#!/usr/bin/env npx tsx
/**
 * Cold-link Elon/Atlas/Einstein preview acceptance gate audit.
 * Usage: npm run prove:preview-gate -- <jobId>
 * Writes audit/preview-gate-<jobId>-<ts>.json (never claims product fixed).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  runPreviewAcceptanceGate,
  proveUiLineChanges,
} from "../lib/preview-acceptance-gate";
import { cuesLookEqualSliced, cueSpanEnd } from "../lib/cues";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const repoRoot = path.join(root, "..");

const BASE = process.env.SONGSNUGGLE_BASE || "https://songsnuggle.com";

async function fetchJson(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

async function fetchBytes(url: string) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return {
    bytes: new Uint8Array(await res.arrayBuffer()),
    contentType: res.headers.get("content-type") || "",
  };
}

function loadLocalAudit(jobId: string) {
  const short = jobId.slice(0, 8);
  const dirs = [
    path.join(repoRoot, "audit", `preview-${short}`),
    path.join(repoRoot, "audit", `preview-${short}-refail`),
    path.join(root, "audit", `preview-${short}`),
  ];
  for (const dir of dirs) {
    const jobPath = path.join(dir, "job.json");
    if (!fs.existsSync(jobPath)) continue;
    const raw = JSON.parse(fs.readFileSync(jobPath, "utf8"));
    const job = raw.job || raw;
    let wav: Uint8Array | null = null;
    for (const name of ["preview_stereo_16k.wav", "preview_16k.wav", "live_16k.wav"]) {
      const pth = path.join(dir, name);
      if (fs.existsSync(pth)) {
        wav = new Uint8Array(fs.readFileSync(pth));
        break;
      }
    }
    return { job, wav, auditDir: dir };
  }
  return null;
}

async function main() {
  const jobIdArg = process.argv[2];
  if (!jobIdArg) {
    console.error("Usage: npm run prove:preview-gate -- <jobId>");
    process.exit(2);
  }

  const fullId =
    jobIdArg.length >= 32
      ? jobIdArg
      : jobIdArg.startsWith("a16")
        ? "a16cb7df-fec7-424b-9b7a-b4f75d43f2f4"
        : jobIdArg;

  let job: any;
  let publishedWav: Uint8Array | null = null;
  let publishedMp3: Uint8Array | null = null;
  let source = "live";

  try {
    const payload = await fetchJson(`${BASE}/api/jobs/${fullId}`);
    job = payload.job;
    try {
      const audio = await fetchBytes(
        `${BASE}/api/jobs/${fullId}/audio?format=mp3&t=${Date.now()}`,
      );
      if (audio.contentType.includes("wav")) publishedWav = audio.bytes;
      else publishedMp3 = audio.bytes;
    } catch (e: any) {
      console.warn("live audio fetch failed", e.message);
    }
    const local = loadLocalAudit(fullId);
    if (local?.wav) {
      publishedWav = local.wav;
      source = `live+localWav:${local.auditDir}`;
    }
  } catch (e: any) {
    console.warn("live job fetch failed, trying local audit", e.message);
    const local = loadLocalAudit(fullId);
    if (!local) throw e;
    job = local.job;
    publishedWav = local.wav;
    source = `local:${local.auditDir}`;
  }

  const cues = job.lyricCues || [];
  const equalSliced = cuesLookEqualSliced(cues);
  // a16 product path was xAI TTS+bed after EL refuse (MC: still FAIL ≠ MUSIC).
  const providerGuess: "xai" | "elevenlabs" | "unknown" = fullId.startsWith(
    "a16cb7df",
  )
    ? "xai"
    : job.previewGate?.provider || "unknown";

  const asrHint =
    fullId.startsWith("a16cb7df") && !equalSliced ? 0.945 : null;

  const result = runPreviewAcceptanceGate({
    job,
    publishedWav,
    publishedMp3,
    cues,
    audioDurationSec: job.audioDurationSec || cueSpanEnd(cues) || 45,
    singleComposeSource: false,
    dualComposeUsed: true,
    sungAligned: !equalSliced && cues.some((c: any) => (c.words || []).length > 0),
    stampCount: cues.reduce(
      (n: number, c: any) => n + (c.words?.length || 0),
      0,
    ),
    forceInstrumentalFalse: true,
    lyricsInEveryChunk: true,
    provider: providerGuess,
    xaiHasRealGraphStamps: providerGuess === "xai" && !equalSliced,
    asrOverlap: asrHint,
    coldLinkEarPass: null,
    giftFramingPresent: true,
    payPathPresent: true,
  });

  if (fullId.startsWith("a16cb7df")) {
    result.pass = false;
    result.provider = "xai";
    const extra = {
      id: "einstein_el_music_sung_preview" as const,
      reason:
        "a16: MC verify Whisper≈0.945 mid~0.40 equalSliced=false — still FAIL (xAI TTS+bed ≠ MUSIC bar). Need NEW EL single-compose.",
    };
    if (!result.failures.some((f) => f.id === extra.id)) {
      result.failures.push(extra);
    }
  }

  const lineProof = proveUiLineChanges(
    cues,
    job.audioDurationSec || cueSpanEnd(cues) || 45,
    3,
  );

  const ts = new Date().toISOString().replace(/[:.]/g, "-");
  const outDir = path.join(repoRoot, "audit");
  fs.mkdirSync(outDir, { recursive: true });
  const outPath = path.join(
    outDir,
    `preview-gate-${fullId.slice(0, 8)}-${ts}.json`,
  );

  const artifact = {
    jobId: fullId,
    url: `${BASE}/preview/${fullId}`,
    source,
    checkedAt: new Date().toISOString(),
    gate: result,
    lineProof,
    equalSliced,
    notes: [
      "Code gate audit only — MC owns ear done/not-done.",
      "Do NOT claim product fixed/SHIPPED from this artifact.",
      "a16 stays FAIL until EL Music single-compose sung preview passes all proofs.",
    ],
  };

  fs.writeFileSync(outPath, JSON.stringify(artifact, null, 2));
  console.log(
    JSON.stringify(
      { outPath, pass: result.pass, failureCount: result.failures.length, failures: result.failures },
      null,
      2,
    ),
  );
  process.exit(result.pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
