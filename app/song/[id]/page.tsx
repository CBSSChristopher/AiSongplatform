import { notFound } from "next/navigation";
import { GiftDeliveryTemplate } from "@/components/GiftDeliveryTemplate";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import {
  cueSpanEnd,
  cuesNeedRescale,
  rescaleCuesToDuration,
} from "@/lib/cues";
import { readAudio, getJob, publicJob, updateJob } from "@/lib/store";
import { resolveEncodedFullDurationSec } from "@/lib/true-duration";

export default async function SongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let job = await getJob(id);
  if (!job) notFound();
  const unlocked = Boolean(job.paidAt && job.fullReady);

  let encodedSec = job.audioDurationSec ?? null;

  if (unlocked && (job.lyricCues || []).length) {
    const mp3 = await readAudio(id, "full", "mp3");
    const wav = await readAudio(id, "full", "wav");
    const dur = await resolveEncodedFullDurationSec({
      wav,
      mp3,
      storedSec: job.audioDurationSec,
      cues: job.lyricCues,
    });
    if (dur > 1) {
      encodedSec = dur;
      const patch: {
        audioDurationSec?: number;
        lyricCues?: typeof job.lyricCues;
      } = {};
      if (!(job.audioDurationSec && Math.abs(job.audioDurationSec - dur) < 0.5)) {
        patch.audioDurationSec = dur;
      }
      if (cuesNeedRescale(job.lyricCues, dur, 2)) {
        const nextCues = rescaleCuesToDuration(job.lyricCues, dur);
        patch.lyricCues = nextCues;
        console.info("[song] fitted lyric cues to encoded duration", {
          jobId: id,
          audioSec: dur,
          beforeEnd: cueSpanEnd(job.lyricCues),
          afterEnd: cueSpanEnd(nextCues),
        });
      }
      // Refuse to persist a cue span that still mismatches after fit.
      if (patch.lyricCues && cuesNeedRescale(patch.lyricCues, dur, 2)) {
        console.error("[song] cue span still mismatches encoded audio — skip persist", {
          jobId: id,
          audioSec: dur,
          cueEnd: cueSpanEnd(patch.lyricCues),
        });
        delete patch.lyricCues;
      }
      if (Object.keys(patch).length) {
        const healed = await updateJob(id, patch);
        if (healed) job = healed;
      }
    }
  }

  const pub = publicJob(job);

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-10">
        {unlocked ? (
          <GiftDeliveryTemplate
            job={pub}
            audioSrc={`/api/jobs/${id}/audio?full=1&format=mp3&t=${encodeURIComponent(job.updatedAt)}`}
            cues={job.lyricCues || []}
            encodedDurationSec={encodedSec}
          />
        ) : (
          <>
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--copper)]">
              Private listening page
            </p>
            <h1 className="serif mt-3 text-4xl">
              {(job.songTitle || "").trim() ||
                (job.recipientName ? `For ${job.recipientName}` : "Your song")}
            </h1>
            <p className="mt-2 text-[var(--muted)]">
              Made for {job.recipientName}
              {job.senderName.trim() ? <> · From {job.senderName.trim()}</> : null}
            </p>
            <p className="mt-6 text-[var(--muted)]">
              This song is not unlocked yet. Finish checkout to release the full recording.
            </p>
          </>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
