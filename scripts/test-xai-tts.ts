/**
 * Smoke test for xAI Grok TTS vocals.
 * Skips the live API call when XAI_API_KEY is unset (do not invent a key).
 */
import {
  buildTtsRequest,
  cuesFromGraphTimestamps,
  distributeCues,
  mapVoiceId,
  renderWithXai,
  wrapSingingText,
} from "../lib/music-xai";
import type { SongJob } from "../lib/types";

const job: SongJob = {
  id: "xai-tts-test",
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
  listenCompletedAt: null,
  fullReady: false,
  paidAt: null,
  whopPaymentId: null,
  checkoutSessionId: null,
};

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

async function main() {
  assert(mapVoiceId("female") === "eve", "female → eve");
  assert(mapVoiceId("male") === "rex", "male → rex");
  assert(mapVoiceId("any") === "eve", "any → eve");

  const request = buildTtsRequest(job, 45);
  assert(request.voice_id === "eve", "preview voice");
  assert(request.language === "en", "language en");
  assert(request.with_timestamps === true, "with_timestamps");
  assert(request.output_format.codec === "wav", "wav codec");
  assert(request.output_format.sample_rate === 44100, "44.1k");
  assert(request.text.includes("<singing>"), "wrap <singing>");
  assert(request.text.includes("Yellow backpack"), "verse lyrics in text");
  assert(request.text.includes("Maya"), "chorus lyrics in text");
  assert(!request.text.includes("ELEVENLABS"), "no elevenlabs");

  const wrapped = wrapSingingText([
    { text: "Hello world", section: "verse" },
    { text: "Keep this", section: "chorus" },
  ]);
  assert(wrapped.includes("<singing>Hello world</singing>"), "verse wrap");
  assert(wrapped.includes("<singing>Keep this</singing>"), "chorus wrap");

  const lyrics = "Verse 1\nHello world\n\nChorus\nKeep this";
  const inner = "Hello world\nKeep this";
  const tagged = `<singing>${inner}</singing>`;
  const graphChars = [...tagged];
  const graphTimes = graphChars.map((_, i) => [i * 0.1, i * 0.1 + 0.08]);
  const fromGraph = cuesFromGraphTimestamps(lyrics, graphChars, graphTimes);
  assert(fromGraph && fromGraph.length >= 2, "graph cues");
  assert(fromGraph[0].text === "Hello world", "first line");
  assert(fromGraph[0].words?.length === 2, "hello/world words");
  assert(fromGraph[0].words![0].end > fromGraph[0].words![0].start, "word timing");
  assert(fromGraph[1].text.includes("Keep"), "second line");

  const distributed = distributeCues(job.lyrics, 45);
  assert(distributed.length >= 2, "distributeCues should emit lines");

  if (!process.env.XAI_API_KEY) {
    console.log("skip_live_xai_tts (no XAI_API_KEY)");
    console.log("request_ok", request.voice_id, request.text.slice(0, 80), "cues", distributed.length);
    return;
  }

  const { wav, cues } = await renderWithXai(job, 45);
  if (wav.length < 1000) throw new Error("audio too small");
  if (String.fromCharCode(wav[0], wav[1], wav[2], wav[3]) !== "RIFF") {
    throw new Error("expected WAV");
  }
  if (!cues.length) throw new Error("expected cues");
  console.log("xai_tts_ok", wav.length, cues.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
