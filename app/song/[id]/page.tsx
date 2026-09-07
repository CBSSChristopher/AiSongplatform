import { notFound } from "next/navigation";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { getJob } from "@/lib/store";

export default async function SongPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();

  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--copper)]">Private listening page</p>
        <h1 className="serif mt-3 text-4xl">Made for {job.recipientName}</h1>
        {job.paidAt && job.fullReady ? (
          <>
            <audio className="mt-6 w-full" controls src={`/api/jobs/${id}/audio?full=1`} />
            <pre className="mt-8 whitespace-pre-wrap rounded-3xl border border-[var(--line)] bg-[var(--card)] p-6">
              {job.lyrics}
            </pre>
            <a
              className="mt-6 inline-block rounded-full bg-[var(--ink)] px-5 py-3 text-white"
              href={`/api/jobs/${id}/audio?full=1`}
              download={`${job.recipientName}-hearloom.wav`}
            >
              Download the recording
            </a>
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
