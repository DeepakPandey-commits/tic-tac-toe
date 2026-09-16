import { memo, useState } from "react";
import type { Cell as CellValue, Stroke, SymbolKind } from "../types";
import { useCellDrawing } from "../hooks/useCellDrawing";
import SymbolGlyph from "./SymbolGlyph";

interface CellProps {
  index: number;
  row: number;
  col: number;
  value: CellValue;
  strokes?: Stroke[];
  active: boolean;
  currentSymbol: SymbolKind;
  isWinning: boolean;
  winOrder: number;
  onTap: (index: number) => void;
  onDrawSuccess: (index: number, strokes: Stroke[]) => void;
  onInvalid: () => void;
}

function CellImpl({
  index,
  row,
  col,
  value,
  strokes,
  active,
  currentSymbol,
  isWinning,
  winOrder,
  onTap,
  onDrawSuccess,
  onInvalid,
}: CellProps) {
  const [shaking, setShaking] = useState(false);

  const { containerRef, canvasRef, isDrawing, handlers } = useCellDrawing({
    active,
    symbol: currentSymbol,
    onTap: () => onTap(index),
    onDrawSuccess: (s) => onDrawSuccess(index, s),
    onInvalid: () => {
      setShaking(true);
      onInvalid();
    },
  });

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!active) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onTap(index);
    }
  };

  const label = value
    ? `Row ${row + 1}, column ${col + 1}, ${value}`
    : active
      ? `Row ${row + 1}, column ${col + 1}, empty. Tap or draw ${currentSymbol} to play here.`
      : `Row ${row + 1}, column ${col + 1}, empty`;

  return (
    <div
      ref={containerRef}
      role="gridcell"
      aria-label={label}
      tabIndex={active ? 0 : -1}
      onKeyDown={handleKeyDown}
      onAnimationEnd={() => setShaking(false)}
      className={[
        "relative aspect-square rounded-[16px] select-none",
        "bg-[var(--surface)] border border-[var(--border)]",
        "transition-[transform,box-shadow,background-color,border-color] duration-150 ease-out",
        active ? "cursor-crosshair" : value ? "cursor-default" : "cursor-default",
        active && !isDrawing ? "hover:bg-[var(--surface-strong)] hover:border-[var(--border-strong)] hover:-translate-y-[2px] hover:shadow-[0_10px_24px_-12px_rgba(0,0,0,0.5)]" : "",
        isDrawing ? "scale-[0.98] bg-[var(--surface-strong)]" : "",
        shaking ? "animate-shake" : "",
        isWinning ? "z-10" : "",
      ].join(" ")}
      style={{
        touchAction: "none",
        boxShadow: isWinning
          ? `0 0 0 2px ${value === "X" ? "var(--accent-x)" : "var(--accent-o)"}55, 0 12px 28px -14px ${value === "X" ? "var(--accent-x-glow)" : "var(--accent-o-glow)"}`
          : undefined,
        animationDelay: isWinning ? `${winOrder * 90}ms` : undefined,
      }}
      {...handlers}
    >
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full rounded-[16px]" style={{ pointerEvents: "none" }} />

      {value && (
        <div
          className={["absolute inset-[14%]", isWinning ? "animate-pop-in" : "animate-pop-in"].join(" ")}
          style={isWinning ? { animationDelay: `${winOrder * 90}ms` } : undefined}
        >
          <SymbolGlyph symbol={value} strokes={strokes} animate strokeWidth={value === "X" ? 10 : 8} className="h-full w-full" />
        </div>
      )}

    </div>
  );
}

export default memo(CellImpl);
