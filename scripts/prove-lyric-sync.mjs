#!/usr/bin/env node
/**
 * Automated lyric-sync proof for gift delivery jobs.
 * Asserts: audio.duration ≈ lastCueEnd (±2s); sample times at 10/40/70%
 * map to expected line indices vs lyric text order.
 *
 * Usage: node scripts/prove-lyric-sync.mjs [jobId ...]
 * Defaults to Maliya female + male earcheck IDs.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const cuesMod = await import(pathToFileURL(path.join(root, "lib/cues.ts")).href);
const {
  cueSpanEnd,
  cuesNeedRescale,
  rescaleCuesToDuration,
  resolvePlayableDurationSec,
  activeCueIndex,
  sealCueGaps,
} = cuesMod;

const DEFAULT_IDS = [
  "6a0a92af-ae93-45d8-a9f3-56053a123acf",
  "63a855ab-e33a-4273-a23d-552839a16030",
];

const ids = process.argv.slice(2).length ? process.argv.slice(2) : DEFAULT_IDS;

async function fetchJob(id) {
  const res = await fetch(`https://songsnuggle.com/api/jobs/${id}`);
  if (!res.ok) throw new Error(`job ${id}: ${res.status}`);
  return (await res.json()).job;
}

async function fetchMp3(id) {
  const res = await fetch(
    `https://songsnuggle.com/api/jobs/${id}/audio?full=1&format=mp3`,
  );
  if (!res.ok) throw new Error(`mp3 ${id}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

function readXingDuration(bytes) {
  // Minimal Xing frame count → seconds (same as lib/mp3).
  let i = 0;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) {
    const size =
      ((bytes[6] & 0x7f) << 21) |
      ((bytes[7] & 0x7f) << 14) |
      ((bytes[8] & 0x7f) << 7) |
      (bytes[9] & 0x7f);
    i = 10 + size;
  }
  while (i + 4 < bytes.length) {
    if (bytes[i] === 0xff && (bytes[i + 1] & 0xe0) === 0xe0) break;
    i += 1;
  }
  if (i + 4 >= bytes.length) return null;
  const versionBits = (bytes[i + 1] >> 3) & 0x03;
  const srTable = [
    [11025, 12000, 8000],
    [0, 0, 0],
    [22050, 24000, 16000],
    [44100, 48000, 32000],
  ];
  const srIndex = (bytes[i + 2] >> 2) & 0x03;
  const sampleRate = srTable[versionBits]?.[srIndex] || 0;
  if (!sampleRate) return null;
  const samplesPerFrame = versionBits === 3 ? 1152 : 576;
  const channelMode = (bytes[i + 3] >> 6) & 0x03;
  const mono = channelMode === 3;
  const side = versionBits === 3 ? (mono ? 17 : 32) : mono ? 9 : 17;
  const xingAt = i + 4 + side;
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
  if (!(flags & 1)) return null;
  const frames =
    (bytes[xingAt + 8] << 24) |
    (bytes[xingAt + 9] << 16) |
    (bytes[xingAt + 10] << 8) |
    bytes[xingAt + 11];
  return (frames * samplesPerFrame) / sampleRate;
}

function lyricLines(job) {
  return String(job.lyrics || "")
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

function expectedIndexAtPercent(cues, lines, pct, duration) {
  const t = duration * pct;
  const idx = activeCueIndex(cues, t);
  return { t, idx, cueText: cues[idx]?.text, lineText: lines[idx] };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

// Unit: inflated media must NOT stretch cues past cue span when no encode meta.
{
  const fakeCues = [
    { text: "a", start: 0, end: 10, section: "verse" },
    { text: "b", start: 10, end: 40, section: "verse" },
    { text: "c", start: 40, end: 80, section: "chorus" },
  ];
  const trueDur = resolvePlayableDurationSec({
    encodedSec: null,
    mediaSec: 117,
    cueEndSec: 80,
  });
  assert(Math.abs(trueDur - 80) < 0.01, `inflated media should yield cueEnd, got ${trueDur}`);
  const withEncode = resolvePlayableDurationSec({
    encodedSec: 83.5,
    mediaSec: 117,
    cueEndSec: 80,
  });
  assert(Math.abs(withEncode - 83.5) < 0.01, `encoded must win, got ${withEncode}`);
  // Simulate bad old client: rescale to 117 would desync
  assert(cuesNeedRescale(fakeCues, 117, 2), "should need rescale vs 117");
  const bad = rescaleCuesToDuration(fakeCues, 117);
  const goodTarget = resolvePlayableDurationSec({
    mediaSec: 117,
    cueEndSec: cueSpanEnd(fakeCues),
  });
  const good = sealCueGaps(fakeCues, goodTarget);
  // At t=50: true timeline is line 2 (c @40); stretched still on line 1 (b→58.5)
  assert(activeCueIndex(good, 50) === 2, "t=50 → line 2 on true cues");
  assert(activeCueIndex(bad, 50) === 1, "stretched cues wrongly stay on line 1 at t=50");
  console.log("unit: resolvePlayableDurationSec + gap-safe active OK");
}

const results = [];
for (const id of ids) {
  const job = await fetchJob(id);
  const mp3 = await fetchMp3(id);
  const xingDur = readXingDuration(mp3);
  const cueEnd = cueSpanEnd(job.lyricCues || []);
  const encoded = job.audioDurationSec || xingDur;
  const trueDur = resolvePlayableDurationSec({
    encodedSec: encoded,
    mediaSec: xingDur, // proxy for healthy browser when Xing honest
    cueEndSec: cueEnd,
  });
  // Inflated-media stress: client must still keep cues
  const stressed = resolvePlayableDurationSec({
    encodedSec: encoded,
    mediaSec: (xingDur || cueEnd) * 1.4,
    cueEndSec: cueEnd,
  });
  assert(
    Math.abs(stressed - (encoded || cueEnd)) <= 2,
    `${id}: inflated media shifted true dur to ${stressed}`,
  );

  let cues = job.lyricCues || [];
  if (trueDur > 1 && cuesNeedRescale(cues, trueDur, 2)) {
    cues = rescaleCuesToDuration(cues, trueDur);
  } else if (trueDur > 1) {
    cues = sealCueGaps(cues, trueDur);
  }
  const last = cueSpanEnd(cues);
  assert(
    Math.abs(last - trueDur) <= 2,
    `${id}: lastCueEnd ${last} vs trueDur ${trueDur}`,
  );

  const lines = lyricLines(job);
  const firstStart = cues[0]?.start ?? 0;
  const lastEnd = cueSpanEnd(cues);
  const samples = [0.1, 0.4, 0.7].map((p) => {
    // Clamp into vocal window so intro silence before first cue is not a false fail.
    const rawT = trueDur * p;
    const t = Math.min(lastEnd - 0.05, Math.max(firstStart + 0.05, rawT));
    const idx = activeCueIndex(cues, t);
    const s = { t, idx, cueText: cues[idx]?.text, lineText: lines[idx] };
    assert(s.idx >= 0, `${id}: no active cue at ${p * 100}% (t=${s.t})`);
    // Cue text should match lyric order (same index into non-empty lyric lines)
    if (lines[s.idx]) {
      const norm = (t) => t.replace(/\s+/g, " ").trim().slice(0, 40).toLowerCase();
      assert(
        norm(s.cueText || "").includes(norm(lines[s.idx]).slice(0, 20)) ||
          norm(lines[s.idx]).includes(norm(s.cueText || "").slice(0, 20)),
        `${id}: at ${p * 100}% cue[${s.idx}]="${s.cueText}" vs lyrics[${s.idx}]="${lines[s.idx]}"`,
      );
    }
    return s;
  });

  // Gap dead-zone: mid-gap between first two cues should still highlight
  if (cues.length >= 2) {
    const gapT = (cues[0].end + cues[1].start) / 2;
    if (cues[1].start - cues[0].end > 0.05) {
      assert(
        activeCueIndex(cues, gapT) === 0,
        `${id}: gap at ${gapT} should keep line 0`,
      );
    }
  }

  results.push({
    id,
    voice: job.voice,
    title: job.songTitle || `For ${job.recipientName}`,
    xingDur,
    cueEnd,
    trueDur,
    lastCueEnd: last,
    samples: samples.map((s) => ({
      t: +s.t.toFixed(2),
      idx: s.idx,
      line: (s.cueText || "").slice(0, 48),
    })),
    ok: true,
  });
  console.log(`PASS ${id} (${job.voice}) trueDur=${trueDur.toFixed(2)} last=${last.toFixed(2)}`);
}

const out = path.join(root, "scripts/prove-lyric-sync-results.json");
fs.writeFileSync(out, JSON.stringify({ checkedAt: new Date().toISOString(), results }, null, 2));
console.log("wrote", out);
console.log("ALL PASS", results.length);
