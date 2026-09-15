import { NextResponse } from "next/server";
import type { LyricCue } from "@/lib/cues";
import { cueSpanEnd, rescaleCuesToDuration } from "@/lib/cues";
import { getJob, publicJob, readAudio, updateJob } from "@/lib/store";

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

  let durationSec = 0;
  if (mp3 && mp3.byteLength > 512) {
    const { readXingInfo } = await import("@/lib/mp3");
    durationSec = readXingInfo(mp3)?.durationSec || 0;
  }
  if (!(durationSec > 1) && wav) {
    const { audioDurationSeconds } = await import("@/lib/music-elevenlabs");
    durationSec = audioDurationSeconds(wav) || 0;
  }

  const body = (await request.json().catch(() => ({}))) as {
    lyricCues?: LyricCue[];
    songTitle?: string;
  };

  let cues = Array.isArray(body.lyricCues) && body.lyricCues.length
    ? body.lyricCues
    : job.lyricCues || [];
  if (durationSec > 1 && cues.length) {
    cues = rescaleCuesToDuration(cues, durationSec);
  }

  const next = await updateJob(id, {
    paidAt: job.paidAt || new Date().toISOString(),
    fullReady: true,
    previewReady: true,
    status: "delivered",
    lyricCues: cues,
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
