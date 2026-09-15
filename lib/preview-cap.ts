/** Free preview hard cap — matches site “45-second preview” copy. */
export const PREVIEW_MAX_SECONDS = 45;

/**
 * Truncate a PCM WAV (16-bit) buffer to maxSeconds. Returns original if already short
 * or if the buffer is not a recognizable WAV.
 */
export function truncateWavToSeconds(bytes: Uint8Array, maxSeconds = PREVIEW_MAX_SECONDS): Uint8Array {
  if (!bytes || bytes.byteLength < 44 || maxSeconds <= 0) return bytes;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // RIFF....WAVE
  if (view.getUint32(0, false) !== 0x52494646 || view.getUint32(8, false) !== 0x57415645) {
    return bytes;
  }

  let offset = 12;
  let sampleRate = 0;
  let channels = 0;
  let bitsPerSample = 0;
  let dataOffset = -1;
  let dataSize = 0;

  while (offset + 8 <= bytes.byteLength) {
    const id =
      String.fromCharCode(bytes[offset], bytes[offset + 1], bytes[offset + 2], bytes[offset + 3]);
    const size = view.getUint32(offset + 4, true);
    const chunkStart = offset + 8;
    if (id === "fmt " && size >= 16) {
      channels = view.getUint16(chunkStart + 2, true);
      sampleRate = view.getUint32(chunkStart + 4, true);
      bitsPerSample = view.getUint16(chunkStart + 14, true);
    } else if (id === "data") {
      dataOffset = chunkStart;
      dataSize = size;
      break;
    }
    offset = chunkStart + size + (size % 2);
  }

  if (
    dataOffset < 0 ||
    !sampleRate ||
    !channels ||
    !bitsPerSample ||
    bitsPerSample !== 16
  ) {
    return bytes;
  }

  const bytesPerSec = sampleRate * channels * (bitsPerSample / 8);
  const maxData = Math.floor(bytesPerSec * maxSeconds);
  if (dataSize <= maxData) return bytes;

  const outData = maxData - (maxData % (channels * (bitsPerSample / 8)));
  const out = new Uint8Array(dataOffset + outData);
  out.set(bytes.subarray(0, dataOffset));
  out.set(bytes.subarray(dataOffset, dataOffset + outData), dataOffset);
  const outView = new DataView(out.buffer);
  outView.setUint32(4, out.byteLength - 8, true); // RIFF size
  outView.setUint32(dataOffset - 4, outData, true); // data chunk size
  return out;
}

function skipId3(bytes: Uint8Array): number {
  if (bytes.byteLength >= 10 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    return 10 + size;
  }
  return 0;
}

function findMpegFrame(bytes: Uint8Array, from = 0): number {
  for (let i = from; i + 4 < bytes.byteLength; i += 1) {
    if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) return i;
  }
  return -1;
}

/** Read duration from Xing/Info frame count when present. */
export function readMp3DurationSeconds(bytes: Uint8Array): number | null {
  const start = skipId3(bytes);
  const frame = findMpegFrame(bytes, start);
  if (frame < 0) return null;

  const versionBits = (bytes[frame + 1] >> 3) & 0x03; // 3=v1, 2=v2, 0=v2.5
  const layerBits = (bytes[frame + 1] >> 1) & 0x03; // 1=layer3
  if (layerBits !== 1) return null;

  const srTable = [
    [11025, 12000, 8000], // v2.5
    [0, 0, 0],
    [22050, 24000, 16000], // v2
    [44100, 48000, 32000], // v1
  ];
  const srIndex = (bytes[frame + 2] >> 2) & 0x03;
  const sampleRate = srTable[versionBits]?.[srIndex] || 0;
  if (!sampleRate) return null;

  const samplesPerFrame = versionBits === 3 ? 1152 : 576;
  // Side info size then Xing
  const channelMode = (bytes[frame + 3] >> 6) & 0x03;
  const mono = channelMode === 3;
  const side =
    versionBits === 3 ? (mono ? 17 : 32) : mono ? 9 : 17;
  const xingAt = frame + 4 + side;
  if (xingAt + 12 >= bytes.byteLength) return null;
  const tag = String.fromCharCode(
    bytes[xingAt],
    bytes[xingAt + 1],
    bytes[xingAt + 2],
    bytes[xingAt + 3],
  );
  if (tag !== "Xing" && tag !== "Info") return null;
  const flags =
    (bytes[xingAt + 4] << 24) |
    (bytes[xingAt + 5] << 16) |
    (bytes[xingAt + 6] << 8) |
    bytes[xingAt + 7];
  if ((flags & 0x0001) === 0) return null; // frames flag
  const frames =
    (bytes[xingAt + 8] << 24) |
    (bytes[xingAt + 9] << 16) |
    (bytes[xingAt + 10] << 8) |
    bytes[xingAt + 11];
  if (!frames) return null;
  return (frames * samplesPerFrame) / sampleRate;
}

/**
 * Truncate MP3 for unpaid preview. Prefer duration-proportional cut (VBR-safe)
 * using Xing/Info when present; else assume ~180kbps average gift bitrate.
 */
export function truncateMp3ToSeconds(bytes: Uint8Array, maxSeconds = PREVIEW_MAX_SECONDS): Uint8Array {
  if (!bytes || bytes.byteLength < 4 || maxSeconds <= 0) return bytes;

  const duration = readMp3DurationSeconds(bytes);
  let cut: Uint8Array | null = null;
  if (duration && duration > maxSeconds + 0.5) {
    const keep = Math.floor(bytes.byteLength * (maxSeconds / duration));
    cut = bytes.subarray(0, Math.max(keep, 4096));
  } else if (duration && duration <= maxSeconds + 0.5) {
    return bytes;
  } else {
    // Fallback when Xing is missing: ~180kbps average (matches current gift encodes).
    const maxBytes = Math.floor((180_000 * maxSeconds) / 8) + 65_536;
    if (bytes.byteLength <= maxBytes) return bytes;
    cut = bytes.subarray(0, maxBytes);
  }
  // CRITICAL: never leave full-length Xing on a truncated preview body (iOS silent-halfway).
  return rewriteXingForTruncatedPreview(cut, duration, maxSeconds);
}

/** Patch Xing frames/bytes after a byte cut so scrubber duration matches the body. */
function rewriteXingForTruncatedPreview(
  bytes: Uint8Array,
  originalDuration: number | null,
  maxSeconds: number,
): Uint8Array {
  // Inline Xing patch (avoid circular imports with mp3.ts duration readers).
  const start = skipId3(bytes);
  const frame = findMpegFrame(bytes, start);
  if (frame < 0) return bytes;
  const versionBits = (bytes[frame + 1]! >> 3) & 0x03;
  const layerBits = (bytes[frame + 1]! >> 1) & 0x03;
  if (layerBits !== 1) return bytes;
  const channelMode = (bytes[frame + 3]! >> 6) & 0x03;
  const mono = channelMode === 3;
  const side = versionBits === 3 ? (mono ? 17 : 32) : mono ? 9 : 17;
  const xingAt = frame + 4 + side;
  if (xingAt + 12 >= bytes.byteLength) return bytes;
  const tag = String.fromCharCode(bytes[xingAt]!, bytes[xingAt + 1]!, bytes[xingAt + 2]!, bytes[xingAt + 3]!);
  if (tag !== "Xing" && tag !== "Info") return bytes;
  const flags =
    (bytes[xingAt + 4]! << 24) |
    (bytes[xingAt + 5]! << 16) |
    (bytes[xingAt + 6]! << 8) |
    bytes[xingAt + 7]!;
  const out = new Uint8Array(bytes);
  const ratio =
    originalDuration && originalDuration > 0
      ? Math.min(1, maxSeconds / originalDuration)
      : bytes.byteLength / Math.max(bytes.byteLength, 1);
  let cursor = xingAt + 8;
  if (flags & 0x0001) {
    const oldFrames =
      (out[cursor]! << 24) | (out[cursor + 1]! << 16) | (out[cursor + 2]! << 8) | out[cursor + 3]!;
    const newFrames = Math.max(1, Math.floor(oldFrames * ratio));
    out[cursor] = (newFrames >>> 24) & 0xff;
    out[cursor + 1] = (newFrames >>> 16) & 0xff;
    out[cursor + 2] = (newFrames >>> 8) & 0xff;
    out[cursor + 3] = newFrames & 0xff;
    cursor += 4;
  }
  if (flags & 0x0002) {
    const newBytes = out.byteLength;
    out[cursor] = (newBytes >>> 24) & 0xff;
    out[cursor + 1] = (newBytes >>> 16) & 0xff;
    out[cursor + 2] = (newBytes >>> 8) & 0xff;
    out[cursor + 3] = newBytes & 0xff;
  }
  return out;
}

export function capPreviewBytes(
  bytes: Uint8Array,
  contentType: string,
  maxSeconds = PREVIEW_MAX_SECONDS,
): Uint8Array {
  if (contentType.includes("wav")) return truncateWavToSeconds(bytes, maxSeconds);
  if (contentType.includes("mpeg") || contentType.includes("mp3")) {
    return truncateMp3ToSeconds(bytes, maxSeconds);
  }
  return bytes;
}
