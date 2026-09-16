import { useState } from "react";
import { clampWinLength, getValidWinLengths } from "../game/engine";
import { useMultiplayer } from "../multiplayer/useMultiplayer";
import OnlineGameScreen from "./OnlineGameScreen";

interface MultiplayerScreenProps {
  soundOn: boolean;
  onToggleSound: () => void;
  onExitToMenu: () => void;
}

const BOARD_SIZES = [3, 4, 5];
const WIN_LENGTH_OPTIONS = [3, 4, 5];

type LobbyMode = "choice" | "create" | "join";

function StatusDot({ connected }: { connected: boolean }) {
  return (
    <span
      className={["inline-block h-2 w-2 rounded-full", connected ? "" : "animate-pulse"].join(" ")}
      style={{ background: connected ? "var(--success)" : "#ffd166" }}
    />
  );
}

export default function MultiplayerScreen({ soundOn, onToggleSound, onExitToMenu }: MultiplayerScreenProps) {
  const mp = useMultiplayer();
  const [mode, setMode] = useState<LobbyMode>("choice");
  const [boardSize, setBoardSize] = useState(3);
  const [winLength, setWinLength] = useState(3);
  const [joinCode, setJoinCode] = useState("");
  const [copied, setCopied] = useState(false);

  const handleExit = () => {
    if (mp.phase !== "idle") mp.leaveRoom();
    onExitToMenu();
  };

  // Once a match exists (in progress, finished, or just abandoned by the
  // opponent), hand off to the same GameOverOverlay/board/HUD the online
  // screen shares with local play.
  if (mp.phase === "active" || mp.phase === "finished" || mp.phase === "opponent-left") {
    return <OnlineGameScreen mp={mp} soundOn={soundOn} onToggleSound={onToggleSound} onExitToMenu={handleExit} />;
  }

  const handleBoardSize = (size: number) => {
    setBoardSize(size);
    setWinLength((prev) => clampWinLength(size, prev));
  };

  const handleCreate = () => mp.createRoom(boardSize, winLength);
  const handleJoin = () => {
    if (joinCode.trim().length === 6) mp.joinRoom(joinCode);
  };

  const handleCopy = async () => {
    if (!mp.roomState) return;
    try {
      await navigator.clipboard.writeText(mp.roomState.roomCode);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard permission unavailable — the code is still shown on screen */
    }
  };

  const connected = mp.connectionStatus === "connected";
  const validWinLengths = getValidWinLengths(boardSize);

  return (
    <div className="relative flex h-[100dvh] w-full flex-col items-center overflow-hidden">
      <div className="flex w-full max-w-[460px] min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 pb-6 pt-[max(24px,var(--safe-t))] sm:pt-10">
        <header className="animate-rise-in flex items-center gap-3">
          <button
            type="button"
            onClick={mp.phase === "waiting" ? handleExit : mode === "choice" ? onExitToMenu : () => setMode("choice")}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] transition-colors hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
            aria-label="Back"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div>
            <h1 className="font-display text-xl font-extrabold text-[var(--text-primary)]">Play Online</h1>
            <p className="flex items-center gap-1.5 text-xs text-[var(--text-tertiary)]">
              <StatusDot connected={connected} />
              {connected
                ? "Connected to server"
                : mp.connectionStatus === "connecting"
                  ? "Connecting…"
                  : mp.connectionStatus === "failed"
                    ? "Unable to connect"
                    : "Reconnecting…"}
            </p>
          </div>
        </header>

        {mp.error && (
          <div className="animate-rise-in flex items-start justify-between gap-3 rounded-2xl border border-[var(--danger)] bg-[rgba(248,113,113,0.08)] px-4 py-3 text-sm text-[var(--danger)]">
            <span>{mp.error.message}</span>
            <button type="button" onClick={mp.dismissError} aria-label="Dismiss" className="shrink-0 text-[var(--text-tertiary)]">
              ✕
            </button>
          </div>
        )}

        {mp.connectionStatus === "failed" && (
          <section className="animate-pop-in flex flex-1 flex-col items-center justify-center gap-4 rounded-[24px] border border-[var(--border-strong)] bg-[var(--surface)] px-6 py-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-strong)] text-2xl">📡</div>
            <div>
              <p className="font-display text-base font-bold text-[var(--text-primary)]">Unable to connect to the game server.</p>
              <p className="mt-1.5 text-sm text-[var(--text-secondary)]">Check your connection and try again.</p>
            </div>
            <button
              type="button"
              onClick={mp.retryConnection}
              className="rounded-full px-6 py-2.5 text-center font-display text-sm font-extrabold tracking-wide text-[#0a0d16]"
              style={{ background: "linear-gradient(135deg, var(--accent-x), var(--accent-o))" }}
            >
              TRY AGAIN
            </button>
          </section>
        )}

        {mp.connectionStatus !== "failed" && mode === "choice" && mp.phase !== "waiting" && (
          <section className="animate-rise-in flex flex-1 flex-col justify-center gap-3.5">
            <button
              type="button"
              onClick={() => setMode("create")}
              disabled={!connected}
              className="w-full rounded-2xl py-4 text-center font-display text-base font-extrabold tracking-wide text-[#0a0d16] shadow-[0_20px_40px_-16px_rgba(79,157,255,0.5)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, var(--accent-x), var(--accent-o))" }}
            >
              CREATE ROOM
            </button>
            <button
              type="button"
              onClick={() => setMode("join")}
              disabled={!connected}
              className="w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] py-4 text-center font-display text-base font-bold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-strong)] disabled:cursor-not-allowed disabled:opacity-50"
            >
              JOIN ROOM
            </button>
          </section>
        )}

        {mp.connectionStatus !== "failed" && mode === "create" && mp.phase === "idle" && (
          <section className="animate-rise-in flex flex-col gap-5">
            <div>
              <h2 className="mb-2.5 font-display text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Choose Board</h2>
              <div className="flex gap-2.5">
                {BOARD_SIZES.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => handleBoardSize(size)}
                    aria-pressed={boardSize === size}
                    className={[
                      "flex-1 rounded-[16px] border px-3 py-3 font-display text-sm font-bold transition-all duration-200",
                      boardSize === size
                        ? "border-transparent bg-[var(--surface-strong)] text-[var(--text-primary)] shadow-[0_0_0_2px_var(--accent-x)]"
                        : "border-[var(--border)] bg-[var(--surface)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]",
                    ].join(" ")}
                  >
                    {size} × {size}
                  </button>
                ))}
              </div>
            </div>
            <div>
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
            </div>
            <p className="text-xs text-[var(--text-secondary)]">You&rsquo;ll play as X and go first. Your friend joins as O.</p>
            <button
              type="button"
              onClick={handleCreate}
              className="w-full rounded-2xl py-4 text-center font-display text-base font-extrabold tracking-wide text-[#0a0d16] shadow-[0_20px_40px_-16px_rgba(79,157,255,0.5)] transition-transform active:scale-[0.98]"
              style={{ background: "linear-gradient(135deg, var(--accent-x), var(--accent-o))" }}
            >
              CREATE ROOM
            </button>
          </section>
        )}

        {mode === "create" && mp.phase === "creating" && (
          <p className="animate-rise-in text-center text-sm text-[var(--text-secondary)]">Creating room…</p>
        )}

        {mp.phase === "waiting" && mp.roomState && (
          <section className="animate-pop-in flex flex-1 flex-col items-center justify-center gap-5 rounded-[24px] border border-[var(--border-strong)] bg-[var(--surface)] px-6 py-8 text-center">
            <p className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Your Room Code</p>
            <p className="font-display text-5xl font-extrabold tracking-[0.15em] text-[var(--text-primary)]">{mp.roomState.roomCode}</p>
            <button
              type="button"
              onClick={handleCopy}
              className="rounded-full border border-[var(--border-strong)] bg-[var(--surface-strong)] px-5 py-2 font-display text-xs font-bold tracking-wide text-[var(--text-primary)] transition-colors hover:bg-[var(--surface)]"
            >
              {copied ? "COPIED!" : "COPY CODE"}
            </button>
            <p className="text-xs text-[var(--text-secondary)]">Share this code with your friend</p>
            <p className="flex items-center gap-2 text-sm font-medium text-[var(--text-primary)]">
              <StatusDot connected={false} />
              Waiting for player…
            </p>
          </section>
        )}

        {mp.connectionStatus !== "failed" && mode === "join" && mp.phase === "idle" && (
          <section className="animate-rise-in flex flex-col gap-4">
            <h2 className="font-display text-xs font-bold uppercase tracking-wider text-[var(--text-tertiary)]">Enter Room Code</h2>
            <input
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.toUpperCase().slice(0, 6))}
              placeholder="X7KQ2P"
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              spellCheck={false}
              maxLength={6}
              className="w-full rounded-2xl border border-[var(--border-strong)] bg-[var(--surface)] px-4 py-4 text-center font-display text-2xl font-bold tracking-[0.3em] text-[var(--text-primary)] outline-none focus-visible:border-[var(--accent-x)]"
            />
            <button
              type="button"
              onClick={handleJoin}
              disabled={joinCode.trim().length !== 6}
              className="w-full rounded-2xl py-4 text-center font-display text-base font-extrabold tracking-wide text-[#0a0d16] shadow-[0_20px_40px_-16px_rgba(79,157,255,0.5)] transition-transform active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: "linear-gradient(135deg, var(--accent-x), var(--accent-o))" }}
            >
              JOIN ROOM
            </button>
          </section>
        )}

        {mode === "join" && mp.phase === "joining" && (
          <p className="animate-rise-in text-center text-sm text-[var(--text-secondary)]">Joining room…</p>
        )}
      </div>
    </div>
  );
}
