import { writeAudio } from "./store";
import type { LyricCue } from "./cues";
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

function sungLines(lyrics: string) {
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

function syllableCount(word: string) {
  const clean = word.toLowerCase().replace(/[^a-z]/g, "");
  if (!clean) return 1;
  const groups = clean.match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
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
  for (let i = 0; i < len && start + i < samples.length; i += 1) {
    const env = Math.min(i / (0.02 * sampleRate), 1) * (1 - i / Math.max(len, 1));
    const vibrato = 1 + 0.008 * Math.sin((2 * Math.PI * 5 * i) / sampleRate);
    samples[start + i] += Math.sin((2 * Math.PI * freq * vibrato * i) / sampleRate) * amp * env;
  }
}

function renderSong(job: SongJob, seconds: number) {
  const sampleRate = 22050;
  const total = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(total);
  const random = rng(hashSeed(`${job.id}:${job.genre}:${job.lyrics}`));
  const scale = genreScale(job.genre);
  const bpm = job.genre === "lullaby" ? 72 : job.genre === "rock" ? 104 : job.genre === "worship" ? 76 : 88;
  const beat = 60 / bpm;
  const lines = sungLines(job.lyrics);
  const cues: LyricCue[] = [];

  let t = 0.45;
  let degree = Math.floor(random() * scale.length);

  for (let lineIndex = 0; lineIndex < lines.length && t < seconds - 0.8; lineIndex += 1) {
    const line = lines[lineIndex];
    const words = line.text.split(/\s+/).filter(Boolean);
    if (!words.length) continue;
    const syllables = words.reduce((sum, word) => sum + syllableCount(word), 0);
    const beats = Math.max(3, syllables);
    const duration = Math.min(beats * beat * (line.section === "chorus" ? 0.92 : 1.05), 4.8);
    const start = t;
    const end = Math.min(t + duration, seconds - 0.4);
    cues.push({ text: line.text, start, end, section: line.section });

    const lift = line.section === "chorus" ? 7 : line.section === "bridge" ? -2 : 0;
    const leadAmp = line.section === "chorus" ? 0.28 : 0.2;
    let cursor = start;
    const slice = (end - start) / Math.max(syllables, 1);

    for (const word of words) {
      const count = syllableCount(word);
      for (let s = 0; s < count; s += 1) {
        degree = (degree + (random() > 0.72 ? 2 : 1)) % scale.length;
        const midi = scale[degree] + lift;
        addTone(samples, sampleRate, cursor, slice * 0.92, midiToFreq(midi), leadAmp);
        addTone(samples, sampleRate, cursor, slice * 0.92, midiToFreq(midi - 12), 0.09);
        if (line.section === "chorus") {
          addTone(samples, sampleRate, cursor, slice * 0.92, midiToFreq(midi + 7), 0.07);
        }
        cursor += slice;
      }
    }
    t = end + beat * 0.25;
  }

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
