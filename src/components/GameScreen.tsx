import { useEffect, useRef, useState } from "react";
import type { Scores, Settings, Stroke } from "../types";
import { useGameEngine } from "../hooks/useGameEngine";
import { opponentOf } from "../game/engine";
import { playDraw, playInvalid, playMove, playTurn, playWin, setMuted } from "../game/sound";
import Board from "./Board";
import Hud from "./Hud";
import GameOverOverlay from "./GameOverOverlay";

interface GameScreenProps {
  settings: Settings;
  scores: Scores;
  onScoresChange: (updater: (prev: Scores) => Scores) => void;
  onToggleSound: () => void;
  onExitToMenu: () => void;
}

const LINE_REVEAL_MS = 650;
const DRAW_REVEAL_MS = 350;

export default function GameScreen({ settings, scores, onScoresChange, onToggleSound, onExitToMenu }: GameScreenProps) {
  const engine = useGameEngine(settings.boardSize, settings.winLength, "X");
  const [placements, setPlacements] = useState<Record<number, Stroke[] | undefined>>({});
  const [revealMessage, setRevealMessage] = useState(false);
  const [invalidHint, setInvalidHint] = useState(false);

  const scoredRef = useRef(false);
  const prevPlayerRef = useRef(engine.currentPlayer);
  const invalidTimerRef = useRef<number | null>(null);

  const player1Symbol = settings.playerSymbol;
  const player2Symbol = opponentOf(player1Symbol);

  useEffect(() => {
    setMuted(!settings.soundOn);
  }, [settings.soundOn]);

  // Turn-change chime (skip on mount and on game-end transitions).
  useEffect(() => {
    if (engine.status !== "playing") {
      prevPlayerRef.current = engine.currentPlayer;
      return;
    }
    if (prevPlayerRef.current !== engine.currentPlayer) {
      playTurn();
    }
    prevPlayerRef.current = engine.currentPlayer;
  }, [engine.currentPlayer, engine.status]);

  // Win / draw reveal sequencing: line animates first, then the message.
  useEffect(() => {
    if (engine.status === "playing") {
      setRevealMessage(false);
      scoredRef.current = false;
      return;
    }

    const delay = engine.status === "won" ? LINE_REVEAL_MS : DRAW_REVEAL_MS;
    const timer = window.setTimeout(() => {
      setRevealMessage(true);
      if (!scoredRef.current) {
        scoredRef.current = true;
        if (engine.status === "won" && engine.winner) {
          playWin();
          onScoresChange((prev) => ({
            ...prev,
            player1: prev.player1 + (engine.winner === player1Symbol ? 1 : 0),
            player2: prev.player2 + (engine.winner === player2Symbol ? 1 : 0),
          }));
        } else if (engine.status === "draw") {
          playDraw();
          onScoresChange((prev) => ({ ...prev, draws: prev.draws + 1 }));
        }
      }
    }, delay);

    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine.status]);

  const handleCellTap = (index: number) => {
    if (!engine.canPlay) return;
    playMove(engine.currentPlayer);
    engine.makeMove(index);
  };

  const handleCellDraw = (index: number, strokes: Stroke[]) => {
    if (!engine.canPlay) return;
    playMove(engine.currentPlayer);
    setPlacements((prev) => ({ ...prev, [index]: strokes }));
    engine.makeMove(index);
  };

  const handleInvalidDraw = () => {
    playInvalid();
    setInvalidHint(true);
    if (invalidTimerRef.current) window.clearTimeout(invalidTimerRef.current);
    invalidTimerRef.current = window.setTimeout(() => setInvalidHint(false), 1500);
  };

  const resetRound = () => {
    engine.reset("X");
    setPlacements({});
    setRevealMessage(false);
    scoredRef.current = false;
  };

  const currentPlayerNumber = engine.currentPlayer === player1Symbol ? 1 : 2;
  const winnerLabel = engine.winner ? (engine.winner === player1Symbol ? "Player 1" : "Player 2") : null;

  return (
    <div className="game-screen mx-auto flex h-full w-full max-w-[640px] flex-1 flex-col gap-4 px-4 pb-[max(16px,var(--safe-b))] pt-[max(14px,var(--safe-t))] sm:gap-5 sm:px-6">
      <Hud
        player1Symbol={player1Symbol}
        player2Symbol={player2Symbol}
        currentPlayer={engine.currentPlayer}
        isGameActive={engine.status === "playing"}
        scores={scores}
        soundOn={settings.soundOn}
        boardSize={settings.boardSize}
        winLength={settings.winLength}
        onToggleSound={onToggleSound}
        onRestart={resetRound}
        onMainMenu={onExitToMenu}
      />

      <div className="game-stage flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        <div className="game-status relative flex h-11 w-full flex-col items-center justify-center text-center">
          {engine.status === "playing" && (
            <div className="animate-rise-in" key={`${currentPlayerNumber}-${invalidHint}`}>
              {invalidHint ? (
                <p className="text-sm font-medium text-[var(--danger)]">Try drawing your {engine.currentPlayer} again</p>
              ) : (
                <>
                  <p className="game-status-title font-display text-base font-bold tracking-wide text-[var(--text-primary)] sm:text-lg">
                    Player {currentPlayerNumber} &mdash; Your Turn
                  </p>
                  <p className="game-status-subtitle text-xs text-[var(--text-secondary)]">Tap or draw {engine.currentPlayer} to play</p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="game-board-wrap relative w-full" style={{ maxWidth: "min(88vw, calc(100dvh - 260px), 560px)" }}>
          <Board
            boardSize={settings.boardSize}
            board={engine.board}
            placements={placements}
            currentPlayer={engine.currentPlayer}
            status={engine.status}
            winningCells={engine.winningCells}
            winner={engine.winner}
            onCellTap={handleCellTap}
            onCellDraw={handleCellDraw}
            onInvalidDraw={handleInvalidDraw}
          />

          <GameOverOverlay
            visible={revealMessage && engine.status !== "playing"}
            status={engine.status}
            winner={engine.winner}
            winnerLabel={winnerLabel}
            winLength={settings.winLength}
            onPlayAgain={resetRound}
            onMainMenu={onExitToMenu}
          />
        </div>
      </div>
    </div>
  );
}
