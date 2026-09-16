import { useEffect, useState } from "react";
import type { Scores, Settings } from "./types";
import { DEFAULT_SETTINGS, EMPTY_SCORES, loadScores, loadSettings, saveScores, saveSettings } from "./game/storage";
import MenuScreen from "./components/MenuScreen";
import GameScreen from "./components/GameScreen";
import MultiplayerScreen from "./components/MultiplayerScreen";
import { hasStoredMultiplayerSession } from "./multiplayer/useMultiplayer";

type Screen = "menu" | "game" | "multiplayer";

function App() {
  // A page reload mid-match should rejoin the room, not drop back to the
  // main menu — the multiplayer screen itself resumes the session using the
  // token already saved in sessionStorage.
  const [screen, setScreen] = useState<Screen>(() => (hasStoredMultiplayerSession() ? "multiplayer" : "menu"));
  const [settings, setSettings] = useState<Settings>(() => loadSettings() ?? DEFAULT_SETTINGS);
  const [scores, setScores] = useState<Scores>(() => loadScores() ?? EMPTY_SCORES);

  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  useEffect(() => {
    saveScores(scores);
  }, [scores]);

  const handleStart = (next: Settings) => {
    setSettings(next);
    setScreen("game");
  };

  const handleScoresChange = (updater: (prev: Scores) => Scores) => {
    setScores((prev) => updater(prev));
  };

  const handleToggleSound = () => {
    setSettings((prev) => ({ ...prev, soundOn: !prev.soundOn }));
  };

  const handleResetScores = () => setScores(EMPTY_SCORES);

  return (
    <div className="h-[100dvh] w-full bg-[var(--bg)]">
      {screen === "menu" && (
        <MenuScreen
          initialSettings={settings}
          onStart={handleStart}
          onResetScores={handleResetScores}
          scores={scores}
          onPlayOnline={() => setScreen("multiplayer")}
        />
      )}
      {screen === "game" && (
        <GameScreen
          settings={settings}
          scores={scores}
          onScoresChange={handleScoresChange}
          onToggleSound={handleToggleSound}
          onExitToMenu={() => setScreen("menu")}
        />
      )}
      {screen === "multiplayer" && (
        <MultiplayerScreen soundOn={settings.soundOn} onToggleSound={handleToggleSound} onExitToMenu={() => setScreen("menu")} />
      )}
    </div>
  );
}

export default App;
