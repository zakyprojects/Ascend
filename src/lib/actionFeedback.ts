import { useSyncExternalStore } from 'react';
import { prefersReducedMotion } from '@/lib/motion';
import { findActionSound, playActionSound, SWIPE_SOUND_ID, TICK_SOUND_ID, type ActionSound } from '@/lib/actionSounds';

/**
 * Feedback for the user's own actions: a short vibration or a soft sound, chosen per action kind
 * in Settings > Sound & vibration. Kept on this device only (localStorage), like the theme: a phone
 * and a laptop want different things, and nothing about it belongs to the account.
 *
 * - 'tick': checking off a habit, resisting a bad habit, finishing a task or a weekly goal.
 * - 'swipe': a swipe row arming its action, a tab or page swipe arming or flicking.
 *
 * Vibration is Android-only (iOS Safari and desktops have no Vibration API). The browser cannot set
 * vibration force, only its length, so strength is the pulse length. Sounds (lib/actionSounds) are
 * synthesised with Web Audio (no audio files), play at the media volume, and on iOS follow the silent switch and
 * leave music playing (audio session 'ambient').
 */

export type ActionFeedbackKind = 'tick' | 'swipe';
export type FeedbackMode = 'vibration' | 'sound' | 'none';
export type VibrationStrength = 'light' | 'medium' | 'strong';
export type SoundVolume = 'soft' | 'medium' | 'loud';

export interface FeedbackPrefs {
  tick: FeedbackMode;
  swipe: FeedbackMode;
  vibrationStrength: VibrationStrength;
  soundVolume: SoundVolume;
}

const STORAGE_KEY = 'ascend_feedback_prefs';
const CHANGE_EVENT = 'ascend:feedback-prefs';

/** Pulse length per strength; 12 ms is the buzz the app shipped with. */
const VIBRATION_MS: Record<VibrationStrength, number> = { light: 8, medium: 12, strong: 20 };
/** Peak gain per volume; kept low so a tick never startles. */
const SOUND_GAIN: Record<SoundVolume, number> = { soft: 0.06, medium: 0.12, loud: 0.22 };

const MODES: readonly FeedbackMode[] = ['vibration', 'sound', 'none'];
const STRENGTHS: readonly VibrationStrength[] = ['light', 'medium', 'strong'];
const VOLUMES: readonly SoundVolume[] = ['soft', 'medium', 'loud'];

export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

export function canPlaySound(): boolean {
  return typeof window !== 'undefined' && typeof window.AudioContext === 'function';
}

/** Until the user chooses: vibration where the device has it, nothing elsewhere. Users who asked
 *  the system for reduced motion start with none, as before this setting existed. */
function defaultPrefs(): FeedbackPrefs {
  const mode: FeedbackMode = canVibrate() && !prefersReducedMotion() ? 'vibration' : 'none';
  return { tick: mode, swipe: mode, vibrationStrength: 'medium', soundVolume: 'soft' };
}

function pick<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? (value as T) : fallback;
}

let cached: { raw: string | null; prefs: FeedbackPrefs } | null = null;

export function getFeedbackPrefs(): FeedbackPrefs {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(STORAGE_KEY);
  } catch {
    /* storage blocked: defaults */
  }
  if (cached && cached.raw === raw) return cached.prefs;
  const fallback = defaultPrefs();
  let stored: Partial<Record<keyof FeedbackPrefs, unknown>> = {};
  try {
    const parsed = raw ? JSON.parse(raw) : null;
    if (parsed && typeof parsed === 'object') stored = parsed;
  } catch {
    /* corrupt value: defaults */
  }
  const prefs: FeedbackPrefs = {
    tick: pick(stored.tick, MODES, fallback.tick),
    swipe: pick(stored.swipe, MODES, fallback.swipe),
    vibrationStrength: pick(stored.vibrationStrength, STRENGTHS, fallback.vibrationStrength),
    soundVolume: pick(stored.soundVolume, VOLUMES, fallback.soundVolume),
  };
  cached = { raw, prefs };
  return prefs;
}

export function setFeedbackPrefs(change: Partial<FeedbackPrefs>): void {
  const next = { ...getFeedbackPrefs(), ...change };
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* storage blocked: the choice lasts until reload */
    cached = { raw: null, prefs: next };
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  // 'storage' carries a change made in another tab of the app.
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useFeedbackPrefs(): FeedbackPrefs {
  return useSyncExternalStore(subscribe, getFeedbackPrefs, defaultPrefs);
}

// --- Sound -------------------------------------------------------------------------------------

let audio: AudioContext | null = null;

function audioContext(): AudioContext | null {
  if (!canPlaySound()) return null;
  if (!audio) {
    try {
      // iOS 16.4+: mix with other audio and obey the silent switch instead of acting like media.
      const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
      if (session) session.type = 'ambient';
      audio = new AudioContext();
    } catch {
      return null;
    }
  }
  if (audio.state === 'suspended') void audio.resume().catch(() => undefined);
  return audio;
}

function usesSound(): boolean {
  const prefs = getFeedbackPrefs();
  return prefs.tick === 'sound' || prefs.swipe === 'sound';
}

// Browsers start audio only from a tap or key press. A swipe's sound plays mid-gesture, which is not
// one, so the first tap anywhere wakes the audio while a sound is chosen.
if (typeof window !== 'undefined') {
  const unlock = () => {
    if (!usesSound()) return;
    const ctx = audioContext();
    if (ctx && ctx.state === 'running') {
      window.removeEventListener('pointerdown', unlock, true);
      window.removeEventListener('keydown', unlock, true);
    }
  };
  window.addEventListener('pointerdown', unlock, { capture: true, passive: true });
  window.addEventListener('keydown', unlock, { capture: true, passive: true });
}

function playSound(kind: ActionFeedbackKind, volume: SoundVolume): void {
  const sound = findActionSound(kind === 'tick' ? TICK_SOUND_ID : SWIPE_SOUND_ID);
  if (sound) playSoundAt(sound, volume);
}

/** Plays one sound at a volume step (also the gallery's audition). */
export function playSoundAt(sound: ActionSound, volume: SoundVolume): void {
  const ctx = audioContext();
  if (ctx) playActionSound(ctx, sound, SOUND_GAIN[volume]);
}

// --- Play --------------------------------------------------------------------------------------

/** One pulse at a strength step (also the gallery's audition). */
export function vibrate(strength: VibrationStrength): void {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(VIBRATION_MS[strength]);
  } catch {
    /* blocked without a user gesture */
  }
}

/** The feedback the user chose for this kind of action, if any. */
export function actionFeedback(kind: ActionFeedbackKind): void {
  const prefs = getFeedbackPrefs();
  const mode = prefs[kind];
  if (mode === 'vibration') vibrate(prefs.vibrationStrength);
  else if (mode === 'sound') playSound(kind, prefs.soundVolume);
}

/** Plays a mode once so Settings can let the user feel or hear a choice as they make it. */
export function previewFeedback(kind: ActionFeedbackKind, mode: FeedbackMode, prefs: FeedbackPrefs = getFeedbackPrefs()): void {
  if (mode === 'vibration') vibrate(prefs.vibrationStrength);
  else if (mode === 'sound') playSound(kind, prefs.soundVolume);
}
