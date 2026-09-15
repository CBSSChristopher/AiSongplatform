/**
 * Unit checks for detectPcmChannels + toWavBuffer encode path.
 * Covers too-fast (mono→stereo 2×) and half-speed (stereo→mono ½), plus real audit fixtures.
 * No network. Run: npx tsx scripts/test-pcm-channels.ts
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import { detectPcmChannels, toWavBuffer } from "../lib/music-elevenlabs";

const RATE = 44100;

function pcmMonoSine(seconds: number, hz = 440, amp = 0.2): Buffer {
  const samples = Math.floor(RATE * seconds);
  const buf = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const v = Math.round(amp * 32767 * Math.sin((2 * Math.PI * hz * i) / RATE));
    buf.writeInt16LE(v, i * 2);
  }
  return buf;
}

function pcmStereoSines(seconds: number): Buffer {
  const frames = Math.floor(RATE * seconds);
  const buf = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i += 1) {
    const L = Math.round(0.2 * 32767 * Math.sin((2 * Math.PI * 440 * i) / RATE));
    const R = Math.round(0.2 * 32767 * Math.sin((2 * Math.PI * 660 * i) / RATE + 0.4));
    buf.writeInt16LE(L, i * 4);
    buf.writeInt16LE(R, i * 4 + 2);
  }
  return buf;
}

/** Extract PCM data chunk from a WAV (skips header). */
function pcmFromWav(path: string): { pcm: Buffer; channels: number; sampleRate: number; headerDur: number } {
  const buf = readFileSync(path);
  if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`not wav: ${path}`);
  }
  let pos = 12;
  let channels = 1;
  let sampleRate = RATE;
  let bits = 16;
  let pcm: Buffer | null = null;
  while (pos + 8 <= buf.length) {
    const id = buf.toString("ascii", pos, pos + 4);
    const size = buf.readUInt32LE(pos + 4);
    if (id === "fmt ") {
      channels = buf.readUInt16LE(pos + 8 + 2);
      sampleRate = buf.readUInt32LE(pos + 8 + 4);
      bits = buf.readUInt16LE(pos + 8 + 14);
    } else if (id === "data") {
      pcm = buf.subarray(pos + 8, pos + 8 + size);
      break;
    }
    pos += 8 + size + (size % 2);
  }
  if (!pcm) throw new Error(`no data chunk: ${path}`);
  const headerDur = pcm.length / (bits / 8) / channels / sampleRate;
  return { pcm: Buffer.from(pcm), channels, sampleRate, headerDur };
}

function readWavHeaderChannels(wav: Buffer): number {
  return wav.readUInt16LE(22);
}

function readWavDuration(wav: Buffer): number {
  const ch = wav.readUInt16LE(22) || 1;
  const rate = wav.readUInt32LE(24) || RATE;
  const bits = wav.readUInt16LE(34) || 16;
  const dataBytes = wav.readUInt32LE(40);
  return dataBytes / (bits / 8) / ch / rate;
}

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function auditPath(...parts: string[]) {
  // Prefer sibling audit/ from deploy-live, else /workspace/songsnuggle/audit
  const candidates = [
    resolve(__dirname, "../../../audit", ...parts),
    resolve("/workspace/songsnuggle/audit", ...parts),
    resolve(process.cwd(), "../audit", ...parts),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[1];
}

function main() {
  const expected = 1.0;

  // --- Synthetic too-fast: ~2s mono bytes with plan E=1s (stereoSec≈E, monoSec≈2E).
  const monoDouble = pcmMonoSine(2.0);
  assert(Math.abs(monoDouble.length / 2 / RATE - 2) < 0.01, "monoSec ~2");
  assert(Math.abs(monoDouble.length / 4 / RATE - 1) < 0.01, "stereoSec ~1");
  assert(detectPcmChannels(monoDouble, RATE, expected) === 1, "too-fast synthetic → mono");
  assert(detectPcmChannels(monoDouble, RATE, expected, { apiDurationSec: 2.0 }) === 1, "apiDur 2s → mono");
  const wavFast = toWavBuffer(monoDouble, expected);
  assert(readWavHeaderChannels(wavFast) === 1, "toWavBuffer encodes mono for too-fast");
  assert(Math.abs(readWavDuration(wavFast) - 2) < 0.02, "too-fast WAV duration ~2s not 1s");

  // --- Synthetic half-speed inverse: true stereo @ 1s — must stay stereo (label mono → ½ speed).
  const stereo = pcmStereoSines(1.0);
  assert(stereo.length === monoDouble.length, "byte lengths equal for inverse cases");
  assert(detectPcmChannels(stereo, RATE, expected) === 2, "half-speed inverse synthetic → stereo");
  assert(detectPcmChannels(stereo, RATE, expected, { apiDurationSec: 1.0 }) === 2, "apiDur 1s → stereo");
  const wavStereo = toWavBuffer(stereo, expected);
  assert(readWavHeaderChannels(wavStereo) === 2, "toWavBuffer encodes stereo for true stereo");
  assert(Math.abs(readWavDuration(wavStereo) - 1) < 0.02, "stereo WAV duration ~1s not 2s");

  // Clear mono matching plan.
  const monoExact = pcmMonoSine(1.0);
  assert(detectPcmChannels(monoExact, RATE, expected) === 1, "exact mono → mono");

  // Format hints win.
  assert(detectPcmChannels(stereo, RATE, expected, { channels: 1 }) === 1, "channels hint 1");
  assert(
    detectPcmChannels(monoExact, RATE, expected, { outputFormat: "pcm_44100_stereo" }) === 2,
    "stereo format hint",
  );
  assert(
    detectPcmChannels(stereo, RATE, expected, { contentType: "audio/pcm; channels=mono" }) === 1,
    "mono content-type",
  );

  // nearDuration tol tightened: pop-female monoSec=80 must NOT falsely match apiDur=90.
  const popLike = pcmStereoSines(40); // monoSec=80, stereoSec=40
  assert(
    detectPcmChannels(popLike, RATE, 45, { apiDurationSec: 90 }) === 2,
    "tol: monoSec=80 vs apiDur=90 must not force mono (locked pop-female trap)",
  );

  // --- Real audit fixtures ---
  const tooFastPath = auditPath("too-fast-6704", "preview.wav");
  const rcaPath = auditPath("rca-6704", "preview.wav");
  const popPath = auditPath("preview-el-pop-female.wav");
  const halfPath = auditPath("half-speed-after-15", "preview.wav");

  assert(existsSync(tooFastPath), `missing fixture ${tooFastPath}`);
  assert(existsSync(rcaPath), `missing fixture ${rcaPath}`);
  assert(existsSync(popPath), `missing fixture ${popPath}`);

  const tooFast = pcmFromWav(tooFastPath);
  assert(
    detectPcmChannels(tooFast.pcm, tooFast.sampleRate, 45) === 1,
    "too-fast-6704 fixture → mono (1)",
  );
  const tooFastWav = toWavBuffer(tooFast.pcm, 45);
  assert(readWavHeaderChannels(tooFastWav) === 1, "too-fast encode → ch=1");
  assert(readWavDuration(tooFastWav) > 80, "too-fast encode duration ~90s not 45s");

  const rca = pcmFromWav(rcaPath);
  assert(detectPcmChannels(rca.pcm, rca.sampleRate, 45) === 1, "rca-6704 fixture → mono (1)");
  // Byte math proof numbers (logged for RCA).
  const rcaMono = rca.pcm.length / 2 / rca.sampleRate;
  const rcaStereo = rca.pcm.length / 4 / rca.sampleRate;
  assert(Math.abs(rcaMono - 90) < 0.05 && Math.abs(rcaStereo - 45) < 0.05, "rca byte math 90/45");

  const pop = pcmFromWav(popPath);
  assert(detectPcmChannels(pop.pcm, pop.sampleRate, 40) === 2, "preview-el-pop-female → stereo (2)");
  const popWav = toWavBuffer(pop.pcm, 40);
  assert(readWavHeaderChannels(popWav) === 2, "pop-female encode stays stereo");
  assert(Math.abs(readWavDuration(popWav) - 40) < 0.5, "pop-female duration ~40s");

  if (existsSync(halfPath)) {
    const half = pcmFromWav(halfPath);
    // This payload is mono-correlated (lr≈0.85); detect → 1. Half-speed protection is
    // covered by the synthetic true-stereo case above (must stay 2).
    const halfDetect = detectPcmChannels(half.pcm, half.sampleRate, 45);
    assert(halfDetect === 1, `half-speed-after-15 pcm → mono (1), got ${halfDetect}`);
  }

  console.log("pcm_channel_detect_ok");
  console.log(
    JSON.stringify({
      rca_payload: rca.pcm.length,
      rca_monoSec: rcaMono,
      rca_stereoSec: rcaStereo,
      too_fast_detect: 1,
      pop_female_detect: 2,
      synthetic_too_fast: 1,
      synthetic_half_speed_inverse: 2,
    }),
  );
}

main();
