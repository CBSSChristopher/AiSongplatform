"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicSongJob } from "@/lib/types";

export function CheckoutComplete({ jobId, failed }: { jobId?: string; failed: boolean }) {
  const [job, setJob] = useState<PublicSongJob | null>(null);
  const [waited, setWaited] = useState(false);
  const [recovering, setRecovering] = useState(false);

  useEffect(() => {
    if (!jobId || failed) return;
    let alive = true;
    let attempts = 0;
    let recoverTried = false;

    async function recoverOnce() {
      if (recoverTried) return;
      recoverTried = true;
      setRecovering(true);
      try {
        await fetch("/api/checkout/recover", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ jobId }),
        });
      } catch {
        // Polling continues even if recover soft-fails.
      } finally {
        if (alive) setRecovering(false);
      }
    }

    async function poll() {
      if (!alive) return;
      if (attempts === 0 || attempts === 2 || attempts === 5) {
        await recoverOnce();
      }

      const response = await fetch(`/api/jobs/${jobId}`);
      if (!response.ok) {
        attempts += 1;
        if (attempts < 20) setTimeout(poll, 2000);
        else if (alive) setWaited(true);
        return;
      }
      const json = (await response.json()) as { job: PublicSongJob };
      if (!alive) return;
      setJob(json.job);
      if (json.job.fullReady && json.job.paidAt) return;
      attempts += 1;
      if (attempts < 20) {
        setTimeout(poll, 2000);
      } else {
        setWaited(true);
      }
    }

    poll();
    return () => {
      alive = false;
    };
  }, [failed, jobId]);

  const ready = Boolean(job?.fullReady && job.paidAt);
  const playHref = jobId ? `/song/${jobId}` : "/";
  const mp3Href = jobId ? `/api/jobs/${jobId}/audio?full=1&format=mp3&download=1` : undefined;

  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <p className="text-sm uppercase tracking-[0.2em] text-[var(--copper)]">
        {failed ? "Checkout" : ready ? "Gift unlocked" : "Almost there"}
      </p>
      <h1 className="serif mt-3 text-4xl">
        {failed ? "Checkout did not finish" : ready ? "Your song is ready" : "Payment received"}
      </h1>
      <p className="mt-4 text-[var(--muted)]">
        {failed
          ? "You can return to checkout and try again. No extra charge is taken unless Whop shows a receipt."
          : ready
            ? job?.email
              ? `Play it now, download the MP3 for phone & text, and keep the private link. We also email this to you at ${job.email}.`
              : "Play it now, download the MP3 for phone & text, and keep the private link."
            : waited
              ? "The recording is still preparing. Open the song page and refresh in a few seconds."
              : recovering
                ? "Confirming your SongSnuggle payment and releasing the full recording…"
                : "Releasing the full recording. This usually takes a few seconds."}
      </p>
      {ready ? (
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link
            href={playHref}
            className="inline-block rounded-full bg-[var(--copper)] px-6 py-3.5 text-white text-lg"
          >
            Play
          </Link>
          {mp3Href ? (
            <a
              href={mp3Href}
              className="inline-block rounded-full bg-[var(--ink)] px-6 py-3.5 text-white text-lg"
            >
              Download MP3
            </a>
          ) : null}
          <Link
            href={playHref}
            className="inline-block rounded-full border border-[var(--line)] bg-white px-5 py-3"
          >
            Open private page
          </Link>
        </div>
      ) : jobId ? (
        <Link
          href={failed ? `/checkout/${jobId}` : `/song/${jobId}`}
          className="mt-8 inline-block rounded-full bg-[var(--copper)] px-5 py-3 text-white"
        >
          {failed ? "Return to checkout" : "Open my song"}
        </Link>
      ) : null}
    </main>
  );
}
