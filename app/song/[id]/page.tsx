import { notFound } from "next/navigation";
import { LyricAudio } from "@/components/LyricAudio";
import { SongDelivery } from "@/components/SongDelivery";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { cueSpanEnd, cuesNeedRescale, rescaleCuesToDuration } from "@/lib/cues";
import { readAudio, getJob, publicJob, updateJob } from "@/lib/store";

async function resolveFullDurationSec(jobId: string): Promise<number | null> {
  try {
    const mp3 = await readAudio(jobId, "full", "mp3");
    if (mp3 && mp3.byteLength > 512) {
      const { readXingInfo } = await import("@/lib/mp3");
      const info = readXingInfo(mp3);
      if (info?.durationSec && info.durationSec > 1) return info.durationSec;
    }
  } catch {
    /* fall through */
  }
  try {
    const wav = await readAudio(jobId, "full", "wav");
    if (wav && wav.byteLength > 44) {
      const { audioDurationSeconds } = await import("@/lib/music-elevenlabs");
      const dur = audioDurationSeconds(wav);
      if (dur > 1) return dur;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export default async function SongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  let job = await getJob(id);
  if (!job) notFound();
  const unlocked = Boolean(job.paidAt && job.fullReady);
  const from = job.senderName.trim();
  const displayTitle =
    (job.songTitle || "").trim() ||
    (job.recipientName ? `For ${job.recipientName}` : "Your song");

  if (unlocked && (job.lyricCues || []).length) {
    const dur = await resolveFullDurationSec(id);
    if (dur && cuesNeedRescale(job.lyricCues, dur, 2)) {
      const nextCues = rescaleCuesToDuration(job.lyricCues, dur);
      const healed = await updateJob(id, { lyricCues: nextCues });
      if (healed) job = healed;
      console.info("[song] healed lyric cues to full duration", {
        jobId: id,
        audioSec: dur,
        beforeEnd: cueSpanEnd(job.lyricCues),
        afterEnd: cueSpanEnd(nextCues),
      });
    }
  }

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--copper)]">
          {unlocked ? "Your gift is ready" : "Private listening page"}
        </p>
        <h1 className="serif mt-3 text-4xl">{displayTitle}</h1>
        <p className="mt-2 text-[var(--muted)]">
          Made for {job.recipientName}
          {from ? <> · From {from}</> : null}
        </p>
        {unlocked ? (
          <>
            <p className="mt-4 text-[var(--muted)]">
              A keepsake in its own space — play below, follow the words, download the MP3
              for phone &amp; text
              {job.email ? (
                <>
                  , and we also email this private page to{" "}
                  <span className="text-[var(--ink)]">{job.email}</span>
                </>
              ) : null}
              .
            </p>
            <LyricAudio
              gift
              title={displayTitle}
              src={`/api/jobs/${id}/audio?full=1&format=mp3&t=${encodeURIComponent(job.updatedAt)}`}
              cues={job.lyricCues || []}
              fallbackLyrics={job.lyrics}
            />
            <SongDelivery job={publicJob(job)} />
          </>
        ) : (
          <p className="mt-6 text-[var(--muted)]">
            This song is not unlocked yet. Finish checkout to release the full recording.
          </p>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
