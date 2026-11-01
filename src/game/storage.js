/**
 * LocalStorage persistence module for Type Rush.
 * Saves and loads Best Score, Best WPM, Highest Combo, and game settings.
 */

const STORAGE_KEYS = {
  BEST_SCORE: 'type_rush_best_score',
  BEST_WPM: 'type_rush_best_wpm',
  HIGHEST_COMBO: 'type_rush_highest_combo',
  SETTINGS: 'type_rush_settings'
};

const DEFAULT_SETTINGS = {
  difficulty: 'all',
  duration: 60,
  lives: 3,
  soundEnabled: true
};

// Fallback in-memory store for non-browser test environments
const memoryStore = new Map();

function getStorage() {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      return window.localStorage;
    }
  } catch {
    // Ignore storage access errors in restricted frames
  }
  return {
    getItem: (k) => (memoryStore.has(k) ? memoryStore.get(k) : null),
    setItem: (k, v) => memoryStore.set(k, String(v)),
    removeItem: (k) => memoryStore.delete(k)
  };
}

export function loadBestStats() {
  const store = getStorage();
  const bestScore = parseInt(store.getItem(STORAGE_KEYS.BEST_SCORE) || '0', 10);
  const bestWpm = parseInt(store.getItem(STORAGE_KEYS.BEST_WPM) || '0', 10);
  const highestCombo = parseInt(store.getItem(STORAGE_KEYS.HIGHEST_COMBO) || '0', 10);

  return {
    bestScore: Number.isFinite(bestScore) && bestScore >= 0 ? bestScore : 0,
    bestWpm: Number.isFinite(bestWpm) && bestWpm >= 0 ? bestWpm : 0,
    highestCombo: Number.isFinite(highestCombo) && highestCombo >= 0 ? highestCombo : 0
  };
}

export function saveBestStats({ score = 0, wpm = 0, highestCombo = 0 }) {
  const store = getStorage();
  const current = loadBestStats();

  const isNewBestScore = score > current.bestScore;
  const isNewBestWpm = wpm > current.bestWpm;
  const isNewHighestCombo = highestCombo > current.highestCombo;

  const updated = {
    bestScore: Math.max(current.bestScore, Math.round(score)),
    bestWpm: Math.max(current.bestWpm, Math.round(wpm)),
    highestCombo: Math.max(current.highestCombo, Math.round(highestCombo))
  };

  try {
    store.setItem(STORAGE_KEYS.BEST_SCORE, String(updated.bestScore));
    store.setItem(STORAGE_KEYS.BEST_WPM, String(updated.bestWpm));
    store.setItem(STORAGE_KEYS.HIGHEST_COMBO, String(updated.highestCombo));
  } catch {
    // Ignore quota errors
  }

  return {
    ...updated,
    isNewBestScore,
    isNewBestWpm,
    isNewHighestCombo
  };
}

export function resetBestStats() {
  const store = getStorage();
  try {
    store.removeItem(STORAGE_KEYS.BEST_SCORE);
    store.removeItem(STORAGE_KEYS.BEST_WPM);
    store.removeItem(STORAGE_KEYS.HIGHEST_COMBO);
  } catch {
    // Ignore errors
  }
  return loadBestStats();
}

export function loadSettings() {
  const store = getStorage();
  try {
    const raw = store.getItem(STORAGE_KEYS.SETTINGS);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw);
    return {
      difficulty: ['all', 'easy', 'medium', 'hard'].includes(parsed.difficulty)
        ? parsed.difficulty
        : DEFAULT_SETTINGS.difficulty,
      duration: [30, 60, 90].includes(Number(parsed.duration))
        ? Number(parsed.duration)
        : DEFAULT_SETTINGS.duration,
      lives: [3, 5].includes(Number(parsed.lives))
        ? Number(parsed.lives)
        : DEFAULT_SETTINGS.lives,
      soundEnabled:
        typeof parsed.soundEnabled === 'boolean'
          ? parsed.soundEnabled
          : DEFAULT_SETTINGS.soundEnabled
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(newSettings) {
  const store = getStorage();
  const merged = {
    ...loadSettings(),
    ...newSettings
  };
  try {
    store.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(merged));
  } catch {
    // Ignore errors
  }
  return merged;
}
