/**
 * Type Rush — Main Game Controller (Vanilla JavaScript)
 * Supports Solo Arcade Mode and Real-Time 1v1 Invite Friend Mode (Shared Word Sequence).
 */

import { getRandomWord } from './game/words.js';
import {
  calculateMultiplier,
  calculateWordPoints,
  calculateWPM,
  calculateAccuracy,
  createGameState,
  startNewSession,
  tickTimer,
  processTypingInput,
  determineMatchWinner
} from './game/rules.js';
import {
  loadBestStats,
  saveBestStats,
  resetBestStats,
  loadSettings,
  saveSettings
} from './game/storage.js';
import {
  setSoundEnabled,
  isSoundEnabled,
  playKeyPressSound,
  playWordCompleteSound,
  playComboMilestoneSound,
  playMistakeSound,
  playButtonSound,
  playGameStartSound,
  playGameOverSound
} from './game/audio.js';
import {
  createMultiplayerClient,
  loadSavedPlayerName,
  savePlayerName
} from './game/multiplayer.js';

// ==========================================
// 1. DOM REFERENCES
// ==========================================
const dom = {
  body: document.body,
  canvas: document.getElementById('arcade-canvas'),

  // Screens
  screenTitle: document.getElementById('screen-title'),
  screenGame: document.getElementById('screen-game'),
  screenGameOver: document.getElementById('screen-gameover'),

  // Modals
  modalMultiplayer: document.getElementById('modal-multiplayer'),
  modalPause: document.getElementById('modal-pause'),
  modalSettings: document.getElementById('modal-settings'),
  modalHowto: document.getElementById('modal-howto'),

  // Title Screen Elements
  titleBestScore: document.getElementById('title-best-score'),
  titleBestWpm: document.getElementById('title-best-wpm'),
  titleBestCombo: document.getElementById('title-best-combo'),
  diffTabs: Array.from(document.querySelectorAll('.diff-tab')),
  btnPlay: document.getElementById('btn-play'),
  btnInviteFriend: document.getElementById('btn-invite-friend'),
  btnHowto: document.getElementById('btn-howto'),
  btnSettings: document.getElementById('btn-settings'),

  // 1v1 Lobby Modal Elements
  mpStepEntry: document.getElementById('mp-step-entry'),
  mpStepRoom: document.getElementById('mp-step-room'),
  mpPlayerName: document.getElementById('mp-player-name'),
  btnMpCreate: document.getElementById('btn-mp-create'),
  mpJoinCode: document.getElementById('mp-join-code'),
  btnMpJoin: document.getElementById('btn-mp-join'),
  mpErrorMsg: document.getElementById('mp-error-msg'),
  btnCloseMp: document.getElementById('btn-close-mp'),
  mpRoomCodeDisplay: document.getElementById('mp-room-code-display'),
  btnMpCopyLink: document.getElementById('btn-mp-copy-link'),
  mpCopyLabel: document.getElementById('mp-copy-label'),
  mpSlotP1: document.getElementById('mp-slot-p1'),
  mpP1Name: document.getElementById('mp-p1-name'),
  mpP1Status: document.getElementById('mp-p1-status'),
  mpSlotP2: document.getElementById('mp-slot-p2'),
  mpP2Name: document.getElementById('mp-p2-name'),
  mpP2Status: document.getElementById('mp-p2-status'),
  mpLobbyRuleSummary: document.getElementById('mp-lobby-rule-summary'),
  btnMpStartMatch: document.getElementById('btn-mp-start-match'),
  btnMpStartLabel: document.getElementById('btn-mp-start-label'),
  btnMpLeave: document.getElementById('btn-mp-leave'),

  // HUD Elements
  hudScoreCard: document.getElementById('hud-score-card'),
  hudScore: document.getElementById('hud-score'),
  hudComboCard: document.getElementById('hud-combo-card'),
  hudCombo: document.getElementById('hud-combo'),
  hudMultiplier: document.getElementById('hud-multiplier'),
  comboTierBadge: document.getElementById('combo-tier-badge'),
  comboMeterFill: document.getElementById('combo-meter-fill'),
  hudTimerCard: document.getElementById('hud-timer-card'),
  hudTimer: document.getElementById('hud-timer'),
  timerBarFill: document.getElementById('timer-bar-fill'),
  hudWpm: document.getElementById('hud-wpm'),
  hudAccuracy: document.getElementById('hud-accuracy'),
  btnSoundHud: document.getElementById('btn-sound-hud'),
  iconSoundOn: document.getElementById('icon-sound-on'),
  iconSoundOff: document.getElementById('icon-sound-off'),
  btnPause: document.getElementById('btn-pause'),

  // 1v1 Live Opponent Card Elements
  opponentHudCard: document.getElementById('opponent-hud-card'),
  oppName: document.getElementById('opp-name'),
  oppLeadBadge: document.getElementById('opp-lead-badge'),
  oppScore: document.getElementById('opp-score'),
  oppCombo: document.getElementById('opp-combo'),
  oppWpm: document.getElementById('opp-wpm'),
  oppWordLabel: document.getElementById('opp-word-label'),
  oppProgressFill: document.getElementById('opp-progress-fill'),
  oppStatusText: document.getElementById('opp-status-text'),

  // Center Word Arena
  wordArena: document.getElementById('word-arena'),
  wordCard: document.getElementById('word-card'),
  comboCelebrationToast: document.getElementById('combo-celebration-toast'),
  wordDifficultyLabel: document.getElementById('word-difficulty-label'),
  wordPointsPreview: document.getElementById('word-points-preview'),
  wordCompletedCount: document.getElementById('word-completed-count'),
  feedbackBanner: document.getElementById('feedback-banner'),
  wordDisplay: document.getElementById('word-display'),
  inputWrapper: document.getElementById('input-wrapper'),
  typingInput: document.getElementById('typing-input'),
  inputProgressBadge: document.getElementById('input-progress-badge'),

  // Pause Modal Elements
  pauseScore: document.getElementById('pause-score'),
  pauseCombo: document.getElementById('pause-combo'),
  pauseTime: document.getElementById('pause-time'),
  btnResume: document.getElementById('btn-resume'),
  btnRestartPause: document.getElementById('btn-restart-pause'),
  btnHomePause: document.getElementById('btn-home-pause'),

  // Settings Modal Elements
  settingSoundToggle: document.getElementById('setting-sound-toggle'),
  durationBtns: Array.from(document.querySelectorAll('[data-duration]')),
  btnResetRecords: document.getElementById('btn-reset-records'),
  resetStatusText: document.getElementById('reset-status-text'),
  btnCloseSettings: document.getElementById('btn-close-settings'),

  // How to Play Modal Elements
  btnCloseHowto: document.getElementById('btn-close-howto'),

  // Game Over Elements
  gameoverCard: document.getElementById('gameover-card'),
  gameoverRecordBadge: document.getElementById('gameover-record-badge'),
  gameoverReasonKicker: document.getElementById('gameover-reason-kicker'),
  gameoverTitle: document.getElementById('gameover-title'),
  gameoverVersusPanel: document.getElementById('gameover-versus-panel'),
  vsMyName: document.getElementById('vs-my-name'),
  vsMyScore: document.getElementById('vs-my-score'),
  vsMyWpm: document.getElementById('vs-my-wpm'),
  vsMyAcc: document.getElementById('vs-my-acc'),
  vsMyCombo: document.getElementById('vs-my-combo'),
  vsOppName: document.getElementById('vs-opp-name'),
  vsOppScore: document.getElementById('vs-opp-score'),
  vsOppWpm: document.getElementById('vs-opp-wpm'),
  vsOppAcc: document.getElementById('vs-opp-acc'),
  vsOppCombo: document.getElementById('vs-opp-combo'),
  goScore: document.getElementById('go-score'),
  goWpm: document.getElementById('go-wpm'),
  goAccuracy: document.getElementById('go-accuracy'),
  goCombo: document.getElementById('go-combo'),
  goBestScore: document.getElementById('go-best-score'),
  btnPlayAgain: document.getElementById('btn-play-again'),
  btnPlayAgainLabel: document.getElementById('btn-play-again-label'),
  btnHome: document.getElementById('btn-home')
};

// ==========================================
// 2. APPLICATION STATE & TIMERS
// ==========================================
let settings = loadSettings();
setSoundEnabled(settings.soundEnabled);

let gameState = createGameState(settings);
let isMultiplayerMode = false;
let opponentState = null;
let waitingForOpponentFinish = false;

let timerIntervalId = null;
let mistakeFlashTimeoutId = null;
let comboToastTimeoutId = null;
let lastMistakeIndex = -1;

// ==========================================
// 3. MULTIPLAYER CLIENT INITIALIZATION
// ==========================================
const mpClient = createMultiplayerClient({
  onRoomState(room) {
    renderLobbyRoomState(room);
  },
  onRoomError(errorMsg) {
    showMpError(errorMsg);
  },
  onMatchStarted(room) {
    startMultiplayerMatch(room);
  },
  onOpponentProgress(player) {
    if (!player) return;
    opponentState = player;
    renderOpponentHUD();
  },
  onMatchFinished(room) {
    if (!room) return;
    const myId = mpClient.getPlayerId();
    const opp = room.players.find((p) => p.id !== myId);
    if (opp) {
      opponentState = opp;
    }
    if (gameState.status === 'playing' || waitingForOpponentFinish) {
      waitingForOpponentFinish = false;
      gameState.status = 'gameover';
      handleGameOver();
    } else if (gameState.status === 'gameover') {
      renderVersusResults();
    }
  },
  onOpponentLeft(room) {
    renderLobbyRoomState(room);
    if (isMultiplayerMode && gameState.status === 'playing') {
      setFeedbackMessage('Friend disconnected from the room!', 'error');
    }
  }
});

// ==========================================
// 4. POOLED CONFETTI PARTICLES (CANVAS)
// ==========================================
const PARTICLE_POOL_SIZE = 54;
const particles = Array.from({ length: PARTICLE_POOL_SIZE }, () => ({
  active: false,
  x: 0,
  y: 0,
  vx: 0,
  vy: 0,
  size: 8,
  color: '#FFD43B',
  alpha: 1,
  rotation: 0,
  vRot: 0,
  shape: 'rect'
}));

const PARTICLE_COLORS = ['#FFD43B', '#51CF66', '#38BDF8', '#FF6B8B', '#B197FC'];
let animFrameId = null;

function resizeCanvas() {
  if (!dom.canvas) return;
  dom.canvas.width = window.innerWidth;
  dom.canvas.height = window.innerHeight;
}

function spawnParticleBurst(count = 16) {
  if (!dom.canvas) return;
  const rect = dom.wordCard
    ? dom.wordCard.getBoundingClientRect()
    : { left: window.innerWidth / 2, top: window.innerHeight / 2, width: 0, height: 0 };
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;

  let spawned = 0;
  for (let i = 0; i < PARTICLE_POOL_SIZE && spawned < count; i++) {
    const p = particles[i];
    if (!p.active) {
      const angle = (Math.PI * 2 * spawned) / count + (Math.random() - 0.5) * 0.4;
      const speed = 3.5 + Math.random() * 6.5;
      p.active = true;
      p.x = centerX + (Math.random() - 0.5) * 140;
      p.y = centerY + (Math.random() - 0.5) * 40;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed - 2.8;
      p.size = 8 + Math.random() * 6;
      p.color = PARTICLE_COLORS[spawned % PARTICLE_COLORS.length];
      p.alpha = 1;
      p.rotation = Math.random() * Math.PI;
      p.vRot = (Math.random() - 0.5) * 0.22;
      p.shape = spawned % 2 === 0 ? 'circle' : 'rect';
      spawned++;
    }
  }

  if (!animFrameId) {
    animFrameId = requestAnimationFrame(stepParticles);
  }
}

function stepParticles() {
  if (!dom.canvas) return;
  const ctx = dom.canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
  let anyActive = false;

  for (let i = 0; i < PARTICLE_POOL_SIZE; i++) {
    const p = particles[i];
    if (!p.active) continue;

    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.24;
    p.rotation += p.vRot;
    p.alpha -= 0.024;

    if (p.alpha <= 0) {
      p.active = false;
      continue;
    }

    anyActive = true;
    ctx.save();
    ctx.globalAlpha = Math.max(0, p.alpha);
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = p.color;
    ctx.strokeStyle = '#2D2346';
    ctx.lineWidth = 2;

    if (p.shape === 'circle') {
      ctx.beginPath();
      ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else {
      ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
      ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size);
    }
    ctx.restore();
  }

  if (anyActive) {
    animFrameId = requestAnimationFrame(stepParticles);
  } else {
    animFrameId = null;
    ctx.clearRect(0, 0, dom.canvas.width, dom.canvas.height);
  }
}

// ==========================================
// 5. UI RENDERING HELPERS
// ==========================================
function setBodyState(stateName) {
  dom.body.dataset.state = stateName;
  dom.body.dataset.mode = isMultiplayerMode ? '1v1' : 'solo';
}

function getComboTier(combo) {
  if (combo >= 20) return 3;
  if (combo >= 10) return 2;
  if (combo >= 5) return 1;
  return 0;
}

function showComboCelebrationToast(message) {
  if (!dom.comboCelebrationToast) return;
  dom.comboCelebrationToast.textContent = message;
  dom.comboCelebrationToast.classList.add('toast-visible');

  if (comboToastTimeoutId) clearTimeout(comboToastTimeoutId);
  comboToastTimeoutId = setTimeout(() => {
    dom.comboCelebrationToast.classList.remove('toast-visible');
  }, 1500);
}

function renderTitleRecords() {
  const best = loadBestStats();
  dom.titleBestScore.textContent = String(best.bestScore);
  dom.titleBestWpm.textContent = String(best.bestWpm);
  dom.titleBestCombo.textContent = `${best.highestCombo}x`;
}

function syncSettingsUI() {
  dom.diffTabs.forEach((tab) => {
    const isMatch = tab.dataset.difficulty === settings.difficulty;
    tab.classList.toggle('active', isMatch);
    tab.setAttribute('aria-pressed', String(isMatch));
  });

  const soundOn = isSoundEnabled();
  dom.settingSoundToggle.classList.toggle('active', soundOn);
  dom.settingSoundToggle.setAttribute('aria-pressed', String(soundOn));
  dom.settingSoundToggle.textContent = soundOn ? 'ON' : 'OFF';

  dom.iconSoundOn.hidden = !soundOn;
  dom.iconSoundOff.hidden = soundOn;

  dom.durationBtns.forEach((btn) => {
    const isMatch = Number(btn.dataset.duration) === settings.duration;
    btn.classList.toggle('active', isMatch);
  });
}

function renderWordKeycaps(wordObj, typedValue, mistakeIndex = -1) {
  if (!wordObj || !wordObj.word) return;
  const word = wordObj.word;
  dom.wordDisplay.dataset.word = word;
  dom.wordDisplay.setAttribute('aria-label', `Target word: ${word}`);

  const nextWordPoints = calculateWordPoints(wordObj, gameState.combo + 1);
  dom.wordDifficultyLabel.textContent = isMultiplayerMode
    ? `WORD #${(gameState.wordIndex || 0) + 1} · ${wordObj.difficulty.toUpperCase()}`
    : `${wordObj.difficulty.toUpperCase()} TIER`;
  dom.wordPointsPreview.textContent = `+${nextWordPoints} PTS`;
  dom.wordCompletedCount.textContent = `${gameState.wordsCompleted} ${
    gameState.wordsCompleted === 1 ? 'WORD' : 'WORDS'
  }`;

  let tilesHtml = '';
  for (let i = 0; i < word.length; i++) {
    const char = word[i];
    let stateClass = '';
    if (i < typedValue.length) {
      stateClass = 'letter-correct';
    } else if (i === mistakeIndex) {
      stateClass = 'letter-mistake';
    } else if (i === typedValue.length) {
      stateClass = 'letter-current';
    }
    tilesHtml += `<span class="letter-tile ${stateClass}" data-char="${char}">${char}</span>`;
  }

  dom.wordDisplay.innerHTML = tilesHtml;
  dom.inputProgressBadge.textContent = `${typedValue.length}/${word.length}`;
}

function renderOpponentHUD() {
  if (!isMultiplayerMode || !dom.opponentHudCard) {
    if (dom.opponentHudCard) dom.opponentHudCard.hidden = true;
    return;
  }

  dom.opponentHudCard.hidden = false;

  if (!opponentState) {
    dom.oppName.textContent = 'Friend';
    dom.oppScore.textContent = '0';
    dom.oppCombo.textContent = '0x';
    if (dom.oppWpm) dom.oppWpm.textContent = '0';
    dom.oppWordLabel.textContent = 'WORD #1';
    dom.oppProgressFill.style.width = '0%';
    dom.oppStatusText.textContent = 'READY';
    dom.oppLeadBadge.textContent = 'TIED!';
    dom.oppLeadBadge.className = 'opp-lead-badge';
    return;
  }

  dom.oppName.textContent = opponentState.name || 'Friend';
  dom.oppScore.textContent = String(opponentState.score || 0);
  dom.oppCombo.textContent = `${opponentState.combo || 0}x`;
  if (dom.oppWpm) dom.oppWpm.textContent = String(opponentState.wpm || 0);
  dom.oppWordLabel.textContent = `WORD #${(opponentState.wordIndex || 0) + 1}`;

  const targetLen = Math.max(1, opponentState.targetLength || 5);
  const typedLen = Math.min(targetLen, Math.max(0, opponentState.typedLength || 0));
  const pct = Math.round((typedLen / targetLen) * 100);
  dom.oppProgressFill.style.width = `${pct}%`;

  if (opponentState.finished) {
    dom.oppStatusText.textContent = 'FINISHED';
  } else {
    dom.oppStatusText.textContent = `${typedLen}/${targetLen}`;
  }

  const diff = gameState.score - (opponentState.score || 0);
  dom.oppLeadBadge.className = 'opp-lead-badge';
  if (diff > 0) {
    dom.oppLeadBadge.textContent = `YOU LEAD +${diff}`;
    dom.oppLeadBadge.classList.add('lead-ahead');
  } else if (diff < 0) {
    dom.oppLeadBadge.textContent = `${opponentState.name} LEADS +${Math.abs(diff)}`;
    dom.oppLeadBadge.classList.add('lead-behind');
  } else {
    dom.oppLeadBadge.textContent = 'TIED!';
  }
}

function renderHUD() {
  dom.hudScore.textContent = String(gameState.score);
  dom.hudCombo.textContent = `${gameState.combo}x`;

  const multiplier = calculateMultiplier(gameState.combo);
  const tier = getComboTier(gameState.combo);

  dom.hudMultiplier.textContent = `${multiplier}x MULT`;
  dom.hudComboCard.dataset.tier = String(tier);
  dom.wordCard.dataset.comboTier = String(tier);
  dom.body.dataset.comboTier = String(tier);

  if (dom.comboTierBadge) {
    if (tier === 3) {
      dom.comboTierBadge.hidden = false;
      dom.comboTierBadge.textContent = 'FEVER!';
    } else if (tier === 2) {
      dom.comboTierBadge.hidden = false;
      dom.comboTierBadge.textContent = 'MEGA!';
    } else if (tier === 1) {
      dom.comboTierBadge.hidden = false;
      dom.comboTierBadge.textContent = 'SUPER!';
    } else {
      dom.comboTierBadge.hidden = true;
    }
  }

  let progressPct = 0;
  if (gameState.combo >= 20) {
    progressPct = 100;
  } else if (gameState.combo >= 10) {
    progressPct = ((gameState.combo - 10) / 10) * 100;
  } else if (gameState.combo >= 5) {
    progressPct = ((gameState.combo - 5) / 5) * 100;
  } else {
    progressPct = (gameState.combo / 5) * 100;
  }
  dom.comboMeterFill.style.width = `${Math.min(100, Math.max(0, progressPct))}%`;

  const ceilSeconds = Math.ceil(gameState.timeLeft);
  dom.hudTimer.textContent = `${ceilSeconds}s`;
  const ratio = gameState.duration > 0 ? gameState.timeLeft / gameState.duration : 0;
  dom.timerBarFill.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio))})`;
  dom.hudTimerCard.classList.toggle('timer-low', ceilSeconds <= 10);

  const currentWpm = calculateWPM(gameState.correctKeystrokes, gameState.elapsedSeconds);
  const currentAccuracy = calculateAccuracy(
    gameState.correctKeystrokes,
    gameState.totalKeystrokes
  );
  dom.hudWpm.textContent = String(currentWpm);
  dom.hudAccuracy.textContent = `${currentAccuracy}%`;

  if (isMultiplayerMode) {
    renderOpponentHUD();
  }
}

function broadcastMyProgress() {
  if (!isMultiplayerMode) return;
  const currentWpm = calculateWPM(gameState.correctKeystrokes, gameState.elapsedSeconds);
  const currentAccuracy = calculateAccuracy(
    gameState.correctKeystrokes,
    gameState.totalKeystrokes
  );
  mpClient.sendProgress({
    score: gameState.score,
    combo: gameState.combo,
    highestCombo: gameState.highestCombo,
    wpm: currentWpm,
    accuracy: currentAccuracy,
    lives: gameState.lives,
    wordIndex: gameState.wordIndex || 0,
    wordsCompleted: gameState.wordsCompleted,
    typedLength: gameState.typedValue.length,
    targetLength: gameState.currentWord?.word?.length || 5
  });
}

function setFeedbackMessage(text, tone = 'neutral') {
  dom.feedbackBanner.textContent = text;
  dom.feedbackBanner.className = 'feedback-banner';
  if (tone === 'good') {
    dom.feedbackBanner.classList.add('feedback-good');
  } else if (tone === 'combo') {
    dom.feedbackBanner.classList.add('feedback-combo');
  } else if (tone === 'error') {
    dom.feedbackBanner.classList.add('feedback-error');
  }
}

function triggerElementAnimation(element, className) {
  if (!element) return;
  element.classList.remove(className);
  void element.offsetWidth;
  element.classList.add(className);
}

// ==========================================
// 6. 1V1 MULTIPLAYER LOBBY HELPERS
// ==========================================
function showMpError(msg) {
  if (!dom.mpErrorMsg) return;
  if (!msg) {
    dom.mpErrorMsg.hidden = true;
    dom.mpErrorMsg.textContent = '';
  } else {
    dom.mpErrorMsg.hidden = false;
    dom.mpErrorMsg.textContent = msg;
  }
}

function openMultiplayerLobby() {
  showMpError('');
  const savedName = loadSavedPlayerName();
  if (savedName) {
    dom.mpPlayerName.value = savedName;
  }
  const activeRoom = mpClient.getCurrentRoom();
  if (activeRoom) {
    renderLobbyRoomState(activeRoom);
  } else {
    dom.mpStepEntry.hidden = false;
    dom.mpStepRoom.hidden = true;
  }
  dom.modalMultiplayer.hidden = false;
}

function renderLobbyRoomState(room) {
  if (!room) return;
  showMpError('');
  dom.mpStepEntry.hidden = true;
  dom.mpStepRoom.hidden = false;

  dom.mpRoomCodeDisplay.textContent = room.roomCode;

  const players = room.players || [];
  const p1 = players[0] || null;
  const p2 = players[1] || null;

  if (p1) {
    dom.mpP1Name.textContent = p1.name;
    dom.mpP1Status.textContent = 'READY';
    dom.mpSlotP1.classList.add('slot-ready');
  }

  if (p2) {
    dom.mpP2Name.textContent = p2.name;
    dom.mpP2Status.textContent = 'CONNECTED!';
    dom.mpSlotP2.classList.add('slot-ready');
  } else {
    dom.mpP2Name.textContent = 'Waiting for friend...';
    dom.mpP2Status.textContent = 'SHARE CODE OR LINK';
    dom.mpSlotP2.classList.remove('slot-ready');
  }

  const diffUpper = (room.config?.difficulty || 'all').toUpperCase();
  dom.mpLobbyRuleSummary.textContent = `Same Words (${diffUpper}) · ${
    room.config?.duration || 60
  }s Timer · Highest Score Wins`;

  const bothConnected = players.length >= 2;
  dom.btnMpStartMatch.disabled = !bothConnected;
  dom.btnMpStartLabel.textContent = bothConnected
    ? 'START 1V1 RACE NOW!'
    : 'WAITING FOR FRIEND TO JOIN...';
}

function startMultiplayerMatch(room) {
  stopGameTimer();
  closeAllModals();

  isMultiplayerMode = true;
  waitingForOpponentFinish = false;

  const myId = mpClient.getPlayerId();
  opponentState = (room.players || []).find((p) => p.id !== myId) || null;

  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }

  lastMistakeIndex = -1;
  if (dom.comboCelebrationToast) {
    dom.comboCelebrationToast.classList.remove('toast-visible');
  }

  gameState = startNewSession({
    difficulty: room.config?.difficulty || settings.difficulty,
    duration: room.config?.duration || settings.duration,
    lives: room.config?.lives || settings.lives,
    wordSequence: room.wordSequence
  });

  setBodyState('playing');
  showScreen('playing');

  dom.typingInput.disabled = false;
  dom.typingInput.value = '';
  dom.inputWrapper.classList.remove('input-error');
  setFeedbackMessage('1V1 RACE STARTED! Type the same words faster than your friend!', 'combo');

  renderHUD();
  renderWordKeycaps(gameState.currentWord, gameState.typedValue, -1);

  playGameStartSound();
  startGameTimer();

  requestAnimationFrame(() => {
    dom.typingInput.focus();
  });
}

// ==========================================
// 7. GAME FLOW & STATE TRANSITIONS
// ==========================================
function stopGameTimer() {
  if (timerIntervalId !== null) {
    clearInterval(timerIntervalId);
    timerIntervalId = null;
  }
  if (mistakeFlashTimeoutId !== null) {
    clearTimeout(mistakeFlashTimeoutId);
    mistakeFlashTimeoutId = null;
  }
  if (comboToastTimeoutId !== null) {
    clearTimeout(comboToastTimeoutId);
    comboToastTimeoutId = null;
  }
}

function startGameTimer() {
  stopGameTimer();
  timerIntervalId = setInterval(() => {
    if (gameState.status !== 'playing' && !waitingForOpponentFinish) return;

    if (waitingForOpponentFinish) {
      const nextTimeLeft = Math.max(0, Number((gameState.timeLeft - 1).toFixed(2)));
      gameState.timeLeft = nextTimeLeft;
      renderHUD();
      if (nextTimeLeft <= 0) {
        waitingForOpponentFinish = false;
        handleGameOver();
      }
      return;
    }

    gameState = tickTimer(gameState, 1);
    renderHUD();

    if (gameState.status === 'gameover') {
      if (isMultiplayerMode) {
        const finalWpm = calculateWPM(
          gameState.correctKeystrokes,
          Math.max(1, gameState.elapsedSeconds)
        );
        const finalAccuracy = calculateAccuracy(
          gameState.correctKeystrokes,
          gameState.totalKeystrokes
        );
        mpClient.sendFinished({
          score: gameState.score,
          combo: gameState.combo,
          highestCombo: gameState.highestCombo,
          wpm: finalWpm,
          accuracy: finalAccuracy,
          lives: gameState.lives,
          wordsCompleted: gameState.wordsCompleted,
          reason: 'time'
        });
      }
      handleGameOver();
    }
  }, 1000);
}

function closeAllModals() {
  dom.modalMultiplayer.hidden = true;
  dom.modalPause.hidden = true;
  dom.modalSettings.hidden = true;
  dom.modalHowto.hidden = true;
}

function showScreen(screenName) {
  dom.screenTitle.hidden = screenName !== 'title';
  dom.screenGame.hidden = screenName !== 'playing';
  dom.screenGameOver.hidden = screenName !== 'gameover';

  const activeEl =
    screenName === 'title'
      ? dom.screenTitle
      : screenName === 'playing'
      ? dom.screenGame
      : dom.screenGameOver;
  triggerElementAnimation(activeEl, 'screen-enter');
}

export function startGame() {
  stopGameTimer();
  closeAllModals();

  isMultiplayerMode = false;
  opponentState = null;
  waitingForOpponentFinish = false;

  if (document.activeElement && typeof document.activeElement.blur === 'function') {
    document.activeElement.blur();
  }

  lastMistakeIndex = -1;
  if (dom.comboCelebrationToast) {
    dom.comboCelebrationToast.classList.remove('toast-visible');
  }

  gameState = startNewSession({
    difficulty: settings.difficulty,
    duration: settings.duration,
    lives: settings.lives,
    wordProvider: getRandomWord
  });

  setBodyState('playing');
  showScreen('playing');

  dom.typingInput.disabled = false;
  dom.typingInput.value = '';
  dom.inputWrapper.classList.remove('input-error');
  setFeedbackMessage('Type the word below to build your combo!', 'neutral');

  renderHUD();
  renderWordKeycaps(gameState.currentWord, gameState.typedValue, -1);

  playGameStartSound();
  startGameTimer();

  requestAnimationFrame(() => {
    dom.typingInput.focus();
  });
}

export function pauseGame() {
  if (gameState.status !== 'playing') return;
  gameState.status = 'paused';
  setBodyState('paused');

  dom.pauseScore.textContent = String(gameState.score);
  dom.pauseCombo.textContent = `${gameState.combo}x`;
  dom.pauseTime.textContent = `${Math.ceil(gameState.timeLeft)}s`;

  dom.modalPause.hidden = false;
  playButtonSound();
}

export function resumeGame() {
  if (gameState.status !== 'paused') return;
  gameState.status = 'playing';
  setBodyState('playing');
  dom.modalPause.hidden = true;
  playButtonSound();

  requestAnimationFrame(() => {
    dom.typingInput.focus();
  });
}

export function returnToTitle() {
  stopGameTimer();
  closeAllModals();

  if (isMultiplayerMode) {
    mpClient.leaveRoom();
  }
  isMultiplayerMode = false;
  opponentState = null;
  waitingForOpponentFinish = false;

  // Clean ?room= from URL if present
  if (window.location.search.includes('room=')) {
    window.history.replaceState({}, '', window.location.pathname);
  }

  gameState = createGameState(settings);
  setBodyState('title');
  dom.body.dataset.comboTier = '0';
  showScreen('title');
  renderTitleRecords();
  playButtonSound();
}

function renderVersusResults() {
  if (!isMultiplayerMode || !dom.gameoverVersusPanel) {
    if (dom.gameoverVersusPanel) dom.gameoverVersusPanel.hidden = true;
    return;
  }

  dom.gameoverVersusPanel.hidden = false;

  const finalWpm = calculateWPM(
    gameState.correctKeystrokes,
    Math.max(1, gameState.elapsedSeconds)
  );
  const finalAccuracy = calculateAccuracy(
    gameState.correctKeystrokes,
    gameState.totalKeystrokes
  );

  const myName = loadSavedPlayerName() || 'You';
  dom.vsMyName.textContent = myName;
  dom.vsMyScore.textContent = String(gameState.score);
  dom.vsMyWpm.textContent = String(finalWpm);
  dom.vsMyAcc.textContent = `${finalAccuracy}%`;
  dom.vsMyCombo.textContent = `${gameState.highestCombo}x`;

  const opp = opponentState || {
    name: 'Friend',
    score: 0,
    wpm: 0,
    accuracy: 100,
    highestCombo: 0
  };
  dom.vsOppName.textContent = opp.name || 'Friend';
  dom.vsOppScore.textContent = String(opp.score || 0);
  dom.vsOppWpm.textContent = String(opp.wpm || 0);
  dom.vsOppAcc.textContent = `${opp.accuracy ?? 100}%`;
  dom.vsOppCombo.textContent = `${opp.highestCombo || 0}x`;

  const outcome = determineMatchWinner({ score: gameState.score }, { score: opp.score || 0 });
  if (outcome === 'win') {
    dom.gameoverReasonKicker.textContent = '1V1 HEAD-TO-HEAD WINNER';
    dom.gameoverTitle.textContent = 'VICTORY!';
  } else if (outcome === 'loss') {
    dom.gameoverReasonKicker.textContent = `WON BY ${(opp.name || 'FRIEND').toUpperCase()}`;
    dom.gameoverTitle.textContent = 'GOOD MATCH!';
  } else {
    dom.gameoverReasonKicker.textContent = 'EXACT SCORE TIE';
    dom.gameoverTitle.textContent = "IT'S A DRAW!";
  }
}

function handleGameOver() {
  stopGameTimer();
  closeAllModals();

  setBodyState('gameover');
  showScreen('gameover');

  const finalWpm = calculateWPM(
    gameState.correctKeystrokes,
    Math.max(1, gameState.elapsedSeconds)
  );
  const finalAccuracy = calculateAccuracy(
    gameState.correctKeystrokes,
    gameState.totalKeystrokes
  );

  const savedStats = saveBestStats({
    score: gameState.score,
    wpm: finalWpm,
    highestCombo: gameState.highestCombo
  });

  if (isMultiplayerMode) {
    renderVersusResults();
    dom.btnPlayAgainLabel.textContent = 'REMATCH (1V1)';
  } else {
    if (dom.gameoverVersusPanel) dom.gameoverVersusPanel.hidden = true;
    dom.gameoverReasonKicker.textContent = "TIME'S UP!";
    dom.gameoverTitle.textContent = 'GAME OVER';
    dom.btnPlayAgainLabel.textContent = 'PLAY AGAIN';
  }

  dom.gameoverRecordBadge.hidden = !savedStats.isNewBestScore || gameState.score === 0;

  dom.goScore.textContent = String(gameState.score);
  dom.goWpm.textContent = String(finalWpm);
  dom.goAccuracy.textContent = `${finalAccuracy}%`;
  dom.goCombo.textContent = `${gameState.highestCombo}x`;
  dom.goBestScore.textContent = String(savedStats.bestScore);

  renderTitleRecords();
  playGameOverSound(savedStats.isNewBestScore && gameState.score > 0);

  if (savedStats.isNewBestScore && gameState.score > 0) {
    spawnParticleBurst(30);
  }
}

// ==========================================
// 8. TYPING INPUT HANDLER
// ==========================================
function onTypingInputChange(rawVal) {
  if (gameState.status !== 'playing' || waitingForOpponentFinish) return;

  const nextState = processTypingInput(gameState, rawVal, getRandomWord);
  gameState = nextState;

  const event = gameState.lastEvent;
  if (!event) return;

  if (event.type === 'backspace') {
    dom.inputWrapper.classList.remove('input-error');
    renderWordKeycaps(gameState.currentWord, gameState.typedValue, -1);
    broadcastMyProgress();
    return;
  }

  if (event.type === 'char_correct') {
    lastMistakeIndex = -1;
    dom.inputWrapper.classList.remove('input-error');
    playKeyPressSound(event.index);
    renderHUD();
    renderWordKeycaps(gameState.currentWord, gameState.typedValue, -1);
    broadcastMyProgress();
    return;
  }

  if (event.type === 'word_complete') {
    lastMistakeIndex = -1;
    dom.typingInput.value = '';
    dom.inputWrapper.classList.remove('input-error');

    triggerElementAnimation(dom.wordCard, 'word-pop');
    triggerElementAnimation(dom.hudScoreCard, 'score-pop');
    triggerElementAnimation(dom.hudComboCard, 'combo-bump');

    if (event.combo === 5) {
      playComboMilestoneSound(2);
      spawnParticleBurst(20);
      showComboCelebrationToast('5x STREAK! 2x SCORE BONUS!');
      setFeedbackMessage(
        `SUPER STREAK! 5x COMBO UNLOCKED · +${event.points} PTS!`,
        'combo'
      );
    } else if (event.combo === 10) {
      playComboMilestoneSound(3);
      spawnParticleBurst(28);
      showComboCelebrationToast('10x MEGA RUSH! 3x SCORE BONUS!');
      setFeedbackMessage(
        `MEGA RUSH! 10x COMBO UNLOCKED · +${event.points} PTS!`,
        'combo'
      );
    } else if (event.combo === 20 || (event.combo > 20 && event.combo % 10 === 0)) {
      playComboMilestoneSound(4);
      spawnParticleBurst(38);
      showComboCelebrationToast(`${event.combo}x ULTRA FEVER! 4x BONUS!`);
      setFeedbackMessage(
        `ULTRA FEVER! ${event.combo}x COMBO · +${event.points} PTS!`,
        'combo'
      );
    } else {
      playWordCompleteSound(event.combo);
      spawnParticleBurst(event.combo >= 10 ? 18 : 12);
      setFeedbackMessage(
        `GREAT! "${event.completedWord.toUpperCase()}" +${event.points} PTS (${event.combo}x STREAK)`,
        'good'
      );
    }

    renderHUD();
    renderWordKeycaps(gameState.currentWord, gameState.typedValue, -1);
    broadcastMyProgress();
    return;
  }

  if (event.type === 'mistake') {
    dom.typingInput.value = gameState.typedValue;
    lastMistakeIndex = event.index;

    playMistakeSound();
    dom.inputWrapper.classList.add('input-error');
    triggerElementAnimation(dom.wordCard, 'word-shake');

    if (dom.comboCelebrationToast) {
      dom.comboCelebrationToast.classList.remove('toast-visible');
    }

    const expectedUpper = (event.expectedChar || '').toUpperCase();
    setFeedbackMessage(
      `OOPS! Expected "${expectedUpper}" — Combo streak reset!`,
      'error'
    );

    renderHUD();
    renderWordKeycaps(gameState.currentWord, gameState.typedValue, lastMistakeIndex);
    broadcastMyProgress();

    if (mistakeFlashTimeoutId) clearTimeout(mistakeFlashTimeoutId);
    mistakeFlashTimeoutId = setTimeout(() => {
      dom.inputWrapper.classList.remove('input-error');
      lastMistakeIndex = -1;
      if (gameState.status === 'playing') {
        renderWordKeycaps(gameState.currentWord, gameState.typedValue, -1);
      }
    }, 450);
  }
}

// ==========================================
// 9. EVENT LISTENERS & INITIALIZATION
// ==========================================
function bindEvents() {
  window.addEventListener('resize', resizeCanvas);

  dom.btnPlay.addEventListener('click', () => {
    startGame();
  });

  dom.btnInviteFriend.addEventListener('click', () => {
    playButtonSound();
    openMultiplayerLobby();
  });

  // 1v1 Lobby Modal Buttons
  dom.btnMpCreate.addEventListener('click', () => {
    const name = savePlayerName(dom.mpPlayerName.value) || 'Player 1';
    playButtonSound();
    mpClient.createRoom(name, settings);
  });

  dom.btnMpJoin.addEventListener('click', () => {
    const code = String(dom.mpJoinCode.value || '').trim().toUpperCase();
    if (code.length < 4) {
      showMpError('Please enter a 4-character Room Code.');
      return;
    }
    const name = savePlayerName(dom.mpPlayerName.value) || 'Player 2';
    playButtonSound();
    mpClient.joinRoom(code, name);
  });

  dom.mpJoinCode.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      dom.btnMpJoin.click();
    }
  });

  dom.btnMpCopyLink.addEventListener('click', async () => {
    const room = mpClient.getCurrentRoom();
    if (!room) return;
    const shareUrl = `${window.location.origin}${window.location.pathname}?room=${room.roomCode}`;
    try {
      await navigator.clipboard.writeText(shareUrl);
    } catch {
      // Fallback if clipboard permission denied in iframe
    }
    dom.btnMpCopyLink.classList.add('copied');
    dom.mpCopyLabel.textContent = 'LINK COPIED!';
    playButtonSound();
    setTimeout(() => {
      dom.btnMpCopyLink.classList.remove('copied');
      dom.mpCopyLabel.textContent = 'Copy Invite Link';
    }, 1800);
  });

  dom.btnMpStartMatch.addEventListener('click', () => {
    playButtonSound();
    mpClient.startMatch();
  });

  dom.btnMpLeave.addEventListener('click', () => {
    playButtonSound();
    mpClient.leaveRoom();
    dom.mpStepRoom.hidden = true;
    dom.mpStepEntry.hidden = false;
  });

  dom.btnCloseMp.addEventListener('click', () => {
    playButtonSound();
    dom.modalMultiplayer.hidden = true;
  });

  dom.btnHowto.addEventListener('click', () => {
    playButtonSound();
    dom.modalHowto.hidden = false;
  });

  dom.btnCloseHowto.addEventListener('click', () => {
    playButtonSound();
    dom.modalHowto.hidden = true;
  });

  dom.btnSettings.addEventListener('click', () => {
    playButtonSound();
    dom.resetStatusText.textContent = 'Clear saved Best Score, WPM, and Combo';
    syncSettingsUI();
    dom.modalSettings.hidden = false;
  });

  dom.btnCloseSettings.addEventListener('click', () => {
    playButtonSound();
    dom.modalSettings.hidden = true;
  });

  dom.diffTabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const selectedDiff = tab.dataset.difficulty || 'all';
      settings = saveSettings({ difficulty: selectedDiff });
      syncSettingsUI();
      playButtonSound();
    });
  });

  dom.settingSoundToggle.addEventListener('click', () => {
    const nextSound = !isSoundEnabled();
    setSoundEnabled(nextSound);
    settings = saveSettings({ soundEnabled: nextSound });
    syncSettingsUI();
    if (nextSound) playButtonSound();
  });

  dom.durationBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const nextDuration = Number(btn.dataset.duration) || 60;
      settings = saveSettings({ duration: nextDuration });
      syncSettingsUI();
      playButtonSound();
    });
  });

  dom.btnResetRecords.addEventListener('click', () => {
    resetBestStats();
    renderTitleRecords();
    dom.resetStatusText.textContent = 'All high score records have been reset to 0!';
    playButtonSound();
  });

  dom.btnSoundHud.addEventListener('click', (e) => {
    const nextSound = !isSoundEnabled();
    setSoundEnabled(nextSound);
    settings = saveSettings({ soundEnabled: nextSound });
    syncSettingsUI();
    if (nextSound) playButtonSound();
    e.currentTarget.blur();
    if (gameState.status === 'playing') {
      dom.typingInput.focus();
    }
  });

  dom.btnPause.addEventListener('click', (e) => {
    e.currentTarget.blur();
    pauseGame();
  });

  dom.btnResume.addEventListener('click', () => {
    resumeGame();
  });

  dom.btnRestartPause.addEventListener('click', () => {
    if (isMultiplayerMode) {
      mpClient.requestRematch();
    } else {
      startGame();
    }
  });

  dom.btnHomePause.addEventListener('click', () => {
    returnToTitle();
  });

  dom.btnPlayAgain.addEventListener('click', () => {
    if (isMultiplayerMode && mpClient.getCurrentRoom()) {
      playButtonSound();
      mpClient.requestRematch();
    } else {
      startGame();
    }
  });

  dom.btnHome.addEventListener('click', () => {
    returnToTitle();
  });

  dom.wordCard.addEventListener('click', () => {
    if (gameState.status === 'playing' && !waitingForOpponentFinish) {
      dom.typingInput.focus();
    }
  });

  dom.typingInput.addEventListener('input', (e) => {
    onTypingInputChange(e.target.value);
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (gameState.status === 'playing') {
        e.preventDefault();
        pauseGame();
        return;
      }
      if (gameState.status === 'paused') {
        e.preventDefault();
        resumeGame();
        return;
      }
      if (
        !dom.modalSettings.hidden ||
        !dom.modalHowto.hidden ||
        !dom.modalMultiplayer.hidden
      ) {
        e.preventDefault();
        closeAllModals();
        return;
      }
    }

    if (
      gameState.status === 'title' &&
      dom.modalSettings.hidden &&
      dom.modalHowto.hidden &&
      dom.modalMultiplayer.hidden &&
      (e.key === 'Enter' || e.key === ' ')
    ) {
      const activeTag = document.activeElement ? document.activeElement.tagName : '';
      if (activeTag !== 'BUTTON' && activeTag !== 'INPUT') {
        e.preventDefault();
        startGame();
      }
    }
  });

  [dom.modalPause, dom.modalSettings, dom.modalHowto, dom.modalMultiplayer].forEach(
    (modal) => {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          if (modal === dom.modalPause && gameState.status === 'paused') {
            resumeGame();
          } else {
            closeAllModals();
          }
        }
      });
    }
  );
}

function init() {
  resizeCanvas();
  renderTitleRecords();
  syncSettingsUI();
  bindEvents();

  const params = new URLSearchParams(window.location.search);
  const inviteRoomCode = params.get('room');
  if (inviteRoomCode && inviteRoomCode.trim().length === 4) {
    const cleanCode = inviteRoomCode.trim().toUpperCase();
    openMultiplayerLobby();
    dom.mpJoinCode.value = cleanCode;
    const guestName = loadSavedPlayerName() || 'Player 2';
    dom.mpPlayerName.value = guestName;
    mpClient.joinRoom(cleanCode, guestName);
    return;
  }

  if (params.get('autostart') === '1') {
    startGame();
  }
}

init();
