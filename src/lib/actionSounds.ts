/**
 * The sounds Settings > Sound & vibration can play, synthesised with Web Audio (no audio files).
 * Each is a few short layers: a tone (one oscillator gliding between two pitches) or a noise burst
 * through a filter. `peak` scales every layer, so one volume setting fits every sound.
 *
 * The gallery (?gallery, dev only) plays every candidate side by side; actionFeedback uses the ids
 * picked in TICK_SOUND_ID and SWIPE_SOUND_ID.
 */

interface ToneLayer {
  kind: 'tone';
  wave: OscillatorType;
  /** Start and end pitch in Hz; the glide takes `glide` seconds. */
  from: number;
  to?: number;
  glide?: number;
  /** Total length in seconds (attack is 4 ms, then an exponential fade). */
  length: number;
  /** Share of the peak gain, 0..1. */
  level: number;
  delay?: number;
  /** Optional lowpass that closes from `lowpass` Hz to a quarter of it: a plucked string. */
  lowpass?: number;
}

interface NoiseLayer {
  kind: 'noise';
  filter: BiquadFilterType;
  freq: number;
  freqTo?: number;
  q?: number;
  length: number;
  level: number;
  delay?: number;
}

type Layer = ToneLayer | NoiseLayer;

export interface ActionSound {
  id: string;
  name: string;
  /** What it sounds like, in a few words (gallery only). */
  hint: string;
  layers: Layer[];
}

export const TICK_SOUNDS: ActionSound[] = [
  {
    id: 't1',
    name: 'Droplet',
    hint: 'A water drop: quick falling plip',
    layers: [{ kind: 'tone', wave: 'sine', from: 1400, to: 420, glide: 0.06, length: 0.11, level: 1 }],
  },
  {
    id: 't2',
    name: 'Bubble',
    hint: 'A soap bubble popping upward',
    layers: [{ kind: 'tone', wave: 'sine', from: 320, to: 980, glide: 0.045, length: 0.08, level: 1 }],
  },
  {
    id: 't3',
    name: 'Marimba',
    hint: 'A soft wooden mallet note',
    layers: [
      { kind: 'tone', wave: 'sine', from: 1046.5, length: 0.28, level: 1 },
      { kind: 'tone', wave: 'sine', from: 4186, length: 0.04, level: 0.35 },
    ],
  },
  {
    id: 't4',
    name: 'Glass',
    hint: 'A light tap on a glass',
    layers: [
      { kind: 'tone', wave: 'sine', from: 2093, length: 0.35, level: 0.8 },
      { kind: 'tone', wave: 'sine', from: 5650, length: 0.12, level: 0.25 },
    ],
  },
  {
    id: 't5',
    name: 'Kalimba',
    hint: 'A thumb-piano tine, warm and round',
    layers: [
      { kind: 'tone', wave: 'triangle', from: 830, to: 784, glide: 0.02, length: 0.32, level: 1 },
      { kind: 'tone', wave: 'sine', from: 3060, length: 0.06, level: 0.3 },
    ],
  },
  {
    id: 't6',
    name: 'Chime',
    hint: 'Two soft bell notes, rising',
    layers: [
      { kind: 'tone', wave: 'sine', from: 1318.5, length: 0.22, level: 0.85 },
      { kind: 'tone', wave: 'sine', from: 1760, length: 0.3, level: 0.75, delay: 0.08 },
    ],
  },
  {
    id: 't7',
    name: 'Pluck',
    hint: 'A gently plucked string',
    layers: [{ kind: 'tone', wave: 'sawtooth', from: 523.25, length: 0.25, level: 0.7, lowpass: 3200 }],
  },
  {
    id: 't8',
    name: 'Wood block',
    hint: 'A short hollow knock',
    layers: [
      { kind: 'tone', wave: 'sine', from: 900, to: 760, glide: 0.02, length: 0.06, level: 1 },
      { kind: 'noise', filter: 'bandpass', freq: 2400, q: 6, length: 0.02, level: 0.5 },
    ],
  },
  {
    id: 't9',
    name: 'Soft click',
    hint: 'Like a phone keyboard tick',
    layers: [{ kind: 'noise', filter: 'bandpass', freq: 3200, q: 3, length: 0.018, level: 1 }],
  },
  {
    id: 't10',
    name: 'Coin-lite',
    hint: 'A tiny two-step "ding-ding", game-like but gentle',
    layers: [
      { kind: 'tone', wave: 'sine', from: 988, length: 0.07, level: 0.8 },
      { kind: 'tone', wave: 'sine', from: 1319, length: 0.18, level: 0.8, delay: 0.06 },
    ],
  },
];

export const SWIPE_SOUNDS: ActionSound[] = [
  {
    id: 's1',
    name: 'Tick',
    hint: 'A tiny dry tick, like a picker wheel',
    layers: [{ kind: 'noise', filter: 'bandpass', freq: 4200, q: 4, length: 0.012, level: 0.9 }],
  },
  {
    id: 's2',
    name: 'Tup',
    hint: 'A low soft tap (the first version)',
    layers: [{ kind: 'tone', wave: 'triangle', from: 520, to: 360, glide: 0.03, length: 0.05, level: 0.7 }],
  },
  {
    id: 's3',
    name: 'Whoosh',
    hint: 'A short airy swish',
    layers: [{ kind: 'noise', filter: 'bandpass', freq: 600, freqTo: 2600, q: 1.2, length: 0.13, level: 0.8 }],
  },
  {
    id: 's4',
    name: 'Soft pop',
    hint: 'A small falling pop',
    layers: [{ kind: 'tone', wave: 'sine', from: 640, to: 260, glide: 0.03, length: 0.05, level: 0.9 }],
  },
  {
    id: 's5',
    name: 'Flick',
    hint: 'A light paper flick',
    layers: [
      { kind: 'noise', filter: 'highpass', freq: 2500, length: 0.03, level: 0.6 },
      { kind: 'tone', wave: 'sine', from: 1500, length: 0.015, level: 0.4 },
    ],
  },
  {
    id: 's6',
    name: 'Wood tap',
    hint: 'A small high knock',
    layers: [
      { kind: 'tone', wave: 'sine', from: 1250, length: 0.03, level: 0.9 },
      { kind: 'tone', wave: 'sine', from: 310, length: 0.04, level: 0.4 },
    ],
  },
];

/** The sounds the app plays. Change these after Zakria picks in the gallery. */
export const TICK_SOUND_ID = 't1';
export const SWIPE_SOUND_ID = 's1';

let noise: AudioBuffer | null = null;

function noiseBuffer(ctx: AudioContext): AudioBuffer {
  if (!noise || noise.sampleRate !== ctx.sampleRate) {
    noise = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.2), ctx.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  }
  return noise;
}

function envelope(ctx: AudioContext, start: number, length: number, peak: number): GainNode {
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.004);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  gain.connect(ctx.destination);
  return gain;
}

/** Plays `sound` now; `peak` is the loudest gain any layer reaches. */
export function playActionSound(ctx: AudioContext, sound: ActionSound, peak: number): void {
  const now = ctx.currentTime + 0.005;
  for (const layer of sound.layers) {
    const start = now + (layer.delay ?? 0);
    const out = envelope(ctx, start, layer.length, peak * layer.level);
    if (layer.kind === 'tone') {
      const osc = ctx.createOscillator();
      osc.type = layer.wave;
      osc.frequency.setValueAtTime(layer.from, start);
      if (layer.to) osc.frequency.exponentialRampToValueAtTime(layer.to, start + (layer.glide ?? layer.length));
      if (layer.lowpass) {
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(layer.lowpass, start);
        filter.frequency.exponentialRampToValueAtTime(layer.lowpass / 4, start + layer.length);
        osc.connect(filter).connect(out);
      } else {
        osc.connect(out);
      }
      osc.start(start);
      osc.stop(start + layer.length + 0.02);
    } else {
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(ctx);
      const filter = ctx.createBiquadFilter();
      filter.type = layer.filter;
      filter.frequency.setValueAtTime(layer.freq, start);
      if (layer.freqTo) filter.frequency.exponentialRampToValueAtTime(layer.freqTo, start + layer.length);
      if (layer.q) filter.Q.value = layer.q;
      src.connect(filter).connect(out);
      src.start(start);
      src.stop(start + layer.length + 0.02);
    }
  }
}

export function findActionSound(id: string): ActionSound | undefined {
  return [...TICK_SOUNDS, ...SWIPE_SOUNDS].find((sound) => sound.id === id);
}
