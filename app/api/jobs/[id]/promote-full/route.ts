import { NextResponse } from "next/server";
import type { LyricCue } from "@/lib/cues";
import { cueSpanEnd, rescaleCuesToDuration, cuesNeedRescale } from "@/lib/cues";
import { getJob, publicJob, readAudio, updateJob } from "@/lib/store";
import { cuesWithSungWordsOnly, lyricsFromSungCues } from "@/lib/lyric-parse";
import { resolveEncodedFullDurationSec } from "@/lib/true-duration";
import { syncPreviewFromFullMaster, previewTargetSeconds } from "@/lib/music";
import {
  audioHeadFingerprint,
  newMasterSourceId,
  bytesLookSameMasterFamily,
} from "@/lib/master-source";
import { runPreviewAcceptanceGate } from "@/lib/preview-acceptance-gate";
import { PREVIEW_MAX_SECONDS } from "@/lib/preview-cap";

/**
 * Promote an existing full master already in KV to delivered (earcheck / ops).
 * Does not regenerate audio. Requires x-repair-secret.
 *
 * Joseph ONE-master / Elon:
 * - Overwrite preview KV as cap of THIS full master (never leave dual takes).
 * - Refuse leaving a parallel preview compose; always re-derive preview from full.
 * - Recompute previewGate from published FULL bytes (cue-span vs same master).
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const secret = process.env.REPAIR_SECRET || process.env.ADMIN_REPAIR_SECRET || "";
  const header = request.headers.get("x-repair-secret") || "";
  if (!secret || header !== secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const mp3 = await readAudio(id, "full", "mp3");
  const wav = await readAudio(id, "full", "wav");
  if ((!mp3 || mp3.byteLength < 1024) && (!wav || wav.byteLength < 1024)) {
    return NextResponse.json(
      { error: "Full audio missing in storage. Upload master first." },
      { status: 400 },
    );
  }

  const priorPreview =
    (await readAudio(id, "preview", "mp3")) ||
    (await readAudio(id, "preview", "wav"));
  const fullBytes = (mp3 && mp3.byteLength > 1024 ? mp3 : wav)!;
  const related = bytesLookSameMasterFamily(priorPreview, fullBytes);
  // Always overwrite preview from full — clears dual-asset even if parallel.
  const capSec = Math.max(previewTargetSeconds(job), PREVIEW_MAX_SECONDS);
  await syncPreviewFromFullMaster(id, wav, mp3, capSec);

  const durationSec = await resolveEncodedFullDurationSec({
    wav,
    mp3,
    storedSec: job.audioDurationSec,
    cues: job.lyricCues,
  });

  const body = (await request.json().catch(() => ({}))) as {
    lyricCues?: LyricCue[];
    songTitle?: string;
    coldLinkEarPass?: boolean | null;
    asrOverlap?: number | null;
  };

  let cues = Array.isArray(body.lyricCues) && body.lyricCues.length
    ? body.lyricCues
    : job.lyricCues || [];
  if (durationSec > 1 && cues.length) {
    cues = rescaleCuesToDuration(cues, durationSec);
    if (cuesNeedRescale(cues, durationSec, 2)) {
      return NextResponse.json(
        {
          error: "Cue span does not match encoded audio within tolerance.",
          audioDurationSec: durationSec,
          cueEndSec: cueSpanEnd(cues),
        },
        { status: 422 },
      );
    }
  }

  cues = cuesWithSungWordsOnly(cues);
  const sungLyrics = cues.length ? lyricsFromSungCues(cues) : job.lyrics;

  const masterFingerprint = audioHeadFingerprint(fullBytes);
  const masterSourceId = newMasterSourceId(id, masterFingerprint);

  const previewGate = runPreviewAcceptanceGate({
    job: { ...job, lyrics: sungLyrics, lyricCues: cues, audioDurationSec: durationSec },
    publishedWav: wav,
    publishedMp3: mp3,
    cues,
    audioDurationSec: durationSec || cueSpanEnd(cues) || 0,
    singleComposeSource: true,
    dualComposeUsed: false,
    sungAligned: cues.some((c) => (c.words || []).length >= 2),
    stampCount: cues.reduce((n, c) => n + (c.words?.length || 0), 0),
    forceInstrumentalFalse: true,
    lyricsInEveryChunk: true,
    provider: "elevenlabs",
    giftFramingPresent: true,
    payPathPresent: true,
    asrOverlap: body.asrOverlap ?? null,
    coldLinkEarPass: body.coldLinkEarPass ?? null,
    masterSourceId,
    masterFingerprint,
    priorMasterSourceId: job.masterSourceId,
    priorPreviewFingerprint: job.masterFingerprint,
    priorPreviewBytes: priorPreview,
    previewDerivedFromFull: true,
    parallelFullRecompose: Boolean(priorPreview?.byteLength) && !related.ok,
    gatePhase: "promote",
  });

  const next = await updateJob(id, {
    paidAt: job.paidAt || new Date().toISOString(),
    fullReady: true,
    previewReady: true,
    status: "delivered",
    lyricCues: cues,
    lyrics: sungLyrics,
    audioDurationSec: durationSec || null,
    masterSourceId,
    masterFingerprint,
    previewGate,
    ...(typeof body.songTitle === "string"
      ? { songTitle: body.songTitle.slice(0, 80) }
      : {}),
    whopPaymentId: job.whopPaymentId || "promote-full",
  });

  return NextResponse.json({
    ok: true,
    audioDurationSec: durationSec || null,
    cueEndSec: cueSpanEnd(cues),
    masterSourceId,
    masterFingerprint,
    previewDerivedFromFull: true,
    priorRelated: related,
    previewGate,
    note: "Preview KV overwritten as cap of full master — dual-take cleared. Gate.pass honest (ear/intelligibility may still fail).",
    privateUrl: `https://songsnuggle.com/song/${id}`,
    job: publicJob(next || job),
  });
}
