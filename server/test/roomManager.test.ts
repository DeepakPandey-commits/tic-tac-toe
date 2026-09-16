import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { RoomManager } from "../roomManager";
import type { WebSocket } from "ws";

function fakeSocket(): WebSocket {
  return {} as WebSocket;
}

describe("RoomManager.createRoom", () => {
  test("creates a WAITING room with player 1 as X", () => {
    const rm = new RoomManager();
    const { room, player } = rm.createRoom(3, 3, fakeSocket());
    assert.equal(room.status, "WAITING");
    assert.equal(room.players.length, 1);
    assert.equal(player.slot, 1);
    assert.equal(player.symbol, "X");
    assert.equal(room.board.length, 9);
    assert.match(room.roomCode, /^[A-Z0-9]{6}$/);
  });

  test("room codes avoid ambiguous characters", () => {
    const rm = new RoomManager();
    for (let i = 0; i < 200; i++) {
      const { room } = rm.createRoom(3, 3, fakeSocket());
      assert.ok(!/[0O1IL]/.test(room.roomCode), `code ${room.roomCode} contains an ambiguous character`);
    }
  });

  test("generates unique codes under repeated creation (collision resistance)", () => {
    const rm = new RoomManager();
    const codes = new Set<string>();
    for (let i = 0; i < 500; i++) {
      const { room } = rm.createRoom(3, 3, fakeSocket());
      assert.ok(!codes.has(room.roomCode), "duplicate room code generated");
      codes.add(room.roomCode);
    }
  });
});

describe("RoomManager.joinRoom", () => {
  test("second player joins as O and room becomes ACTIVE", () => {
    const rm = new RoomManager();
    const { room } = rm.createRoom(3, 3, fakeSocket());
    const result = rm.joinRoom(room.roomCode, fakeSocket());
    assert.ok(result.ok);
    if (!result.ok) return;
    assert.equal(result.player.slot, 2);
    assert.equal(result.player.symbol, "O");
    assert.equal(result.room.status, "ACTIVE");
  });

  test("joining a nonexistent room fails with NOT_FOUND", () => {
    const rm = new RoomManager();
    const result = rm.joinRoom("ZZZZZZ", fakeSocket());
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.reason, "NOT_FOUND");
  });

  test("joining a full room fails with FULL", () => {
    const rm = new RoomManager();
    const { room } = rm.createRoom(3, 3, fakeSocket());
    rm.joinRoom(room.roomCode, fakeSocket());
    const third = rm.joinRoom(room.roomCode, fakeSocket());
    assert.equal(third.ok, false);
    if (!third.ok) assert.equal(third.reason, "ALREADY_STARTED");
  });

  test("a third player cannot join an already-active game", () => {
    const rm = new RoomManager();
    const { room } = rm.createRoom(3, 3, fakeSocket());
    rm.joinRoom(room.roomCode, fakeSocket());
    const spectatorAttempt = rm.joinRoom(room.roomCode, fakeSocket());
    assert.equal(spectatorAttempt.ok, false);
  });
});

describe("RoomManager reconnection", () => {
  test("rejoin restores the player's socket binding by token", () => {
    const rm = new RoomManager();
    const { room, player } = rm.createRoom(3, 3, fakeSocket());
    rm.joinRoom(room.roomCode, fakeSocket());
    rm.scheduleDisconnectCleanup(room, player, () => {});
    assert.equal(player.connected, false);

    const newSocket = fakeSocket();
    const result = rm.rejoin(room.roomCode, player.token, newSocket);
    assert.ok(result.ok);
    if (result.ok) {
      assert.equal(result.player.connected, true);
      assert.equal(result.player.ws, newSocket);
    }
  });

  test("rejoin with a wrong token fails", () => {
    const rm = new RoomManager();
    const { room } = rm.createRoom(3, 3, fakeSocket());
    const result = rm.rejoin(room.roomCode, "not-a-real-token", fakeSocket());
    assert.equal(result.ok, false);
  });
});

describe("RoomManager.sweep", () => {
  test("removes stale WAITING rooms", () => {
    const rm = new RoomManager();
    rm.createRoom(3, 3, fakeSocket());
    const future = Date.now() + 20 * 60_000;
    const removed = rm.sweep(future);
    assert.equal(removed.length, 1);
    assert.equal(rm.size, 0);
  });

  test("does not remove a fresh WAITING room", () => {
    const rm = new RoomManager();
    rm.createRoom(3, 3, fakeSocket());
    const removed = rm.sweep(Date.now());
    assert.equal(removed.length, 0);
    assert.equal(rm.size, 1);
  });
});
