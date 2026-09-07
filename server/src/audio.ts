import { makeRng } from "./lyrics.js";

const SAMPLE_RATE = 44100;

const SCALES: Record<string, number[]> = {
  major: [0, 2, 4, 5, 7, 9, 11],
  minor: [0, 2, 3, 5, 7, 8, 10],
  pentatonic: [0, 2, 4, 7, 9],
};

const ROOT_FREQ = 261.63; // C4

function degreeToFreq(intervals: number[], degree: number, octaveOffset = 0): number {
  const len = intervals.length;
  const octave = Math.floor(degree / len);
  const idx = ((degree % len) + len) % len;
  const semitones = intervals[idx] + 12 * octave + 12 * octaveOffset;
  return ROOT_FREQ * Math.pow(2, semitones / 12);
}

function oscillator(phase: number, waveform: "sine" | "triangle"): number {
  if (waveform === "triangle") {
    const t = phase / (2 * Math.PI);
    return 2 * Math.abs(2 * (t - Math.floor(t + 0.5))) - 1;
  }
  return Math.sin(phase);
}

/** Attack/decay/sustain/release envelope, returns gain at time t within a note of length dur. */
function envelope(t: number, dur: number, attack: number, release: number): number {
  if (t < attack) return t / attack;
  if (t > dur - release) return Math.max(0, (dur - t) / release);
  return 1;
}

interface SynthOptions {
  scale: "major" | "minor" | "pentatonic";
  tempoBpm: number;
  progression: number[];
  waveform: "sine" | "triangle";
  seed: number;
  loops?: number;
}

/** Render a short instrumental clip and return it as a 16-bit PCM WAV buffer. */
export function synthesizeSong(opts: SynthOptions): { wav: Buffer; durationSeconds: number } {
  const intervals = SCALES[opts.scale];
  const rng = makeRng(opts.seed);
  const secondsPerBeat = 60 / opts.tempoBpm;
  const beatsPerBar = 4;
  const barDuration = secondsPerBeat * beatsPerBar;
  const loops = opts.loops ?? 2;
  const bars: number[] = [];
  for (let l = 0; l < loops; l++) bars.push(...opts.progression);

  const totalDuration = bars.length * barDuration;
  const totalSamples = Math.ceil(totalDuration * SAMPLE_RATE);
  const left = new Float64Array(totalSamples);

  const addTone = (
    startSec: number,
    durSec: number,
    freq: number,
    amp: number,
    waveform: "sine" | "triangle",
    attack: number,
    release: number,
  ) => {
    const startSample = Math.floor(startSec * SAMPLE_RATE);
    const nSamples = Math.floor(durSec * SAMPLE_RATE);
    const angular = (2 * Math.PI * freq) / SAMPLE_RATE;
    for (let i = 0; i < nSamples; i++) {
      const idx = startSample + i;
      if (idx >= totalSamples) break;
      const tSec = i / SAMPLE_RATE;
      const env = envelope(tSec, durSec, attack, release);
      left[idx] += oscillator(angular * i, waveform) * amp * env;
    }
  };

  bars.forEach((rootDegree, barIndex) => {
    const barStart = barIndex * barDuration;
    const triad = [rootDegree, rootDegree + 2, rootDegree + 4];

    // Sustained pad chord across the whole bar.
    triad.forEach((d) => {
      addTone(barStart, barDuration, degreeToFreq(intervals, d, 0), 0.11, opts.waveform, 0.4, 0.6);
    });

    // Bass on beats 1 and 3.
    for (const beat of [0, 2]) {
      addTone(
        barStart + beat * secondsPerBeat,
        secondsPerBeat * 1.6,
        degreeToFreq(intervals, rootDegree, -1),
        0.22,
        "sine",
        0.01,
        0.25,
      );
    }

    // Melody: one note per beat drawn from the chord/scale.
    for (let beat = 0; beat < beatsPerBar; beat++) {
      const choice = triad[Math.floor(rng() * triad.length)] + (rng() > 0.75 ? 1 : 0);
      addTone(
        barStart + beat * secondsPerBeat,
        secondsPerBeat * 0.9,
        degreeToFreq(intervals, choice, 1),
        0.16,
        opts.waveform,
        0.02,
        0.18,
      );
    }
  });

  // Master fade in/out to avoid clicks.
  const fade = Math.floor(0.25 * SAMPLE_RATE);
  for (let i = 0; i < fade; i++) {
    left[i] *= i / fade;
    left[totalSamples - 1 - i] *= i / fade;
  }

  // Normalize to avoid clipping.
  let peak = 0;
  for (let i = 0; i < totalSamples; i++) peak = Math.max(peak, Math.abs(left[i]));
  const norm = peak > 0 ? 0.9 / peak : 1;

  return {
    wav: encodeWav(left, norm),
    durationSeconds: Math.round(totalDuration * 10) / 10,
  };
}

function encodeWav(samples: Float64Array, gain: number): Buffer {
  const numChannels = 1;
  const bytesPerSample = 2;
  const dataSize = samples.length * numChannels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(SAMPLE_RATE, 24);
  buffer.writeUInt32LE(SAMPLE_RATE * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(8 * bytesPerSample, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataSize, 40);

  let offset = 44;
  for (let i = 0; i < samples.length; i++) {
    let s = samples[i] * gain;
    s = Math.max(-1, Math.min(1, s));
    buffer.writeInt16LE(Math.round(s * 32767), offset);
    offset += 2;
  }
  return buffer;
}
