/**
 * MP3 helpers for iOS/Safari playback.
 * Runtime Workers must not depend on ffmpeg. Prefer EL mp3_* at generate time;
 * backfill existing jobs with box ffmpeg + KV put.
 */

export function isMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false;
  // ID3 or MPEG frame sync
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  if (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return true;
  return false;
}
