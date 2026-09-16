/**
 * Local re-export of the framework-agnostic game engine. The real
 * implementation lives in `shared/gameLogic.ts` so the exact same win/draw
 * logic runs on the server (server-authoritative multiplayer) and the
 * client (local/offline play) without duplication.
 */
export * from "../../shared/gameLogic";
