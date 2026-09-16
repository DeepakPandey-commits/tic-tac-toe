import { useRef } from "react";
import type { Cell as CellValue, GameStatus, Stroke, SymbolKind } from "../types";
import Cell from "./Cell";
import WinningLine from "./WinningLine";

interface BoardProps {
  boardSize: number;
  board: CellValue[];
  placements: Record<number, Stroke[] | undefined>;
  currentPlayer: SymbolKind;
  status: GameStatus;
  winningCells: number[] | null;
  winner: SymbolKind | null;
  onCellTap: (index: number) => void;
  onCellDraw: (index: number, strokes: Stroke[]) => void;
  onInvalidDraw: () => void;
  /** Local play always allows the active player to move; online play sets
   * this to false while it's the opponent's turn so a client can't act out
   * of turn (the server would reject it regardless — this is UX, not the
   * security boundary). Defaults to true so local play is unaffected. */
  canInteract?: boolean;
}

export default function Board({
  boardSize,
  board,
  placements,
  currentPlayer,
  status,
  winningCells,
  winner,
  onCellTap,
  onCellDraw,
  onInvalidDraw,
  canInteract = true,
}: BoardProps) {
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const cellElsRef = useRef<Record<number, HTMLDivElement | null>>({});

  const winningSet = new Set(winningCells ?? []);
  const firstWin = winningCells?.[0] ?? null;
  const lastWin = winningCells?.[winningCells.length - 1] ?? null;

  return (
    <div
      ref={wrapperRef}
      className="relative w-full rounded-[var(--radius-lg)] border border-[var(--border)] bg-[var(--bg-soft)] p-[3.5%] shadow-[0_30px_60px_-30px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.04)]"
    >
      <div
        className="grid w-full"
        style={{
          gridTemplateColumns: `repeat(${boardSize}, minmax(0, 1fr))`,
          gap: `clamp(5px, ${1.8 - boardSize * 0.08}vw, 14px)`,
        }}
        role="grid"
        aria-label={`${boardSize} by ${boardSize} tic-tac-toe board`}
      >
        {board.map((value, index) => {
          const row = Math.floor(index / boardSize);
          const col = index % boardSize;
          const isWinning = winningSet.has(index);
          const winOrder = isWinning && winningCells ? winningCells.indexOf(index) : 0;
          const active = status === "playing" && value === null && canInteract;
          return (
            <div
              key={index}
              ref={(el) => {
                cellElsRef.current[index] = el;
              }}
            >
              <Cell
                index={index}
                row={row}
                col={col}
                value={value}
                strokes={placements[index]}
                active={active}
                currentSymbol={currentPlayer}
                isWinning={isWinning}
                winOrder={winOrder}
                onTap={onCellTap}
                onDrawSuccess={onCellDraw}
                onInvalid={onInvalidDraw}
              />
            </div>
          );
        })}
      </div>

      {status === "won" && winner && firstWin !== null && lastWin !== null && (
        <WinningLine
          containerEl={wrapperRef.current}
          startEl={cellElsRef.current[firstWin] ?? null}
          endEl={cellElsRef.current[lastWin] ?? null}
          symbol={winner}
          active
        />
      )}
    </div>
  );
}
