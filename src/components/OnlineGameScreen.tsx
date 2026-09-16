import { useEffect, useRef, useState } from "react";
import type { GameStatus, Stroke } from "../types";
import type { UseMultiplayerReturn } from "../multiplayer/useMultiplayer";
import { playDraw, playInvalid, playMove, playTurn, playWin, setMuted } from "../game/sound";
import Board from "./Board";
import Hud from "./Hud";
import GameOverOverlay from "./GameOverOverlay";

interface OnlineGameScreenProps {
  mp: UseMultiplayerReturn;
  soundOn: boolean;
  onToggleSound: () => void;
  onExitToMenu: () => void;
}

const LINE_REVEAL_MS = 650;
const DRAW_REVEAL_MS = 350;

function connectionBadgeFor(mp: UseMultiplayerReturn): { label: string; color: string; pulsing?: boolean } {
  if (mp.connectionStatus === "connecting") return { label: "Connecting", color: "#ffd166", pulsing: true };
  if (mp.connectionStatus === "reconnecting") return { label: "Reconnecting", color: "#ffd166", pulsing: true };
  if (mp.connectionStatus === "failed") return { label: "Can't reach server", color: "var(--danger)", pulsing: false };
  if (mp.connectionStatus === "disconnected") return { label: "Offline", color: "var(--danger)", pulsing: false };
  if (!mp.opponentConnected) return { label: "Opp. offline", color: "#ffd166", pulsing: true };
  return { label: "Live", color: "var(--success)", pulsing: false };
}

export default function OnlineGameScreen({ mp, soundOn, onToggleSound, onExitToMenu }: OnlineGameScreenProps) {
  const { roomState, mySymbol } = mp;
  const [placements, setPlacements] = useState<Record<number, Stroke[] | undefined>>({});
  const [revealMessage, setRevealMessage] = useState(false);
  const [invalidHint, setInvalidHint] = useState(false);
  const [scores, setScores] = useState({ player1: 0, player2: 0, draws: 0 });

  const scoredRef = useRef(false);
  const prevTurnRef = useRef(roomState?.currentTurn);
  const invalidTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setMuted(!soundOn);
  }, [soundOn]);

  const status: GameStatus = !roomState
    ? "playing"
    : roomState.status !== "FINISHED"
      ? "playing"
      : roomState.winner
        ? "won"
        : "draw";

  const player1Symbol = "X" as const;
  const player2Symbol = "O" as const;
  const currentPlayer = roomState?.currentTurn ?? "X";
  const isMyTurn = Boolean(roomState && mySymbol && roomState.status === "ACTIVE" && roomState.currentTurn === mySymbol);
  const currentPlayerNumber = currentPlayer === player1Symbol ? 1 : 2;
  const winnerLabel = roomState?.winner ? (roomState.winner === player1Symbol ? "Player 1" : "Player 2") : null;

  // Turn-change chime (skip on mount / game-end transitions).
  useEffect(() => {
    if (!roomState || roomState.status !== "ACTIVE") {
      prevTurnRef.current = roomState?.currentTurn;
      return;
    }
    if (prevTurnRef.current !== undefined && prevTurnRef.current !== roomState.currentTurn) {
      playTurn();
    }
    prevTurnRef.current = roomState.currentTurn;
  }, [roomState?.currentTurn, roomState?.status, roomState]);

  // Win / draw reveal sequencing, mirroring local play, plus a local score tally.
  useEffect(() => {
    if (status === "playing") {
      setRevealMessage(false);
      scoredRef.current = false;
      return;
    }
    const delay = status === "won" ? LINE_REVEAL_MS : DRAW_REVEAL_MS;
    const timer = window.setTimeout(() => {
      setRevealMessage(true);
      if (!scoredRef.current) {
        scoredRef.current = true;
        if (status === "won" && roomState?.winner) {
          playWin();
          setScores((prev) => ({
            ...prev,
            player1: prev.player1 + (roomState.winner === player1Symbol ? 1 : 0),
            player2: prev.player2 + (roomState.winner === player2Symbol ? 1 : 0),
          }));
        } else if (status === "draw") {
          playDraw();
          setScores((prev) => ({ ...prev, draws: prev.draws + 1 }));
        }
      }
    }, delay);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  // Clear drawing placements whenever a fresh round starts.
  useEffect(() => {
    if (roomState?.moveCount === 0) setPlacements({});
  }, [roomState?.moveCount]);

  const handleCellTap = (index: number) => {
    if (!isMyTurn) return;
    if (mySymbol) playMove(mySymbol);
    mp.makeMove(index);
  };

  const handleCellDraw = (index: number, strokes: Stroke[]) => {
    if (!isMyTurn) return;
    if (mySymbol) playMove(mySymbol);
    setPlacements((prev) => ({ ...prev, [index]: strokes }));
    mp.makeMove(index);
  };

  const handleInvalidDraw = () => {
    playInvalid();
    setInvalidHint(true);
    if (invalidTimerRef.current) window.clearTimeout(invalidTimerRef.current);
    invalidTimerRef.current = window.setTimeout(() => setInvalidHint(false), 1500);
  };

  const handleMainMenu = () => {
    mp.leaveRoom();
    onExitToMenu();
  };

  if (!roomState) return null;

  const opponentGone = mp.phase === "opponent-left";
  const rematch = opponentGone
    ? { myReady: false, opponentReady: false, opponentGone: true }
    : { myReady: roomState.rematch.player1Ready && mySymbol === "X" ? true : roomState.rematch.player2Ready && mySymbol === "O" ? true : false, opponentReady: mySymbol === "X" ? roomState.rematch.player2Ready : roomState.rematch.player1Ready };

  return (
    <div className="game-screen mx-auto flex h-full w-full max-w-[640px] flex-1 flex-col gap-4 px-4 pb-[max(16px,var(--safe-b))] pt-[max(14px,var(--safe-t))] sm:gap-5 sm:px-6">
      <Hud
        player1Symbol={player1Symbol}
        player2Symbol={player2Symbol}
        currentPlayer={currentPlayer}
        isGameActive={roomState.status === "ACTIVE"}
        scores={scores}
        soundOn={soundOn}
        boardSize={roomState.boardSize}
        winLength={roomState.winLength}
        onToggleSound={onToggleSound}
        onRestart={mp.requestRematch}
        onMainMenu={handleMainMenu}
        connectionBadge={connectionBadgeFor(mp)}
      />

      <div className="game-stage flex min-h-0 flex-1 flex-col items-center justify-center gap-4">
        <div className="game-status relative flex h-11 w-full flex-col items-center justify-center text-center">
          {roomState.status === "ACTIVE" && !opponentGone && (
            <div className="animate-rise-in" key={`${currentPlayerNumber}-${invalidHint}`}>
              {invalidHint ? (
                <p className="text-sm font-medium text-[var(--danger)]">Try drawing your {mySymbol} again</p>
              ) : (
                <>
                  <p className="game-status-title font-display text-base font-bold tracking-wide text-[var(--text-primary)] sm:text-lg">
                    {isMyTurn ? "Your Turn" : `Player ${currentPlayerNumber}’s Turn`}
                  </p>
                  <p className="game-status-subtitle text-xs text-[var(--text-secondary)]">
                    {isMyTurn ? `Tap or draw ${mySymbol} to play` : "Waiting for opponent…"}
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="game-board-wrap relative w-full" style={{ maxWidth: "min(88vw, calc(100dvh - 260px), 560px)" }}>
          <Board
            boardSize={roomState.boardSize}
            board={roomState.board}
            placements={placements}
            currentPlayer={mySymbol ?? currentPlayer}
            status={status}
            winningCells={roomState.winningCells}
            winner={roomState.winner}
            onCellTap={handleCellTap}
            onCellDraw={handleCellDraw}
            onInvalidDraw={handleInvalidDraw}
            canInteract={isMyTurn && !opponentGone}
          />

          <GameOverOverlay
            visible={opponentGone || (revealMessage && status !== "playing")}
            status={status}
            winner={roomState.winner}
            winnerLabel={winnerLabel}
            winLength={roomState.winLength}
            onPlayAgain={mp.requestRematch}
            onMainMenu={handleMainMenu}
            rematch={rematch}
          />
        </div>
      </div>
    </div>
  );
}
