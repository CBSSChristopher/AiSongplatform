import { cueSpanEnd, type LyricCue } from "./cues";
import { readXingInfo, mp3XingMismatch } from "./mp3";

/**
 * Authoritative full-master duration for lyric fit.
 * Prefer honest MP3 Xing (what the gift player actually plays) when present;
 * WAV PCM when Xing missing/lying. If WAV is longer than honest Xing by a
 * small silent tail, keep Xing (do not stretch cues into padding).
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
  let xingHonest = false;
  if (input.mp3 && input.mp3.byteLength > 512) {
    if (!mp3XingMismatch(input.mp3)) {
      xingSec = readXingInfo(input.mp3)?.durationSec || 0;
      xingHonest = xingSec > 1;
    }
  }

  const cueEnd = input.cues?.length ? cueSpanEnd(input.cues) : 0;

  // Honest Xing that agrees with (or is shorter than) WAV → gift MP3 truth.
  if (xingHonest) {
    if (!(wavSec > 1) || xingSec <= wavSec + 0.5) {
      // Allow WAV slightly shorter (encode roundtrip); distrust only if Xing >> WAV (lie).
      if (!(wavSec > 1) || xingSec <= wavSec + 2.5) {
        return xingSec;
      }
    }
  }

  if (wavSec > 1) return wavSec;
  if (stored > 1) {
    // Prefer stored when it agrees with cue span / honest xing.
    if (!(cueEnd > 0.5) || Math.abs(stored - cueEnd) <= 8) return stored;
  }
  if (xingHonest) return xingSec;
  if (cueEnd > 0.5) return cueEnd;
  if (stored > 1) return stored;
  return 0;
}
