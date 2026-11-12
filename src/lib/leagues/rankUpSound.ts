/**
 * The rank-up fanfare, synthesised with Web Audio like lib/actionSounds (no audio files): a rising
 * arpeggio over a swelling chord, a bright brass-like hit, then a bell shimmer that rings out.
 * `level` 0..3 follows the overlay's intensity (clean, rich, VIP, VIP jump): higher levels add
 * notes, an octave, a low boom and a longer tail (about 1.6 s up to 2.6 s).
 */

const NOTE = (semitones: number) => 261.63 * 2 ** (semitones / 12); // from C4

interface Voice {
  wave: OscillatorType;
  freq: number;
  start: number;
  attack: number;
  /** Seconds at full level after the attack, before the release. */
  hold: number;
  release: number;
  level: number;
  detune?: number;
  /** Lowpass that opens from `from` to `to` Hz over the attack (a brass swell). */
  lowpass?: { from: number; to: number };
  /** Pitch glide target (a drum's fall). */
  glideTo?: number;
}

function playVoice(ctx: AudioContext, out: AudioNode, v: Voice): void {
  const gain = ctx.createGain();
  const end = v.start + v.attack + v.hold + v.release;
  gain.gain.setValueAtTime(0.0001, v.start);
  gain.gain.exponentialRampToValueAtTime(Math.max(v.level, 0.0002), v.start + v.attack);
  gain.gain.setValueAtTime(Math.max(v.level, 0.0002), v.start + v.attack + v.hold);
  gain.gain.exponentialRampToValueAtTime(0.0001, end);
  gain.connect(out);

  const osc = ctx.createOscillator();
  osc.type = v.wave;
  osc.frequency.setValueAtTime(v.freq, v.start);
  if (v.glideTo) osc.frequency.exponentialRampToValueAtTime(v.glideTo, v.start + v.attack + v.hold + v.release * 0.6);
  if (v.detune) osc.detune.value = v.detune;
  if (v.lowpass) {
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.Q.value = 0.8;
    filter.frequency.setValueAtTime(v.lowpass.from, v.start);
    filter.frequency.exponentialRampToValueAtTime(v.lowpass.to, v.start + v.attack + 0.05);
    filter.frequency.exponentialRampToValueAtTime(Math.max(v.lowpass.from, 400), end);
    osc.connect(filter).connect(gain);
  } else {
    osc.connect(gain);
  }
  osc.start(v.start);
  osc.stop(end + 0.05);
}

function sparkle(ctx: AudioContext, out: AudioNode, start: number, length: number, level: number): void {
  const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * length), ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'highpass';
  filter.frequency.setValueAtTime(5000, start);
  filter.frequency.exponentialRampToValueAtTime(9000, start + length);
  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(level, start + length * 0.25);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
  src.connect(filter).connect(gain).connect(out);
  src.start(start);
  src.stop(start + length + 0.02);
}

/** Plays the fanfare now; `peak` is the user's volume step (louder than a tick, still gentle). */
export function playRankUpFanfare(ctx: AudioContext, peak: number, level: 0 | 1 | 2 | 3): void {
  const t0 = ctx.currentTime + 0.02;
  // One bus with a soft compressor, so stacked voices never clip or turn harsh.
  const bus = ctx.createGain();
  bus.gain.value = peak;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  bus.connect(comp).connect(ctx.destination);

  // Rising arpeggio (C major, up to two octaves for the top levels).
  const steps = [0, 4, 7, 12, 16, 19, 24].slice(0, 4 + level);
  const stepGap = level >= 2 ? 0.075 : 0.085;
  steps.forEach((semi, i) => {
    const start = t0 + i * stepGap;
    playVoice(ctx, bus, { wave: 'triangle', freq: NOTE(semi + 12), start, attack: 0.008, hold: 0.04, release: 0.35, level: 0.32 });
    playVoice(ctx, bus, { wave: 'sine', freq: NOTE(semi + 24), start, attack: 0.005, hold: 0.01, release: 0.18, level: 0.08 });
  });

  // The hit: a brass-like chord where the arpeggio lands, held, then rings out.
  const hit = t0 + steps.length * stepGap;
  const sustain = 0.45 + level * 0.22;
  const chord = level >= 2 ? [0, 7, 12, 16, 19] : [0, 7, 12, 16];
  for (const semi of chord) {
    for (const detune of [-7, 7]) {
      playVoice(ctx, bus, {
        wave: 'sawtooth',
        freq: NOTE(semi),
        start: hit,
        attack: 0.06,
        hold: sustain,
        release: 0.7 + level * 0.15,
        level: 0.075,
        detune,
        lowpass: { from: 500, to: 2600 + level * 600 },
      });
    }
  }
  // Warm root under it.
  playVoice(ctx, bus, { wave: 'sine', freq: NOTE(-12), start: hit, attack: 0.04, hold: sustain, release: 0.8, level: 0.3 });

  // Swell into the hit (from level 1): the chord fading in under the arpeggio.
  if (level >= 1) {
    for (const semi of [0, 7, 12]) {
      playVoice(ctx, bus, {
        wave: 'sawtooth',
        freq: NOTE(semi - 12),
        start: t0,
        attack: hit - t0,
        hold: 0.02,
        release: 0.4,
        level: 0.05,
        lowpass: { from: 300, to: 1400 },
      });
    }
  }

  // Low boom for the VIP ranks.
  if (level >= 2) {
    playVoice(ctx, bus, { wave: 'sine', freq: 110, glideTo: 46, start: hit, attack: 0.006, hold: 0.02, release: 0.7, level: 0.55 });
  }

  // Bell shimmer ringing out over the top.
  const bells = [24, 31, 36, 40, 43].slice(0, 2 + level);
  bells.forEach((semi, i) => {
    const start = hit + 0.08 + i * 0.09;
    playVoice(ctx, bus, { wave: 'sine', freq: NOTE(semi), start, attack: 0.004, hold: 0.01, release: 0.9 + level * 0.2, level: 0.09 });
    playVoice(ctx, bus, { wave: 'sine', freq: NOTE(semi) * 2.76, start, attack: 0.003, hold: 0, release: 0.25, level: 0.025 });
  });
  sparkle(ctx, bus, hit, 0.6 + level * 0.3, 0.05 + level * 0.015);
}

/** A short celebratory buzz for 'vibration' (ms on/off), longer for higher levels. */
export function rankUpVibration(level: 0 | 1 | 2 | 3): number[] {
  const base = [30, 60, 30, 60, 90];
  return level >= 2 ? [...base, 80, 40, 40, 140] : level === 1 ? [...base, 60, 120] : base;
}
