import { writeAudio } from "./store";
import type { LyricCue, LyricWordCue } from "./cues";
import type { SongJob } from "./types";

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

function sectionOf(header: string): LyricCue["section"] {
  const value = header.toLowerCase();
  if (value.includes("chorus")) return "chorus";
  if (value.includes("bridge")) return "bridge";
  return "verse";
}

export function sungLines(lyrics: string) {
  const lines: { text: string; section: LyricCue["section"] }[] = [];
  let section: LyricCue["section"] = "verse";
  for (const raw of lyrics.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(verse|chorus|bridge|final chorus|pre-chorus|outro)\b/i.test(line) && line.length < 48) {
      section = sectionOf(line);
      continue;
    }
    lines.push({ text: line.replace(/^[-*]\s+/, ""), section });
  }
  return lines;
}

export function splitSyllables(word: string): string[] {
  const core = word.replace(/[^A-Za-z']/g, "");
  if (!core) return [word];
  const lower = core.toLowerCase();
  const isVowel = (index: number) => {
    const ch = lower[index];
    if ("aeiou".includes(ch)) return true;
    if (ch === "y") {
      const prev = index > 0 ? lower[index - 1] : "";
      return !"aeiou".includes(prev);
    }
    return false;
  };
  const groups: { start: number; end: number }[] = [];
  let i = 0;
  while (i < lower.length) {
    if (isVowel(i)) {
      const start = i;
      while (i < lower.length && isVowel(i)) i += 1;
      groups.push({ start, end: i });
    } else {
      i += 1;
    }
  }
  if (groups.length <= 1) return [core];
  const cuts = [0];
  for (let g = 1; g < groups.length; g += 1) {
    const consonants = groups[g].start - groups[g - 1].end;
    const onset = consonants <= 1 ? consonants : 1;
    cuts.push(groups[g].start - onset);
  }
  const parts: string[] = [];
  for (let c = 0; c < cuts.length; c += 1) {
    const end = c === cuts.length - 1 ? core.length : cuts[c + 1];
    const part = core.slice(cuts[c], end);
    if (part) parts.push(part);
  }
  return parts.length ? parts : [core];
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
  const lines = sungLines(job.lyrics);
  const cues: LyricCue[] = [];
  const motif = [0, 2, 4, 2, 3, 5, 4, 2, 1, 3, 2, 0];

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
    const duration = Math.min(beats * beat * (line.section === "chorus" ? 0.88 : 1), seconds - t - 0.5);
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

export async function writePreviewAudio(job: SongJob) {
  const { wav, cues } = renderSong(job, 48);
  await writeAudio(job.id, "preview", wav);
  return cues;
}

export async function writeFullAudio(job: SongJob) {
  const { wav, cues } = renderSong(job, 150);
  await writeAudio(job.id, "full", wav);
  return cues;
}
