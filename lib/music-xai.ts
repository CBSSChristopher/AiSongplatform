import type { LyricCue, LyricWordCue } from "./cues";
import { lyricSections, sungLines } from "./lyric-parse";
import type { SongJob } from "./types";

const TTS_URL = "https://api.x.ai/v1/tts";
const SAMPLE_RATE = 44100;
const MAX_CHARS = 15000;

export type XaiTtsRequest = {
  text: string;
  voice_id: string;
  language: string;
  output_format: { codec: "wav"; sample_rate: number };
  with_timestamps: true;
  text_normalization: false;
  speed: number;
};

export type XaiVocalRender = {
  wav: Buffer;
  cues: LyricCue[];
  samples: Float32Array;
  sampleRate: number;
  duration: number;
  hasRealGraphStamps: boolean;
};

type TimedChar = { char: string; start: number; end: number };
type WordStamp = { text: string; start: number; end: number };

type SungLine = { text: string; section: LyricCue["section"] };

/** female → eve, male → rex, any → eve (built-ins: eve/ara/rex/sal/leo). */
export function mapVoiceId(voice: string): "eve" | "ara" | "rex" | "sal" | "leo" {
  if (voice === "male") return "rex";
  if (voice === "female") return "eve";
  return "eve";
}

function singingSpeed(genre: string) {
  if (genre === "lullaby") return 0.85;
  if (genre === "worship") return 0.9;
  if (genre === "rock") return 1.05;
  return 1;
}

export function singingLines(job: SongJob, targetSeconds: number): SungLine[] {
  let sections = lyricSections(job.lyrics);
  if (!sections.length) {
    return [{ text: "A song made just for you.", section: "verse" }];
  }
  if (targetSeconds <= 50 && sections.length > 3) {
    const verse = sections.find((s) => s.section === "verse");
    const chorus = sections.find((s) => s.section === "chorus");
    const bridge = sections.find((s) => s.section === "bridge");
    const picked = [verse, chorus, bridge].filter(Boolean) as typeof sections;
    sections = picked.length >= 2 ? picked : sections.slice(0, 3);
  }
  return sections.flatMap((section) =>
    section.lines.map((text) => ({ text, section: section.section })),
  );
}

function wrapSection(section: LyricCue["section"], lines: string[]) {
  const body = lines.join("\n");
  if (section === "bridge") return `<sing-song>${body}</sing-song>`;
  return `<singing>${body}</singing>`;
}

/** Wrap sung lines in xAI speech tags for sung delivery. */
export function wrapSingingText(lines: SungLine[]): string {
  const parts: string[] = [];
  let bucket: SungLine[] = [];
  for (const line of lines) {
    const last = bucket[bucket.length - 1];
    if (last && last.section !== line.section) {
      parts.push(wrapSection(last.section, bucket.map((item) => item.text)));
      bucket = [];
    }
    bucket.push(line);
  }
  if (bucket.length) {
    parts.push(wrapSection(bucket[0].section, bucket.map((item) => item.text)));
  }
  const text = parts.join("\n[pause]\n");
  if (text.length <= MAX_CHARS) return text;
  return text.slice(0, MAX_CHARS);
}

export function buildTtsRequest(job: SongJob, targetSeconds: number): XaiTtsRequest {
  const lines = singingLines(job, targetSeconds);
  return {
    text: wrapSingingText(lines),
    voice_id: mapVoiceId(job.voice),
    language: "en",
    output_format: { codec: "wav", sample_rate: SAMPLE_RATE },
    with_timestamps: true,
    text_normalization: false,
    speed: singingSpeed(job.genre),
  };
}

function encodePcm16Wav(pcm: Buffer, sampleRate: number) {
  const buffer = Buffer.alloc(44 + pcm.length);
  buffer.write("RIFF", 0);
  buffer.writeUInt32LE(36 + pcm.length, 4);
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
  buffer.writeUInt32LE(pcm.length, 40);
  for (let i = 0; i < pcm.length; i += 1) buffer[44 + i] = pcm[i];
  return buffer;
}

function readU32LE(buf: Uint8Array, offset: number) {
  return (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0;
}

function readU16LE(buf: Uint8Array, offset: number) {
  return buf[offset] | (buf[offset + 1] << 8);
}

function readI16LE(buf: Uint8Array, offset: number) {
  const u = readU16LE(buf, offset);
  return u > 0x7fff ? u - 0x10000 : u;
}

function readF32LE(buf: Uint8Array, offset: number) {
  const view = new DataView(buf.buffer, buf.byteOffset + offset, 4);
  return view.getFloat32(0, true);
}

function asciiSlice(buf: Uint8Array, start: number, end: number) {
  let out = "";
  for (let i = start; i < end && i < buf.length; i += 1) out += String.fromCharCode(buf[i]);
  return out;
}

function encodeFloatWav(samples: Float32Array, sampleRate: number) {
  const pcm = Buffer.alloc(samples.length * 2);
  for (let i = 0; i < samples.length; i += 1) {
    const clipped = Math.max(-1, Math.min(1, samples[i]));
    pcm.writeInt16LE(Math.round(clipped * 32767), i * 2);
  }
  return encodePcm16Wav(pcm, sampleRate);
}

function isWav(buf: Uint8Array) {
  return buf.length >= 12 && asciiSlice(buf, 0, 4) === "RIFF" && asciiSlice(buf, 8, 12) === "WAVE";
}

function isMp3(buf: Uint8Array) {
  if (buf.length < 3) return false;
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  return asciiSlice(buf, 0, 3) === "ID3";
}

type ParsedWav = {
  sampleRate: number;
  channels: number;
  bits: number;
  floatFmt: boolean;
  pcm: Buffer;
};

function parseWav(buf: Buffer): ParsedWav | null {
  if (!isWav(buf) || buf.length < 12) return null;
  let offset = 12;
  let sampleRate = SAMPLE_RATE;
  let channels = 1;
  let bits = 16;
  let floatFmt = false;
  let pcm: Buffer | null = null;
  while (offset + 8 <= buf.length) {
    const id = asciiSlice(buf, offset, offset + 4);
    const size = readU32LE(buf, offset + 4);
    const start = offset + 8;
    const end = Math.min(buf.length, start + size);
    if (id === "fmt " && end - start >= 16) {
      const format = readU16LE(buf, start);
      channels = readU16LE(buf, start + 2) || 1;
      sampleRate = readU32LE(buf, start + 4) || SAMPLE_RATE;
      bits = readU16LE(buf, start + 14) || 16;
      floatFmt = format === 3;
    } else if (id === "data") {
      pcm = Buffer.from(buf.subarray(start, end));
    }
    offset = start + size + (size % 2);
  }
  if (!pcm) return null;
  return { sampleRate, channels, bits, floatFmt, pcm };
}

function pcmToMonoFloat(parsed: ParsedWav): Float32Array {
  const { pcm, channels, bits, floatFmt } = parsed;
  const ch = Math.max(1, channels);
  if (floatFmt && bits === 32) {
    const frames = Math.floor(pcm.length / 4 / ch);
    const out = new Float32Array(frames);
    for (let i = 0; i < frames; i += 1) {
      let sum = 0;
      for (let c = 0; c < ch; c += 1) sum += readF32LE(pcm, (i * ch + c) * 4);
      out[i] = sum / ch;
    }
    return out;
  }
  if (bits === 16) {
    const frames = Math.floor(pcm.length / 2 / ch);
    const out = new Float32Array(frames);
    for (let i = 0; i < frames; i += 1) {
      let sum = 0;
      for (let c = 0; c < ch; c += 1) sum += readI16LE(pcm, (i * ch + c) * 2);
      out[i] = sum / ch / 32768;
    }
    return out;
  }
  throw new Error(`Unsupported WAV format (${bits}-bit).`);
}

function audioToSamples(audio: Buffer, contentType: string): { samples: Float32Array; sampleRate: number; wav: Buffer } {
  if (isWav(audio)) {
    const parsed = parseWav(audio);
    if (!parsed) throw new Error("xAI TTS returned a WAV we could not parse.");
    const samples = pcmToMonoFloat(parsed);
    const wav =
      parsed.channels === 1 && parsed.bits === 16 && !parsed.floatFmt
        ? audio
        : encodeFloatWav(samples, parsed.sampleRate);
    return { samples, sampleRate: parsed.sampleRate, wav };
  }
  if (isMp3(audio) || /mpeg|mp3/i.test(contentType)) {
    throw new Error(
      "xAI TTS returned MP3; request wav codec was unavailable. Convert to WAV is not supported on Workers.",
    );
  }
  // Raw PCM 16-bit LE mono at the requested rate.
  const samples = pcmToMonoFloat({
    sampleRate: SAMPLE_RATE,
    channels: 1,
    bits: 16,
    floatFmt: false,
    pcm: audio,
  });
  return { samples, sampleRate: SAMPLE_RATE, wav: encodePcm16Wav(audio, SAMPLE_RATE) };
}

function audioDurationSeconds(samples: Float32Array, sampleRate: number, fallback: number) {
  if (samples.length && sampleRate) return samples.length / sampleRate;
  return fallback;
}

/** Distribute line/word cues evenly across audio duration (fallback). */
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

function tagSpan(chars: string[], index: number): number | null {
  const token = chars[index] || "";
  if (token.length > 1) {
    if (/^<\/?[a-z-]+>$/i.test(token) || /^\[[a-z-]+\]$/i.test(token)) return index;
    return null;
  }
  if (token === "<") {
    let j = index + 1;
    if (chars[j] === "/") j += 1;
    const start = j;
    while (j < chars.length && /^[a-zA-Z-]$/.test(chars[j] || "")) j += 1;
    if (j > start && chars[j] === ">") return j;
  }
  if (token === "[") {
    let j = index + 1;
    while (j < chars.length && /^[a-zA-Z-]$/.test(chars[j] || "")) j += 1;
    if (j > index + 1 && chars[j] === "]") return j;
  }
  return null;
}

function timedChars(graphChars: string[], graphTimes: number[][]): TimedChar[] {
  const out: TimedChar[] = [];
  for (let i = 0; i < graphChars.length; i += 1) {
    const skipTo = tagSpan(graphChars, i);
    if (skipTo !== null) {
      i = skipTo;
      continue;
    }
    const pair = graphTimes[i];
    const start = Number(pair?.[0]);
    const end = Number(pair?.[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    const char = graphChars[i];
    if (!char) continue;
    for (const piece of char) {
      out.push({ char: piece, start, end });
    }
  }
  return out;
}

function wordsFromTimed(chars: TimedChar[]): WordStamp[] {
  const words: WordStamp[] = [];
  let current = "";
  let start = 0;
  let end = 0;
  const flush = () => {
    const text = current.trim();
    if (text) words.push({ text, start, end });
    current = "";
  };
  for (const item of chars) {
    if (/\s/.test(item.char)) {
      flush();
      continue;
    }
    if (!current) start = item.start;
    current += item.char;
    end = item.end;
  }
  flush();
  return words;
}

/**
 * Map xAI graph_chars + graph_times onto sung lyric lines/words for karaoke cues.
 * Speech tags are skipped; remaining characters are grouped into words and
 * consumed in order against sungLines(lyrics).
 */
export function cuesFromGraphTimestamps(
  lyrics: string,
  graphChars: string[],
  graphTimes: number[][],
): LyricCue[] | null {
  const words = wordsFromTimed(timedChars(graphChars, graphTimes));
  const lines = sungLines(lyrics);
  if (!words.length || !lines.length) return null;
  const cues: LyricCue[] = [];
  let cursor = 0;
  for (const line of lines) {
    const tokens = line.text.split(/\s+/).filter(Boolean);
    if (!tokens.length) continue;
    const lineWords: LyricWordCue[] = [];
    for (const token of tokens) {
      const stamp = words[cursor];
      if (!stamp) break;
      lineWords.push({ text: token, start: stamp.start, end: stamp.end });
      cursor += 1;
    }
    if (!lineWords.length) continue;
    cues.push({
      text: line.text,
      start: lineWords[0].start,
      end: lineWords[lineWords.length - 1].end,
      section: line.section,
      words: lineWords,
    });
  }
  return cues.length ? cues : null;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item));
}

function asTimePairs(value: unknown): number[][] {
  if (!Array.isArray(value)) return [];
  const pairs: number[][] = [];
  for (const item of value) {
    if (!Array.isArray(item) || item.length < 2) continue;
    const start = Number(item[0]);
    const end = Number(item[1]);
    if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
    pairs.push([start, end]);
  }
  return pairs;
}

function graphFromPayload(payload: Record<string, unknown>): { chars: string[]; times: number[][] } {
  const ts = (payload.audio_timestamps || payload.audioTimestamps) as Record<string, unknown> | undefined;
  if (!ts || typeof ts !== "object") return { chars: [], times: [] };
  return {
    chars: asStringArray(ts.graph_chars ?? ts.graphChars),
    times: asTimePairs(ts.graph_times ?? ts.graphTimes),
  };
}

async function synthesize(apiKey: string, request: XaiTtsRequest) {
  const response = await fetch(TTS_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json, audio/wav, audio/*",
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    const detail = (await response.text().catch(() => "")).slice(0, 240);
    const hint =
      response.status === 401 || response.status === 403
        ? "Check XAI_API_KEY."
        : response.status === 429
          ? "xAI TTS rate limit — try again shortly."
          : "Sung vocal generation failed.";
    throw new Error(`xAI TTS ${response.status}: ${hint} ${detail}`.trim());
  }

  const contentType = response.headers.get("content-type") || "";
  if (/json/i.test(contentType)) {
    const payload = (await response.json()) as Record<string, unknown>;
    const audioB64 = typeof payload.audio === "string" ? payload.audio : "";
    if (!audioB64) throw new Error("xAI TTS JSON response missing audio.");
    const audio = Buffer.from(audioB64, "base64");
    const converted = audioToSamples(audio, String(payload.content_type || contentType));
    const apiDuration = Number(payload.duration);
    const duration = audioDurationSeconds(
      converted.samples,
      converted.sampleRate,
      Number.isFinite(apiDuration) ? apiDuration : 0,
    );
    return { ...converted, duration, graph: graphFromPayload(payload) };
  }

  const audio = Buffer.from(await response.arrayBuffer());
  const converted = audioToSamples(audio, contentType);
  const duration = audioDurationSeconds(converted.samples, converted.sampleRate, 0);
  return { ...converted, duration, graph: { chars: [] as string[], times: [] as number[][] } };
}

export async function renderWithXai(job: SongJob, targetSeconds: number): Promise<XaiVocalRender> {
  const apiKey = process.env.XAI_API_KEY;
  if (!apiKey) {
    throw new Error("XAI_API_KEY is missing. Add it with: wrangler secret put XAI_API_KEY");
  }
  const request = buildTtsRequest(job, targetSeconds);
  if (!request.text.trim()) {
    throw new Error("xAI TTS request has empty singing text.");
  }
  const result = await synthesize(apiKey, request);
  const fromGraph = cuesFromGraphTimestamps(job.lyrics, result.graph.chars, result.graph.times);
  // Einstein F / Elon: never publish equal-time distributeCues as sync. Prefer real graph stamps only.
  const cues = fromGraph ?? [];
  return {
    wav: result.wav,
    cues,
    samples: result.samples,
    sampleRate: result.sampleRate,
    duration: result.duration || targetSeconds,
    hasRealGraphStamps: Boolean(fromGraph && fromGraph.length),
  };
}
