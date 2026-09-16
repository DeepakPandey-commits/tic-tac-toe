import { useCallback, useEffect, useRef, useState } from "react";
import { MultiplayerClient } from "./client";
import type { ConnectionStatus } from "./client";
import type { ErrorCode, PlayerSlot, RoomStateDTO } from "../../shared/protocol";
import type { SymbolKind } from "../../shared/types";

export type MultiplayerPhase =
  | "idle" // choosing create/join
  | "creating"
  | "joining"
  | "waiting" // room created, waiting for opponent
  | "active" // game in progress
  | "finished" // game over, rematch UI
  | "opponent-left"; // opponent explicitly left / grace period expired

interface SessionInfo {
  roomCode: string;
  playerToken: string;
}

const SESSION_KEY = "ttt.mp.session.v1";

function loadSession(): SessionInfo | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.roomCode === "string" && typeof parsed?.playerToken === "string") return parsed;
    return null;
  } catch {
    return null;
  }
}

/** Lets App-level routing decide whether a page reload should land back on
 * the multiplayer screen instead of the main menu. */
export function hasStoredMultiplayerSession(): boolean {
  return loadSession() !== null;
}

function saveSession(info: SessionInfo | null) {
  try {
    if (info) sessionStorage.setItem(SESSION_KEY, JSON.stringify(info));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* storage unavailable — reconnection just won't survive a refresh */
  }
}

export function useMultiplayer() {
  const clientRef = useRef<MultiplayerClient | null>(null);
  const sessionRef = useRef<SessionInfo | null>(null);

  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const [phase, setPhase] = useState<MultiplayerPhase>("idle");
  const [roomState, setRoomState] = useState<RoomStateDTO | null>(null);
  const [mySlot, setMySlot] = useState<PlayerSlot | null>(null);
  const [mySymbol, setMySymbol] = useState<SymbolKind | null>(null);
  const [opponentConnected, setOpponentConnected] = useState(true);
  const [error, setError] = useState<{ code: ErrorCode; message: string } | null>(null);

  useEffect(() => {
    const client = new MultiplayerClient();
    clientRef.current = client;
    sessionRef.current = loadSession();

    const offStatus = client.onStatusChange((status) => {
      setConnectionStatus(status);
      if (status === "connected" && sessionRef.current) {
        client.send({ type: "REJOIN_ROOM", roomCode: sessionRef.current.roomCode, playerToken: sessionRef.current.playerToken });
      }
    });

    const offMessage = client.onMessage((msg) => {
      switch (msg.type) {
        case "ROOM_CREATED": {
          sessionRef.current = { roomCode: msg.roomCode, playerToken: msg.playerToken };
          saveSession(sessionRef.current);
          setMySlot(msg.mySlot);
          setMySymbol(msg.symbol);
          setRoomState(msg.state);
          setOpponentConnected(true);
          setPhase("waiting");
          setError(null);
          break;
        }
        case "PLAYER_JOINED": {
          sessionRef.current = { roomCode: msg.state.roomCode, playerToken: msg.playerToken };
          saveSession(sessionRef.current);
          setMySlot(msg.mySlot);
          setMySymbol(msg.symbol);
          setRoomState(msg.state);
          setOpponentConnected(true);
          setPhase("active");
          setError(null);
          break;
        }
        case "GAME_STARTED": {
          setRoomState(msg.state);
          setOpponentConnected(true);
          setPhase("active");
          break;
        }
        case "GAME_STATE": {
          setRoomState(msg.state);
          break;
        }
        case "GAME_OVER": {
          setRoomState(msg.state);
          setPhase("finished");
          break;
        }
        case "GAME_RESTARTED": {
          setRoomState(msg.state);
          setPhase("active");
          break;
        }
        case "MOVE_REJECTED": {
          setError({ code: "INVALID_PAYLOAD", message: `Move rejected: ${msg.reason.replaceAll("_", " ").toLowerCase()}` });
          break;
        }
        case "PLAYER_DISCONNECTED": {
          setOpponentConnected(false);
          break;
        }
        case "PLAYER_RECONNECTED": {
          // Sent to BOTH players: the reconnecting one (to resume) and the
          // other one (as a status update) — never overwrite an
          // already-known identity, only fill it in when it's still unset
          // (which only happens for a fresh page reload resuming itself).
          setRoomState(msg.state);
          setOpponentConnected(true);
          setPhase(msg.state.status === "WAITING" ? "waiting" : msg.state.status === "FINISHED" ? "finished" : "active");
          setMySlot((prev) => prev ?? msg.slot);
          setMySymbol((prev) => prev ?? msg.state.players.find((p) => p.slot === msg.slot)?.symbol ?? prev);
          break;
        }
        case "OPPONENT_LEFT": {
          if (msg.state) setRoomState(msg.state);
          setOpponentConnected(false);
          setPhase("opponent-left");
          sessionRef.current = null;
          saveSession(null);
          break;
        }
        case "ERROR": {
          setError({ code: msg.code, message: msg.message });
          if (msg.code === "ROOM_NOT_FOUND" || msg.code === "ROOM_FULL" || msg.code === "GAME_ALREADY_STARTED") {
            setPhase("idle");
          }
          if (msg.code === "REJOIN_FAILED") {
            sessionRef.current = null;
            saveSession(null);
            setPhase("idle");
          }
          break;
        }
        case "PONG":
          break;
      }
    });

    client.connect();

    return () => {
      offStatus();
      offMessage();
      client.close();
    };
  }, []);

  const createRoom = useCallback((boardSize: number, winLength: number) => {
    setError(null);
    setPhase("creating");
    clientRef.current?.send({ type: "CREATE_ROOM", boardSize, winLength });
  }, []);

  const joinRoom = useCallback((roomCode: string) => {
    setError(null);
    setPhase("joining");
    clientRef.current?.send({ type: "JOIN_ROOM", roomCode: roomCode.trim().toUpperCase() });
  }, []);

  const makeMove = useCallback((cell: number) => {
    clientRef.current?.send({ type: "MAKE_MOVE", cell });
  }, []);

  const requestRematch = useCallback(() => {
    clientRef.current?.send({ type: "REQUEST_REMATCH" });
  }, []);

  const leaveRoom = useCallback(() => {
    clientRef.current?.send({ type: "LEAVE_ROOM" });
    sessionRef.current = null;
    saveSession(null);
    setRoomState(null);
    setMySlot(null);
    setMySymbol(null);
    setOpponentConnected(true);
    setError(null);
    setPhase("idle");
  }, []);

  const dismissError = useCallback(() => setError(null), []);

  const retryConnection = useCallback(() => {
    clientRef.current?.retry();
  }, []);

  return {
    connectionStatus,
    phase,
    roomState,
    mySlot,
    mySymbol,
    opponentConnected,
    error,
    createRoom,
    joinRoom,
    makeMove,
    requestRematch,
    leaveRoom,
    dismissError,
    retryConnection,
  };
}

export type UseMultiplayerReturn = ReturnType<typeof useMultiplayer>;
