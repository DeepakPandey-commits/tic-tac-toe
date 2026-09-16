import type { SymbolKind, Cell, GameStatus } from "../shared/types";

export type { SymbolKind, Cell, GameStatus };

export interface Settings {
  playerSymbol: SymbolKind;
  boardSize: number;
  winLength: number;
  soundOn: boolean;
}

export interface Scores {
  player1: number;
  player2: number;
  draws: number;
}

export interface Point {
  x: number;
  y: number;
}

export type Stroke = Point[];
