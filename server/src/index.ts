import express from "express";
import cors from "cors";
import { MOODS, OCCASIONS } from "./catalog.js";
import { ValidationError, generateSong } from "./songGenerator.js";
import type { GeneratedSong, SongRequest } from "./types.js";

const PORT = Number(process.env.PORT ?? 3001);
const MAX_SONGS = 100;

/** In-memory store of recently generated audio, keyed by song id. */
const audioStore = new Map<string, Buffer>();
const songStore = new Map<string, GeneratedSong>();
const order: string[] = [];

function remember(song: GeneratedSong, wav: Buffer) {
  audioStore.set(song.id, wav);
  songStore.set(song.id, song);
  order.push(song.id);
  while (order.length > MAX_SONGS) {
    const evicted = order.shift();
    if (evicted) {
      audioStore.delete(evicted);
      songStore.delete(evicted);
    }
  }
}

const app = express();
app.use(cors());
app.use(express.json({ limit: "64kb" }));

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", songsCached: songStore.size });
});

app.get("/api/catalog", (_req, res) => {
  res.json({ occasions: OCCASIONS, moods: MOODS });
});

app.post("/api/songs", (req, res) => {
  try {
    const body = req.body as SongRequest;
    const { song, wav } = generateSong(body);
    remember(song, wav);
    res.status(201).json(song);
  } catch (err) {
    if (err instanceof ValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    console.error("Failed to generate song", err);
    res.status(500).json({ error: "Failed to generate song." });
  }
});

app.get("/api/songs/:id", (req, res) => {
  const song = songStore.get(req.params.id);
  if (!song) {
    res.status(404).json({ error: "Song not found." });
    return;
  }
  res.json(song);
});

app.get("/api/songs/:id/audio", (req, res) => {
  const wav = audioStore.get(req.params.id);
  if (!wav) {
    res.status(404).json({ error: "Audio not found." });
    return;
  }
  res.setHeader("Content-Type", "audio/wav");
  res.setHeader("Content-Length", wav.length);
  res.setHeader("Cache-Control", "public, max-age=3600");
  res.send(wav);
});

// Only start listening when run directly (keeps tests import-safe).
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  app.listen(PORT, () => {
    console.log(`AiSongPlatform API listening on http://localhost:${PORT}`);
  });
}

export { app };
