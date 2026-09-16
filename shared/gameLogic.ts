import type { Cell, GameStatus, SymbolKind } from "./types";

export interface WinResult {
  winner: SymbolKind;
  winningCells: number[];
  direction: [number, number];
}

const DIRECTIONS: [number, number][] = [
  [1, 0], // horizontal
  [0, 1], // vertical
  [1, 1], // diagonal top-left -> bottom-right
  [1, -1], // diagonal top-right -> bottom-left
];

export function createEmptyBoard(boardSize: number): Cell[] {
  return Array.from({ length: boardSize * boardSize }, () => null);
}

export function indexOf(row: number, col: number, boardSize: number): number {
  return row * boardSize + col;
}

export function coordsOf(index: number, boardSize: number): [number, number] {
  return [Math.floor(index / boardSize), index % boardSize];
}

/** Every win length that is legal for a given board size (3..boardSize). */
export function getValidWinLengths(boardSize: number): number[] {
  const lengths: number[] = [];
  for (let n = 3; n <= boardSize; n++) lengths.push(n);
  return lengths;
}

/** Clamp a win length into the valid range for a board size. */
export function clampWinLength(boardSize: number, winLength: number): number {
  const valid = getValidWinLengths(boardSize);
  if (valid.includes(winLength)) return winLength;
  return valid[valid.length - 1];
}

/**
 * Checks whether placing a symbol at `lastMoveIndex` created a winning
 * sequence. Only scans through the last move for efficiency instead of
 * rescanning the whole board.
 */
export function checkWinnerFromMove(
  board: Cell[],
  boardSize: number,
  winLength: number,
  lastMoveIndex: number,
): WinResult | null {
  const symbol = board[lastMoveIndex];
  if (!symbol) return null;

  const [row, col] = coordsOf(lastMoveIndex, boardSize);

  for (const [dr, dc] of DIRECTIONS) {
    const cells: number[] = [indexOf(row, col, boardSize)];

    // walk forward
    let r = row + dr;
    let c = col + dc;
    while (
      r >= 0 &&
      r < boardSize &&
      c >= 0 &&
      c < boardSize &&
      board[indexOf(r, c, boardSize)] === symbol
    ) {
      cells.push(indexOf(r, c, boardSize));
      r += dr;
      c += dc;
    }

    // walk backward
    r = row - dr;
    c = col - dc;
    while (
      r >= 0 &&
      r < boardSize &&
      c >= 0 &&
      c < boardSize &&
      board[indexOf(r, c, boardSize)] === symbol
    ) {
      cells.unshift(indexOf(r, c, boardSize));
      r -= dr;
      c -= dc;
    }

    if (cells.length >= winLength) {
      // Find the exact winning run (in case the full line is longer than
      // winLength, we still want a contiguous run of exactly winLength+ cells,
      // trimmed to the minimal winning stretch for a clean line animation).
      const winningCells = cells.slice(0, winLength);
      return { winner: symbol, winningCells, direction: [dr, dc] };
    }
  }

  return null;
}

export function isBoardFull(board: Cell[]): boolean {
  return board.every((cell) => cell !== null);
}

export function getGameStatus(
  board: Cell[],
  boardSize: number,
  winLength: number,
  lastMoveIndex: number | null,
): { status: GameStatus; result: WinResult | null } {
  if (lastMoveIndex !== null) {
    const result = checkWinnerFromMove(board, boardSize, winLength, lastMoveIndex);
    if (result) return { status: "won", result };
  }
  if (isBoardFull(board)) return { status: "draw", result: null };
  return { status: "playing", result: null };
}

export function opponentOf(symbol: SymbolKind): SymbolKind {
  return symbol === "X" ? "O" : "X";
}

/** Board sizes/win-lengths the game supports. Kept here so both client menu
 * UI and the server's room-config validation agree on the legal set. */
export const SUPPORTED_BOARD_SIZES = [3, 4, 5];

export function isSupportedBoardSize(boardSize: number): boolean {
  return SUPPORTED_BOARD_SIZES.includes(boardSize);
}

export function isValidRoomConfig(boardSize: number, winLength: number): boolean {
  return isSupportedBoardSize(boardSize) && getValidWinLengths(boardSize).includes(winLength);
}
