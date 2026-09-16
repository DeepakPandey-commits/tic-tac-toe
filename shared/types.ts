/**
 * Framework-agnostic types shared between the Vite frontend and the Node
 * WebSocket server. No browser or Node APIs allowed in this folder.
 */
export type SymbolKind = "X" | "O";

export type Cell = SymbolKind | null;

export type GameStatus = "playing" | "won" | "draw";
