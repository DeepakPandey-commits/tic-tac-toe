import { useMemo, useState } from "react";
import type { Scores, Settings, SymbolKind } from "../types";
import { clampWinLength, getValidWinLengths } from "../game/engine";
import SymbolGlyph from "./SymbolGlyph";

interface MenuScreenProps {
  initialSettings: Settings;
  scores: Scores;
  onStart: (settings: Settings) => void;
  onResetScores: () => void;
  onPlayOnline: () => void;
}

const BOARD_OPTIONS: { size: number; label: string; tagline: string }[] = [
  { size: 3, label: "3 × 3", tagline: "Classic" },
  { size: 4, label: "4 × 4", tagline: "Advanced" },
  { size: 5, label: "5 × 5", tagline: "Expert" },
];

const WIN_LENGTH_OPTIONS = [3, 4, 5];

function SymbolCard({ symbol, selected, onSelect }: { symbol: SymbolKind; selected: boolean; onSelect: () => void }) {
  const color = symbol === "X" ? "var(--accent-x)" : "var(--accent-o)";
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "group relative flex flex-1 flex-col items-center gap-2 rounded-[20px] border px-4 py-5 transition-all duration-200",
        selected
          ? "border-transparent bg-[var(--surface-strong)] shadow-[0_0_0_2px_var(--ring-color),0_16px_32px_-18px_var(--glow-color)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)] hover:bg-[var(--surface-strong)]",
      ].join(" ")}
      style={
        {
          "--ring-color": color,
          "--glow-color": color,
        } as React.CSSProperties
      }
    >
      <div className="h-12 w-12" style={{ opacity: selected ? 1 : 0.55, transition: "opacity 0.2s" }}>
        <SymbolGlyph symbol={symbol} strokeWidth={11} className="h-full w-full" />
      </div>
      <span className={["font-display text-sm font-bold tracking-wide", selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"].join(" ")}>
        {symbol === "X" ? "Cross" : "Zero"}
      </span>
      {selected && (
        <span
          className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold text-[#0a0d16]"
          style={{ background: color }}
        >
          ✓
        </span>
      )}
    </button>
  );
}

function BoardSizeCard({
  size,
  label,
  tagline,
  selected,
  onSelect,
}: {
  size: number;
  label: string;
  tagline: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={[
        "flex flex-1 flex-col items-center gap-2.5 rounded-[18px] border px-2 py-4 transition-all duration-200",
        selected
          ? "border-transparent bg-[var(--surface-strong)] shadow-[0_0_0_2px_var(--accent-x)]"
          : "border-[var(--border)] bg-[var(--surface)] hover:border-[var(--border-strong)]",
      ].join(" ")}
    >
      <div
        className="grid gap-[3px]"
        style={{ gridTemplateColumns: `repeat(${size}, minmax(0,1fr))`, width: `${Math.min(44, size * 9)}px` }}
      >
        {Array.from({ length: size * size }, (_, i) => (
          <span
            key={i}
            className="aspect-square rounded-[2px]"
            style={{ background: selected ? "var(--accent-x)" : "var(--text-tertiary)", opacity: selected ? 0.9 : 0.5 }}
          />
        ))}
      </div>
      <div className="text-center">
        <div className={["font-display text-sm font-bold", selected ? "text-[var(--text-primary)]" : "text-[var(--text-secondary)]"].join(" ")}>
          {label}
        </div>
        <div className="text-[10px] uppercase tracking-wide text-[var(--text-tertiary)]">{tagline}</div>
      </div>
    </button>
  );
}

export default function MenuScreen({ initialSettings, scores, onStart, onResetScores, onPlayOnline }: MenuScreenProps) {
  const [playerSymbol, setPlayerSymbol] = useState<SymbolKind>(initialSettings.playerSymbol);
  const [boardSize, setBoardSize] = useState(initialSettings.boardSize);
  const [winLength, setWinLength] = useState(clampWinLength(initialSettings.boardSize, initialSettings.winLength));

  const validWinLengths = useMemo(() => getValidWinLengths(boardSize), [boardSize]);
  const hasScoreHistory = scores.player1 + scores.player2 + scores.draws > 0;

  const handleBoardSize = (size: number) => {
    setBoardSize(size);
    setWinLength((prev) => clampWinLength(size, prev));
  };

  const handleStart = () => {
    onStart({ ...initialSettings, playerSymbol, boardSize, winLength });
  };

  return (
    <div className="relative flex h-[100dvh] w-full flex-col items-center overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div
          className="absolute -left-[20%] -top-[15%] h-[55vh] w-[55vh] rounded-full opacity-40 blur-[90px]"
          style={{ background: "radial-gradient(circle, var(--accent-x) 0%, transparent 70%)", animation: "bg-drift 16s ease-in-out infinite" }}
        />
        <div
          className="absolute -bottom-[20%] -right-[15%] h-[60vh] w-[60vh] rounded-full opacity-30 blur-[100px]"
          style={{ background: "radial-gradient(circle, var(--accent-o) 0%, transparent 70%)", animation: "bg-drift 18s ease-in-out infinite reverse" }}
        />
      </div>

      <div className="flex w-full max-w-[460px] min-h-0 flex-1 flex-col gap-7 overflow-y-auto overscroll-contain px-5 pb-6 pt-[max(40px,var(--safe-t))] sm:pt-14">
        <header className="animate-rise-in text-center">
          <h1 className="font-display text-4xl font-extrabold tracking-tight text-[var(--text-primary)] sm:text-5xl">
            TIC <span style={{ color: "var(--accent-x)" }}>TAC</span> TOE
          </h1>
          <p className="mt-2 text-sm text-[var(--text-secondary)] sm:text-base">Draw it. Place it. Win it.</p>
        </header>

        {hasScoreHistory && (
          <div className="animate-rise-in -mt-3 flex items-center justify-center gap-3 text-xs text-[var(--text-tertiary)]">
            <span>
              <span style={{ color: "var(--accent-x)" }}>P1 {scores.player1}</span> &bull; {scores.draws} draws &bull;{" "}
              <span style={{ color: "var(--accent-o)" }}>P2 {scores.player2}</span>
            </span>
            <button type="button" onClick={onResetScores} className="underline decoration-dotted underline-offset-2 hover:text-[var(--text-secondary)]">
              Reset score
            </button>
          </div>
        )}

        <section className="animate-rise-in" style={{ animationDelay: "0.05s" }}>
          <h2 className="mb-2.5 font-display text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Choose Your Symbol</h2>
          <div className="flex gap-3">
            <SymbolCard symbol="X" selected={playerSymbol === "X"} onSelect={() => setPlayerSymbol("X")} />
            <SymbolCard symbol="O" selected={playerSymbol === "O"} onSelect={() => setPlayerSymbol("O")} />
          </div>
        </section>

        <section className="animate-rise-in" style={{ animationDelay: "0.1s" }}>
          <h2 className="mb-2.5 font-display text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Choose Board</h2>
          <div className="flex gap-2.5">
            {BOARD_OPTIONS.map((opt) => (
              <BoardSizeCard key={opt.size} {...opt} selected={boardSize === opt.size} onSelect={() => handleBoardSize(opt.size)} />
            ))}
          </div>
        </section>

        <section className="animate-rise-in" style={{ animationDelay: "0.15s" }}>
          <h2 className="mb-2.5 font-display text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Win Condition</h2>
          <div className="flex gap-2.5">
            {WIN_LENGTH_OPTIONS.map((n) => {
              const disabled = !validWinLengths.includes(n);
              const selected = winLength === n && !disabled;
              return (
                <button
                  key={n}
                  type="button"
                  disabled={disabled}
                  aria-pressed={selected}
                  onClick={() => setWinLength(n)}
                  className={[
                    "flex-1 rounded-[16px] border px-3 py-3 font-display text-sm font-bold transition-all duration-200",
                    disabled
                      ? "cursor-not-allowed border-[var(--border)] bg-transparent text-[var(--text-tertiary)] opacity-35"
                      : selected
                        ? "border-transparent bg-[var(--surface-strong)] text-[var(--text-primary)] shadow-[0_0_0_2px_var(--accent-o)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]",
                  ].join(" ")}
                >
                  {n} in a row
                </button>
              );
            })}
          </div>
        </section>

        <div
          className="animate-rise-in rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-center"
          style={{ animationDelay: "0.2s" }}
        >
          <span className="font-display text-sm font-semibold text-[var(--text-primary)]">
            {boardSize} × {boardSize} <span className="text-[var(--text-tertiary)]">&bull;</span> {winLength} in a row
          </span>
        </div>

        <section
          className="animate-rise-in flex items-center gap-3.5 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-4"
          style={{ animationDelay: "0.25s" }}
        >
          <DrawHintIcon />
          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
            <span className="font-semibold text-[var(--text-primary)]">Play your way.</span> Tap a cell, or draw your {playerSymbol}{" "}
            with your finger, mouse, or stylus.
          </p>
        </section>
      </div>

      <div className="flex w-full max-w-[460px] shrink-0 flex-col gap-2 border-t border-[var(--border)] bg-[var(--bg)] px-5 pb-[max(20px,var(--safe-b))] pt-4">
        <button
          type="button"
          onClick={handleStart}
          className="w-full rounded-2xl py-4 text-center font-display text-base font-extrabold tracking-wide text-[#0a0d16] shadow-[0_20px_40px_-16px_rgba(79,157,255,0.5)] transition-transform active:scale-[0.98]"
          style={{ background: "linear-gradient(135deg, var(--accent-x), var(--accent-o))" }}
        >
          START GAME
        </button>
        <button
          type="button"
          onClick={onPlayOnline}
          className="w-full rounded-2xl border border-[var(--border-strong)] bg-transparent py-2.5 text-center font-display text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] active:scale-[0.98]"
        >
          PLAY ONLINE
        </button>
      </div>
    </div>
  );
}

function DrawHintIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0" aria-hidden="true">
      <rect x="1" y="1" width="38" height="38" rx="10" fill="var(--surface-strong)" stroke="var(--border-strong)" />
      <path
        d="M12 12 L28 28 M28 12 L12 28"
        fill="none"
        stroke="var(--accent-x)"
        strokeWidth="3"
        strokeLinecap="round"
        pathLength={1}
        strokeDasharray="1"
        strokeDashoffset="1"
        style={{ animation: "draw-hint 2.6s ease-in-out infinite" }}
      />
      <style>{`
        @keyframes draw-hint {
          0% { stroke-dashoffset: 1; opacity: 0.3; }
          35% { stroke-dashoffset: 0; opacity: 1; }
          75% { stroke-dashoffset: 0; opacity: 1; }
          95%, 100% { stroke-dashoffset: -1; opacity: 0; }
        }
      `}</style>
    </svg>
  );
}
