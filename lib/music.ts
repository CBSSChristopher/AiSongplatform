import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { audioPath } from "./store";
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

function synthesize(job: SongJob, seconds: number) {
  const sampleRate = 22050;
  const total = Math.floor(sampleRate * seconds);
  const samples = new Float32Array(total);
  const random = rng(hashSeed(`${job.id}:${job.genre}:${job.recipientName}`));
  const scale = genreScale(job.genre);
  const bpm = job.genre === "lullaby" ? 68 : job.genre === "rock" ? 108 : 84;
  const beat = 60 / bpm;
  const notes: { start: number; dur: number; freq: number; amp: number }[] = [];

  let t = 0.2;
  while (t < seconds - 0.4) {
    const n = scale[Math.floor(random() * scale.length)];
    const dur = beat * (random() > 0.7 ? 2 : 1);
    notes.push({
      start: t,
      dur,
      freq: midiToFreq(n),
      amp: 0.18 + random() * 0.08,
    });
    if (random() > 0.45) {
      notes.push({
        start: t,
        dur,
        freq: midiToFreq(n - 12),
        amp: 0.08,
      });
    }
    t += dur;
  }

  for (const note of notes) {
    const start = Math.floor(note.start * sampleRate);
    const len = Math.floor(note.dur * sampleRate);
    for (let i = 0; i < len && start + i < total; i += 1) {
      const env = Math.min(i / (0.02 * sampleRate), 1) * (1 - i / len);
      const x = Math.sin((2 * Math.PI * note.freq * i) / sampleRate);
      samples[start + i] += x * note.amp * env;
    }
  }

  return encodeWav(samples, sampleRate);
}

export async function writePreviewAudio(job: SongJob) {
  const file = audioPath(job.id, "preview");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, synthesize(job, 45));
}

export async function writeFullAudio(job: SongJob) {
  const file = audioPath(job.id, "full");
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, synthesize(job, 150));
}
