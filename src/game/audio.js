/**
 * Audio placeholder & Web Audio synth effects module for Type Rush.
 * Does not require external audio files; uses lightweight Web Audio API
 * oscillator tones when enabled, with clean placeholder hooks for future audio assets.
 */

let soundEnabled = true;
let audioCtx = null;

function getAudioContext() {
  if (!soundEnabled) return null;
  if (typeof window === 'undefined') return null;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return null;
    if (!audioCtx) {
      audioCtx = new AudioContextClass();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function playTone(freq, type = 'sine', duration = 0.08, gainValue = 0.08, delay = 0) {
  const ctx = getAudioContext();
  if (!ctx) return;

  try {
    const startTime = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, startTime);

    gain.gain.setValueAtTime(gainValue, startTime);
    gain.gain.exponentialRampToValueAtTime(0.001, startTime + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(startTime);
    osc.stop(startTime + duration);
  } catch {
    // Safe fallback if audio context is blocked
  }
}

export function setSoundEnabled(enabled) {
  soundEnabled = Boolean(enabled);
}

export function isSoundEnabled() {
  return soundEnabled;
}

/**
 * Placeholder sound effect: triggered when a correct key is pressed.
 */
export function playKeyPressSound(charIndex = 0) {
  if (!soundEnabled) return;
  const baseFreq = 440 + Math.min(charIndex, 10) * 28;
  playTone(baseFreq, 'triangle', 0.045, 0.06, 0);
}

/**
 * Placeholder sound effect: triggered when a word is completed accurately.
 */
export function playWordCompleteSound(combo = 1) {
  if (!soundEnabled) return;
  const pitchBoost = Math.min(combo * 18, 220);
  playTone(523.25 + pitchBoost, 'triangle', 0.09, 0.09, 0);
  playTone(659.25 + pitchBoost, 'triangle', 0.12, 0.1, 0.055);
}

/**
 * Placeholder sound effect: triggered when combo reaches a new multiplier tier.
 */
export function playComboMilestoneSound(multiplier = 2) {
  if (!soundEnabled) return;
  const root = 587.33 + (multiplier - 1) * 60;
  playTone(root, 'sine', 0.09, 0.1, 0);
  playTone(root * 1.25, 'sine', 0.09, 0.1, 0.06);
  playTone(root * 1.5, 'triangle', 0.16, 0.12, 0.12);
}

/**
 * Placeholder sound effect: triggered when the player makes a typing mistake.
 */
export function playMistakeSound() {
  if (!soundEnabled) return;
  playTone(190, 'sawtooth', 0.11, 0.09, 0);
  playTone(145, 'sawtooth', 0.15, 0.09, 0.06);
}

/**
 * Placeholder sound effect: triggered when UI buttons are clicked.
 */
export function playButtonSound() {
  if (!soundEnabled) return;
  playTone(620, 'sine', 0.05, 0.07, 0);
}

/**
 * Placeholder sound effect: triggered when a new game starts.
 */
export function playGameStartSound() {
  if (!soundEnabled) return;
  playTone(440, 'triangle', 0.08, 0.08, 0);
  playTone(554.37, 'triangle', 0.08, 0.08, 0.07);
  playTone(659.25, 'triangle', 0.14, 0.1, 0.14);
}

/**
 * Placeholder sound effect: triggered when the game ends.
 */
export function playGameOverSound(isNewRecord = false) {
  if (!soundEnabled) return;
  if (isNewRecord) {
    playTone(523.25, 'triangle', 0.1, 0.1, 0);
    playTone(659.25, 'triangle', 0.1, 0.1, 0.08);
    playTone(783.99, 'triangle', 0.1, 0.1, 0.16);
    playTone(1046.5, 'triangle', 0.24, 0.12, 0.24);
  } else {
    playTone(392.0, 'triangle', 0.12, 0.09, 0);
    playTone(349.23, 'triangle', 0.12, 0.09, 0.1);
    playTone(293.66, 'sawtooth', 0.22, 0.09, 0.2);
  }
}
