import { isValidRoomConfig } from "../shared/gameLogic";
import { ROOM_CODE_LENGTH } from "../shared/protocol";
import type { ClientMessage } from "../shared/protocol";

export const MAX_MESSAGE_BYTES = 2048;

const ROOM_CODE_RE = /^[A-Z0-9]{6}$/;

export function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isRoomCodeShape(v: unknown): v is string {
  return typeof v === "string" && v.length === ROOM_CODE_LENGTH && ROOM_CODE_RE.test(v);
}

/**
 * Parses and structurally validates a raw incoming WebSocket frame.
 * Returns null for anything malformed — callers must treat null as "ignore
 * this message" rather than throwing, since a hostile or buggy client can
 * send arbitrary bytes.
 */
export function parseClientMessage(raw: string): ClientMessage | null {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isPlainObject(data) || typeof data.type !== "string") return null;

  switch (data.type) {
    case "CREATE_ROOM": {
      if (typeof data.boardSize !== "number" || typeof data.winLength !== "number") return null;
      if (!isValidRoomConfig(data.boardSize, data.winLength)) return null;
      return { type: "CREATE_ROOM", boardSize: data.boardSize, winLength: data.winLength };
    }
    case "JOIN_ROOM": {
      const code = typeof data.roomCode === "string" ? data.roomCode.trim().toUpperCase() : "";
      if (!isRoomCodeShape(code)) return null;
      return { type: "JOIN_ROOM", roomCode: code };
    }
    case "REJOIN_ROOM": {
      const code = typeof data.roomCode === "string" ? data.roomCode.trim().toUpperCase() : "";
      if (!isRoomCodeShape(code) || typeof data.playerToken !== "string" || data.playerToken.length < 8 || data.playerToken.length > 128) {
        return null;
      }
      return { type: "REJOIN_ROOM", roomCode: code, playerToken: data.playerToken };
    }
    case "MAKE_MOVE": {
      if (typeof data.cell !== "number" || !Number.isInteger(data.cell) || data.cell < 0 || data.cell > 10_000) return null;
      return { type: "MAKE_MOVE", cell: data.cell };
    }
    case "REQUEST_REMATCH":
      return { type: "REQUEST_REMATCH" };
    case "LEAVE_ROOM":
      return { type: "LEAVE_ROOM" };
    case "PING":
      return { type: "PING" };
    default:
      return null;
  }
}
