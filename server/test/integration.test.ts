import { test, describe, before, after } from "node:test";
import assert from "node:assert/strict";
import { WebSocket } from "ws";
import { startServer } from "../app";
import type { ServerHandle } from "../app";
import type { ClientMessage, ServerMessage } from "../../shared/protocol";

let handle: ServerHandle;
let port: number;

before(async () => {
  handle = await startServer(0); // ephemeral port
  const address = handle.httpServer.address();
  if (!address || typeof address === "string") throw new Error("expected AddressInfo");
  port = address.port;
});

after(async () => {
  await handle.close();
});

/**
 * Tiny WS test client. `messages` is a queue of not-yet-consumed frames:
 * waitFor() consumes (removes) the first match, so calling waitFor(sameType)
 * twice waits for two *different* occurrences instead of the same stale one.
 */
class TestClient {
  ws: WebSocket;
  messages: ServerMessage[] = [];
  private waiters: Array<{ predicate: (m: ServerMessage) => boolean; resolve: (m: ServerMessage) => void }> = [];

  constructor(private url: string) {
    this.ws = new WebSocket(url);
    this.ws.on("message", (raw) => {
      const msg = JSON.parse(raw.toString()) as ServerMessage;
      const waiterIdx = this.waiters.findIndex((w) => w.predicate(msg));
      if (waiterIdx !== -1) {
        const [waiter] = this.waiters.splice(waiterIdx, 1);
        waiter.resolve(msg);
      } else {
        this.messages.push(msg);
      }
    });
  }

  waitOpen(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.ws.readyState === WebSocket.OPEN) return resolve();
      this.ws.once("open", () => resolve());
      this.ws.once("error", reject);
    });
  }

  send(msg: ClientMessage) {
    this.ws.send(JSON.stringify(msg));
  }

  waitFor(type: ServerMessage["type"], timeoutMs = 2000): Promise<ServerMessage> {
    const idx = this.messages.findIndex((m) => m.type === type);
    if (idx !== -1) {
      const [msg] = this.messages.splice(idx, 1);
      return Promise.resolve(msg);
    }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`timed out waiting for ${type}`)), timeoutMs);
      this.waiters.push({
        predicate: (m) => m.type === type,
        resolve: (m) => {
          clearTimeout(timer);
          resolve(m);
        },
      });
    });
  }

  close() {
    this.ws.close();
  }
}

function url() {
  return `ws://127.0.0.1:${port}`;
}

describe("end-to-end multiplayer flow", () => {
  test("create → join → both receive matching GAME_STARTED state", async () => {
    const a = new TestClient(url());
    await a.waitOpen();
    a.send({ type: "CREATE_ROOM", boardSize: 3, winLength: 3 });
    const created = await a.waitFor("ROOM_CREATED");
    assert.equal(created.type, "ROOM_CREATED");
    if (created.type !== "ROOM_CREATED") return;
    const roomCode = created.roomCode;
    assert.equal(created.symbol, "X");

    const b = new TestClient(url());
    await b.waitOpen();
    b.send({ type: "JOIN_ROOM", roomCode });
    const joined = await b.waitFor("PLAYER_JOINED");
    assert.equal(joined.type, "PLAYER_JOINED");
    if (joined.type !== "PLAYER_JOINED") return;
    assert.equal(joined.symbol, "O");

    const aStarted = await a.waitFor("GAME_STARTED");
    const bStarted = await b.waitFor("GAME_STARTED");
    assert.deepEqual(aStarted, bStarted);
    assert.equal((aStarted as { state: { status: string } }).state.status, "ACTIVE");

    a.close();
    b.close();
  });

  test("moves broadcast identical state to both clients, and a full game reaches GAME_OVER", async () => {
    const a = new TestClient(url());
    await a.waitOpen();
    a.send({ type: "CREATE_ROOM", boardSize: 3, winLength: 3 });
    const created = await a.waitFor("ROOM_CREATED");
    if (created.type !== "ROOM_CREATED") throw new Error("unexpected");
    const roomCode = created.roomCode;

    const b = new TestClient(url());
    await b.waitOpen();
    b.send({ type: "JOIN_ROOM", roomCode });
    await b.waitFor("PLAYER_JOINED");
    await a.waitFor("GAME_STARTED");

    // X: 0,1,2 (win) — O: 3,4
    a.send({ type: "MAKE_MOVE", cell: 0 });
    await a.waitFor("GAME_STATE");
    await b.waitFor("GAME_STATE");

    b.send({ type: "MAKE_MOVE", cell: 3 });
    await a.waitFor("GAME_STATE");
    await b.waitFor("GAME_STATE");

    a.send({ type: "MAKE_MOVE", cell: 1 });
    await a.waitFor("GAME_STATE");
    await b.waitFor("GAME_STATE");

    b.send({ type: "MAKE_MOVE", cell: 4 });
    await a.waitFor("GAME_STATE");
    await b.waitFor("GAME_STATE");

    a.send({ type: "MAKE_MOVE", cell: 2 }); // X wins
    const aOver = await a.waitFor("GAME_OVER");
    const bOver = await b.waitFor("GAME_OVER");
    assert.deepEqual(aOver, bOver);
    if (aOver.type === "GAME_OVER") {
      assert.equal(aOver.state.winner, "X");
      assert.deepEqual(aOver.state.winningCells, [0, 1, 2]);
    }

    a.close();
    b.close();
  });

  test("wrong-turn and occupied-cell moves are rejected and do not corrupt state", async () => {
    const a = new TestClient(url());
    await a.waitOpen();
    a.send({ type: "CREATE_ROOM", boardSize: 3, winLength: 3 });
    const created = await a.waitFor("ROOM_CREATED");
    if (created.type !== "ROOM_CREATED") throw new Error("unexpected");

    const b = new TestClient(url());
    await b.waitOpen();
    b.send({ type: "JOIN_ROOM", roomCode: created.roomCode });
    await b.waitFor("PLAYER_JOINED");
    await a.waitFor("GAME_STARTED");

    // O tries to move first — must be rejected.
    b.send({ type: "MAKE_MOVE", cell: 0 });
    const rejected = await b.waitFor("MOVE_REJECTED");
    assert.equal(rejected.type, "MOVE_REJECTED");
    if (rejected.type === "MOVE_REJECTED") assert.equal(rejected.reason, "NOT_YOUR_TURN");

    // X moves validly.
    a.send({ type: "MAKE_MOVE", cell: 0 });
    await a.waitFor("GAME_STATE");
    await b.waitFor("GAME_STATE");

    // O tries the same occupied cell.
    b.send({ type: "MAKE_MOVE", cell: 0 });
    const rejected2 = await b.waitFor("MOVE_REJECTED");
    if (rejected2.type === "MOVE_REJECTED") assert.equal(rejected2.reason, "CELL_OCCUPIED");

    a.close();
    b.close();
  });

  test("joining a full room is rejected with ROOM_FULL/ALREADY_STARTED", async () => {
    const a = new TestClient(url());
    await a.waitOpen();
    a.send({ type: "CREATE_ROOM", boardSize: 3, winLength: 3 });
    const created = await a.waitFor("ROOM_CREATED");
    if (created.type !== "ROOM_CREATED") throw new Error("unexpected");

    const b = new TestClient(url());
    await b.waitOpen();
    b.send({ type: "JOIN_ROOM", roomCode: created.roomCode });
    await b.waitFor("PLAYER_JOINED");

    const c = new TestClient(url());
    await c.waitOpen();
    c.send({ type: "JOIN_ROOM", roomCode: created.roomCode });
    const err = await c.waitFor("ERROR");
    assert.equal(err.type, "ERROR");
    if (err.type === "ERROR") assert.equal(err.code, "GAME_ALREADY_STARTED");

    a.close();
    b.close();
    c.close();
  });

  test("joining a nonexistent room returns ROOM_NOT_FOUND", async () => {
    const a = new TestClient(url());
    await a.waitOpen();
    a.send({ type: "JOIN_ROOM", roomCode: "ABCD23" });
    const err = await a.waitFor("ERROR");
    if (err.type === "ERROR") assert.equal(err.code, "ROOM_NOT_FOUND");
    a.close();
  });

  test("malformed JSON and invalid payloads are rejected without crashing the server", async () => {
    const a = new TestClient(url());
    await a.waitOpen();
    a.ws.send("{not valid json");
    const err1 = await a.waitFor("ERROR");
    assert.equal(err1.type, "ERROR");

    a.ws.send(JSON.stringify({ type: "MAKE_MOVE", cell: "not-a-number" }));
    const err2 = await a.waitFor("ERROR");
    assert.equal(err2.type, "ERROR");

    // Server must still be responsive after malformed input.
    a.send({ type: "PING" });
    const pong = await a.waitFor("PONG");
    assert.equal(pong.type, "PONG");
    a.close();
  });

  test("rematch requires both players before restarting", async () => {
    const a = new TestClient(url());
    await a.waitOpen();
    a.send({ type: "CREATE_ROOM", boardSize: 3, winLength: 3 });
    const created = await a.waitFor("ROOM_CREATED");
    if (created.type !== "ROOM_CREATED") throw new Error("unexpected");

    const b = new TestClient(url());
    await b.waitOpen();
    b.send({ type: "JOIN_ROOM", roomCode: created.roomCode });
    await b.waitFor("PLAYER_JOINED");
    await a.waitFor("GAME_STARTED");

    const seq: Array<[TestClient, number]> = [
      [a, 0], [b, 3], [a, 1], [b, 4], [a, 2],
    ];
    for (const [client, cell] of seq) {
      client.send({ type: "MAKE_MOVE", cell });
      await new Promise((r) => setTimeout(r, 30));
    }
    await a.waitFor("GAME_OVER");

    a.send({ type: "REQUEST_REMATCH" });
    await new Promise((r) => setTimeout(r, 50));
    // Only one side ready — game must not have restarted.
    const stateMsgsBefore = b.messages.filter((m) => m.type === "GAME_RESTARTED");
    assert.equal(stateMsgsBefore.length, 0);

    b.send({ type: "REQUEST_REMATCH" });
    const restarted = await a.waitFor("GAME_RESTARTED");
    if (restarted.type === "GAME_RESTARTED") {
      assert.equal(restarted.state.status, "ACTIVE");
      assert.equal(restarted.state.board.every((c) => c === null), true);
    }

    a.close();
    b.close();
  });

  test("reconnection: a disconnected player can rejoin with their token and resume", async () => {
    const a = new TestClient(url());
    await a.waitOpen();
    a.send({ type: "CREATE_ROOM", boardSize: 3, winLength: 3 });
    const created = await a.waitFor("ROOM_CREATED");
    if (created.type !== "ROOM_CREATED") throw new Error("unexpected");
    const { roomCode, playerToken } = created;

    const b = new TestClient(url());
    await b.waitOpen();
    b.send({ type: "JOIN_ROOM", roomCode });
    await b.waitFor("PLAYER_JOINED");
    await a.waitFor("GAME_STARTED");

    a.send({ type: "MAKE_MOVE", cell: 0 });
    await b.waitFor("GAME_STATE");

    // Simulate A dropping and reconnecting with a new socket + stored token.
    a.close();
    await b.waitFor("PLAYER_DISCONNECTED");

    const aReconnect = new TestClient(url());
    await aReconnect.waitOpen();
    aReconnect.send({ type: "REJOIN_ROOM", roomCode, playerToken });
    const restored = await aReconnect.waitFor("PLAYER_RECONNECTED");
    if (restored.type === "PLAYER_RECONNECTED") {
      assert.equal(restored.state.board[0], "X");
      assert.equal(restored.state.status, "ACTIVE");
    }
    await b.waitFor("PLAYER_RECONNECTED");

    // Game continues normally after reconnect.
    b.send({ type: "MAKE_MOVE", cell: 4 });
    const state = await aReconnect.waitFor("GAME_STATE");
    if (state.type === "GAME_STATE") assert.equal(state.state.board[4], "O");

    aReconnect.close();
    b.close();
  });

  test("reconnection works even while still WAITING (creator refreshes before anyone joins)", async () => {
    const a = new TestClient(url());
    await a.waitOpen();
    a.send({ type: "CREATE_ROOM", boardSize: 3, winLength: 3 });
    const created = await a.waitFor("ROOM_CREATED");
    if (created.type !== "ROOM_CREATED") throw new Error("unexpected");
    const { roomCode, playerToken } = created;

    // Creator's tab closes/refreshes before a second player ever joins.
    a.close();
    await new Promise((r) => setTimeout(r, 50));

    const aReconnect = new TestClient(url());
    await aReconnect.waitOpen();
    aReconnect.send({ type: "REJOIN_ROOM", roomCode, playerToken });
    const restored = await aReconnect.waitFor("PLAYER_RECONNECTED");
    assert.equal(restored.type, "PLAYER_RECONNECTED");
    if (restored.type === "PLAYER_RECONNECTED") {
      assert.equal(restored.state.status, "WAITING");
    }

    // The room must still be genuinely joinable afterwards.
    const b = new TestClient(url());
    await b.waitOpen();
    b.send({ type: "JOIN_ROOM", roomCode });
    const joined = await b.waitFor("PLAYER_JOINED");
    assert.equal(joined.type, "PLAYER_JOINED");

    aReconnect.close();
    b.close();
  });

  test("rejoin with a bogus token is rejected", async () => {
    const a = new TestClient(url());
    await a.waitOpen();
    a.send({ type: "REJOIN_ROOM", roomCode: "ABCD23", playerToken: "bogus-token-value" });
    const err = await a.waitFor("ERROR");
    if (err.type === "ERROR") assert.equal(err.code, "REJOIN_FAILED");
    a.close();
  });
});
