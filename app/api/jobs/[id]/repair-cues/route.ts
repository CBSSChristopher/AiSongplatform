import { NextResponse } from "next/server";
import { cueSpanEnd, cuesNeedRescale, rescaleCuesToDuration } from "@/lib/cues";
import { getJob, publicJob, readAudio, updateJob } from "@/lib/store";
import { cuesWithSungWordsOnly, lyricsFromSungCues } from "@/lib/lyric-parse";
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
  const body = (await request.json().catch(() => ({}))) as {
    targetDurationSec?: number;
    forceRescale?: boolean;
  };

  const mp3 = await readAudio(id, "full", "mp3");
  const wav = await readAudio(id, "full", "wav");
  let durationSec = await resolveEncodedFullDurationSec({
    wav,
    mp3,
    storedSec: job.audioDurationSec,
    cues: job.lyricCues,
  });
  if (!(durationSec > 1)) {
    return NextResponse.json({ error: "Could not read full audio duration." }, { status: 400 });
  }
  if (
    force &&
    typeof body.targetDurationSec === "number" &&
    body.targetDurationSec > 1
  ) {
    durationSec = body.targetDurationSec;
  }

  const before = cueSpanEnd(job.lyricCues || []);
  const needsFit =
    Boolean(force && body.forceRescale) ||
    cuesNeedRescale(job.lyricCues || [], durationSec, 2);
  // Secret unlocks repair on locked jobs; it must NOT stretch cues that already fit.
  // Always strip unsung cue shells + align display lyrics (fc06 interim).
  const sungCues = cuesWithSungWordsOnly(job.lyricCues || []);
  const sungLyrics = sungCues.length ? lyricsFromSungCues(sungCues) : job.lyrics;
  const lyricsDirty = sungLyrics !== job.lyrics;
  const cuesDirty = sungCues.length !== (job.lyricCues || []).length;

  if (!needsFit) {
    const durDirty = !(
      job.audioDurationSec && Math.abs(job.audioDurationSec - durationSec) < 0.5
    );
    const next =
      durDirty || lyricsDirty || cuesDirty
        ? await updateJob(id, {
            audioDurationSec: durationSec,
            lyricCues: sungCues,
            lyrics: sungLyrics,
          })
        : job;
    return NextResponse.json({
      ok: true,
      healed: Boolean(durDirty || lyricsDirty || cuesDirty),
      strippedUnsung: cuesDirty || lyricsDirty,
      forced: force,
      audioDurationSec: durationSec,
      cueEndSec: before,
      job: publicJob(next || job),
    });
  }
  if (!force && job.paidAt && job.fullReady) {
    // Public heal allowed (same as song page); continue.
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
  const stripped = cuesWithSungWordsOnly(nextCues);
  const next = await updateJob(id, {
    lyricCues: stripped,
    lyrics: stripped.length ? lyricsFromSungCues(stripped) : job.lyrics,
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
