/**
 * Unit checks for detectPcmChannels + toWavBuffer permanent stereo path.
 * Covers too-fast (mono force-label), half-speed (0914 stereo-as-mono), upconvert, assert.
 * No network. Run: npx tsx scripts/test-pcm-channels.ts
 */
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";
import {
  detectPcmChannels,
  toWavBuffer,
  monoPcmToStereoPcm,
  assertDuration,
} from "../lib/music-elevenlabs";

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

function pcmStereoSines(seconds: number, centered = false): Buffer {
  const frames = Math.floor(RATE * seconds);
  const buf = Buffer.alloc(frames * 4);
  for (let i = 0; i < frames; i += 1) {
    const L = Math.round(0.2 * 32767 * Math.sin((2 * Math.PI * 440 * i) / RATE));
    const R = centered
      ? Math.round(L * 0.97 + 0.03 * 0.2 * 32767 * Math.sin((2 * Math.PI * 660 * i) / RATE))
      : Math.round(0.2 * 32767 * Math.sin((2 * Math.PI * 660 * i) / RATE + 0.4));
    buf.writeInt16LE(L, i * 4);
    buf.writeInt16LE(R, i * 4 + 2);
  }
  return buf;
}

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

  // --- True mono → detect 1, upconvert stereo, duration=monoSec, ALWAYS ch=2
  const monoExact = pcmMonoSine(1.0);
  assert(detectPcmChannels(monoExact, RATE, expected) === 1, "exact mono → detect 1");
  const wavMono = toWavBuffer(monoExact, expected);
  assert(readWavHeaderChannels(wavMono) === 2, "true mono emits ch=2 (upconverted)");
  assert(Math.abs(readWavDuration(wavMono) - 1) < 0.02, "upconverted mono duration=monoSec");
  // Duplication proof: stereo PCM length = 2× mono samples
  const dup = monoPcmToStereoPcm(monoExact);
  assert(dup.length === monoExact.length * 2, "monoPcmToStereoPcm doubles bytes");
  assert(dup.readInt16LE(0) === dup.readInt16LE(2), "L=R first frame");

  // --- True stereo → stereo, duration=stereoSec, ch=2
  const stereo = pcmStereoSines(1.0);
  assert(detectPcmChannels(stereo, RATE, expected) === 2, "true stereo → 2");
  const wavStereo = toWavBuffer(stereo, expected);
  assert(readWavHeaderChannels(wavStereo) === 2, "stereo emits ch=2");
  assert(Math.abs(readWavDuration(wavStereo) - 1) < 0.02, "stereo duration ~1s");

  // --- Centered stereo (high lr, 0914-like) + E=T → must stay stereo @ T (NOT mono header)
  const centered = pcmStereoSines(1.0, true);
  assert(detectPcmChannels(centered, RATE, expected) === 2, "centered stereo → 2 (not high-lr mono)");
  const wavCentered = toWavBuffer(centered, expected);
  assert(readWavHeaderChannels(wavCentered) === 2, "centered → ch=2");
  assert(Math.abs(readWavDuration(wavCentered) - 1) < 0.02, "centered duration ~1s not 2s");

  // --- mono-as-stereo too-fast: ambiguous bytes (monoSec≈2E, stereoSec≈E).
  // Prefer stereoSec≈E → detect 2. Must NOT force-label without understanding:
  // If clear mono (monoSec≈E only), upconvert — never header-flip to ch=1.
  const monoDouble = pcmMonoSine(2.0);
  assert(Math.abs(monoDouble.length / 2 / RATE - 2) < 0.01, "monoSec ~2");
  assert(Math.abs(monoDouble.length / 4 / RATE - 1) < 0.01, "stereoSec ~1");
  // Duration-first: stereoSec≈E → prefer stereo (0914 permanent rule).
  assert(detectPcmChannels(monoDouble, RATE, expected) === 2, "ambiguous stereoSec≈E → prefer stereo");
  // Clear mono with matching E must upconvert, never ship ch=1
  assert(detectPcmChannels(monoDouble, RATE, 2.0) === 1, "monoSec≈E=2 → detect mono");
  const wavUp = toWavBuffer(monoDouble, 2.0);
  assert(readWavHeaderChannels(wavUp) === 2, "clear mono never ships ch=1");
  assert(Math.abs(readWavDuration(wavUp) - 2) < 0.02, "upconvert duration=monoSec=2");

  // --- stereo-as-mono half-speed inverse: true stereo @ 1s must stay stereo
  assert(detectPcmChannels(stereo, RATE, expected, { apiDurationSec: 1.0 }) === 2, "apiDur 1s → stereo");

  // Format hints win.
  assert(detectPcmChannels(stereo, RATE, expected, { channels: 1 }) === 1, "channels hint 1");
  assert(
    detectPcmChannels(monoExact, RATE, expected, { outputFormat: "pcm_44100_stereo" }) === 2,
    "stereo format hint",
  );

  // nearDuration tol: pop-female-like monoSec=80 must NOT falsely match weak targets into mono header.
  const popLike = pcmStereoSines(40);
  assert(detectPcmChannels(popLike, RATE, 40) === 2, "pop-like E=40 → stereo");
  assert(detectPcmChannels(popLike, RATE, 45, { apiDurationSec: 90 }) === 2, "tol: prefer stereoSec≈45");

  // --- Duration assert fail path
  let threw = false;
  try {
    assertDuration(100, 50, 0.05);
  } catch {
    threw = true;
  }
  assert(threw, "assertDuration must throw on 2× mismatch");
  assertDuration(50, 50, 0.05); // ok
  // toWavBuffer: 1s mono with expect=2s → upconvert to 1s stereo, assert fails
  let towavThrew = false;
  try {
    toWavBuffer(monoExact, 2.0);
  } catch {
    towavThrew = true;
  }
  assert(towavThrew, "toWavBuffer assertDuration fail path");

  // --- Real audit fixtures ---
  const rca0914Candidates = [
    auditPath("rca-0914", "preview.wav"),
    auditPath("rca-halfspeed-0914", "preview.wav"),
  ];
  const rca0914Path = rca0914Candidates.find((p) => existsSync(p));
  assert(rca0914Path, `missing 0914 fixture in ${rca0914Candidates.join(" | ")}`);

  const half = pcmFromWav(rca0914Path!);
  // Live bytes were mono-header; strip to PCM — monoSec=100, stereoSec=50
  assert(Math.abs(half.pcm.length / 4 / half.sampleRate - 50) < 0.05, "0914 stereoSec≈50");
  assert(detectPcmChannels(half.pcm, half.sampleRate, 50) === 2, "0914 E=50 → stereo (not deco mono)");
  const halfWav = toWavBuffer(half.pcm, 50);
  assert(readWavHeaderChannels(halfWav) === 2, "0914 encode → ch=2");
  assert(Math.abs(readWavDuration(halfWav) - 50) < 0.5, "0914 encode duration ~50s not 100s");

  const popPath = auditPath("preview-el-pop-female.wav");
  assert(existsSync(popPath), `missing fixture ${popPath}`);
  const pop = pcmFromWav(popPath);
  assert(detectPcmChannels(pop.pcm, pop.sampleRate, 40) === 2, "preview-el-pop-female → stereo");
  const popWav = toWavBuffer(pop.pcm, 40);
  assert(readWavHeaderChannels(popWav) === 2, "pop-female encode stays stereo");
  assert(Math.abs(readWavDuration(popWav) - 40) < 0.5, "pop-female duration ~40s");

  // too-fast fixture: prefer stereoSec≈E=45 → stereo @ 45 (duration-first permanent path).
  // Ban regression is: clear mono must upconvert (tested above), not header-only force-stereo.
  const tooFastPath = auditPath("too-fast-6704", "preview.wav");
  if (existsSync(tooFastPath)) {
    const tooFast = pcmFromWav(tooFastPath);
    assert(detectPcmChannels(tooFast.pcm, tooFast.sampleRate, 45) === 2, "too-fast ambiguous → prefer stereoSec≈E");
  }

  console.log("pcm_channel_detect_ok");
  console.log(
    JSON.stringify({
      permanent_path: "always_stereo_upconvert_assert",
      rca_0914_detect: 2,
      rca_0914_dur: readWavDuration(halfWav),
      rca_0914_ch: readWavHeaderChannels(halfWav),
      pop_female_detect: 2,
      synthetic_centered_stereo: 2,
      synthetic_true_mono_upconvert_ch: 2,
      assert_fail_path: true,
    }),
  );
}

main();
