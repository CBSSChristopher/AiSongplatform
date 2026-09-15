/**
 * MP3 helpers for iOS/Safari playback + paid-full integrity.
 * Runtime Workers must not depend on ffmpeg. Prefer EL mp3_* at generate time;
 * backfill existing jobs with box ffmpeg + KV put when EL ships non-seekable or truncated.
 */

export function isMp3(bytes: Uint8Array): boolean {
  if (bytes.length < 3) return false;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  if (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return true;
  return false;
}

function skipId3(bytes: Uint8Array): number {
  if (bytes.byteLength >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size =
      ((bytes[6]! & 0x7f) << 21) |
      ((bytes[7]! & 0x7f) << 14) |
      ((bytes[8]! & 0x7f) << 7) |
      (bytes[9]! & 0x7f);
    return 10 + size;
  }
  return 0;
}

function findMpegFrame(bytes: Uint8Array, from = 0): number {
  for (let i = from; i + 4 < bytes.byteLength; i += 1) {
    if (bytes[i] === 0xff && (bytes[i + 1]! & 0xe0) === 0xe0) return i;
  }
  return -1;
}

export type XingInfo = {
  frameOffset: number;
  xingOffset: number;
  sampleRate: number;
  samplesPerFrame: number;
  flags: number;
  frames: number | null;
  bytes: number | null;
  durationSec: number | null;
};

/** Locate Xing/Info header + declared frames/bytes when present. */
export function readXingInfo(bytes: Uint8Array): XingInfo | null {
  const start = skipId3(bytes);
  const frame = findMpegFrame(bytes, start);
  if (frame < 0) return null;

  const versionBits = (bytes[frame + 1]! >> 3) & 0x03;
  const layerBits = (bytes[frame + 1]! >> 1) & 0x03;
  if (layerBits !== 1) return null;

  const srTable = [
    [11025, 12000, 8000],
    [0, 0, 0],
    [22050, 24000, 16000],
    [44100, 48000, 32000],
  ];
  const srIndex = (bytes[frame + 2]! >> 2) & 0x03;
  const sampleRate = srTable[versionBits]?.[srIndex] || 0;
  if (!sampleRate) return null;

  const samplesPerFrame = versionBits === 3 ? 1152 : 576;
  const channelMode = (bytes[frame + 3]! >> 6) & 0x03;
  const mono = channelMode === 3;
  const side = versionBits === 3 ? (mono ? 17 : 32) : mono ? 9 : 17;
  const xingAt = frame + 4 + side;
  if (xingAt + 12 >= bytes.byteLength) return null;
  const tag = String.fromCharCode(
    bytes[xingAt]!,
    bytes[xingAt + 1]!,
    bytes[xingAt + 2]!,
    bytes[xingAt + 3]!,
  );
  if (tag !== "Xing" && tag !== "Info") return null;

  const flags =
    (bytes[xingAt + 4]! << 24) |
    (bytes[xingAt + 5]! << 16) |
    (bytes[xingAt + 6]! << 8) |
    bytes[xingAt + 7]!;
  let cursor = xingAt + 8;
  let frames: number | null = null;
  let byteCount: number | null = null;
  if (flags & 0x0001) {
    if (cursor + 4 > bytes.byteLength) return null;
    frames =
      (bytes[cursor]! << 24) |
      (bytes[cursor + 1]! << 16) |
      (bytes[cursor + 2]! << 8) |
      bytes[cursor + 3]!;
    cursor += 4;
  }
  if (flags & 0x0002) {
    if (cursor + 4 > bytes.byteLength) return null;
    byteCount =
      (bytes[cursor]! << 24) |
      (bytes[cursor + 1]! << 16) |
      (bytes[cursor + 2]! << 8) |
      bytes[cursor + 3]!;
  }

  const durationSec =
    frames && sampleRate ? (frames * samplesPerFrame) / sampleRate : null;

  return {
    frameOffset: frame,
    xingOffset: xingAt,
    sampleRate,
    samplesPerFrame,
    flags,
    frames,
    bytes: byteCount,
    durationSec,
  };
}

/**
 * True when Xing claims a longer file/duration than the actual bitstream
 * (classic silent-halfway: truncated preview body + full-length Xing).
 */
export function mp3XingMismatch(bytes: Uint8Array): boolean {
  const info = readXingInfo(bytes);
  if (!info) return false;
  if (info.bytes != null && info.bytes > bytes.byteLength * 1.02) return true;
  if (info.durationSec != null && info.durationSec > 1) {
    // CBR-ish estimate; 128–192kbps gift encodes.
    const estHigh = (bytes.byteLength * 8) / 96_000; // permissive upper
    if (info.durationSec > estHigh * 1.25) return true;
  }
  return false;
}

/**
 * After byte-truncating an MP3 for unpaid preview, rewrite Xing frames/bytes
 * so iOS scrubber duration matches the truncated body (never leave full-length Xing).
 */
export function rewriteXingForFileSize(bytes: Uint8Array): Uint8Array {
  const info = readXingInfo(bytes);
  if (!info || info.frames == null) return bytes;
  const out = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes);
  // Estimate remaining frames from byte ratio vs declared (when bytes flag present).
  let newFrames = info.frames;
  if (info.bytes && info.bytes > 0) {
    newFrames = Math.max(1, Math.floor(info.frames * (out.byteLength / info.bytes)));
  } else if (info.durationSec && info.durationSec > 0) {
    const estDur = (out.byteLength * 8) / 160_000;
    newFrames = Math.max(
      1,
      Math.floor(info.frames * (estDur / info.durationSec)),
    );
  } else {
    return out;
  }

  let cursor = info.xingOffset + 8;
  if (info.flags & 0x0001) {
    out[cursor] = (newFrames >>> 24) & 0xff;
    out[cursor + 1] = (newFrames >>> 16) & 0xff;
    out[cursor + 2] = (newFrames >>> 8) & 0xff;
    out[cursor + 3] = newFrames & 0xff;
    cursor += 4;
  }
  if (info.flags & 0x0002) {
    const newBytes = out.byteLength;
    out[cursor] = (newBytes >>> 24) & 0xff;
    out[cursor + 1] = (newBytes >>> 16) & 0xff;
    out[cursor + 2] = (newBytes >>> 8) & 0xff;
    out[cursor + 3] = newBytes & 0xff;
  }
  return out;
}

/** PCM WAV duration (16-bit) from header; 0 if unreadable. */
export function wavDurationSeconds(bytes: Uint8Array): number {
  if (!bytes || bytes.byteLength < 44) return 0;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) {
    return 0;
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataSize = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = String.fromCharCode(
      bytes[offset]!,
      bytes[offset + 1]!,
      bytes[offset + 2]!,
      bytes[offset + 3]!,
    );
    const size = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    if (id === "fmt " && size >= 16) {
      channels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
    } else if (id === "data") {
      dataSize = size;
      break;
    }
    offset = chunkStart + size + (size % 2);
  }
  if (!sampleRate || !channels || !bitsPerSample || !dataSize) return 0;
  const bytesPerSec = sampleRate * channels * (bitsPerSample / 8);
  return bytesPerSec > 0 ? dataSize / bytesPerSec : 0;
}

/**
 * Paid-full gate: WAV must be clearly longer than free preview.
 * MP3 must not carry lying Xing / preview-length body when WAV is full-length.
 */
export function assertPaidFullAudio(wav: Uint8Array, mp3: Uint8Array | null | undefined, previewMaxSec: number) {
  const wavSec = wavDurationSeconds(wav);
  if (!(wavSec > previewMaxSec + 8)) {
    throw new Error(
      `Refusing paid full publish: WAV is ${wavSec.toFixed(1)}s (preview-length). Expected >${previewMaxSec + 8}s master.`,
    );
  }
  if (!mp3 || mp3.byteLength < 512) {
    return { wavSec, mp3Ok: false as const, reason: "missing_mp3" as const };
  }
  if (mp3XingMismatch(mp3)) {
    return { wavSec, mp3Ok: false as const, reason: "xing_mismatch" as const };
  }
  const info = readXingInfo(mp3);
  const mp3Sec =
    info?.durationSec ??
    // crude fallback
    (mp3.byteLength * 8) / 160_000;
  if (mp3Sec < previewMaxSec + 5 && wavSec > previewMaxSec + 8) {
    return { wavSec, mp3Ok: false as const, reason: "mp3_preview_length" as const };
  }
  if (wavSec > 1 && mp3Sec > 1 && Math.abs(wavSec - mp3Sec) > Math.max(12, wavSec * 0.25)) {
    return { wavSec, mp3Ok: false as const, reason: "duration_mismatch" as const };
  }
  return { wavSec, mp3Ok: true as const, reason: "ok" as const };
}
