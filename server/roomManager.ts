import { randomUUID } from "node:crypto";
import type { WebSocket } from "ws";
import { createEmptyBoard } from "../shared/gameLogic";
import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, DISCONNECT_GRACE_MS } from "../shared/protocol";
import type { PlayerSlot, RoomStateDTO, RoomStatus } from "../shared/protocol";
import type { Cell, SymbolKind } from "../shared/types";

export interface Player {
  slot: PlayerSlot;
  symbol: SymbolKind;
  token: string;
  ws: WebSocket | null;
  connected: boolean;
  readyForRematch: boolean;
  disconnectTimer: ReturnType<typeof setTimeout> | null;
}

export interface Room {
  roomCode: string;
  status: RoomStatus;
  boardSize: number;
  winLength: number;
  board: Cell[];
  currentTurn: SymbolKind;
  winner: SymbolKind | null;
  winningCells: number[] | null;
  isDraw: boolean;
  moveCount: number;
  players: Player[];
  createdAt: number;
  lastActivity: number;
  finishedAt: number | null;
}

const WAITING_ROOM_TTL_MS = 10 * 60_000; // abandoned "waiting for player" rooms
const FINISHED_ROOM_TTL_MS = 5 * 60_000; // rooms kept briefly after both leave
const SWEEP_INTERVAL_MS = 30_000;

export class RoomManager {
  private rooms = new Map<string, Room>();

  private generateRoomCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = "";
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    // Astronomically unlikely, but fall back to a guaranteed-unique code.
    return randomUUID().replace(/-/g, "").slice(0, ROOM_CODE_LENGTH).toUpperCase();
  }

  createRoom(boardSize: number, winLength: number, ws: WebSocket): { room: Room; player: Player } {
    const roomCode = this.generateRoomCode();
    const now = Date.now();
    const player: Player = {
      slot: 1,
      symbol: "X",
      token: randomUUID(),
      ws,
      connected: true,
      readyForRematch: false,
      disconnectTimer: null,
    };
    const room: Room = {
      roomCode,
      status: "WAITING",
      boardSize,
      winLength,
      board: createEmptyBoard(boardSize),
      currentTurn: "X",
      winner: null,
      winningCells: null,
      isDraw: false,
      moveCount: 0,
      players: [player],
      createdAt: now,
      lastActivity: now,
      finishedAt: null,
    };
    this.rooms.set(roomCode, room);
    return { room, player };
  }

  getRoom(roomCode: string): Room | undefined {
    return this.rooms.get(roomCode);
  }

  /** Result discriminant lets the caller send a precise error to the client. */
  joinRoom(
    roomCode: string,
    ws: WebSocket,
  ): { ok: true; room: Room; player: Player } | { ok: false; reason: "NOT_FOUND" | "FULL" | "ALREADY_STARTED" } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false, reason: "NOT_FOUND" };
    if (room.players.length >= 2) return { ok: false, reason: room.status === "WAITING" ? "FULL" : "ALREADY_STARTED" };
    if (room.status !== "WAITING") return { ok: false, reason: "ALREADY_STARTED" };

    const player: Player = {
      slot: 2,
      symbol: "O",
      token: randomUUID(),
      ws,
      connected: true,
      readyForRematch: false,
      disconnectTimer: null,
    };
    room.players.push(player);
    room.status = "ACTIVE";
    room.lastActivity = Date.now();
    return { ok: true, room, player };
  }

  rejoin(
    roomCode: string,
    playerToken: string,
    ws: WebSocket,
  ): { ok: true; room: Room; player: Player } | { ok: false } {
    const room = this.rooms.get(roomCode);
    if (!room) return { ok: false };
    const player = room.players.find((p) => p.token === playerToken);
    if (!player) return { ok: false };

    if (player.disconnectTimer) {
      clearTimeout(player.disconnectTimer);
      player.disconnectTimer = null;
    }
    player.ws = ws;
    player.connected = true;
    room.lastActivity = Date.now();
    return { ok: true, room, player };
  }

  findByToken(roomCode: string, playerToken: string): { room: Room; player: Player } | null {
    const room = this.rooms.get(roomCode);
    if (!room) return null;
    const player = room.players.find((p) => p.token === playerToken);
    if (!player) return null;
    return { room, player };
  }

  /** Find the room/player currently bound to a live socket (used on ws 'close'). */
  findBySocket(ws: WebSocket): { room: Room; player: Player } | null {
    for (const room of this.rooms.values()) {
      const player = room.players.find((p) => p.ws === ws);
      if (player) return { room, player };
    }
    return null;
  }

  scheduleDisconnectCleanup(room: Room, player: Player, onExpire: (room: Room, player: Player) => void) {
    player.connected = false;
    player.ws = null;
    if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
    player.disconnectTimer = setTimeout(() => {
      player.disconnectTimer = null;
      onExpire(room, player);
    }, DISCONNECT_GRACE_MS);
  }

  removeRoom(roomCode: string) {
    const room = this.rooms.get(roomCode);
    if (room) {
      for (const player of room.players) {
        if (player.disconnectTimer) clearTimeout(player.disconnectTimer);
      }
    }
    this.rooms.delete(roomCode);
  }

  markFinished(room: Room) {
    room.status = "FINISHED";
    room.finishedAt = Date.now();
  }

  toPublicState(room: Room): RoomStateDTO {
    return {
      roomCode: room.roomCode,
      status: room.status,
      boardSize: room.boardSize,
      winLength: room.winLength,
      board: room.board.slice(),
      currentTurn: room.currentTurn,
      winner: room.winner,
      winningCells: room.winningCells ? room.winningCells.slice() : null,
      isDraw: room.isDraw,
      moveCount: room.moveCount,
      players: room.players.map((p) => ({ slot: p.slot, symbol: p.symbol, connected: p.connected })),
      rematch: {
        player1Ready: room.players.find((p) => p.slot === 1)?.readyForRematch ?? false,
        player2Ready: room.players.find((p) => p.slot === 2)?.readyForRematch ?? false,
      },
    };
  }

  /** Periodic sweep for abandoned/finished rooms. Returns codes removed (for logging/tests). */
  sweep(now = Date.now()): string[] {
    const removed: string[] = [];
    for (const [code, room] of this.rooms) {
      const allDisconnected = room.players.length > 0 && room.players.every((p) => !p.connected);
      if (room.status === "WAITING" && now - room.createdAt > WAITING_ROOM_TTL_MS) {
        removed.push(code);
      } else if (room.status === "FINISHED" && room.finishedAt !== null && now - room.finishedAt > FINISHED_ROOM_TTL_MS) {
        removed.push(code);
      } else if (room.status === "ACTIVE" && allDisconnected && now - room.lastActivity > DISCONNECT_GRACE_MS * 2) {
        // Safety net in case a disconnect timer was somehow lost.
        removed.push(code);
      }
    }
    for (const code of removed) this.removeRoom(code);
    return removed;
  }

  startSweepInterval(): ReturnType<typeof setInterval> {
    return setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
  }

  get size(): number {
    return this.rooms.size;
  }
}
