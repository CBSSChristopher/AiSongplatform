import { NextResponse } from "next/server";
import { cueSpanEnd, cuesNeedRescale, rescaleCuesToDuration } from "@/lib/cues";
import { getJob, publicJob, readAudio, updateJob } from "@/lib/store";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const secret = process.env.REPAIR_SECRET || process.env.ADMIN_REPAIR_SECRET || "";
  const header = request.headers.get("x-repair-secret") || "";
  // Allow unauthenticated heal when cues clearly overrun a delivered full master
  // (same condition as song-page auto-heal). Secret still accepted for force.
  const force = Boolean(secret && header && header === secret);

  let durationSec = 0;
  try {
    const mp3 = await readAudio(id, "full", "mp3");
    if (mp3 && mp3.byteLength > 512) {
      const { readXingInfo } = await import("@/lib/mp3");
      durationSec = readXingInfo(mp3)?.durationSec || 0;
    }
  } catch {
    /* ignore */
  }
  if (!(durationSec > 1)) {
    try {
      const wav = await readAudio(id, "full", "wav");
      if (wav) {
        const { audioDurationSeconds } = await import("@/lib/music-elevenlabs");
        durationSec = audioDurationSeconds(wav) || 0;
      }
    } catch {
      /* ignore */
    }
  }
  if (!(durationSec > 1)) {
    return NextResponse.json({ error: "Could not read full audio duration." }, { status: 400 });
  }

  const before = cueSpanEnd(job.lyricCues || []);
  if (!force && !cuesNeedRescale(job.lyricCues || [], durationSec, 2)) {
    return NextResponse.json({
      ok: true,
      healed: false,
      audioDurationSec: durationSec,
      cueEndSec: before,
      job: publicJob(job),
    });
  }

  const nextCues = rescaleCuesToDuration(job.lyricCues || [], durationSec);
  const next = await updateJob(id, { lyricCues: nextCues });
  return NextResponse.json({
    ok: true,
    healed: true,
    audioDurationSec: durationSec,
    cueEndSecBefore: before,
    cueEndSecAfter: cueSpanEnd(nextCues),
    job: publicJob(next || job),
  });
}
