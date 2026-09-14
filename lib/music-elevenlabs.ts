import type { LyricCue, LyricWordCue } from "./cues";
import { lyricSections, sungLines } from "./lyric-parse";
import type { SongJob } from "./types";

const API_BASE = "https://api.elevenlabs.io/v1/music";
const MODEL_ID = "music_v2";
const PCM_RATE = 44100;

type GenerationChunk = {
  text: string;
  duration_ms: number;
  positive_styles: string[];
  negative_styles: string[];
  context_adherence?: "low" | "medium" | "high";
};

type WordStamp = { text: string; start: number; end: number };

function isIntimateOccasion(occasion: string): boolean {
  return ["anniversary", "wedding", "in-memory", "bedtime"].includes(occasion);
}

function genreStyles(genre: string, occasion = ""): string[] {
  switch (genre) {
    case "pop":
      return ["pop", "upbeat tempo", "energetic", "catchy hook", "polished production", "lively", "tight drums"];
    case "country":
      return ["country", "upbeat tempo", "energetic", "driving acoustic guitar", "lively two-step", "polished gift-song", "bright twang"];
    case "rnb":
      return ["r&b", "upbeat tempo", "energetic groove", "clear professional vocals", "tight production", "lively", "polished"];
    case "rock":
      return ["soft rock", "electric guitar", "anthemic", "driving beat", "upbeat tempo", "energetic"];
    case "worship":
      return ["worship", "reverent", "piano and pad", "hopeful"];
    case "lullaby":
      // Intentionally soft/slow — do not energize lullabies.
      return ["lullaby", "soft and gentle", "slow tempo", "quiet intimacy"];
    case "jazz":
      // Default gift jazz is livelier; only lean intimate when occasion is explicitly intimate.
      if (isIntimateOccasion(occasion)) {
        return ["jazz", "warm piano", "brushed drums", "intimate nightclub", "clear vocals"];
      }
      return ["jazz", "upbeat swing", "lively", "swing rhythm", "clear vocals", "bright horns", "gift-song jazz", "energetic"];
    default:
      return ["acoustic folk", "warm guitar", "upbeat tempo", "energetic", "organic", "clear vocals"];
  }
}

function voiceStyles(voice: string): string[] {
  if (voice === "male") return ["male vocals", "clear male singer"];
  if (voice === "female") return ["female vocals", "clear female singer"];
  return ["natural vocals", "expressive singer"];
}

function positiveStyles(job: SongJob, section: string): string[] {
  const base = [
    ...genreStyles(job.genre, job.occasion),
    ...voiceStyles(job.voice),
    "upbeat tempo",
    "energetic",
    "tight production",
    "polished gift-song",
    "clear professional vocals",
    "lively",
    "great production quality",
    "clear lyrics",
    "heartfelt gift song",
  ];
  if (section === "chorus") base.push("memorable chorus", "slightly bigger arrangement", "punchy chorus");
  if (section === "bridge") base.push("lifted bridge", "keep energy moving");
  if (section === "verse") base.push("conversational verse", "forward momentum");
  return [...new Set(base)].slice(0, 50);
}

function clampDurationMs(ms: number) {
  return Math.max(3000, Math.min(120000, Math.round(ms)));
}

/** Build music_v2 composition_plan chunks from job lyrics. Target total seconds. */
export function buildCompositionPlan(job: SongJob, targetSeconds: number): { chunks: GenerationChunk[] } {
  let sections = lyricSections(job.lyrics);
  if (!sections.length) {
    sections = [{ section: "verse", label: "Verse 1", lines: ["A song made just for you."] }];
  }

  // Preview: keep verse + chorus (+ bridge if short) so total stays ~45s.
  if (targetSeconds <= 50 && sections.length > 3) {
    const verse = sections.find((s) => s.section === "verse");
    const chorus = sections.find((s) => s.section === "chorus");
    const bridge = sections.find((s) => s.section === "bridge");
    const picked = [verse, chorus, bridge].filter(Boolean) as typeof sections;
    if (picked.length >= 2) sections = picked;
    else sections = sections.slice(0, 3);
  }

  const weights = sections.map((s) => {
    const words = s.lines.join(" ").split(/\s+/).filter(Boolean).length;
    const base = s.section === "chorus" ? 1.15 : s.section === "bridge" ? 0.9 : 1;
    return Math.max(4, words) * base;
  });
  const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
  const targetMs = Math.round(targetSeconds * 1000);

  const chunks: GenerationChunk[] = sections.map((section, index) => {
    const share = weights[index] / weightSum;
    const duration_ms = clampDurationMs(targetMs * share);
    const lines = section.lines.map((line) => line.slice(0, 200)).slice(0, 30);
    const text = `[${section.label}]\n${lines.join("\n")}`.slice(0, 4000);
    return {
      text,
      duration_ms,
      positive_styles: positiveStyles(job, section.section),
      negative_styles: ["harsh distortion", "screaming", "explicit", "sluggish", "lethargic", "slurred", "robotic", "mumbled", "sleepy", "dirge", "slow intimate ballad", "draggy tempo"],
      context_adherence: index === 0 ? "high" : "medium",
    };
  });

  // Normalize total duration toward target (API enforces per-chunk 3–120s, max 30 chunks).
  let total = chunks.reduce((sum, c) => sum + c.duration_ms, 0);
  if (total > 0 && Math.abs(total - targetMs) > 500) {
    const scale = targetMs / total;
    for (const chunk of chunks) {
      chunk.duration_ms = clampDurationMs(chunk.duration_ms * scale);
    }
    total = chunks.reduce((sum, c) => sum + c.duration_ms, 0);
    const last = chunks[chunks.length - 1];
    if (last) {
      last.duration_ms = clampDurationMs(last.duration_ms + (targetMs - total));
    }
  }

  return { chunks: chunks.slice(0, 30) };
}

function asciiSlice(buf: Uint8Array, start: number, end: number) {
  let out = "";
  for (let i = start; i < end && i < buf.length; i += 1) out += String.fromCharCode(buf[i]);
  return out;
}

function readU32LE(buf: Uint8Array, offset: number) {
  return buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24);
}

function readU16LE(buf: Uint8Array, offset: number) {
  return buf[offset] | (buf[offset + 1] << 8);
}

/** Encode raw PCM16 LE into a WAV container. Default stereo — EL Music pcm_44100 is interleaved stereo. */
function encodePcm16Wav(pcm: Buffer, sampleRate: number, channels = 2) {
  // Labeling stereo PCM as mono doubles perceived duration and halves tempo (Joseph "too slow").
  const ch = channels === 1 ? 1 : 2;
  const blockAlign = ch * 2;
  const buffer = Buffer.alloc(44 + pcm.length);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcm.length, 4);
  buffer.write("WAVE", 8);
  buffer.write("fmt ", 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20); // PCM
  buffer.writeUInt16LE(ch, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * blockAlign, 28);
  buffer.writeUInt16LE(blockAlign, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36);
  buffer.writeUInt32LE(pcm.length, 40);
  for (let i = 0; i < pcm.length; i += 1) buffer[44 + i] = pcm[i];
  return buffer;
}

/** Infer channel count for raw PCM16. Prefer stereo when duration match or API default. */
function detectPcmChannels(pcm: Buffer, sampleRate: number, expectedDurationSec?: number): 1 | 2 {
  if (expectedDurationSec && expectedDurationSec > 0 && pcm.length > 0) {
    const monoSec = pcm.length / 2 / sampleRate;
    const stereoSec = pcm.length / 4 / sampleRate;
    if (Math.abs(stereoSec - expectedDurationSec) <= Math.abs(monoSec - expectedDurationSec)) {
      return 2;
    }
    // Mono-labeled stereo looks ~2× the planned length.
    if (monoSec > expectedDurationSec * 1.5) return 2;
    return 1;
  }
  // ElevenLabs Music output_format=pcm_44100 is stereo PCM16 @ 44.1kHz.
  return 2;
}

function isWav(buf: Uint8Array) {
  return buf.length >= 12 && asciiSlice(buf, 0, 4) === "RIFF" && asciiSlice(buf, 8, 12) === "WAVE";
}

function isMp3(buf: Uint8Array) {
  if (buf.length < 3) return false;
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  return asciiSlice(buf, 0, 3) === "ID3";
}

function audioDurationSeconds(wav: Uint8Array): number {
  if (!isWav(wav) || wav.length < 44) return 0;
  const sampleRate = (readU32LE(wav, 24) >>> 0) || PCM_RATE;
  const channels = readU16LE(wav, 22) || 1;
  const bits = readU16LE(wav, 34) || 16;
  const dataBytes = readU32LE(wav, 40) >>> 0;
  const bytesPerSample = (bits / 8) * channels;
  if (!bytesPerSample || !sampleRate) return 0;
  return dataBytes / bytesPerSample / sampleRate;
}

/** Distribute line/word cues evenly across audio duration (fallback when API has no timestamps). */
export function distributeCues(lyrics: string, durationSec: number): LyricCue[] {
  const lines = sungLines(lyrics);
  if (!lines.length || durationSec <= 0) return [];
  const leadIn = Math.min(1.2, durationSec * 0.04);
  const usable = Math.max(0.5, durationSec - leadIn - 0.4);
  const lineWeight = lines.map((line) => Math.max(3, line.text.split(/\s+/).filter(Boolean).length));
  const weightSum = lineWeight.reduce((a, b) => a + b, 0) || 1;
  const cues: LyricCue[] = [];
  let t = leadIn;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const share = lineWeight[i] / weightSum;
    const dur = Math.max(0.35, usable * share);
    const start = t;
    const end = Math.min(durationSec - 0.05, start + dur);
    const tokens = line.text.split(/\s+/).filter(Boolean);
    const words: LyricWordCue[] = [];
    let cursor = start;
    const slice = (end - start) / Math.max(tokens.length, 1);
    for (const token of tokens) {
      const wEnd = Math.min(end, cursor + slice);
      words.push({ text: token, start: cursor, end: wEnd });
      cursor = wEnd;
    }
    cues.push({ text: line.text, start, end, section: line.section, words });
    t = end + Math.min(0.12, dur * 0.05);
  }
  return cues;
}

function parseWordStamps(payload: unknown): WordStamp[] {
  if (!payload || typeof payload !== "object") return [];
  const root = payload as Record<string, unknown>;
  const candidates = [
    root.words_timestamps,
    root.wordsTimestamps,
    root.timestamps,
    (root.json as Record<string, unknown> | undefined)?.words_timestamps,
    (root.json as Record<string, unknown> | undefined)?.wordsTimestamps,
  ];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const list = Array.isArray(candidate)
      ? candidate
      : Array.isArray((candidate as { words?: unknown }).words)
        ? ((candidate as { words: unknown[] }).words)
        : null;
    if (!list?.length) continue;
    const stamps: WordStamp[] = [];
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as Record<string, unknown>;
      const text = String(row.text ?? row.word ?? row.lyric ?? "").trim();
      if (!text) continue;
      const startRaw = row.start ?? row.start_time ?? row.startSec ?? row.start_ms ?? row.startMs;
      const endRaw = row.end ?? row.end_time ?? row.endSec ?? row.end_ms ?? row.endMs;
      let start = Number(startRaw);
      let end = Number(endRaw);
      if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
      // Heuristic: values > 1000 are milliseconds.
      if (start > 1000 || end > 1000) {
        start /= 1000;
        end /= 1000;
      }
      if (end < start) continue;
      stamps.push({ text, start, end });
    }
    if (stamps.length) return stamps;
  }
  return [];
}

function cuesFromWordStamps(lyrics: string, stamps: WordStamp[]): LyricCue[] | null {
  if (!stamps.length) return null;
  const lines = sungLines(lyrics);
  if (!lines.length) return null;
  const cues: LyricCue[] = [];
  let cursor = 0;
  for (const line of lines) {
    const tokens = line.text.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const words: LyricWordCue[] = [];
    for (const token of tokens) {
      const stamp = stamps[cursor];
      if (!stamp) break;
      words.push({ text: token, start: stamp.start, end: stamp.end });
      cursor += 1;
    }
    if (!words.length) continue;
    cues.push({
      text: line.text,
      start: words[0].start,
      end: words[words.length - 1].end,
      section: line.section,
      words,
    });
  }
  return cues.length ? cues : null;
}

async function parseMultipartMusic(response: Response): Promise<{ audio: Buffer; meta: unknown }> {
  const contentType = response.headers.get("content-type") || "";
  const raw = Buffer.from(await response.arrayBuffer());
  const boundaryMatch = /boundary=([^;]+)/i.exec(contentType);
  if (!boundaryMatch) {
    return { audio: raw, meta: null };
  }
  const boundary = boundaryMatch[1].trim().replace(/^"|"$/g, "");
  const parts = raw.toString("binary").split(`--${boundary}`);
  let audio: Buffer | null = null;
  let meta: unknown = null;
  for (const part of parts) {
    if (part === "--" || part === "--\r\n" || !part.trim() || part.startsWith("--")) continue;
    const splitAt = part.indexOf("\r\n\r\n");
    if (splitAt < 0) continue;
    const headers = part.slice(0, splitAt);
    const bodyBinary = part.slice(splitAt + 4).replace(/\r\n$/, "");
    const body = Buffer.from(bodyBinary, "binary");
    if (/application\/json/i.test(headers)) {
      try {
        meta = JSON.parse(body.toString("utf8"));
      } catch {
        meta = null;
      }
    } else if (/audio\//i.test(headers) || /octet-stream/i.test(headers) || /name="audio"/i.test(headers)) {
      audio = body;
    }
  }
  if (!audio) {
    // Last resort: if whole body looks like audio
    if (isWav(raw) || isMp3(raw) || raw.length > 1000) audio = raw;
  }
  if (!audio) throw new Error("ElevenLabs detailed response missing audio part.");
  return { audio, meta };
}

function toWavBuffer(audio: Buffer, expectedDurationSec?: number): Buffer {
  if (isWav(audio)) return audio;
  if (isMp3(audio)) {
    throw new Error(
      "ElevenLabs returned MP3; pcm_44100 was unavailable. Convert to WAV is not supported on Workers — retry or check output_format.",
    );
  }
  // Raw pcm_44100 from ElevenLabs Music is interleaved stereo PCM16 @ 44.1kHz.
  const channels = detectPcmChannels(audio, PCM_RATE, expectedDurationSec);
  return encodePcm16Wav(audio, PCM_RATE, channels);
}

async function composeMusic(
  apiKey: string,
  lyrics: string,
  compositionPlan: { chunks: GenerationChunk[] },
): Promise<{ wav: Buffer; cues: LyricCue[] }> {
  const body = {
    model_id: MODEL_ID,
    composition_plan: compositionPlan,
    with_timestamps: true,
  };

  let wav: Buffer | null = null;
  let stamps: WordStamp[] = [];

  const detailed = await fetch(`${API_BASE}/detailed?output_format=pcm_44100`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "multipart/mixed, application/json, audio/*",
    },
    body: JSON.stringify(body),
  });

  if (detailed.ok) {
    const parsed = await parseMultipartMusic(detailed);
    const expectedSec = compositionPlan.chunks.reduce((s, c) => s + c.duration_ms, 0) / 1000;
    wav = toWavBuffer(parsed.audio, expectedSec);
    stamps = parseWordStamps(parsed.meta);
  } else {
    const detailedErr = await detailed.text().catch(() => "");
    // If detailed fails (e.g. 404/422), try plain compose once.
    const plain = await fetch(`${API_BASE}?output_format=pcm_44100`, {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
        Accept: "audio/*, application/json",
      },
      body: JSON.stringify({ model_id: MODEL_ID, composition_plan: compositionPlan }),
    });
    if (!plain.ok) {
      const detail = (await plain.text()) || detailedErr;
      const status = plain.status || detailed.status;
      const hint =
        status === 401 || status === 403
          ? "Check ELEVENLABS_API_KEY."
          : status === 429
            ? "ElevenLabs rate limit — try again shortly."
            : "Music generation failed.";
      throw new Error(`ElevenLabs Music ${status}: ${hint} ${detail.slice(0, 240)}`);
    }
    const expectedSec = compositionPlan.chunks.reduce((s, c) => s + c.duration_ms, 0) / 1000;
    wav = toWavBuffer(Buffer.from(await plain.arrayBuffer()), expectedSec);
  }

  const duration = audioDurationSeconds(wav) || compositionPlan.chunks.reduce((s, c) => s + c.duration_ms, 0) / 1000;
  const fromStamps = cuesFromWordStamps(lyrics, stamps);
  const cues = fromStamps ?? distributeCues(lyrics, duration);
  return { wav, cues };
}

export async function renderWithElevenLabs(job: SongJob, targetSeconds: number) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is missing. Add it with: wrangler secret put ELEVENLABS_API_KEY");
  }
  const plan = buildCompositionPlan(job, targetSeconds);
  return composeMusic(apiKey, job.lyrics, plan);
}
