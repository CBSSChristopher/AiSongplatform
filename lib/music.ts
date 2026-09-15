import { writeAudio } from "./store";
import type { LyricCue, LyricWordCue } from "./cues";
import { splitSyllables, sungLines } from "./lyric-parse";
import { renderWithElevenLabs } from "./music-elevenlabs";
import { renderWithXai } from "./music-xai";
import type { SongJob } from "./types";

export { splitSyllables, sungLines } from "./lyric-parse";

export type RenderedAudio = { wav: Buffer; cues: LyricCue[]; mp3?: Buffer };

function hashSeed(input: string) {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(1664525, s) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function midiToFreq(note: number) {
  return 440 * 2 ** ((note - 69) / 12);
}

function genreScale(genre: string): number[] {
  if (genre === "worship" || genre === "lullaby") return [60, 62, 64, 67, 69, 72];
  if (genre === "country") return [57, 60, 62, 64, 67, 69];
  if (genre === "rock") return [57, 60, 62, 65, 67, 70];
  if (genre === "jazz") return [60, 62, 63, 65, 67, 70, 72];
  if (genre === "rnb") return [60, 63, 65, 67, 70, 72];
  return [60, 62, 64, 67, 69, 71, 72];
}

function voiceShift(voice: string) {
  if (voice === "male") return -12;
  if (voice === "female") return 0;
  return -5;
}

function encodeWav(samples: Float32Array, sampleRate: number) {
  const buffer = Buffer.alloc(44 + samples.length * 2);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + samples.length * 2, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(samples.length * 2, 40);
  let offset = 44;
  for (let i = 0; i < samples.length; i += 1) {
    const clipped = Math.max(-1, Math.min(1, samples[i]));
    buffer.writeInt16LE(Math.round(clipped * 32767), offset);
    offset += 2;
  }
  return buffer;
}




function formantsFor(syllable: string): [number, number, number] {
  const seq = (syllable.toLowerCase().match(/[aeiouy]+/)?.[0] || "a").replace(/y/g, "i");
  if (/oo|uu|ou|u/.test(seq) && !/au/.test(seq)) return [300, 870, 2240];
  if (/ee|ii|i/.test(seq)) return [270, 2290, 3010];
  if (/ay|ai|ei|e/.test(seq)) return [530, 1840, 2480];
  if (/ow|o/.test(seq)) return [570, 840, 2410];
  if (/au|aw/.test(seq)) return [640, 920, 2410];
  return [730, 1090, 2440];
}

function makeResonator(freq: number, bw: number, sampleRate: number) {
  const r = Math.exp((-Math.PI * bw) / sampleRate);
  const a1 = 2 * r * Math.cos((2 * Math.PI * freq) / sampleRate);
  const a2 = -(r * r);
  const gain = 1 - r;
  let y1 = 0;
  let y2 = 0;
  return (x: number) => {
    const y = x + a1 * y1 + a2 * y2;
    y2 = y1;
    y1 = y;
    return y * gain;
  };
}

function glottal(phase: number) {
  const x = phase - Math.floor(phase);
  if (x < 0.6) return 0.5 * (1 - Math.cos((Math.PI * x) / 0.6));
  if (x < 0.82) return 0.5 * (1 + Math.cos((Math.PI * (x - 0.6)) / 0.22));
  return 0;
}

function addTone(
  samples: Float32Array,
  sampleRate: number,
  startSec: number,
  durSec: number,
  freq: number,
  amp: number,
) {
  const start = Math.floor(startSec * sampleRate);
  const len = Math.floor(durSec * sampleRate);
  const attack = Math.max(1, 0.012 * sampleRate);
  for (let i = 0; i < len && start + i < samples.length; i += 1) {
    const env = Math.min(i / attack, 1) * (1 - i / Math.max(len, 1));
    const vibrato = 1 + 0.004 * Math.sin((2 * Math.PI * 5 * i) / sampleRate);
    samples[start + i] += Math.sin((2 * Math.PI * freq * vibrato * i) / sampleRate) * amp * env;
  }
}

function addKick(samples: Float32Array, sampleRate: number, startSec: number, amp: number) {
  const start = Math.floor(startSec * sampleRate);
  const len = Math.floor(0.16 * sampleRate);
  for (let i = 0; i < len && start + i < samples.length; i += 1) {
    const t = i / sampleRate;
    const freq = 92 * Math.exp(-22 * t);
    const env = Math.exp(-18 * t);
    samples[start + i] += Math.sin(2 * Math.PI * freq * t) * amp * env;
  }
}

function addHat(samples: Float32Array, sampleRate: number, startSec: number, amp: number, random: () => number) {
  const start = Math.floor(startSec * sampleRate);
  const len = Math.floor(0.04 * sampleRate);
  for (let i = 0; i < len && start + i < samples.length; i += 1) {
    const env = 1 - i / len;
    samples[start + i] += (random() * 2 - 1) * amp * env;
  }
}

function addSungSyllable(
  samples: Float32Array,
  sampleRate: number,
  startSec: number,
  durSec: number,
  midi: number,
  syllable: string,
  amp: number,
  random: () => number,
) {
  const start = Math.floor(startSec * sampleRate);
  const len = Math.max(1, Math.floor(durSec * sampleRate));
  const [f1, f2, f3] = formantsFor(syllable);
  const res1 = makeResonator(f1, 90, sampleRate);
  const res2 = makeResonator(f2, 120, sampleRate);
  const res3 = makeResonator(f3, 160, sampleRate);
  const f0 = midiToFreq(midi);
  const letters = syllable.toLowerCase();
  const sibilant = /^[sfc]h?/.test(letters) || letters.startsWith("th");
  const voicedCons = /^[bdgmnvlrwj]/.test(letters);
  const consLen = Math.min(Math.floor((sibilant ? 0.055 : 0.03) * sampleRate), Math.floor(len * 0.35));
  const attack = Math.max(1, 0.01 * sampleRate);
  const release = Math.max(1, 0.04 * sampleRate);
  let phase = 0;

  for (let i = 0; i < len && start + i < samples.length; i += 1) {
    const t = i / sampleRate;
    let env = Math.min(i / attack, 1);
    if (i > len - release) env *= Math.max(0, (len - i) / release);
    const vibrato = 1 + 0.012 * Math.sin(2 * Math.PI * 5.4 * t);
    const pitch = f0 * vibrato;
    phase += pitch / sampleRate;
    if (phase >= 1) phase -= Math.floor(phase);

    let source = glottal(phase) * 0.9;
    if (i < consLen) {
      const noise = (random() * 2 - 1) * (sibilant ? 0.7 : voicedCons ? 0.22 : 0.4);
      const mix = 1 - i / consLen;
      source = source * (1 - mix * (sibilant ? 0.85 : 0.45)) + noise * mix;
    }

    const voice = res1(source) + 0.72 * res2(source) + 0.38 * res3(source);
    samples[start + i] += voice * amp * env * 0.22;
  }
}

function normalize(samples: Float32Array) {
  let peak = 0;
  for (let i = 0; i < samples.length; i += 1) peak = Math.max(peak, Math.abs(samples[i]));
  if (peak < 0.001) return;
  const gain = 0.9 / peak;
  for (let i = 0; i < samples.length; i += 1) samples[i] *= gain;
}

function pickSungLines(
  lines: { text: string; section: LyricCue["section"] }[],
  seconds: number,
  recipientName: string,
) {
  // Preview lengths (62–90s) still need chorus/name priority — do not burn time on filler verses.
  if (seconds > 120 || lines.length <= 8) return lines;
  const name = recipientName.trim().toLowerCase();
  const chosen = new Map<number, (typeof lines)[number]>();
  let verseTaken = 0;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const hasName = Boolean(name) && line.text.toLowerCase().includes(name);
    if (line.section === "chorus" || hasName) {
      chosen.set(i, line);
      continue;
    }
    if (verseTaken < 3) {
      chosen.set(i, line);
      verseTaken += 1;
    }
  }
  if (chosen.size < 4) return lines;
  return [...chosen.entries()]
    .sort((a, b) => a[0] - b[0])
    .map(([, line]) => line);
}

function renderSong(job: SongJob, seconds: number) {
  const sampleRate = 22050;
  const total = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(total);
  const random = rng(hashSeed(`${job.id}:${job.genre}:${job.voice}:${job.lyrics}`));
  const scale = genreScale(job.genre);
  const shift = voiceShift(job.voice);
  const bpm =
    job.genre === "lullaby" ? 70 : job.genre === "rock" ? 100 : job.genre === "worship" ? 74 : job.genre === "pop" ? 92 : 84;
  const beat = 60 / bpm;
  const lines = pickSungLines(sungLines(job.lyrics), seconds, job.recipientName);
  const cues: LyricCue[] = [];
  const motif = [0, 2, 4, 2, 3, 5, 4, 2, 1, 3, 2, 0];
  const maxLine = seconds <= 48 ? 5.1 : 8.5;

  let t = beat * 2;
  for (let b = 0; b < 4 && b * beat < t; b += 1) {
    addHat(samples, sampleRate, b * (beat / 2), b % 2 === 0 ? 0.08 : 0.045, random);
    if (b % 2 === 0) addKick(samples, sampleRate, b * (beat / 2), 0.28);
  }

  let noteIndex = 0;
  for (let lineIndex = 0; lineIndex < lines.length && t < seconds - 0.9; lineIndex += 1) {
    const line = lines[lineIndex];
    const tokens = line.text.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;

    const syllables = tokens.map((word) => ({ word, parts: splitSyllables(word) }));
    const totalSyl = syllables.reduce((sum, item) => sum + item.parts.length, 0);
    const beats = Math.max(3, totalSyl);
    const duration = Math.min(
      beats * beat * (line.section === "chorus" ? 0.88 : 1),
      maxLine,
      seconds - t - 0.5,
    );
    const start = t;
    const end = start + duration;
    const lift = line.section === "chorus" ? 4 : line.section === "bridge" ? -2 : 0;
    const voiceAmp = line.section === "chorus" ? 1.15 : 1;
    const words: LyricWordCue[] = [];
    let cursor = start;
    const slice = duration / Math.max(totalSyl, 1);

    const root = scale[0] + shift - 12 + lift;
    addTone(samples, sampleRate, start, duration * 0.96, midiToFreq(root), 0.07);
    addTone(samples, sampleRate, start, duration * 0.96, midiToFreq(root + 7), 0.035);
    addTone(samples, sampleRate, start, duration * 0.96, midiToFreq(root + 12), 0.02);

    for (let beatT = start; beatT < end - 0.02; beatT += beat) {
      addKick(samples, sampleRate, beatT, line.section === "chorus" ? 0.22 : 0.16);
      addHat(samples, sampleRate, beatT + beat * 0.5, 0.05, random);
    }

    for (const item of syllables) {
      const wordStart = cursor;
      for (const part of item.parts) {
        const midi = scale[motif[noteIndex % motif.length] % scale.length] + shift + lift;
        noteIndex += 1;
        addSungSyllable(samples, sampleRate, cursor, slice * 0.94, midi, part, voiceAmp, random);
        addTone(samples, sampleRate, cursor, slice * 0.9, midiToFreq(midi - 12), 0.045);
        cursor += slice;
      }
      words.push({ text: item.word, start: wordStart, end: cursor });
    }

    cues.push({ text: line.text, start, end, section: line.section, words });
    t = end + beat * (line.section === "chorus" ? 0.18 : 0.28);
  }

  normalize(samples);
  return { wav: encodeWav(samples, sampleRate), cues };
}

function mixVocalWithBed(vocal: Float32Array, bed: Float32Array) {
  const out = new Float32Array(vocal.length);
  const n = Math.min(vocal.length, bed.length);
  for (let i = 0; i < n; i += 1) {
    out[i] = vocal[i] * 0.88 + bed[i] * 0.22;
  }
  for (let i = n; i < vocal.length; i += 1) out[i] = vocal[i] * 0.88;
  normalize(out);
  return out;
}

/** Soft instrumental-only bed (pads + light kick/hat). No formant vocals. */
function renderInstrumentalBed(job: SongJob, seconds: number, sampleRate: number) {
  const total = Math.max(1, Math.floor(sampleRate * Math.max(0.5, seconds)));
  const samples = new Float32Array(total);
  const random = rng(hashSeed(`${job.id}:bed:${job.genre}`));
  const scale = genreScale(job.genre);
  const bpm =
    job.genre === "lullaby" ? 70 : job.genre === "rock" ? 100 : job.genre === "worship" ? 74 : job.genre === "pop" ? 92 : 84;
  const beat = 60 / bpm;
  const root = scale[0] - 12;
  addTone(samples, sampleRate, 0, seconds, midiToFreq(root), 0.055);
  addTone(samples, sampleRate, 0, seconds, midiToFreq(root + 7), 0.028);
  addTone(samples, sampleRate, 0, seconds, midiToFreq(root + 12), 0.016);
  for (let t = 0; t < seconds - 0.05; t += beat * 4) {
    addTone(samples, sampleRate, t, Math.min(beat * 3.6, seconds - t), midiToFreq(root + 4), 0.02);
  }
  for (let t = 0; t < seconds - 0.02; t += beat) {
    addKick(samples, sampleRate, t, 0.1);
    addHat(samples, sampleRate, t + beat * 0.5, 0.03, random);
  }
  return samples;
}

function resolveMusicProvider(): "elevenlabs" | "xai" | "synth" {
  const forced = (process.env.MUSIC_PROVIDER || "").toLowerCase();
  if (forced === "synth" || forced === "formant") return "synth";
  if (forced === "xai" || forced === "grok") return "xai";
  if (forced === "elevenlabs" || forced === "el") return "elevenlabs";
  // Default gift path: real instrumental+vocal songs via ElevenLabs Music when key is present.
  // xAI-first is prioritization elsewhere, not a ban — EL Music is the outside path for beautiful songs WITH music.
  if (process.env.ELEVENLABS_API_KEY) return "elevenlabs";
  if (process.env.XAI_API_KEY) return "xai";
  // Production-shaped default when neither key is set: prefer EL so missing key fails loud with the right secret name.
  return "elevenlabs";
}

async function renderWithXaiAndBed(job: SongJob, seconds: number) {
  if (!process.env.XAI_API_KEY) {
    throw new Error(
      "Music provider is xAI Grok TTS, but XAI_API_KEY is not set. " +
        "Add the Worker secret with: wrangler secret put XAI_API_KEY " +
        "(or set MUSIC_PROVIDER=synth for local formant tests only).",
    );
  }
  const vocals = await renderWithXai(job, seconds);
  if (!vocals.samples.length || !vocals.sampleRate) {
    return { wav: vocals.wav, cues: vocals.cues };
  }
  try {
    const bed = renderInstrumentalBed(job, vocals.duration, vocals.sampleRate);
    const mixed = mixVocalWithBed(vocals.samples, bed);
    return { wav: encodeWav(mixed, vocals.sampleRate), cues: vocals.cues };
  } catch (error) {
    console.error("[music] instrumental bed mix failed; serving a-cappella xAI vocals", error);
    return { wav: vocals.wav, cues: vocals.cues };
  }
}

function isElevenLabsPaidPlanError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? "");
  const lower = message.toLowerCase();
  return (
    /\b402\b/.test(message) ||
    lower.includes("paid_plan_required") ||
    lower.includes("not available for free")
  );
}

async function renderForJob(job: SongJob, seconds: number): Promise<RenderedAudio> {
  const provider = resolveMusicProvider();
  if (provider === "synth") {
    return renderSong(job, seconds);
  }
  if (provider === "elevenlabs") {
    if (!process.env.ELEVENLABS_API_KEY) {
      throw new Error(
        "Music provider is ElevenLabs Music, but ELEVENLABS_API_KEY is not set. " +
          "Add the Worker secret with: wrangler secret put ELEVENLABS_API_KEY " +
          "(or set MUSIC_PROVIDER=xai with XAI_API_KEY, or MUSIC_PROVIDER=synth for local formant tests only).",
      );
    }
    try {
      return await renderWithElevenLabs(job, seconds);
    } catch (error) {
      // Free EL Music returns HTTP 402 paid_plan_required — soft-fallback to xAI when available.
      if (isElevenLabsPaidPlanError(error) && process.env.XAI_API_KEY) {
        console.error(
          "[music] ElevenLabs Music unavailable (paid plan); falling back to xAI.",
          error instanceof Error ? error.message : error,
        );
        return renderWithXaiAndBed(job, seconds);
      }
      throw error;
    }
  }
  return renderWithXaiAndBed(job, seconds);
}

/** Einstein PERFECT LOCK v2: heartfelt ~70s (floor 60); dense lyrics ≳180 words → 80–90s. */
export function isHeartfeltOccasion(occasion: string): boolean {
  return ["birthday", "anniversary", "in-memory", "thank-you", "wedding"].includes(occasion);
}

export function previewTargetSeconds(job: SongJob): number {
  const occasion = job.occasion || "";
  const heartfelt =
    isHeartfeltOccasion(occasion) || job.genre === "lullaby" || occasion === "bedtime";
  if (!heartfelt) {
    // Non-heartfelt still retire ~50s race; give ballad room at 62s floor band.
    return 62;
  }
  const words = (job.lyrics || "").trim().split(/\s+/).filter(Boolean).length;
  if (words >= 180) return 85; // dense 80–90 band
  return 70; // default heartfelt
}

export async function writePreviewAudio(job: SongJob) {
  const seconds = previewTargetSeconds(job);
  const rendered = await renderForJob(job, seconds);
  await writeAudio(job.id, "preview", rendered.wav, "wav");
  if (rendered.mp3 && rendered.mp3.byteLength > 0) {
    await writeAudio(job.id, "preview", rendered.mp3, "mp3");
  }
  return rendered.cues;
}

export async function writeFullAudio(job: SongJob) {
  const rendered = await renderForJob(job, 135);
  await writeAudio(job.id, "full", rendered.wav, "wav");
  if (rendered.mp3 && rendered.mp3.byteLength > 0) {
    await writeAudio(job.id, "full", rendered.mp3, "mp3");
  }
  return rendered.cues;
}
