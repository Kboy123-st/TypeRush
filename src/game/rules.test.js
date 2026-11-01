import test from 'node:test';
import assert from 'node:assert/strict';
import { getWordPool, getRandomWord, generateWordSequence } from './words.js';
import {
  calculateMultiplier,
  calculateWordPoints,
  calculateWPM,
  calculateAccuracy,
  startNewSession,
  tickTimer,
  processTypingInput,
  determineMatchWinner
} from './rules.js';
import { loadBestStats, saveBestStats, resetBestStats } from './storage.js';

test('word bank has more than 100 common English words across easy, medium, and hard', () => {
  const all = getWordPool('all');
  const easy = getWordPool('easy');
  const medium = getWordPool('medium');
  const hard = getWordPool('hard');

  assert.ok(all.length >= 100, `Expected >= 100 words, got ${all.length}`);
  assert.ok(easy.length >= 30);
  assert.ok(medium.length >= 30);
  assert.ok(hard.length >= 30);

  const w1 = getRandomWord('apple', 'easy', () => 0);
  assert.notEqual(w1.word, 'apple');
  assert.equal(w1.difficulty, 'easy');
});

test('combo multiplier and word point scoring scale accurately', () => {
  assert.equal(calculateMultiplier(0), 1);
  assert.equal(calculateMultiplier(4), 1);
  assert.equal(calculateMultiplier(5), 2);
  assert.equal(calculateMultiplier(10), 3);
  assert.equal(calculateMultiplier(20), 4);

  // Easy 5-letter word at 1x combo: (10 + 5*2) * 1 = 20
  assert.equal(calculateWordPoints({ word: 'apple', difficulty: 'easy' }, 1), 20);
  // Easy 5-letter word at 5x combo (2x multiplier): (10 + 10) * 2 = 40
  assert.equal(calculateWordPoints({ word: 'apple', difficulty: 'easy' }, 5), 40);
});

test('WPM and accuracy calculations handle edge cases cleanly', () => {
  assert.equal(calculateAccuracy(0, 0), 100);
  assert.equal(calculateAccuracy(9, 10), 90);
  assert.equal(calculateAccuracy(5, 10), 50);

  assert.equal(calculateWPM(0, 30), 0);
  // 50 correct characters (10 words) in 30 seconds = 20 WPM
  assert.equal(calculateWPM(50, 30), 20);
});

test('typing a word character by character completes word, increments score & combo, and picks next word', () => {
  const words = [
    { word: 'apple', difficulty: 'easy' },
    { word: 'rocket', difficulty: 'medium' }
  ];
  let idx = 0;
  const mockProvider = () => words[idx++ % words.length];

  let state = startNewSession({ lives: 3, duration: 60, wordProvider: mockProvider });
  assert.equal(state.currentWord.word, 'apple');
  assert.equal(state.score, 0);
  assert.equal(state.combo, 0);

  state = processTypingInput(state, 'a', mockProvider);
  assert.equal(state.typedValue, 'a');
  assert.equal(state.lastEvent.type, 'char_correct');

  state = processTypingInput(state, 'ap', mockProvider);
  state = processTypingInput(state, 'app', mockProvider);
  state = processTypingInput(state, 'appl', mockProvider);
  state = processTypingInput(state, 'apple', mockProvider);

  assert.equal(state.lastEvent.type, 'word_complete');
  assert.equal(state.score, 20);
  assert.equal(state.combo, 1);
  assert.equal(state.highestCombo, 1);
  assert.equal(state.wordsCompleted, 1);
  assert.equal(state.typedValue, '');
  assert.equal(state.currentWord.word, 'rocket');
});

test('making a mistake resets combo, keeps valid prefix, and continues game without losing lives', () => {
  const mockProvider = () => ({ word: 'tiger', difficulty: 'easy' });
  let state = startNewSession({ duration: 60, wordProvider: mockProvider });
  state.combo = 4;
  state.highestCombo = 4;

  // Type 't', then wrong letter 'x'
  state = processTypingInput(state, 't', mockProvider);
  state = processTypingInput(state, 'tx', mockProvider);

  assert.equal(state.lastEvent.type, 'mistake');
  assert.equal(state.combo, 0);
  assert.equal(state.highestCombo, 4); // Highest combo preserved
  assert.equal(state.typedValue, 't'); // Valid prefix kept
  assert.equal(state.status, 'playing');

  // Even after multiple mistakes, game stays playing until timer ends
  state = processTypingInput(state, 'tz', mockProvider);
  state = processTypingInput(state, 'tq', mockProvider);
  assert.equal(state.mistakeCount, 3);
  assert.equal(state.status, 'playing');
});

test('timer expiration triggers gameover and startNewSession resets all state cleanly', () => {
  let state = startNewSession({ duration: 5 });
  state = tickTimer(state, 3);
  assert.equal(state.timeLeft, 2);
  assert.equal(state.status, 'playing');

  state = tickTimer(state, 2);
  assert.equal(state.timeLeft, 0);
  assert.equal(state.status, 'gameover');
  assert.equal(state.gameOverReason, 'time');

  // Restarting resets all counters and status
  const restarted = startNewSession({ duration: 60 });
  assert.equal(restarted.status, 'playing');
  assert.equal(restarted.score, 0);
  assert.equal(restarted.combo, 0);
  assert.equal(restarted.highestCombo, 0);
  assert.equal(restarted.timeLeft, 60);
  assert.equal(restarted.typedValue, '');
  assert.equal(restarted.totalKeystrokes, 0);
  assert.equal(restarted.correctKeystrokes, 0);
});

test('storage saves and updates best score, best WPM, and highest combo', () => {
  resetBestStats();
  const initial = loadBestStats();
  assert.equal(initial.bestScore, 0);

  const saved = saveBestStats({ score: 340, wpm: 68, highestCombo: 14 });
  assert.equal(saved.bestScore, 340);
  assert.equal(saved.bestWpm, 68);
  assert.equal(saved.highestCombo, 14);
  assert.equal(saved.isNewBestScore, true);

  const lowerRun = saveBestStats({ score: 120, wpm: 50, highestCombo: 22 });
  assert.equal(lowerRun.bestScore, 340);
  assert.equal(lowerRun.bestWpm, 68);
  assert.equal(lowerRun.highestCombo, 22);
});

test('1v1 shared word sequence gives both players the exact same words at independent pace', () => {
  const sharedSeq = generateWordSequence(20, 'easy');
  assert.equal(sharedSeq.length, 20);
  assert.notEqual(sharedSeq[0].word, sharedSeq[1].word);

  let player1 = startNewSession({ wordSequence: sharedSeq });
  let player2 = startNewSession({ wordSequence: sharedSeq });

  assert.equal(player1.currentWord.word, sharedSeq[0].word);
  assert.equal(player2.currentWord.word, sharedSeq[0].word);

  // Player 1 completes word 0 and word 1
  player1 = processTypingInput(player1, sharedSeq[0].word);
  assert.equal(player1.wordIndex, 1);
  assert.equal(player1.currentWord.word, sharedSeq[1].word);

  player1 = processTypingInput(player1, sharedSeq[1].word);
  assert.equal(player1.wordIndex, 2);
  assert.equal(player1.currentWord.word, sharedSeq[2].word);

  // Player 2 is still on word 0, then completes word 0 -> gets exact same word 1!
  assert.equal(player2.currentWord.word, sharedSeq[0].word);
  player2 = processTypingInput(player2, sharedSeq[0].word);
  assert.equal(player2.wordIndex, 1);
  assert.equal(player2.currentWord.word, sharedSeq[1].word);

  assert.equal(determineMatchWinner({ score: player1.score }, { score: player2.score }), 'win');
  assert.equal(determineMatchWinner({ score: player2.score }, { score: player1.score }), 'loss');
  assert.equal(determineMatchWinner({ score: 100 }, { score: 100 }), 'draw');
});

