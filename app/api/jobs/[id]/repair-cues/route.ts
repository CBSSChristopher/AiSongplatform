import { NextResponse } from "next/server";
import { cueSpanEnd, cuesNeedRescale, rescaleCuesToDuration } from "@/lib/cues";
import { getJob, publicJob, readAudio, updateJob } from "@/lib/store";
import { resolveEncodedFullDurationSec } from "@/lib/true-duration";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const secret = process.env.REPAIR_SECRET || process.env.ADMIN_REPAIR_SECRET || "";
  const header = request.headers.get("x-repair-secret") || "";
  const force = Boolean(secret && header && header === secret);

  const mp3 = await readAudio(id, "full", "mp3");
  const wav = await readAudio(id, "full", "wav");
  const durationSec = await resolveEncodedFullDurationSec({
    wav,
    mp3,
    storedSec: job.audioDurationSec,
    cues: job.lyricCues,
  });
  if (!(durationSec > 1)) {
    return NextResponse.json({ error: "Could not read full audio duration." }, { status: 400 });
  }

  const before = cueSpanEnd(job.lyricCues || []);
  if (!force && !cuesNeedRescale(job.lyricCues || [], durationSec, 2)) {
    const next =
      job.audioDurationSec && Math.abs(job.audioDurationSec - durationSec) < 0.5
        ? job
        : await updateJob(id, { audioDurationSec: durationSec });
    return NextResponse.json({
      ok: true,
      healed: false,
      audioDurationSec: durationSec,
      cueEndSec: before,
      job: publicJob(next || job),
    });
  }

  const nextCues = rescaleCuesToDuration(job.lyricCues || [], durationSec);
  if (cuesNeedRescale(nextCues, durationSec, 2)) {
    return NextResponse.json(
      {
        error: "Cue span still mismatches encoded audio after fit.",
        audioDurationSec: durationSec,
        cueEndSec: cueSpanEnd(nextCues),
      },
      { status: 422 },
    );
  }
  const next = await updateJob(id, {
    lyricCues: nextCues,
    audioDurationSec: durationSec,
  });
  return NextResponse.json({
    ok: true,
    healed: true,
    audioDurationSec: durationSec,
    cueEndSecBefore: before,
    cueEndSecAfter: cueSpanEnd(nextCues),
    job: publicJob(next || job),
  });
}
