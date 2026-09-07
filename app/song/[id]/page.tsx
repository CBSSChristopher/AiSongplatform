import { notFound } from "next/navigation";
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
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--copper)]">Private listening page</p>
        <h1 className="serif mt-3 text-4xl">Made for {job.recipientName}</h1>
        {from ? <p className="mt-2 text-[var(--muted)]">From {from}</p> : null}
        {unlocked ? (
          <>
            <audio className="mt-6 w-full" controls src={`/api/jobs/${id}/audio?full=1`} />
            <SongDelivery job={publicJob(job)} />
            <pre className="mt-8 whitespace-pre-wrap rounded-3xl border border-[var(--line)] bg-[var(--card)] p-6">
              {job.lyrics}
            </pre>
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
