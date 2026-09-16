import type { Scores, SymbolKind } from "../types";
import SymbolGlyph from "./SymbolGlyph";

interface ConnectionBadge {
  label: string;
  color: string;
  pulsing?: boolean;
}

interface HudProps {
  player1Symbol: SymbolKind;
  player2Symbol: SymbolKind;
  currentPlayer: SymbolKind;
  isGameActive: boolean;
  scores: Scores;
  soundOn: boolean;
  boardSize: number;
  winLength: number;
  onToggleSound: () => void;
  onRestart: () => void;
  onMainMenu: () => void;
  /** Only passed by the online game screen — local play never shows this. */
  connectionBadge?: ConnectionBadge;
}

function PlayerBadge({
  label,
  symbol,
  isTurn,
  score,
}: {
  label: string;
  symbol: SymbolKind;
  isTurn: boolean;
  score: number;
}) {
  const color = symbol === "X" ? "var(--accent-x)" : "var(--accent-o)";
  return (
    <div
      className={[
        "hud-player-badge flex items-center gap-2.5 rounded-2xl border px-3 py-2 transition-all duration-300 sm:gap-3 sm:px-4",
        isTurn ? "border-[var(--border-strong)] bg-[var(--surface-strong)]" : "border-[var(--border)] bg-[var(--surface)] opacity-60",
      ].join(" ")}
      style={isTurn ? { boxShadow: `0 0 0 1px ${color}33, 0 8px 20px -10px ${color}66` } : undefined}
    >
      <div className="hud-player-icon h-6 w-6 shrink-0 sm:h-7 sm:w-7" style={{ color }}>
        <SymbolGlyph symbol={symbol} strokeWidth={12} className="h-full w-full" />
      </div>
      <div className="hud-player-text leading-tight">
        <div className="hud-player-label font-display text-[11px] font-semibold uppercase tracking-wide text-[var(--text-secondary)] sm:text-xs">
          {label}
        </div>
        <div className="hud-player-score font-display text-base font-bold text-[var(--text-primary)] sm:text-lg">{score}</div>
      </div>
      {isTurn && (
        <span className="ml-0.5 h-2 w-2 shrink-0 animate-pulse rounded-full sm:h-2.5 sm:w-2.5" style={{ background: color }} />
      )}
    </div>
  );
}

export default function Hud({
  player1Symbol,
  player2Symbol,
  currentPlayer,
  isGameActive,
  scores,
  soundOn,
  boardSize,
  winLength,
  onToggleSound,
  onRestart,
  onMainMenu,
  connectionBadge,
}: HudProps) {
  return (
    <div className="game-hud w-full">
      <div className="hud-top-row mb-3 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={onMainMenu}
          className="flex min-h-[40px] items-center gap-1.5 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
            <path d="M15 18l-6-6 6-6" />
          </svg>
          Menu
        </button>

        <div className="hud-board-info flex items-center justify-center gap-1 font-display text-[11px] font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
          <span>
            {boardSize}×{boardSize} <span className="opacity-50">&bull;</span> {winLength} in a row
          </span>
          {connectionBadge && (
            <span className="ml-0.5 inline-flex items-center gap-1 whitespace-nowrap">
              <span className="opacity-50">&bull;</span>
              <span
                className={["h-1.5 w-1.5 shrink-0 rounded-full", connectionBadge.pulsing ? "animate-pulse" : ""].join(" ")}
                style={{ background: connectionBadge.color }}
              />
              {connectionBadge.label}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={onToggleSound}
            aria-label={soundOn ? "Mute sound" : "Unmute sound"}
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            {soundOn ? (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                <path d="M16 8a5 5 0 0 1 0 8" />
                <path d="M19 5a9 9 0 0 1 0 14" />
              </svg>
            ) : (
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                <path d="m17 9 4 6M21 9l-4 6" />
              </svg>
            )}
          </button>
          <button
            type="button"
            onClick={onRestart}
            aria-label="Restart round"
            className="flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12a9 9 0 1 1-2.64-6.36" />
              <path d="M21 4v5h-5" />
            </svg>
          </button>
        </div>
      </div>

      <div className="hud-players-row flex items-center justify-center gap-2 sm:gap-3">
        <PlayerBadge label="Player 1" symbol={player1Symbol} isTurn={isGameActive && currentPlayer === player1Symbol} score={scores.player1} />
        <div className="hud-draws px-1 text-center font-display text-[11px] font-semibold uppercase tracking-widest text-[var(--text-tertiary)]">
          <div>{scores.draws}</div>
          <div className="hud-draws-label">Draws</div>
        </div>
        <PlayerBadge label="Player 2" symbol={player2Symbol} isTurn={isGameActive && currentPlayer === player2Symbol} score={scores.player2} />
      </div>
    </div>
  );
}
