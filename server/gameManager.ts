import { createEmptyBoard, getGameStatus, opponentOf } from "../shared/gameLogic";
import type { Player, Room } from "./roomManager";

export type MoveRejectReason = "GAME_NOT_ACTIVE" | "NOT_YOUR_TURN" | "CELL_OCCUPIED" | "CELL_OUT_OF_RANGE";

/**
 * Server-authoritative move application. The caller has already resolved
 * `player` from a validated socket/room lookup — this function re-checks
 * every game rule itself so nothing about validity is ever assumed from
 * the client.
 */
export function applyMove(room: Room, player: Player, cell: number): { ok: true } | { ok: false; reason: MoveRejectReason } {
  // room.status is flipped to FINISHED the instant a win/draw is recorded,
  // so that single check also covers "game already over" — no separate
  // winner/isDraw check needed here.
  if (room.status !== "ACTIVE") return { ok: false, reason: "GAME_NOT_ACTIVE" };
  if (!Number.isInteger(cell) || cell < 0 || cell >= room.boardSize * room.boardSize) {
    return { ok: false, reason: "CELL_OUT_OF_RANGE" };
  }
  if (room.currentTurn !== player.symbol) return { ok: false, reason: "NOT_YOUR_TURN" };
  if (room.board[cell] !== null) return { ok: false, reason: "CELL_OCCUPIED" };

  room.board[cell] = player.symbol;
  room.moveCount += 1;

  const { status, result } = getGameStatus(room.board, room.boardSize, room.winLength, cell);
  if (status === "won" && result) {
    room.winner = result.winner;
    room.winningCells = result.winningCells;
    room.isDraw = false;
    room.status = "FINISHED";
    room.finishedAt = Date.now();
  } else if (status === "draw") {
    room.winner = null;
    room.winningCells = null;
    room.isDraw = true;
    room.status = "FINISHED";
    room.finishedAt = Date.now();
  } else {
    room.currentTurn = opponentOf(room.currentTurn);
  }

  room.lastActivity = Date.now();
  return { ok: true };
}

/** Marks a player ready for rematch; resets the board once both are ready. */
export function requestRematch(room: Room, player: Player): { started: boolean } {
  player.readyForRematch = true;
  const bothReady = room.players.length === 2 && room.players.every((p) => p.readyForRematch);
  if (!bothReady) return { started: false };

  room.board = createEmptyBoard(room.boardSize);
  room.currentTurn = "X";
  room.winner = null;
  room.winningCells = null;
  room.isDraw = false;
  room.moveCount = 0;
  room.status = "ACTIVE";
  room.finishedAt = null;
  room.lastActivity = Date.now();
  for (const p of room.players) p.readyForRematch = false;
  return { started: true };
}
