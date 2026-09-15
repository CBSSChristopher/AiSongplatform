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

/** Heartfelt gift occasions — locked ballad pocket, not a race. */
function isHeartfeltOccasion(occasion: string): boolean {
  return ["birthday", "anniversary", "in-memory", "thank-you", "wedding"].includes(occasion);
}

function isMemorialOccasion(occasion: string): boolean {
  return occasion === "in-memory";
}

function isLullabyJob(job: { genre: string; occasion: string }): boolean {
  return job.genre === "lullaby" || job.occasion === "bedtime";
}

/** Einstein PERFECT LOCK v2 — exact strings; BPM token inside positive_styles only. */
const SHARED_NEGATIVES = [
  "upbeat",
  "energetic",
  "lively",
  "rushed",
  "double-time",
  "racing tempo",
  "frantic",
  "too fast",
  "chipmunk",
  "sped-up vocals",
  "hurried phrasing",
  "off-beat phrasing",
  "ahead of the beat",
  "talk-sung",
  "spoken-word",
  "rap cadence",
  "syllable stuffing",
  "dance",
  "club drop",
  "EDM",
  "screaming",
  "harsh distortion",
  "explicit",
  "robotic",
  "mumbled",
  "slurred",
  "dirge",
  "lethargic",
  "sleepy",
  "draggy tempo",
  "race tempo",
  "two-step race",
] as const;

type PackEntry = { positive: string[]; negativeExtra: string[]; bpmToken: string };

/** Pack keyed by genre|voice — wire EXACT v2 strings (no freestyle). */
const HEARTFELT_PACK: Record<string, PackEntry> = {
  "pop|female": {
    bpmToken: "88 BPM",
    positive: [
      "pop ballad",
      "soft contemporary pop",
      "female vocals",
      "clear female singer",
      "warm intimate female lead",
      "singable melody",
      "clear pitched melody",
      "hook you can hum",
      "in-tune lead vocal",
      "on the beat",
      "88 BPM",
      "medium-slow tempo",
      "ballad pacing",
      "space between phrases",
      "unhurried vowels",
      "legato phrasing",
      "soft drums",
      "warm bass",
      "gentle acoustic guitar",
      "polished gift-song",
      "great production quality",
      "clear lyrics",
      "heartfelt",
      "natural phrasing",
    ],
    negativeExtra: ["radio-ready race", "tight punchy drums", "catchy hook race", "anthemic shout"],
  },
  "pop|male": {
    bpmToken: "88 BPM",
    positive: [
      "pop ballad",
      "soft contemporary pop",
      "male vocals",
      "clear male singer",
      "warm intimate male lead",
      "singable melody",
      "clear pitched melody",
      "hook you can hum",
      "in-tune lead vocal",
      "on the beat",
      "88 BPM",
      "medium-slow tempo",
      "ballad pacing",
      "space between phrases",
      "unhurried vowels",
      "legato phrasing",
      "soft drums",
      "warm bass",
      "gentle acoustic guitar",
      "polished gift-song",
      "great production quality",
      "clear lyrics",
      "heartfelt",
      "natural phrasing",
    ],
    negativeExtra: [
      "radio-ready race",
      "tight punchy drums",
      "catchy hook race",
      "anthemic shout",
      "boy-band shout",
    ],
  },
  "country|female": {
    bpmToken: "86 BPM",
    positive: [
      "country ballad",
      "warm country",
      "female vocals",
      "clear female singer",
      "warm intimate female lead",
      "singable melody",
      "clear pitched melody",
      "hook you can hum",
      "in-tune lead vocal",
      "on the beat",
      "86 BPM",
      "medium-slow tempo",
      "ballad pacing",
      "space between phrases",
      "unhurried vowels",
      "legato phrasing",
      "warm acoustic guitar",
      "gentle fingerpicking",
      "soft brushed drums",
      "warm pedal steel hint",
      "polished gift-song",
      "great production quality",
      "clear lyrics",
      "heartfelt",
      "storytelling verse",
      "natural phrasing",
    ],
    negativeExtra: [
      "lively two-step",
      "honky-tonk race",
      "driving acoustic guitar race",
      "bright aggressive twang",
      "line-dance",
    ],
  },
  "rnb|female": {
    bpmToken: "84 BPM",
    positive: [
      "r&b ballad",
      "smooth contemporary r&b",
      "female vocals",
      "clear female singer",
      "warm intimate female lead",
      "singable melody",
      "clear pitched melody",
      "hook you can hum",
      "in-tune lead vocal",
      "on the beat",
      "84 BPM",
      "medium-slow tempo",
      "ballad pacing",
      "space between phrases",
      "unhurried vowels",
      "legato phrasing",
      "smooth groove",
      "soft kick",
      "warm keys",
      "gentle guitar",
      "polished gift-song",
      "great production quality",
      "clear lyrics",
      "heartfelt",
      "soulful but restrained",
      "natural phrasing",
    ],
    negativeExtra: ["trap hats race", "club r&b", "energetic groove", "auto-tune chatter"],
  },
};

function normalizeGenre(genre: string): string {
  if (genre === "r&b" || genre === "rnb") return "rnb";
  return genre || "pop";
}

function normalizeVoice(voice: string): "female" | "male" {
  return voice === "male" ? "male" : "female";
}

function packKey(genre: string, voice: string): string {
  return `${normalizeGenre(genre)}|${normalizeVoice(voice)}`;
}

function voiceSwapPositive(positive: string[], voice: "female" | "male"): string[] {
  if (voice === "male") {
    return positive.map((s) =>
      s
        .replace(/\bfemale vocals\b/g, "male vocals")
        .replace(/\bclear female singer\b/g, "clear male singer")
        .replace(/\bwarm intimate female lead\b/g, "warm intimate male lead"),
    );
  }
  return positive.map((s) =>
    s
      .replace(/\bmale vocals\b/g, "female vocals")
      .replace(/\bclear male singer\b/g, "clear female singer")
      .replace(/\bwarm intimate male lead\b/g, "warm intimate female lead"),
  );
}

/** Exact pack hit, or voice-swap same genre, else pop|voice — never freestyle energy. */
function resolveHeartfeltPack(genre: string, voice: string): PackEntry {
  const key = packKey(genre, voice);
  const hit = HEARTFELT_PACK[key];
  if (hit) return hit;
  const g = normalizeGenre(genre);
  const v = normalizeVoice(voice);
  const otherVoice = v === "male" ? "female" : "male";
  const sameGenreOther = HEARTFELT_PACK[`${g}|${otherVoice}`];
  if (sameGenreOther) {
    return {
      bpmToken: sameGenreOther.bpmToken,
      positive: voiceSwapPositive(sameGenreOther.positive, v),
      negativeExtra: [...sameGenreOther.negativeExtra],
    };
  }
  const fallback = HEARTFELT_PACK[`pop|${v}`] || HEARTFELT_PACK["pop|female"];
  return fallback;
}

function applyOverlay(pack: PackEntry, job: SongJob): PackEntry {
  if (isLullabyJob(job)) {
    const positive = pack.positive
      .map((s) => (/\d+\s*BPM/i.test(s) ? "68 BPM" : s))
      .concat(["sparse arrangement", "tender", "soft and gentle", "quiet intimacy"]);
    return {
      bpmToken: "68 BPM",
      positive: [...new Set(positive)],
      negativeExtra: [...pack.negativeExtra, "loud drums", "aggressive", "club drop"],
    };
  }
  if (isMemorialOccasion(job.occasion)) {
    const positive = pack.positive
      .map((s) => (/\d+\s*BPM/i.test(s) ? "82 BPM" : s))
      .concat(["reverent", "still melodic"]);
    return {
      bpmToken: "82 BPM",
      positive: [...new Set(positive)],
      negativeExtra: [...pack.negativeExtra],
    };
  }
  return pack;
}

function packForJob(job: SongJob): PackEntry {
  const base = resolveHeartfeltPack(job.genre || "pop", job.voice || "female");
  return applyOverlay(base, job);
}

function nameEnunciationOverlays(job: SongJob): { positive: string[]; negativeExtra: string[] } {
  const written = (job.recipientName || "").trim();
  const guide = (job.namePronunciation || "").trim();
  // Only when a pronunciation guide is present — never leak phonetics into lyric chunk text.
  if (!guide) return { positive: [], negativeExtra: [] };
  const label = written || "the name";
  return {
    positive: [
      `clear enunciation of the name ${label}`,
      `pronounce ${label} carefully`,
      "distinct syllables for the name",
      `pronounce the name like ${guide} when singing`,
      `clear enunciation guided by ${guide}`,
    ],
    negativeExtra: [
      "mumbled name",
      "rushed name",
      "slurred name",
      "wrong name",
      "phonetic spelling sung as lyrics",
    ],
  };
}

function negativeStylesFor(job: SongJob): string[] {
  const pack = packForJob(job);
  const overlays = nameEnunciationOverlays(job);
  return [...new Set([...SHARED_NEGATIVES, ...pack.negativeExtra, ...overlays.negativeExtra])];
}

/** Exported for regression: birthday/heartfelt positives include BPM; ban race energy. */
export function positiveStylesForJob(job: SongJob, _section = ""): string[] {
  const pack = packForJob(job);
  // First-chunk styles dominate; keep exact pack list, then optional name enunciation overlays.
  const overlays = nameEnunciationOverlays(job);
  return [...new Set([...pack.positive, ...overlays.positive])];
}

export function bpmTokenForJob(job: SongJob): string {
  return packForJob(job).bpmToken;
}

export function negativeStylesForJob(job: SongJob): string[] {
  return negativeStylesFor(job);
}

function positiveStyles(job: SongJob, section: string): string[] {
  return positiveStylesForJob(job, section);
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

  // Preview: keep verse + chorus (+ bridge if short) so total stays ~preview length.
  if (targetSeconds <= 60 && sections.length > 3) {
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
      negative_styles: negativeStylesFor(job),
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

/**
 * Duplicate mono PCM16 LE samples to interleaved stereo L=R.
 * Duration stays monoSec — NEVER just flip the WAV channel header (half-speed / too-fast).
 */
export function monoPcmToStereoPcm(pcm: Buffer): Buffer {
  const frames = Math.floor(pcm.length / 2);
  const out = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i += 1) {
    const lo = pcm[i * 2]!;
    const hi = pcm[i * 2 + 1]!;
    const o = i * 4;
    out[o] = lo;
    out[o + 1] = hi;
    out[o + 2] = lo;
    out[o + 3] = hi;
  }
  return out;
}

/** Fail loudly when playback duration drifts >tol from plan/API (default 5%). */
export function assertDuration(actualSec: number, expectedSec: number, tol = 0.05): void {
  if (!(expectedSec > 0) || !(actualSec > 0)) {
    throw new Error(
      `WAV duration assert missing values (actual=${actualSec}, expected=${expectedSec})`,
    );
  }
  const rel = Math.abs(actualSec - expectedSec) / expectedSec;
  if (rel > tol) {
    throw new Error(
      `WAV duration ${actualSec.toFixed(3)}s != expected ${expectedSec.toFixed(3)}s ` +
        `(${(rel * 100).toFixed(1)}% > ${(tol * 100).toFixed(0)}%) — refusing wrong-speed ship`,
    );
  }
}

/** Encode raw PCM16 LE into a stereo WAV container. Always ch=2 — never ship mono headers. */
function encodePcm16Wav(pcm: Buffer, sampleRate: number, channels = 2) {
  // Ban mono-header-on-stereo-bytes (half-speed) and force-stereo-without-dup (too-fast).
  // Callers must upconvert mono via monoPcmToStereoPcm before encode.
  if (channels === 1) {
    throw new Error("encodePcm16Wav: channels=1 banned — upconvert with monoPcmToStereoPcm first");
  }
  const ch = 2;
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

function nearDuration(actualSec: number, expectedSec: number, tol = 0.09): boolean {
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

  // Centered true-stereo mixes often have lr>0.8 (0914 lr≈0.97) — do NOT treat high lr alone as mono.
  // Tight delta: true mono consecutive-sample pairs keep lr≈lag1 (too-fast-6704 delta≈0.003).
  if (lag1 > 0.25 && delta < 0.008) return 1;
  if (delta >= 0.012 || (Math.abs(lr) < 0.2 && lag1 < 0.2)) return 2;
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
 * Infer PCM16 channel layout for pcm_44100 payloads (before stereo emission).
 * Duration match wins over decorrelation — high L/R corr must NOT force mono when stereoSec≈E (0914).
 * toWavBuffer always emits ch=2; mono detections are upconverted via monoPcmToStereoPcm.
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
  const planE = expectedDurationSec && expectedDurationSec > 0 ? expectedDurationSec : undefined;
  // Prefer plan/API duration whose layout matches — apiDur used as corroboration, not override of stereoSec≈plan.
  const E = planE || apiDur;

  if (E && monoSec > 0) {
    // Clear mono: duration matches mono only (stereo would be ~half) → upconvert path.
    if (nearDuration(monoSec, E) && !nearDuration(stereoSec, E)) return 1;
    // Clear / ambiguous stereoSec≈E (incl. monoSec≈2E): prefer stereo. Centered mixes look mono-like (0914).
    if (nearDuration(stereoSec, E)) return 2;
    // stereoSec≈2E && monoSec≈E with wrong E (half of true mono): treat as mono for upconvert.
    if (nearDuration(stereoSec, 2 * E) && nearDuration(monoSec, E)) {
      const deco = guessChannelsFromDecorrelation(pcm);
      if (deco === 1) return 1;
      return 2;
    }
    // apiDur may still disambiguate when plan E is weak.
    if (apiDur && apiDur !== E) {
      if (nearDuration(monoSec, apiDur) && !nearDuration(stereoSec, apiDur)) return 1;
      if (nearDuration(stereoSec, apiDur)) return 2;
    }
    const deco = guessChannelsFromDecorrelation(pcm);
    if (deco) return deco;
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

export function audioDurationSeconds(wav: Uint8Array): number {
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
      // EL mixes ms (219,400) with seconds (0.959). Do NOT treat 100–200 as always-ms —
      // songs >100s have legitimate second stamps there.
      // Heuristics: >1000 ⇒ ms; both >100 with absurd word span (>20s) ⇒ ms pair;
      // start>100 with small end (<30) ⇒ start was ms in a mixed row.
      if (start > 1000 || end > 1000) {
        start /= 1000;
        end /= 1000;
      } else if (start > 100 && end > 100 && end - start > 20) {
        start /= 1000;
        end /= 1000;
      } else if (start > 100 && end < 30) {
        start /= 1000;
      } else if (end > 100 && start < 30 && end > start) {
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

/** Encode EL pcm_44100 (or pass-through WAV). Always emits stereo WAV. Exported for fixture tests. */
export function toWavBuffer(audio: Buffer, expectedDurationSec?: number, hints?: PcmChannelHints): Buffer {
  if (isWav(audio)) return audio;
  if (isMp3(audio)) {
    throw new Error(
      "ElevenLabs returned MP3; pcm_44100 was unavailable. Convert to WAV is not supported on Workers — retry or check output_format.",
    );
  }
  // Detect layout, then ALWAYS emit ch=2. Mono → duplicate L=R (same duration). Stereo → keep bytes.
  // Ban: force-stereo-without-duplication (PR16) and mono-header-on-stereo-bytes (0914).
  const detected = detectPcmChannels(audio, PCM_RATE, expectedDurationSec, hints);
  const pcm = detected === 1 ? monoPcmToStereoPcm(audio) : audio;
  const wav = encodePcm16Wav(pcm, PCM_RATE, 2);
  const playback = audioDurationSeconds(wav);
  const expect =
    (expectedDurationSec && expectedDurationSec > 0 ? expectedDurationSec : undefined) ||
    (hints?.apiDurationSec && hints.apiDurationSec > 0 ? hints.apiDurationSec : undefined);
  if (expect) assertDuration(playback, expect, 0.05);
  return wav;
}


function stampSpanSec(stamps: WordStamp[]): number {
  if (!stamps.length) return 0;
  let maxEnd = 0;
  for (const s of stamps) {
    if (s.end > maxEnd) maxEnd = s.end;
  }
  return maxEnd;
}

function scaleWordStamps(stamps: WordStamp[], factor: number): WordStamp[] {
  if (!(factor > 0) || Math.abs(factor - 1) < 0.02) return stamps;
  return stamps.map((s) => ({
    text: s.text,
    start: s.start * factor,
    end: s.end * factor,
  }));
}

/** True when stamps look unusable (crushed last words, zero-width, inverted). */
function stampsLookBroken(stamps: WordStamp[], audioDurationSec: number): boolean {
  if (!stamps.length) return true;
  const span = stampSpanSec(stamps);
  if (!(span > 0.5)) return true;
  let zeroWidth = 0;
  let tiny = 0;
  for (const s of stamps) {
    const dur = s.end - s.start;
    if (dur <= 0) zeroWidth += 1;
    if (dur > 0 && dur < 0.02) tiny += 1;
  }
  if (zeroWidth > stamps.length * 0.1) return true;
  if (tiny > stamps.length * 0.35) return true;
  // Crushed into final 0.5s of a much longer song.
  if (audioDurationSec > 8) {
    const late = stamps.filter((s) => s.start >= audioDurationSec - 0.5);
    if (late.length >= 8) return true;
  }
  return false;
}

async function composeMusic(
  apiKey: string,
  lyrics: string,
  compositionPlan: { chunks: GenerationChunk[] },
): Promise<{ wav: Buffer; mp3?: Buffer; cues: LyricCue[] }> {
  const body = {
    model_id: MODEL_ID,
    composition_plan: compositionPlan,
    force_instrumental: false,
    with_timestamps: true,
  };

  let wav: Buffer | null = null;
  let mp3: Buffer | undefined;
  let stamps: WordStamp[] = [];

  // Parallel MP3 for iOS <audio> — Workers cannot run ffmpeg/lamejs in time.
  const mp3Promise = fetch(`${API_BASE}?output_format=mp3_44100_128`, {
    method: "POST",
    headers: {
      "xi-api-key": apiKey,
      "Content-Type": "application/json",
      Accept: "audio/*, application/json",
    },
    body: JSON.stringify({
      model_id: MODEL_ID,
      composition_plan: compositionPlan,
      force_instrumental: false,
    }),
  }).catch(() => null);

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
      body: JSON.stringify({ model_id: MODEL_ID, composition_plan: compositionPlan, force_instrumental: false }),
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

  const expectedSec = compositionPlan.chunks.reduce((s, c) => s + c.duration_ms, 0) / 1000;
  const duration = audioDurationSeconds(wav) || expectedSec;
  let usableStamps = stamps;
  const span = stampSpanSec(usableStamps);
  // NEVER 2×-scale cues to paper over a mono-header lie (0914). If wav≈2×span and span≈plan, channels are wrong.
  if (
    span > 1 &&
    duration > 1 &&
    nearDuration(duration, 2 * span, 0.15) &&
    expectedSec > 0 &&
    nearDuration(span, expectedSec, 0.15)
  ) {
    throw new Error(
      `Cue/WAV 2× mismatch (wav=${duration.toFixed(1)}s span=${span.toFixed(1)}s plan=${expectedSec.toFixed(1)}s) — channel encode bug, not cue scale`,
    );
  } else if (span > 1 && duration > 1) {
    const ratio = duration / span;
    // Shrink or stretch stamps onto real WAV length when they drift >2%.
    // Never a full 2× paper-over (caught above). Allow shrink (ratio<1) for
    // masters restored shorter than the alignment timeline (e.g. 85s audio, 105s cues).
    if (ratio > 0.5 && ratio < 1.35 && Math.abs(ratio - 1) > 0.02) {
      usableStamps = scaleWordStamps(usableStamps, ratio);
    }
  }
  const fromStamps =
    usableStamps.length && !stampsLookBroken(usableStamps, duration)
      ? cuesFromWordStamps(lyrics, usableStamps)
      : null;
  const cues = fromStamps ?? distributeCues(lyrics, duration);

  try {
    const mp3Res = await mp3Promise;
    if (mp3Res?.ok) {
      const buf = Buffer.from(await mp3Res.arrayBuffer());
      if (buf.byteLength > 512) mp3 = buf;
    }
  } catch {
    // WAV master still saved; playback can fall back until backfill.
  }

  return { wav, mp3, cues };
}

export async function renderWithElevenLabs(job: SongJob, targetSeconds: number) {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is missing. Add it with: wrangler secret put ELEVENLABS_API_KEY");
  }
  const plan = buildCompositionPlan(job, targetSeconds);
  return composeMusic(apiKey, job.lyrics, plan);
}
