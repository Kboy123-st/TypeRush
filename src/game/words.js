/**
 * Official English Dictionary Word System for Type Rush.
 * Uses the complete 264,718-word English dictionary (3 to 14 letters)
 * classified into Easy (3–5 letters), Medium (6–8 letters), and Hard (9–14 letters).
 */

import { OFFICIAL_DICTIONARY_WORDS } from './dictionary-words.js';

const EASY_WORDS = ['apple'];
const MEDIUM_WORDS = [];
const HARD_WORDS = [];

for (let i = 0; i < OFFICIAL_DICTIONARY_WORDS.length; i++) {
  const w = OFFICIAL_DICTIONARY_WORDS[i];
  if (!w || w === 'apple') continue;
  const len = w.length;
  if (len <= 5) {
    EASY_WORDS.push(w);
  } else if (len <= 8) {
    MEDIUM_WORDS.push(w);
  } else {
    HARD_WORDS.push(w);
  }
}

export const WORD_BANK = {
  easy: EASY_WORDS,
  medium: MEDIUM_WORDS,
  hard: HARD_WORDS
};

export const WORDS_BY_DIFFICULTY = WORD_BANK;

export const DICTIONARY_COUNTS = {
  easy: EASY_WORDS.length,
  medium: MEDIUM_WORDS.length,
  hard: HARD_WORDS.length,
  total: EASY_WORDS.length + MEDIUM_WORDS.length + HARD_WORDS.length
};

const cachedPools = {
  easy: null,
  medium: null,
  hard: null,
  all: null
};

/**
 * Returns an array of { word, difficulty } objects matching the filter.
 * Cached lazily so large dictionary pools are only constructed when explicitly requested.
 * @param {'all' | 'easy' | 'medium' | 'hard'} difficultyFilter
 */
export function getWordPool(difficultyFilter = 'all') {
  const filter = (difficultyFilter || 'all').toLowerCase();
  if (filter === 'easy' || filter === 'medium' || filter === 'hard') {
    if (!cachedPools[filter]) {
      cachedPools[filter] = WORDS_BY_DIFFICULTY[filter].map((word) => ({
        word,
        difficulty: filter
      }));
    }
    return cachedPools[filter];
  }

  if (!cachedPools.all) {
    cachedPools.all = [
      ... getWordPool('easy'),
      ... getWordPool('medium'),
      ... getWordPool('hard')
    ];
  }
  return cachedPools.all;
}

/**
 * O(1) random dictionary word selector across all 264,718 official English dictionary words.
 * Avoids immediate repetition without allocating intermediate arrays.
 *
 * @param {string} previousWord
 * @param {'all' | 'easy' | 'medium' | 'hard'} difficultyFilter
 * @param {() => number} rng
 */
export function getRandomWord(previousWord = '', difficultyFilter = 'all', rng = Math.random) {
  const filter = (difficultyFilter || 'all').toLowerCase();
  let targetDifficulty = filter;

  if (filter !== 'easy' && filter !== 'medium' && filter !== 'hard') {
    // Balanced selection across Easy, Medium, and Hard dictionary tiers in "All Mix"
    const tierRoll = rng();
    if (tierRoll < 0.34) {
      targetDifficulty = 'easy';
    } else if (tierRoll < 0.68) {
      targetDifficulty = 'medium';
    } else {
      targetDifficulty = 'hard';
    }
  }

  const list = WORDS_BY_DIFFICULTY[targetDifficulty] || MEDIUM_WORDS;
  if (list.length === 0) {
    return { word: 'arcade', difficulty: 'medium' };
  }

  let index = Math.min(list.length - 1, Math.max(0, Math.floor(rng() * list.length)));
  if (previousWord && list[index] === previousWord && list.length > 1) {
    index = (index + 1) % list.length;
  }

  return {
    word: list[index],
    difficulty: targetDifficulty
  };
}

/**
 * Generates an ordered sequence of words from the official dictionary for 1v1 matches
 * so both players receive the exact same words in the exact same order.
 * @param {number} count
 * @param {'all' | 'easy' | 'medium' | 'hard'} difficultyFilter
 * @param {() => number} rng
 */
export function generateWordSequence(count = 140, difficultyFilter = 'all', rng = Math.random) {
  const sequence = [];
  let prev = '';
  const targetCount = Math.max(1, count);
  for (let i = 0; i < targetCount; i++) {
    const next = getRandomWord(prev, difficultyFilter, rng);
    sequence.push(next);
    prev = next.word;
  }
  return sequence;
}
