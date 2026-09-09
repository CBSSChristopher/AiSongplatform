"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { PublicSongJob } from "@/lib/types";

export function CheckoutComplete({ jobId, failed }: { jobId?: string; failed: boolean }) {
  const [job, setJob] = useState<PublicSongJob | null>(null);
  const [waited, setWaited] = useState(false);

  useEffect(() => {
    if (!jobId || failed) return;
    let alive = true;
    let attempts = 0;

    async function poll() {
      const response = await fetch(`/api/jobs/${jobId}`);
      if (!response.ok) return;
      const json = (await response.json()) as { job: PublicSongJob };
      if (!alive) return;
      setJob(json.job);
      if (json.job.fullReady) return;
      attempts += 1;
      if (attempts < 15) {
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

  return (
    <main className="mx-auto max-w-lg px-5 py-16 text-center">
      <h1 className="serif text-4xl">
        {failed ? "Checkout did not finish" : ready ? "Your song is ready" : "Payment received"}
      </h1>
      <p className="mt-4 text-[var(--muted)]">
        {failed
          ? "You can return to checkout and try again. No extra charge is taken unless Whop shows a receipt."
          : ready
            ? "The full recording is on a private page. Copy the link, download it, or email it to yourself."
            : waited
              ? "The recording is still preparing. Open the song page and refresh in a few seconds."
              : "Releasing the full recording. This usually takes a few seconds."}
      </p>
      {jobId ? (
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
