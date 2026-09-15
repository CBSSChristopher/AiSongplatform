/**
 * Unit checks for detectPcmChannels — too-fast (mono→stereo) and too-slow (stereo→mono).
 * No network. Run: npx tsx scripts/test-pcm-channels.ts
 */
import { detectPcmChannels } from "../lib/music-elevenlabs";

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

function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function main() {
  const expected = 1.0;

  // Too-fast case: ~2s mono bytes with plan E=1s (stereoSec≈E, monoSec≈2E).
  // Labeling stereo would play 2×; detector must choose MONO.
  const monoDouble = pcmMonoSine(2.0);
  const monoSec = monoDouble.length / 2 / RATE;
  const stereoSec = monoDouble.length / 4 / RATE;
  assert(Math.abs(monoSec - 2) < 0.01, `monoSec ${monoSec}`);
  assert(Math.abs(stereoSec - 1) < 0.01, `stereoSec ${stereoSec}`);
  assert(
    detectPcmChannels(monoDouble, RATE, expected) === 1,
    "too-fast: 2× mono bytes must be labeled mono",
  );
  assert(
    detectPcmChannels(monoDouble, RATE, expected, { apiDurationSec: 2.0 }) === 1,
    "apiDuration 2s → mono",
  );

  // Too-slow case: 1s true stereo (same byte length as 2s mono!).
  // Labeling mono would play ½ speed; detector must choose STEREO.
  const stereo = pcmStereoSines(1.0);
  assert(stereo.length === monoDouble.length, "byte lengths equal for inverse cases");
  assert(
    detectPcmChannels(stereo, RATE, expected) === 2,
    "too-slow inverse: true stereo bytes must be labeled stereo",
  );
  assert(
    detectPcmChannels(stereo, RATE, expected, { apiDurationSec: 1.0 }) === 2,
    "apiDuration 1s → stereo",
  );

  // Clear mono matching plan (45s-style): monoSec≈E, stereoSec≈E/2.
  const monoExact = pcmMonoSine(1.0);
  assert(detectPcmChannels(monoExact, RATE, expected) === 1, "exact mono duration → mono");

  // Format hints win.
  assert(detectPcmChannels(stereo, RATE, expected, { channels: 1 }) === 1, "channels hint 1");
  assert(detectPcmChannels(monoExact, RATE, expected, { outputFormat: "pcm_44100_stereo" }) === 2, "stereo format hint");
  assert(detectPcmChannels(stereo, RATE, expected, { contentType: "audio/pcm; channels=mono" }) === 1, "mono content-type");

  // Observed-wrong-duration style: pass E=monoSec when bytes are stereo → stereoSec≈2E path.
  // stereo 1s bytes: monoSec=2, stereoSec=1. Pass E=1 already covered. Pass E=0.5:
  // monoSec=2 ≈? 0.5 no; stereoSec=1 ≈ 2*0.5 → near(stereo, 2E) && near(mono, E)? mono≈0.5? no.
  // Construct: want monoSec≈E and stereoSec≈2E — impossible with consistent formulas.
  // Instead verify legacy half-speed protection via deco on stereo with E matching stereoSec.
  assert(detectPcmChannels(stereo, RATE, 1.0) === 2, "stereo @ matching E");

  console.log("pcm_channel_detect_ok");
}

main();
