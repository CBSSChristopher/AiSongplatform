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

function readS16LE(buf: Uint8Array, offset: number) {
  const u = readU16LE(buf, offset);
  return u > 0x7fff ? u - 0x10000 : u;
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

/** Optional hints so we do not trust composition-plan duration alone. */
export type PcmChannelHints = {
  channels?: 1 | 2;
  apiDurationSec?: number;
  outputFormat?: string;
  contentType?: string;
};

function nearDuration(actualSec: number, expectedSec: number, tol = 0.2): boolean {
  if (!(expectedSec > 0) || !(actualSec > 0)) return false;
  return Math.abs(actualSec - expectedSec) / expectedSec <= tol;
}

/**
 * L/R decorrelation tie-breaker for the ambiguous byte-length case
 * (monoSec ≈ 2×E and stereoSec ≈ E): mono interleaved as stereo pairs
 * has L/R correlation ≈ interleaved lag-1; true stereo usually diverges.
 */
function guessChannelsFromDecorrelation(pcm: Buffer): 1 | 2 | null {
  const frames = Math.min(Math.floor(pcm.length / 4), PCM_RATE * 2);
  if (frames < 2048) return null;

  let sumL = 0;
  let sumR = 0;
  for (let i = 0; i < frames; i += 1) {
    sumL += readS16LE(pcm, i * 4);
    sumR += readS16LE(pcm, i * 4 + 2);
  }
  const meanL = sumL / frames;
  const meanR = sumR / frames;

  let covLR = 0;
  let varL = 0;
  let varR = 0;
  for (let i = 0; i < frames; i += 1) {
    const L = readS16LE(pcm, i * 4) - meanL;
    const R = readS16LE(pcm, i * 4 + 2) - meanR;
    covLR += L * R;
    varL += L * L;
    varR += R * R;
  }
  const lrDen = Math.sqrt(varL * varR);
  const lr = lrDen > 0 ? covLR / lrDen : 0;

  const sampleCount = frames * 2;
  const lagCount = sampleCount - 1;
  let meanA = 0;
  let meanB = 0;
  let prev = readS16LE(pcm, 0);
  for (let i = 1; i < sampleCount; i += 1) {
    const s = readS16LE(pcm, i * 2);
    meanA += prev;
    meanB += s;
    prev = s;
  }
  meanA /= lagCount;
  meanB /= lagCount;

  let covLag = 0;
  let varA = 0;
  let varB = 0;
  prev = readS16LE(pcm, 0);
  for (let i = 1; i < sampleCount; i += 1) {
    const s = readS16LE(pcm, i * 2);
    const a = prev - meanA;
    const b = s - meanB;
    covLag += a * b;
    varA += a * a;
    varB += b * b;
    prev = s;
  }
  const lagDen = Math.sqrt(varA * varB);
  const lag1 = lagDen > 0 ? covLag / lagDen : 0;
  const delta = Math.abs(lr - lag1);

  // Mono-as-stereo: stream lag-1 ≈ L/R corr and both are meaningfully correlated.
  if (lag1 > 0.25 && delta < 0.01) return 1;
  // Clear stereo separation (independent or clearly divergent channels).
  if (delta >= 0.015 || (Math.abs(lr) < 0.2 && lag1 < 0.2)) return 2;
  return null;
}

function channelHintFromFormat(hints?: PcmChannelHints): 1 | 2 | null {
  if (!hints) return null;
  if (hints.channels === 1 || hints.channels === 2) return hints.channels;
  const blob = `${hints.outputFormat || ""} ${hints.contentType || ""}`.toLowerCase();
  // Match mono/stereo even inside tokens like pcm_44100_stereo.
  if (/(?:^|[^a-z])mono(?:[^a-z]|$)/.test(blob)) return 1;
  if (/(?:^|[^a-z])stereo(?:[^a-z]|$)/.test(blob)) return 2;
  return null;
}

/**
 * Infer PCM16 channel count (OFFLINE / unit tests only).
 * Production pcm_44100 path always encodes stereo — do not call from toWavBuffer.
 * Do not trust expectedDuration alone: API duration / format hints win, then
 * byte-length 2× heuristics, then optional L/R decorrelation.
 */
export function detectPcmChannels(
  pcm: Buffer,
  sampleRate: number,
  expectedDurationSec?: number,
  hints?: PcmChannelHints,
): 1 | 2 {
  const formatHint = channelHintFromFormat(hints);
  if (formatHint) return formatHint;

  const monoSec = pcm.length > 0 && sampleRate > 0 ? pcm.length / 2 / sampleRate : 0;
  const stereoSec = pcm.length > 0 && sampleRate > 0 ? pcm.length / 4 / sampleRate : 0;

  const apiDur = hints?.apiDurationSec && hints.apiDurationSec > 0 ? hints.apiDurationSec : undefined;
  if (apiDur && monoSec > 0) {
    // Unambiguous API matches.
    if (nearDuration(monoSec, apiDur) && !nearDuration(stereoSec, apiDur)) return 1;
    // Ambiguous: stereoSec≈apiDur and monoSec≈2×apiDur — same trap as plan duration; use decorrelation.
    if (nearDuration(stereoSec, apiDur) && nearDuration(monoSec, 2 * apiDur)) {
      const deco = guessChannelsFromDecorrelation(pcm);
      if (deco === 1) return 1;
      if (deco === 2) return 2;
      // Fall through to shared ambiguous handling below (E will be apiDur).
    } else if (nearDuration(stereoSec, apiDur) && !nearDuration(monoSec, apiDur)) {
      return 2;
    } else if (Math.abs(monoSec - apiDur) < Math.abs(stereoSec - apiDur)) {
      return 1;
    } else if (Math.abs(stereoSec - apiDur) < Math.abs(monoSec - apiDur)) {
      return 2;
    }
  }

  const E = apiDur || (expectedDurationSec && expectedDurationSec > 0 ? expectedDurationSec : undefined);
  if (E && monoSec > 0) {
    // Ambiguous byte length: stereoSec≈E and monoSec≈2E (correct stereo OR double-length mono).
    // Too-fast (mono labeled stereo) vs too-slow inverse — do not trust E alone; use decorrelation.
    if (nearDuration(monoSec, 2 * E) && nearDuration(stereoSec, E)) {
      const deco = guessChannelsFromDecorrelation(pcm);
      // Clear mono-as-stereo → MONO (2× playback if labeled stereo).
      if (deco === 1) return 1;
      // Clear stereo → STEREO (½ speed if labeled mono).
      if (deco === 2) return 2;
      // Inconclusive: keep EL pcm_44100 stereo default (avoids reintroducing half-speed).
      return 2;
    }
    // Explicit too-slow style input: caller passes observed wrong (mono) duration as E
    // where monoSec≈E and stereoSec≈E/2 — handled below as clear mono match is wrong;
    // when stereoSec≈2×E && monoSec≈E (E = half the mono duration / planned stereo), prefer STEREO.
    if (nearDuration(stereoSec, 2 * E) && nearDuration(monoSec, E)) {
      const deco = guessChannelsFromDecorrelation(pcm);
      if (deco === 1) return 1;
      return 2;
    }
    // Clear mono: duration matches mono only.
    if (nearDuration(monoSec, E) && !nearDuration(stereoSec, E)) return 1;
    // Clear stereo: duration matches stereo only (and not the 2× mono trap above).
    if (nearDuration(stereoSec, E) && !nearDuration(monoSec, E)) return 2;

    const deco = guessChannelsFromDecorrelation(pcm);
    if (deco) return deco;

    // Closer wins; ties prefer stereo only when not the 2×-mono pattern.
    if (Math.abs(stereoSec - E) < Math.abs(monoSec - E)) return 2;
    if (Math.abs(monoSec - E) < Math.abs(stereoSec - E)) return 1;
  }

  const deco = guessChannelsFromDecorrelation(pcm);
  if (deco) return deco;
  // ElevenLabs Music output_format=pcm_44100 defaults to stereo PCM16 @ 44.1kHz.
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

/** Max word-stamp end time from detailed JSON (API-reported audio timeline). */
export function apiDurationFromMeta(meta: unknown): number | undefined {
  const stamps = parseWordStamps(meta);
  if (!stamps.length) {
    if (!meta || typeof meta !== "object") return undefined;
    const root = meta as Record<string, unknown>;
    const candidates = [
      root.duration,
      root.duration_sec,
      root.durationSec,
      root.duration_seconds,
      root.song_duration,
      root.audio_duration,
      (root.json as Record<string, unknown> | undefined)?.duration,
    ];
    for (const c of candidates) {
      const n = Number(c);
      if (Number.isFinite(n) && n > 0) return n > 1000 ? n / 1000 : n;
    }
    return undefined;
  }
  let maxEnd = 0;
  for (const s of stamps) {
    if (s.end > maxEnd) maxEnd = s.end;
  }
  return maxEnd > 0 ? maxEnd : undefined;
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

function toWavBuffer(audio: Buffer, _expectedDurationSec?: number, _hints?: PcmChannelHints): Buffer {
  if (isWav(audio)) return audio;
  if (isMp3(audio)) {
    throw new Error(
      "ElevenLabs returned MP3; pcm_44100 was unavailable. Convert to WAV is not supported on Workers — retry or check output_format.",
    );
  }
  // Raw EL Music output_format=pcm_44100 is ALWAYS interleaved stereo PCM16 @ 44.1kHz.
  // Never run detectPcmChannels in production: labeling stereo as mono → half-speed (Joseph after PR15).
  // detectPcmChannels remains exported for offline unit tests only.
  return encodePcm16Wav(audio, PCM_RATE, 2);
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
    stamps = parseWordStamps(parsed.meta);
    const hints: PcmChannelHints = {
      apiDurationSec: apiDurationFromMeta(parsed.meta),
      outputFormat: "pcm_44100",
      contentType: detailed.headers.get("content-type") || undefined,
    };
    wav = toWavBuffer(parsed.audio, expectedSec, hints);
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
    const hints: PcmChannelHints = {
      outputFormat: "pcm_44100",
      contentType: plain.headers.get("content-type") || undefined,
    };
    wav = toWavBuffer(Buffer.from(await plain.arrayBuffer()), expectedSec, hints);
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
