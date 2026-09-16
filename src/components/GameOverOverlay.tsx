import { useMemo } from "react";
import type { GameStatus, SymbolKind } from "../types";

interface RematchState {
  myReady: boolean;
  opponentReady: boolean;
  /** true once the opponent has left the room — rematch is no longer possible. */
  opponentGone?: boolean;
}

interface GameOverOverlayProps {
  visible: boolean;
  status: GameStatus;
  winner: SymbolKind | null;
  winnerLabel: string | null;
  winLength: number;
  onPlayAgain: () => void;
  onMainMenu: () => void;
  /** Only passed by the online game screen — local play rematches instantly. */
  rematch?: RematchState;
}

const CONFETTI_COLORS = ["var(--accent-x)", "var(--accent-o)", "#ffd166", "#34d399"];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        id: i,
        angle: (360 / 18) * i + (i % 2 === 0 ? 6 : -6),
        distance: 70 + ((i * 37) % 40),
        delay: (i % 6) * 0.03,
        color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
        rotate: (i * 53) % 360,
      })),
    [],
  );

  return (
    <div className="pointer-events-none absolute inset-0 flex items-center justify-center overflow-hidden">
      {pieces.map((p) => (
        <span
          key={p.id}
          className="absolute h-2 w-1 rounded-sm opacity-0"
          style={{
            backgroundColor: p.color,
            animation: `confetti-burst 0.9s cubic-bezier(0.2,0.7,0.3,1) ${p.delay}s forwards`,
            // @ts-expect-error custom properties
            "--angle": `${p.angle}deg`,
            "--distance": `${p.distance}px`,
            "--rotate": `${p.rotate}deg`,
          }}
        />
      ))}
      <style>{`
        @keyframes confetti-burst {
          0% { transform: rotate(var(--angle)) translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: rotate(var(--angle)) translateY(calc(var(--distance) * -1)) rotate(var(--rotate)); opacity: 0; }
        }
      `}</style>
    </div>
  );
}

export default function GameOverOverlay({
  visible,
  status,
  winner,
  winnerLabel,
  winLength,
  onPlayAgain,
  onMainMenu,
  rematch,
}: GameOverOverlayProps) {
  if (!visible) return null;

  const isOpponentGone = Boolean(rematch?.opponentGone);
  // An opponent can leave mid-match, before any win/draw was ever recorded —
  // that takes priority over the (possibly still "playing") game status so
  // we never show a misleading "It's a Draw" for an abandoned match.
  const isWin = !isOpponentGone && status === "won" && winner;
  const color = winner === "X" ? "var(--accent-x)" : "var(--accent-o)";

  const playAgainLabel = rematch?.myReady ? "WAITING…" : "PLAY AGAIN";
  const playAgainDisabled = Boolean(rematch?.myReady || rematch?.opponentGone);
  const rematchMessage =
    rematch && !rematch.opponentGone
      ? rematch.myReady && rematch.opponentReady
        ? "Starting…"
        : rematch.myReady
          ? "Waiting for opponent…"
          : rematch.opponentReady
            ? "Opponent is ready — your move"
            : null
      : null;

  return (
    <div
      className="game-over-overlay absolute inset-0 z-30 flex items-center justify-center rounded-[var(--radius-lg)] bg-[rgba(6,8,14,0.66)] backdrop-blur-sm"
      role="alertdialog"
      aria-live="assertive"
      aria-label={isOpponentGone ? "Opponent left the room" : isWin ? `${winnerLabel} wins` : "It's a draw"}
    >
      {isWin && <Confetti />}

      <div className="game-over-card animate-pop-in relative mx-4 flex w-full max-w-xs flex-col items-center gap-5 rounded-[24px] border border-[var(--border-strong)] bg-[var(--bg-soft)] px-6 py-8 text-center shadow-[0_40px_80px_-30px_rgba(0,0,0,0.7)] sm:max-w-sm sm:px-8">
        {isOpponentGone ? (
          <div>
            <div className="game-over-icon mx-auto mb-2 flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-strong)] text-3xl">
              🚪
            </div>
            <h2 className="game-over-title font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">Opponent Left</h2>
            <p className="game-over-subtitle mt-1.5 text-sm text-[var(--text-secondary)]">The match ended because your opponent disconnected</p>
          </div>
        ) : isWin ? (
          <>
            <div
              className="game-over-icon flex h-16 w-16 items-center justify-center rounded-full text-3xl"
              style={{ background: `${color}1a`, boxShadow: `0 0 40px -6px ${color}` }}
            >
              🎉
            </div>
            <div>
              <h2 className="game-over-title font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">{winnerLabel} Wins!</h2>
              <p className="game-over-subtitle mt-1.5 text-sm text-[var(--text-secondary)]">
                {winner} completed {winLength} in a row
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="game-over-icon flex h-16 w-16 items-center justify-center rounded-full bg-[var(--surface-strong)] text-3xl">🤝</div>
            <div>
              <h2 className="game-over-title font-display text-2xl font-bold text-[var(--text-primary)] sm:text-3xl">It&rsquo;s a Draw</h2>
              <p className="game-over-subtitle mt-1.5 text-sm text-[var(--text-secondary)]">The board filled up &mdash; no winner this round</p>
            </div>
          </>
        )}

        <div className="game-over-actions mt-1 flex w-full flex-col gap-2.5">
          {rematchMessage && (
            <p className="game-over-subtitle -mb-1 text-xs text-[var(--text-secondary)]" aria-live="polite">
              {rematchMessage}
            </p>
          )}
          {!isOpponentGone && (
            <button
              type="button"
              onClick={onPlayAgain}
              disabled={playAgainDisabled}
              className="w-full rounded-2xl px-5 py-3 font-display text-sm font-bold tracking-wide text-[#0a0d16] transition-transform active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60 disabled:active:scale-100"
              style={{ background: "linear-gradient(135deg, var(--accent-x), var(--accent-o))" }}
            >
              {rematch ? playAgainLabel : "PLAY AGAIN"}
            </button>
          )}
          <button
            type="button"
            onClick={onMainMenu}
            className="w-full rounded-2xl border border-[var(--border-strong)] bg-transparent px-5 py-3 font-display text-sm font-semibold text-[var(--text-secondary)] transition-colors hover:text-[var(--text-primary)] active:scale-[0.97]"
          >
            MAIN MENU
          </button>
        </div>
      </div>
    </div>
  );
}
