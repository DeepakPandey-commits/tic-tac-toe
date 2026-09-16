import type { Scores, Settings } from "../types";

const SETTINGS_KEY = "ttt.settings.v1";
const SCORES_KEY = "ttt.scores.v1";

export const DEFAULT_SETTINGS: Settings = {
  playerSymbol: "X",
  boardSize: 3,
  winLength: 3,
  soundOn: true,
};

export const EMPTY_SCORES: Scores = { player1: 0, player2: 0, draws: 0 };

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;
  try {
    return { ...fallback, ...JSON.parse(raw) };
  } catch {
    return fallback;
  }
}

export function loadSettings(): Settings {
  try {
    return safeParse(localStorage.getItem(SETTINGS_KEY), DEFAULT_SETTINGS);
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings) {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* storage unavailable — ignore */
  }
}

export function loadScores(): Scores {
  try {
    return safeParse(localStorage.getItem(SCORES_KEY), EMPTY_SCORES);
  } catch {
    return EMPTY_SCORES;
  }
}

export function saveScores(scores: Scores) {
  try {
    localStorage.setItem(SCORES_KEY, JSON.stringify(scores));
  } catch {
    /* storage unavailable — ignore */
  }
}
