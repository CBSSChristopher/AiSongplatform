import { NextResponse } from "next/server";
import type { LyricCue } from "@/lib/cues";
import { cueSpanEnd, rescaleCuesToDuration, cuesNeedRescale } from "@/lib/cues";
import { getJob, publicJob, readAudio, updateJob } from "@/lib/store";
import { resolveEncodedFullDurationSec } from "@/lib/true-duration";

/**
 * Promote an existing full master already in KV to delivered (earcheck / ops).
 * Does not regenerate audio. Requires x-repair-secret.
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

  const durationSec = await resolveEncodedFullDurationSec({
    wav,
    mp3,
    storedSec: job.audioDurationSec,
    cues: job.lyricCues,
  });

  const body = (await request.json().catch(() => ({}))) as {
    lyricCues?: LyricCue[];
    songTitle?: string;
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

  const next = await updateJob(id, {
    paidAt: job.paidAt || new Date().toISOString(),
    fullReady: true,
    previewReady: true,
    status: "delivered",
    lyricCues: cues,
    audioDurationSec: durationSec || null,
    ...(typeof body.songTitle === "string"
      ? { songTitle: body.songTitle.slice(0, 80) }
      : {}),
    whopPaymentId: job.whopPaymentId || "promote-full",
  });

  return NextResponse.json({
    ok: true,
    audioDurationSec: durationSec || null,
    cueEndSec: cueSpanEnd(cues),
    privateUrl: `https://songsnuggle.com/song/${id}`,
    job: publicJob(next || job),
  });
}
