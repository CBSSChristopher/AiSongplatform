/**
 * Optional live smoke test for ElevenLabs Music.
 * Skips cleanly when ELEVENLABS_API_KEY is unset (do not invent a key).
 */
import { buildCompositionPlan, distributeCues, renderWithElevenLabs } from "../lib/music-elevenlabs";
import type { SongJob } from "../lib/types";

const job: SongJob = {
  id: "elevenlabs-music-test",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: "preview",
  recipientName: "Maya",
  namePronunciation: "",
  relationship: "daughter",
  email: "a@b.c",
  marketingOptIn: false,
  genre: "acoustic",
  voice: "female",
  qualities: "",
  memories: "",
  occasion: "just-because",
  senderName: "Dad",
  message: "",
    songTitle: "",
  lyrics:
    "Verse 1\nYellow backpack by the door\nYou walked out brave\n\nChorus\nThis is a song I made for Maya\nPlay it when you need me",
  lyricCues: [],
  includeLyricPrint: false,
  previewReady: false,
  fullReady: false,
  paidAt: null,
  whopPaymentId: null,
  checkoutSessionId: null,
  listenCompletedAt: null,
};

async function main() {
  const plan = buildCompositionPlan(job, 45);
  const totalMs = plan.chunks.reduce((sum, c) => sum + c.duration_ms, 0);
  if (!plan.chunks.length) throw new Error("expected composition chunks");
  if (totalMs < 3000 || totalMs > 600000) throw new Error(`bad total duration ${totalMs}`);
  if (!plan.chunks[0].positive_styles.some((s) => /female|acoustic|folk/i.test(s))) {
    throw new Error("styles should reflect genre/voice");
  }
  const distributed = distributeCues(job.lyrics, 45);
  if (distributed.length < 2) throw new Error("distributeCues should emit lines");

  if (!process.env.ELEVENLABS_API_KEY) {
    console.log("skip_live_elevenlabs (no ELEVENLABS_API_KEY)");
    console.log("plan_ok", plan.chunks.length, "total_ms", totalMs, "cues", distributed.length);
    return;
  }

  const { wav, cues } = await renderWithElevenLabs(job, 45);
  if (wav.length < 1000) throw new Error("audio too small");
  if (String.fromCharCode(wav[0], wav[1], wav[2], wav[3]) !== "RIFF") {
    throw new Error("expected WAV");
  }
  if (!cues.length) throw new Error("expected cues");
  console.log("elevenlabs_music_ok", wav.length, cues.length, plan.chunks.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
