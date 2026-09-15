#!/usr/bin/env npx tsx
/**
 * Country female + male regen — same PASS 5ebce70b gift brief, sung name = clear Malia.
 * EL single-compose only. Does NOT claim product DONE. MC owns ear.
 */
import { writeFileSync, mkdirSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  renderWithElevenLabs,
  looksInstrumentalOnly,
  vocalPresenceFromWav,
  audioDurationSeconds,
  lyricsForCompose,
  sungNameForEnunciation,
  positiveStylesForJob,
} from "../lib/music-elevenlabs";
import { runPreviewAcceptanceGate } from "../lib/preview-acceptance-gate";
import { cuesLookEqualSliced } from "../lib/cues";
import type { SongJob } from "../lib/types";

const BASE = process.env.SONGSNUGGLE_BASE || "https://songsnuggle.com";
const REPAIR = process.env.REPAIR_SECRET || "";
const OUT_ROOT = process.env.OUT_ROOT || "/workspace/songsnuggle/audit/country-malia-2026-09-15";
const MAX_ATTEMPTS = Number(process.env.MAX_ATTEMPTS || 3);

const brief = JSON.parse(readFileSync("/tmp/malia-brief.json", "utf8")) as Partial<SongJob>;

function baseJob(voice: "female" | "male"): SongJob {
  const id = randomUUID();
  const now = new Date().toISOString();
  return {
    id,
    createdAt: now,
    updatedAt: now,
    status: "preview",
    recipientName: brief.recipientName || "Maliya Grace",
    namePronunciation: brief.namePronunciation || "",
    relationship: brief.relationship || "daughter",
    email: brief.email || "josephsnyder@me.com",
    marketingOptIn: false,
    genre: "country",
    voice,
    qualities: brief.qualities || "",
    memories: brief.memories || "",
    occasion: brief.occasion || "birthday",
    senderName: brief.senderName || "Daddy",
    message: brief.message || "",
    songTitle: brief.songTitle || "Malia's 19th Birthday Song",
    lyrics: brief.lyrics || "",
    lyricCues: [],
    includeLyricPrint: false,
    previewReady: false,
    previewGate: null,
    listenCompletedAt: null,
    fullReady: false,
    paidAt: null,
    audioDurationSec: null,
  } as SongJob;
}

async function createJobOnLive(job: SongJob): Promise<string> {
  // Prefer cloning via public create API if available; else publish-candidate needs existing row.
  // Use /api/jobs POST shape from app.
  const res = await fetch(`${BASE}/api/jobs`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 SongSnuggleNeo/1.0",
    },
    body: JSON.stringify({
      recipientName: job.recipientName,
      namePronunciation: job.namePronunciation,
      relationship: job.relationship,
      email: job.email,
      marketingOptIn: false,
      genre: job.genre,
      voice: job.voice,
      qualities: job.qualities,
      memories: job.memories,
      occasion: job.occasion,
      senderName: job.senderName,
      message: job.message,
      songTitle: job.songTitle,
      includeLyricPrint: false,
    }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`create job ${res.status}: ${t.slice(0, 400)}`);
  }
  const data = (await res.json()) as { job: SongJob };
  return data.job.id;
}

async function patchLyrics(jobId: string, lyrics: string) {
  const res = await fetch(`${BASE}/api/jobs/${jobId}/lyrics`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "User-Agent": "Mozilla/5.0 SongSnuggleNeo/1.0",
    },
    body: JSON.stringify({ lyrics }),
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`lyrics ${res.status}: ${t.slice(0, 300)}`);
  }
}

async function uploadKv(jobId: string, wavPath: string, mp3Path: string) {
  const token = process.env.CLOUDFLARE_API_TOKEN!;
  const acct = process.env.CLOUDFLARE_ACCOUNT_ID!;
  const ns = "4f8262cb903743708308da8c8b3ea2dc";
  for (const [key, file] of [
    [`audio:${jobId}:preview`, wavPath],
    [`audio:${jobId}:preview:mp3`, mp3Path],
  ] as const) {
    const body = readFileSync(file);
    const url = `https://api.cloudflare.com/client/v4/accounts/${acct}/storage/kv/namespaces/${ns}/values/${encodeURIComponent(key)}`;
    const res = await fetch(url, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/octet-stream",
      },
      body,
    });
    if (!res.ok) throw new Error(`KV put ${key} ${res.status} ${await res.text()}`);
    console.log("KV put", key, body.byteLength);
  }
}

async function publishCandidate(
  jobId: string,
  cues: unknown,
  audioDurationSec: number,
  gate: unknown,
) {
  const res = await fetch(`${BASE}/api/jobs/${jobId}/publish-candidate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-repair-secret": REPAIR,
      "User-Agent": "Mozilla/5.0 SongSnuggleNeo/1.0",
    },
    body: JSON.stringify({ cues, audioDurationSec, previewGate: gate }),
  });
  if (!res.ok) throw new Error(`publish-candidate ${res.status} ${await res.text()}`);
  return res.json();
}

async function renderOne(voice: "female" | "male") {
  const seed = baseJob(voice);
  console.log("sungName", sungNameForEnunciation(seed), "compose snippet", lyricsForCompose(seed).match(/Happy birthday,.*/)?.[0]);
  console.log("styles sample", positiveStylesForJob(seed).filter((s) => /Malia|name/i.test(s)).slice(0, 6));

  const liveId = await createJobOnLive(seed);
  console.log("created", liveId, voice);
  await patchLyrics(liveId, seed.lyrics!);

  const job: SongJob = { ...seed, id: liveId };
  const words = (job.lyrics || "").split(/\s+/).filter(Boolean).length;
  const target = words >= 180 ? 85 : 70;
  const out = `${OUT_ROOT}/${voice}-${liveId.slice(0, 8)}`;
  mkdirSync(out, { recursive: true });
  writeFileSync(`${out}/job-id.txt`, liveId);

  let lastErr: unknown = null;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      console.log(`${voice} attempt ${attempt}/${MAX_ATTEMPTS}`);
      const rendered = await renderWithElevenLabs(job, target);
      const presence = vocalPresenceFromWav(rendered.wav);
      const dur = audioDurationSeconds(rendered.wav);
      const equalSliced = cuesLookEqualSliced(rendered.cues);
      console.log(JSON.stringify({ attempt, dur, midFrac: presence.midFrac, sungAligned: rendered.sungAligned, stamps: rendered.stampCount, equalSliced }));
      if (looksInstrumentalOnly(rendered.wav, rendered.sungAligned) || !rendered.sungAligned || !rendered.cues.length) {
        lastErr = new Error(`bad attempt ${attempt}`);
        writeFileSync(`${out}/attempt-${attempt}.wav`, rendered.wav);
        continue;
      }
      let mp3 = rendered.mp3;
      const wavPath = `${out}/preview.wav`;
      writeFileSync(wavPath, rendered.wav);
      const mp3Path = `${out}/preview.mp3`;
      if (mp3 && mp3.byteLength > 1024) {
        writeFileSync(mp3Path, mp3);
      } else {
        execFileSync("ffmpeg", ["-y", "-i", wavPath, "-codec:a", "libmp3lame", "-b:a", "192k", mp3Path], {
          stdio: "inherit",
        });
        mp3 = readFileSync(mp3Path);
      }
      const gate = runPreviewAcceptanceGate({
        job,
        publishedWav: rendered.wav,
        publishedMp3: mp3 ? new Uint8Array(mp3) : null,
        cues: rendered.cues,
        audioDurationSec: dur,
        sungAligned: rendered.sungAligned,
        singleComposeSource: true,
        forceInstrumentalFalse: true,
        lyricsInEveryChunk: rendered.lyricsInEveryChunk,
        stampCount: rendered.stampCount,
        provider: "elevenlabs",
      });
      writeFileSync(`${out}/cues.json`, JSON.stringify(rendered.cues));
      writeFileSync(`${out}/gate.json`, JSON.stringify(gate, null, 2));
      writeFileSync(
        `${out}/summary.json`,
        JSON.stringify(
          {
            jobId: liveId,
            previewUrl: `${BASE}/preview/${liveId}`,
            voice,
            genre: "country",
            audioDurationSec: dur,
            midFrac: presence.midFrac,
            sungName: sungNameForEnunciation(job),
            gatePass: gate.pass,
            note: "MC ear candidate — not product DONE",
          },
          null,
          2,
        ),
      );
      await uploadKv(liveId, wavPath, mp3Path);
      await publishCandidate(liveId, rendered.cues, dur, gate);
      // Desktop copy
      const deskDir = `${OUT_ROOT}/desktop`;
      mkdirSync(deskDir, { recursive: true });
      const deskMp3 = `${deskDir}/country-${voice}-malia-${liveId.slice(0, 8)}.mp3`;
      writeFileSync(deskMp3, readFileSync(mp3Path));
      writeFileSync(`${out}/desktop-path.txt`, deskMp3);
      console.log("DONE", voice, liveId, deskMp3);
      return { liveId, out, deskMp3, gate };
    } catch (e) {
      lastErr = e;
      console.error(e);
    }
  }
  throw lastErr || new Error("all attempts failed");
}

async function main() {
  if (!process.env.ELEVENLABS_API_KEY) throw new Error("ELEVENLABS_API_KEY missing");
  if (!process.env.CLOUDFLARE_API_TOKEN) throw new Error("CLOUDFLARE_API_TOKEN missing");
  if (!REPAIR) throw new Error("REPAIR_SECRET missing");
  mkdirSync(OUT_ROOT, { recursive: true });
  const female = await renderOne("female");
  const male = await renderOne("male");
  writeFileSync(
    `${OUT_ROOT}/REPORT.json`,
    JSON.stringify({ female, male, note: "not pass — MC ear" }, null, 2),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
