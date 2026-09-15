/**
 * Einstein PERFECT LOCK v2 regression — BPM in positives; ban race energy; preview ≥60.
 */
import { buildCompositionPlan, bpmTokenForJob, negativeStylesForJob, positiveStylesForJob } from "../lib/music-elevenlabs";
import { previewTargetSeconds } from "../lib/music";
import type { SongJob } from "../lib/types";

function baseJob(over: Partial<SongJob>): SongJob {
  return {
    id: "einstein-pack-v2-test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "preview",
    recipientName: "Ma-lee-ya",
    relationship: "daughter",
    email: "a@b.c",
    marketingOptIn: false,
    genre: "pop",
    voice: "female",
    qualities: "beautiful, smart",
    memories: "waikiki sunset",
    occasion: "birthday",
    senderName: "Fajah",
    message: "happy 19th",
    lyrics: "Verse 1\nHello Maliya\n\nChorus\nHappy birthday",
    lyricCues: [],
    includeLyricPrint: false,
    previewReady: false,
    fullReady: false,
    paidAt: null,
    whopPaymentId: null,
    checkoutSessionId: null,
    listenCompletedAt: null,
    ...over,
  };
}

const BANNED = ["upbeat", "energetic", "lively"];

function assertPack(job: SongJob, expectedBpm: string) {
  const pos = positiveStylesForJob(job);
  const neg = negativeStylesForJob(job);
  const bpm = bpmTokenForJob(job);
  if (bpm !== expectedBpm) throw new Error(`${job.genre}/${job.voice}: bpm ${bpm} != ${expectedBpm}`);
  if (!pos.includes(expectedBpm)) throw new Error(`${job.genre}/${job.voice}: positive missing ${expectedBpm}`);
  if (pos.length < 6) throw new Error(`${job.genre}/${job.voice}: need ≥6 styles, got ${pos.length}`);
  for (const bad of BANNED) {
    if (pos.some((s) => s.toLowerCase() === bad || s.toLowerCase().includes(`${bad} `))) {
      throw new Error(`${job.genre}/${job.voice}: positive contains banned ${bad}`);
    }
  }
  for (const bad of BANNED) {
    if (!neg.includes(bad)) throw new Error(`${job.genre}/${job.voice}: negatives missing ${bad}`);
  }
  for (const must of ["off-beat phrasing", "ahead of the beat", "talk-sung"]) {
    if (!neg.includes(must)) throw new Error(`shared neg missing ${must}`);
  }
  const plan = buildCompositionPlan(job, 70);
  const first = plan.chunks[0]?.positive_styles || [];
  if (!first.includes(expectedBpm)) throw new Error("first chunk must include BPM token");
  if (first.some((s) => BANNED.includes(s))) throw new Error("first chunk has banned energy");
}

function main() {
  assertPack(baseJob({ genre: "pop", voice: "female" }), "88 BPM");
  assertPack(baseJob({ genre: "pop", voice: "male" }), "88 BPM");
  assertPack(baseJob({ genre: "country", voice: "female" }), "86 BPM");
  assertPack(baseJob({ genre: "rnb", voice: "female" }), "84 BPM");

  const short = baseJob({ lyrics: "Verse 1\nHi\n\nChorus\nBye" });
  const shortTarget = previewTargetSeconds(short);
  if (shortTarget < 60) throw new Error(`preview target ${shortTarget} < 60`);
  if (shortTarget < 62 || shortTarget > 75) {
    // heartfelt default is 70
    if (shortTarget !== 70) throw new Error(`expected ~70 heartfelt, got ${shortTarget}`);
  }

  const denseWords = Array.from({ length: 200 }, (_, i) => `word${i}`).join(" ");
  const dense = baseJob({ lyrics: denseWords });
  const denseTarget = previewTargetSeconds(dense);
  if (denseTarget < 80 || denseTarget > 90) throw new Error(`dense target ${denseTarget} not in 80–90`);

  console.log("einstein_pack_v2_ok", {
    popF: bpmTokenForJob(baseJob({ genre: "pop", voice: "female" })),
    popM: bpmTokenForJob(baseJob({ genre: "pop", voice: "male" })),
    countryF: bpmTokenForJob(baseJob({ genre: "country", voice: "female" })),
    rnbF: bpmTokenForJob(baseJob({ genre: "rnb", voice: "female" })),
    shortTarget,
    denseTarget,
  });
}

main();
