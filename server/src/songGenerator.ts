import { randomUUID } from "node:crypto";
import { getMood, getOccasion } from "./catalog.js";
import { buildLyrics, seedFromString } from "./lyrics.js";
import { synthesizeSong } from "./audio.js";
import type { GeneratedSong, SongRequest } from "./types.js";

export class ValidationError extends Error {}

export interface SongResult {
  song: GeneratedSong;
  wav: Buffer;
}

export function generateSong(req: SongRequest): SongResult {
  const occasion = getOccasion(req.occasion);
  const mood = getMood(req.mood);
  if (!occasion) throw new ValidationError(`Unknown occasion: ${req.occasion}`);
  if (!mood) throw new ValidationError(`Unknown mood: ${req.mood}`);
  if (!req.recipient || !req.recipient.trim()) {
    throw new ValidationError("A recipient name is required.");
  }

  const keywords = (req.keywords ?? [])
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 4);

  const seedInput = [
    req.occasion,
    req.mood,
    req.recipient,
    req.sender ?? "",
    keywords.join(","),
    req.message ?? "",
  ].join("|");
  const seed = seedFromString(seedInput);

  const { title, sections } = buildLyrics({
    occasion: req.occasion,
    recipient: req.recipient,
    keywords,
    seed,
  });

  const { wav, durationSeconds } = synthesizeSong({
    scale: mood.scale,
    tempoBpm: mood.tempoBpm,
    progression: mood.progression,
    waveform: mood.waveform,
    seed,
  });

  const id = randomUUID();
  const song: GeneratedSong = {
    id,
    title,
    occasion: req.occasion,
    mood: req.mood,
    recipient: req.recipient.trim(),
    sender: req.sender?.trim() || undefined,
    tempoBpm: mood.tempoBpm,
    durationSeconds,
    sections,
    audioUrl: `/api/songs/${id}/audio`,
    createdAt: new Date().toISOString(),
  };

  return { song, wav };
}
