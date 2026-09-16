import { useCallback, useMemo, useReducer } from "react";
import type { Cell, GameStatus, SymbolKind } from "../types";
import { createEmptyBoard, getGameStatus, opponentOf, type WinResult } from "../game/engine";

interface GameEngineState {
  boardSize: number;
  winLength: number;
  board: Cell[];
  currentPlayer: SymbolKind;
  status: GameStatus;
  winner: SymbolKind | null;
  winningCells: number[] | null;
  winDirection: [number, number] | null;
  lastMoveIndex: number | null;
  moveCount: number;
}

type Action =
  | { type: "MOVE"; index: number }
  | { type: "RESET"; startingPlayer: SymbolKind }
  | { type: "CONFIGURE"; boardSize: number; winLength: number; startingPlayer: SymbolKind };

function init(boardSize: number, winLength: number, startingPlayer: SymbolKind): GameEngineState {
  return {
    boardSize,
    winLength,
    board: createEmptyBoard(boardSize),
    currentPlayer: startingPlayer,
    status: "playing",
    winner: null,
    winningCells: null,
    winDirection: null,
    lastMoveIndex: null,
    moveCount: 0,
  };
}

function reducer(state: GameEngineState, action: Action): GameEngineState {
  switch (action.type) {
    case "MOVE": {
      if (state.status !== "playing") return state;
      if (state.board[action.index] !== null) return state;

      const board = state.board.slice();
      board[action.index] = state.currentPlayer;

      const { status, result } = getGameStatus(board, state.boardSize, state.winLength, action.index);

      const won = status === "won" ? (result as WinResult) : null;

      return {
        ...state,
        board,
        lastMoveIndex: action.index,
        moveCount: state.moveCount + 1,
        status,
        winner: won?.winner ?? null,
        winningCells: won?.winningCells ?? null,
        winDirection: won?.direction ?? null,
        currentPlayer: status === "playing" ? opponentOf(state.currentPlayer) : state.currentPlayer,
      };
    }
    case "RESET":
      return init(state.boardSize, state.winLength, action.startingPlayer);
    case "CONFIGURE":
      return init(action.boardSize, action.winLength, action.startingPlayer);
    default:
      return state;
  }
}

export function useGameEngine(boardSize: number, winLength: number, startingPlayer: SymbolKind = "X") {
  const [state, dispatch] = useReducer(reducer, undefined, () => init(boardSize, winLength, startingPlayer));

  const makeMove = useCallback((index: number) => dispatch({ type: "MOVE", index }), []);

  const reset = useCallback(
    (nextStartingPlayer: SymbolKind = "X") => dispatch({ type: "RESET", startingPlayer: nextStartingPlayer }),
    [],
  );

  const configure = useCallback(
    (nextBoardSize: number, nextWinLength: number, nextStartingPlayer: SymbolKind = "X") =>
      dispatch({ type: "CONFIGURE", boardSize: nextBoardSize, winLength: nextWinLength, startingPlayer: nextStartingPlayer }),
    [],
  );

  const canPlay = useMemo(() => state.status === "playing", [state.status]);

  return { ...state, makeMove, reset, configure, canPlay };
}

export type UseGameEngineReturn = ReturnType<typeof useGameEngine>;
