import { cueSpanEnd, type LyricCue } from "./cues";
import { readXingInfo, mp3XingMismatch } from "./mp3";

/**
 * Authoritative full-master duration for lyric fit.
 * Prefer WAV PCM sample count; only trust Xing when it agrees with bytes
 * (never use lying Xing alone).
 */
export async function resolveEncodedFullDurationSec(input: {
  wav?: Uint8Array | null;
  mp3?: Uint8Array | null;
  storedSec?: number | null;
  cues?: LyricCue[] | null;
}): Promise<number> {
  const stored =
    typeof input.storedSec === "number" && input.storedSec > 1
      ? input.storedSec
      : 0;

  let wavSec = 0;
  if (input.wav && input.wav.byteLength > 44) {
    try {
      const { audioDurationSeconds } = await import("./music-elevenlabs");
      wavSec = audioDurationSeconds(input.wav) || 0;
    } catch {
      /* ignore */
    }
  }

  let xingSec = 0;
  if (input.mp3 && input.mp3.byteLength > 512) {
    if (!mp3XingMismatch(input.mp3)) {
      xingSec = readXingInfo(input.mp3)?.durationSec || 0;
    }
  }

  const cueEnd = input.cues?.length ? cueSpanEnd(input.cues) : 0;

  // Prefer WAV PCM (true sample count).
  if (wavSec > 1) return wavSec;
  if (stored > 1) return stored;
  // Xing only when consistent with cue span OR no cues yet.
  if (xingSec > 1) {
    if (!(cueEnd > 0.5) || Math.abs(xingSec - cueEnd) <= 8) return xingSec;
    // Xing disagrees badly with cues — distrust; fall through.
  }
  if (cueEnd > 0.5) return cueEnd;
  if (xingSec > 1) return xingSec;
  return 0;
}
