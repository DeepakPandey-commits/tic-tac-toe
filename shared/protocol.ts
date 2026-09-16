import type { Cell, SymbolKind } from "./types";

/**
 * WebSocket wire protocol shared between client and server.
 * Client -> Server: intents only. Server -> Client: canonical state.
 * The server never trusts a client-provided symbol, turn, or board state.
 */

export type PlayerSlot = 1 | 2;

export type RoomStatus = "WAITING" | "ACTIVE" | "FINISHED";

export interface PublicPlayer {
  slot: PlayerSlot;
  symbol: SymbolKind;
  connected: boolean;
}

export interface RematchStatus {
  player1Ready: boolean;
  player2Ready: boolean;
}

/** The canonical, server-owned room state sent to clients. Never includes
 * sockets, tokens, or any other server-internal bookkeeping. */
export interface RoomStateDTO {
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
  players: PublicPlayer[];
  rematch: RematchStatus;
}

// ---------- Client -> Server ----------

export type ClientMessage =
  | { type: "CREATE_ROOM"; boardSize: number; winLength: number }
  | { type: "JOIN_ROOM"; roomCode: string }
  | { type: "REJOIN_ROOM"; roomCode: string; playerToken: string }
  | { type: "MAKE_MOVE"; cell: number }
  | { type: "REQUEST_REMATCH" }
  | { type: "LEAVE_ROOM" }
  | { type: "PING" };

// ---------- Server -> Client ----------

export type ServerMessage =
  | { type: "ROOM_CREATED"; roomCode: string; playerToken: string; mySlot: PlayerSlot; symbol: SymbolKind; state: RoomStateDTO }
  | { type: "PLAYER_JOINED"; playerToken: string; mySlot: PlayerSlot; symbol: SymbolKind; state: RoomStateDTO }
  | { type: "GAME_STARTED"; state: RoomStateDTO }
  | { type: "GAME_STATE"; state: RoomStateDTO }
  | { type: "MOVE_REJECTED"; reason: string }
  | { type: "PLAYER_DISCONNECTED"; slot: PlayerSlot; graceMs: number }
  | { type: "PLAYER_RECONNECTED"; slot: PlayerSlot; state: RoomStateDTO }
  | { type: "GAME_OVER"; state: RoomStateDTO }
  | { type: "GAME_RESTARTED"; state: RoomStateDTO }
  | { type: "OPPONENT_LEFT"; state: RoomStateDTO | null }
  | { type: "ERROR"; code: ErrorCode; message: string }
  | { type: "PONG" };

export type ErrorCode =
  | "ROOM_NOT_FOUND"
  | "ROOM_FULL"
  | "GAME_ALREADY_STARTED"
  | "INVALID_PAYLOAD"
  | "INVALID_ROOM_CONFIG"
  | "NOT_IN_ROOM"
  | "REJOIN_FAILED"
  | "SERVER_ERROR";

export const ROOM_CODE_LENGTH = 6;
/** Excludes visually ambiguous characters: 0/O, 1/I/L. */
export const ROOM_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

export const DISCONNECT_GRACE_MS = 45_000;
