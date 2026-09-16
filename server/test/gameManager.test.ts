import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { RoomManager } from "../roomManager";
import { applyMove, requestRematch } from "../gameManager";
import type { WebSocket } from "ws";

function fakeSocket(): WebSocket {
  return {} as WebSocket;
}

function setupActiveRoom(boardSize = 3, winLength = 3) {
  const rm = new RoomManager();
  const { room, player: p1 } = rm.createRoom(boardSize, winLength, fakeSocket());
  const joinResult = rm.joinRoom(room.roomCode, fakeSocket());
  if (!joinResult.ok) throw new Error("setup failed");
  return { rm, room, p1, p2: joinResult.player };
}

describe("applyMove — validity", () => {
  test("accepts a valid move by the player whose turn it is", () => {
    const { room, p1 } = setupActiveRoom();
    const result = applyMove(room, p1, 4);
    assert.ok(result.ok);
    assert.equal(room.board[4], "X");
    assert.equal(room.currentTurn, "O");
    assert.equal(room.moveCount, 1);
  });

  test("rejects a move when it is not that player's turn", () => {
    const { room, p2 } = setupActiveRoom();
    const result = applyMove(room, p2, 0); // X goes first
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "NOT_YOUR_TURN");
    assert.equal(room.board[0], null);
  });

  test("rejects a move onto an occupied cell", () => {
    const { room, p1, p2 } = setupActiveRoom();
    applyMove(room, p1, 0);
    const result = applyMove(room, p2, 0);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "CELL_OCCUPIED");
  });

  test("rejects an out-of-range cell index", () => {
    const { room, p1 } = setupActiveRoom();
    const result = applyMove(room, p1, 99);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "CELL_OUT_OF_RANGE");
  });

  test("rejects a negative cell index", () => {
    const { room, p1 } = setupActiveRoom();
    const result = applyMove(room, p1, -1);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "CELL_OUT_OF_RANGE");
  });

  test("rejects any move once the game is over", () => {
    const { room, p1, p2 } = setupActiveRoom();
    // X wins top row: X O X O X . . . .
    applyMove(room, p1, 0);
    applyMove(room, p2, 3);
    applyMove(room, p1, 1);
    applyMove(room, p2, 4);
    applyMove(room, p1, 2); // X wins
    assert.equal(room.winner, "X");
    const result = applyMove(room, p2, 5);
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "GAME_NOT_ACTIVE");
  });
});

describe("applyMove — win/draw detection", () => {
  test("detects a 3x3 horizontal win", () => {
    const { room, p1, p2 } = setupActiveRoom(3, 3);
    applyMove(room, p1, 0);
    applyMove(room, p2, 3);
    applyMove(room, p1, 1);
    applyMove(room, p2, 4);
    applyMove(room, p1, 2);
    assert.equal(room.status, "FINISHED");
    assert.equal(room.winner, "X");
    assert.deepEqual(room.winningCells, [0, 1, 2]);
  });

  test("detects a 3x3 draw", () => {
    const { room, p1, p2 } = setupActiveRoom(3, 3);
    // X O X / X O O / O X X -> draw
    const moves: Array<[typeof p1, number]> = [
      [p1, 0], [p2, 1], [p1, 2],
      [p2, 4], [p1, 3], [p2, 5],
      [p1, 7], [p2, 6], [p1, 8],
    ];
    for (const [player, cell] of moves) applyMove(room, player, cell);
    assert.equal(room.status, "FINISHED");
    assert.equal(room.isDraw, true);
    assert.equal(room.winner, null);
  });

  test("detects a 5x5 with 5-in-a-row win", () => {
    const { room, p1, p2 } = setupActiveRoom(5, 5);
    // X takes row 0 (0..4), O takes row 1 (5..8)
    applyMove(room, p1, 0);
    applyMove(room, p2, 5);
    applyMove(room, p1, 1);
    applyMove(room, p2, 6);
    applyMove(room, p1, 2);
    applyMove(room, p2, 7);
    applyMove(room, p1, 3);
    applyMove(room, p2, 8);
    applyMove(room, p1, 4); // completes 5-in-a-row
    assert.equal(room.status, "FINISHED");
    assert.equal(room.winner, "X");
    assert.deepEqual(room.winningCells, [0, 1, 2, 3, 4]);
  });

  test("a 5x5 board does not falsely win on only 4-in-a-row", () => {
    const { room, p1, p2 } = setupActiveRoom(5, 5);
    applyMove(room, p1, 0);
    applyMove(room, p2, 10);
    applyMove(room, p1, 1);
    applyMove(room, p2, 11);
    applyMove(room, p1, 2);
    applyMove(room, p2, 12);
    applyMove(room, p1, 3); // X has 0,1,2,3 — only 4 in a row, needs 5
    assert.equal(room.status, "ACTIVE");
    assert.equal(room.winner, null);
  });
});

describe("requestRematch", () => {
  test("does not restart until both players are ready", () => {
    const { room, p1, p2 } = setupActiveRoom();
    applyMove(room, p1, 0);
    applyMove(room, p2, 3);
    applyMove(room, p1, 1);
    applyMove(room, p2, 4);
    applyMove(room, p1, 2); // X wins, room FINISHED

    const first = requestRematch(room, p1);
    assert.equal(first.started, false);
    assert.equal(room.status, "FINISHED");

    const second = requestRematch(room, p2);
    assert.equal(second.started, true);
    assert.equal(room.status, "ACTIVE");
    assert.equal(room.winner, null);
    assert.equal(room.board.every((c) => c === null), true);
    assert.equal(room.currentTurn, "X");
  });
});
