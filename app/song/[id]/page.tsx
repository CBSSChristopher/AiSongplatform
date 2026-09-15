import { notFound } from "next/navigation";
import { LyricAudio } from "@/components/LyricAudio";
import { SongDelivery } from "@/components/SongDelivery";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getJob, publicJob } from "@/lib/store";

export default async function SongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  const unlocked = Boolean(job.paidAt && job.fullReady);
  const from = job.senderName.trim();

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--copper)]">
          {unlocked ? "Your song is ready" : "Private listening page"}
        </p>
        <h1 className="serif mt-3 text-4xl">Made for {job.recipientName}</h1>
        {from ? <p className="mt-2 text-[var(--muted)]">From {from}</p> : null}
        {unlocked ? (
          <>
            <p className="mt-4 text-[var(--muted)]">
              A gift they can keep — play below, download the MP3 for phone &amp; text
              {job.email ? (
                <>
                  , and we also email this private page to{" "}
                  <span className="text-[var(--ink)]">{job.email}</span>
                </>
              ) : null}
              .
            </p>
            <LyricAudio
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
