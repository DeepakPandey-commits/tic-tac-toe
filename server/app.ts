import { createServer, type Server as HttpServer } from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { RoomManager } from "./roomManager";
import type { Player, Room } from "./roomManager";
import { applyMove, requestRematch } from "./gameManager";
import { parseClientMessage, MAX_MESSAGE_BYTES } from "./validation";
import type { ServerMessage, ErrorCode } from "../shared/protocol";

const HEARTBEAT_INTERVAL_MS = 30_000;

export interface ServerHandle {
  httpServer: HttpServer;
  wss: WebSocketServer;
  roomManager: RoomManager;
  close: () => Promise<void>;
}

/**
 * Builds the full HTTP + WebSocket app and starts listening on `port`.
 * Kept as a factory (rather than top-level side effects) so tests can spin
 * up isolated instances on ephemeral ports.
 */
export function startServer(port: number): Promise<ServerHandle> {
  const roomManager = new RoomManager();

  const httpServer = createServer((req, res) => {
    if (req.url === "/health") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: true, rooms: roomManager.size }));
      return;
    }
    res.writeHead(404);
    res.end();
  });

  const wss = new WebSocketServer({ server: httpServer });

  function send(ws: WebSocket, message: ServerMessage) {
    if (ws.readyState !== WebSocket.OPEN) return;
    try {
      ws.send(JSON.stringify(message));
    } catch {
      /* socket closing mid-send — nothing actionable */
    }
  }

  function sendError(ws: WebSocket, code: ErrorCode, message: string) {
    send(ws, { type: "ERROR", code, message });
  }

  function broadcast(room: Room, message: ServerMessage) {
    for (const player of room.players) {
      if (player.ws && player.connected) send(player.ws, message);
    }
  }

  function handleUnexpectedDisconnect(room: Room, _player: Player) {
    if (room.status === "ACTIVE") {
      const state = roomManager.toPublicState(room);
      broadcast(room, { type: "OPPONENT_LEFT", state });
    }
    roomManager.removeRoom(room.roomCode);
  }

  wss.on("connection", (ws: WebSocket & { isAlive?: boolean }) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    ws.on("message", (raw) => {
      const text = raw.toString();
      if (text.length > MAX_MESSAGE_BYTES) {
        sendError(ws, "INVALID_PAYLOAD", "Message too large.");
        return;
      }

      const message = parseClientMessage(text);
      if (!message) {
        sendError(ws, "INVALID_PAYLOAD", "Malformed or unrecognized message.");
        return;
      }

      switch (message.type) {
        case "CREATE_ROOM": {
          if (roomManager.findBySocket(ws)) {
            sendError(ws, "INVALID_PAYLOAD", "Already in a room.");
            return;
          }
          const { room, player } = roomManager.createRoom(message.boardSize, message.winLength, ws);
          send(ws, {
            type: "ROOM_CREATED",
            roomCode: room.roomCode,
            playerToken: player.token,
            mySlot: player.slot,
            symbol: player.symbol,
            state: roomManager.toPublicState(room),
          });
          break;
        }

        case "JOIN_ROOM": {
          if (roomManager.findBySocket(ws)) {
            sendError(ws, "INVALID_PAYLOAD", "Already in a room.");
            return;
          }
          const result = roomManager.joinRoom(message.roomCode, ws);
          if (!result.ok) {
            const codeMap: Record<typeof result.reason, ErrorCode> = {
              NOT_FOUND: "ROOM_NOT_FOUND",
              FULL: "ROOM_FULL",
              ALREADY_STARTED: "GAME_ALREADY_STARTED",
            };
            const messageMap: Record<typeof result.reason, string> = {
              NOT_FOUND: "Room not found.",
              FULL: "Room is full.",
              ALREADY_STARTED: "This game has already started.",
            };
            sendError(ws, codeMap[result.reason], messageMap[result.reason]);
            return;
          }
          const { room, player } = result;
          const state = roomManager.toPublicState(room);
          send(ws, {
            type: "PLAYER_JOINED",
            playerToken: player.token,
            mySlot: player.slot,
            symbol: player.symbol,
            state,
          });
          broadcast(room, { type: "GAME_STARTED", state });
          break;
        }

        case "REJOIN_ROOM": {
          const result = roomManager.rejoin(message.roomCode, message.playerToken, ws);
          if (!result.ok) {
            sendError(ws, "REJOIN_FAILED", "Could not restore your session for that room.");
            return;
          }
          const { room, player } = result;
          const state = roomManager.toPublicState(room);
          send(ws, { type: "PLAYER_RECONNECTED", slot: player.slot, state });
          for (const other of room.players) {
            if (other !== player && other.ws && other.connected) {
              send(other.ws, { type: "PLAYER_RECONNECTED", slot: player.slot, state });
            }
          }
          break;
        }

        case "MAKE_MOVE": {
          const found = roomManager.findBySocket(ws);
          if (!found) {
            sendError(ws, "NOT_IN_ROOM", "You are not in an active room.");
            return;
          }
          const { room, player } = found;
          const result = applyMove(room, player, message.cell);
          if (!result.ok) {
            send(ws, { type: "MOVE_REJECTED", reason: result.reason });
            return;
          }
          const state = roomManager.toPublicState(room);
          broadcast(room, room.status === "FINISHED" ? { type: "GAME_OVER", state } : { type: "GAME_STATE", state });
          break;
        }

        case "REQUEST_REMATCH": {
          const found = roomManager.findBySocket(ws);
          if (!found) {
            sendError(ws, "NOT_IN_ROOM", "You are not in an active room.");
            return;
          }
          const { room, player } = found;
          if (room.status !== "FINISHED") return;
          const { started } = requestRematch(room, player);
          const state = roomManager.toPublicState(room);
          broadcast(room, started ? { type: "GAME_RESTARTED", state } : { type: "GAME_STATE", state });
          break;
        }

        case "LEAVE_ROOM": {
          const found = roomManager.findBySocket(ws);
          if (!found) return;
          const { room } = found;
          const state = roomManager.toPublicState(room);
          for (const other of room.players) {
            if (other.ws && other.ws !== ws && other.connected) {
              send(other.ws, { type: "OPPONENT_LEFT", state });
            }
          }
          roomManager.removeRoom(room.roomCode);
          break;
        }

        case "PING":
          send(ws, { type: "PONG" });
          break;
      }
    });

    ws.on("close", () => {
      const found = roomManager.findBySocket(ws);
      if (!found) return;
      const { room, player } = found;

      // A WAITING room (creator alone, nobody to notify) still gets the same
      // grace period as an ACTIVE one — otherwise a creator whose page merely
      // refreshes before anyone joins would find their own room destroyed
      // and be unable to get back into it.
      for (const other of room.players) {
        if (other !== player && other.ws && other.connected) {
          send(other.ws, { type: "PLAYER_DISCONNECTED", slot: player.slot, graceMs: 45_000 });
        }
      }

      roomManager.scheduleDisconnectCleanup(room, player, handleUnexpectedDisconnect);
    });

    ws.on("error", () => {
      /* 'close' fires after 'error' for the same socket — cleanup happens there */
    });
  });

  const heartbeat = setInterval(() => {
    for (const ws of wss.clients as Set<WebSocket & { isAlive?: boolean }>) {
      if (ws.isAlive === false) {
        ws.terminate();
        continue;
      }
      ws.isAlive = false;
      ws.ping();
    }
  }, HEARTBEAT_INTERVAL_MS);

  const sweepTimer = roomManager.startSweepInterval();

  return new Promise((resolve) => {
    httpServer.listen(port, () => {
      resolve({
        httpServer,
        wss,
        roomManager,
        close: () =>
          new Promise((res) => {
            clearInterval(heartbeat);
            clearInterval(sweepTimer);
            wss.close();
            httpServer.close(() => res());
            for (const client of wss.clients) client.terminate();
          }),
      });
    });
  });
}
