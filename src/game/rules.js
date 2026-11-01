/**
 * Pure game rules and state transitions for Type Rush.
 * Decoupled from DOM manipulation for deterministic behavior and fast unit testing.
 */

import { getRandomWord } from './words.js';

export const DIFFICULTY_BASE_POINTS = {
  easy: 10,
  medium: 20,
  hard: 35
};

/**
 * Calculates the combo multiplier from the current combo count.
 * @param {number} combo
 * @returns {number}
 */
export function calculateMultiplier(combo) {
  if (combo >= 20) return 4;
  if (combo >= 10) return 3;
  if (combo >= 5) return 2;
  return 1;
}

/**
 * Calculates the score earned for completing a word at a given combo.
 * @param {{ word: string, difficulty: 'easy' | 'medium' | 'hard' }} wordEntry
 * @param {number} combo
 * @returns {number}
 */
export function calculateWordPoints(wordEntry, combo) {
  if (!wordEntry || !wordEntry.word) return 0;
  const base = DIFFICULTY_BASE_POINTS[wordEntry.difficulty] || 15;
  const lengthBonus = wordEntry.word.length * 2;
  const multiplier = calculateMultiplier(combo);
  return (base + lengthBonus) * multiplier;
}

/**
 * Calculates standard Words Per Minute (WPM), where 1 word = 5 correct characters.
 * @param {number} correctKeystrokes
 * @param {number} elapsedSeconds
 * @returns {number}
 */
export function calculateWPM(correctKeystrokes, elapsedSeconds) {
  if (!Number.isFinite(correctKeystrokes) || correctKeystrokes <= 0) return 0;
  if (!Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) return 0;
  // Clamp minimum effective window to 2 seconds to avoid absurd initial spikes on first keystroke
  const effectiveMinutes = Math.max(elapsedSeconds, 2) / 60;
  const wpm = (correctKeystrokes / 5) / effectiveMinutes;
  return Math.max(0, Math.round(wpm));
}

/**
 * Calculates typing accuracy percentage (0 to 100).
 * @param {number} correctKeystrokes
 * @param {number} totalKeystrokes
 * @returns {number}
 */
export function calculateAccuracy(correctKeystrokes, totalKeystrokes) {
  if (!Number.isFinite(totalKeystrokes) || totalKeystrokes <= 0) return 100;
  const clampedCorrect = Math.max(0, Math.min(correctKeystrokes, totalKeystrokes));
  return Math.round((clampedCorrect / totalKeystrokes) * 100);
}

/**
 * Creates a clean, reset game state object.
 * Supports an optional pre-generated `wordSequence` array for 1v1 shared-word matches.
 * @param {{ difficulty?: string, duration?: number, lives?: number, wordProvider?: Function, wordSequence?: Array<{word: string, difficulty: string}> }} options
 */
export function createGameState(options = {}) {
  const difficulty = options.difficulty || 'all';
  const duration = Number(options.duration) > 0 ? Number(options.duration) : 60;
  const wordProvider = options.wordProvider || getRandomWord;
  const wordSequence =
    Array.isArray(options.wordSequence) && options.wordSequence.length > 0
      ? options.wordSequence
      : null;

  const firstWord = wordSequence ? wordSequence[0] : wordProvider('', difficulty);

  return {
    status: 'title', // 'title' | 'playing' | 'paused' | 'gameover'
    difficulty,
    duration,
    timeLeft: duration,
    elapsedSeconds: 0,
    score: 0,
    combo: 0,
    highestCombo: 0,
    wordsCompleted: 0,
    wordIndex: 0,
    wordSequence,
    totalKeystrokes: 0,
    correctKeystrokes: 0,
    mistakeCount: 0,
    currentWord: firstWord,
    typedValue: '',
    gameOverReason: null, // 'time' | null
    lastEvent: null
  };
}

/**
 * Starts or restarts a game session, guaranteeing all variables are cleanly reset.
 */
export function startNewSession(options = {}) {
  const state = createGameState(options);
  state.status = 'playing';
  return state;
}

/**
 * Advances the countdown timer by deltaSeconds while playing.
 * Transitions to 'gameover' when timeLeft reaches 0.
 */
export function tickTimer(state, deltaSeconds = 1) {
  if (state.status !== 'playing') return state;

  const nextTimeLeft = Math.max(0, Number((state.timeLeft - deltaSeconds).toFixed(2)));
  const nextElapsed = Number((state.elapsedSeconds + deltaSeconds).toFixed(2));

  const nextState = {
    ...state,
    timeLeft: nextTimeLeft,
    elapsedSeconds: nextElapsed,
    lastEvent: null
  };

  if (nextTimeLeft <= 0) {
    nextState.timeLeft = 0;
    nextState.status = 'gameover';
    nextState.gameOverReason = 'time';
    nextState.lastEvent = { type: 'gameover', reason: 'time' };
  }

  return nextState;
}

/**
 * Processes player typing input against the current word.
 * Supports both single-character typing and full-word input (e.g. mobile paste/fill),
 * and advances deterministically through `state.wordSequence` when in 1v1 mode.
 *
 * @param {object} state
 * @param {string} rawInput
 * @param {Function} wordProvider
 */
export function processTypingInput(state, rawInput, wordProvider = getRandomWord) {
  if (state.status !== 'playing' || !state.currentWord) {
    return state;
  }

  const target = state.currentWord.word.toLowerCase();
  const normalized = String(rawInput || '').trim().toLowerCase();
  const previousTyped = state.typedValue;

  // If the input didn't change, do nothing
  if (normalized === previousTyped) {
    return { ...state, lastEvent: null };
  }

  // Allow backspacing / clearing without penalty
  if (normalized.length < previousTyped.length && target.startsWith(normalized)) {
    return {
      ...state,
      typedValue: normalized,
      lastEvent: { type: 'backspace' }
    };
  }

  // Case 1: The new input is a valid prefix (or full match) of the target word
  if (target.startsWith(normalized)) {
    const addedChars = Math.max(1, normalized.length - previousTyped.length);
    const totalKeystrokes = state.totalKeystrokes + addedChars;
    const correctKeystrokes = state.correctKeystrokes + addedChars;

    // Full word completed!
    if (normalized === target) {
      const prevMultiplier = calculateMultiplier(state.combo);
      const nextCombo = state.combo + 1;
      const nextHighestCombo = Math.max(state.highestCombo, nextCombo);
      const nextMultiplier = calculateMultiplier(nextCombo);
      const earnedPoints = calculateWordPoints(state.currentWord, nextCombo);
      const nextScore = state.score + earnedPoints;
      const nextWordIndex = (state.wordIndex || 0) + 1;

      const nextWord =
        Array.isArray(state.wordSequence) && state.wordSequence.length > 0
          ? state.wordSequence[nextWordIndex % state.wordSequence.length]
          : wordProvider(target, state.difficulty);

      return {
        ...state,
        score: nextScore,
        combo: nextCombo,
        highestCombo: nextHighestCombo,
        wordsCompleted: state.wordsCompleted + 1,
        wordIndex: nextWordIndex,
        totalKeystrokes,
        correctKeystrokes,
        currentWord: nextWord,
        typedValue: '',
        lastEvent: {
          type: 'word_complete',
          completedWord: target,
          difficulty: state.currentWord.difficulty,
          points: earnedPoints,
          combo: nextCombo,
          multiplier: nextMultiplier,
          multiplierUp: nextMultiplier > prevMultiplier,
          wordIndex: nextWordIndex
        }
      };
    }

    // Valid partial prefix typed
    return {
      ...state,
      totalKeystrokes,
      correctKeystrokes,
      typedValue: normalized,
      lastEvent: {
        type: 'char_correct',
        char: normalized[normalized.length - 1],
        index: normalized.length - 1
      }
    };
  }

  // Case 2: The player made a typing mistake! (Resets combo, no heart loss)
  const wrongIndex = previousTyped.length;
  const expectedChar = target[wrongIndex] || '';
  const wrongChar = normalized[wrongIndex] || normalized[normalized.length - 1] || '?';

  return {
    ...state,
    combo: 0,
    totalKeystrokes: state.totalKeystrokes + 1,
    mistakeCount: state.mistakeCount + 1,
    // Keep the already-typed valid prefix so the player can immediately type the right key
    typedValue: previousTyped,
    status: 'playing',
    gameOverReason: null,
    lastEvent: {
      type: 'mistake',
      expectedChar,
      wrongChar,
      index: wrongIndex
    }
  };
}

/**
 * Determines the head-to-head outcome for 1v1 Invite Friend matches.
 * Primary win condition: Highest Score.
 * @param {{ score: number, wpm?: number }} myStats
 * @param {{ score: number, wpm?: number }} opponentStats
 * @returns {'win' | 'loss' | 'draw'}
 */
export function determineMatchWinner(myStats, opponentStats) {
  const myScore = Number(myStats?.score || 0);
  const oppScore = Number(opponentStats?.score || 0);
  if (myScore > oppScore) return 'win';
  if (myScore < oppScore) return 'loss';
  return 'draw';
}
