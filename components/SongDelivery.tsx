"use client";

import { useState } from "react";
import { brand } from "@/lib/brand";
import type { PublicSongJob } from "@/lib/types";

export function SongDelivery({ job }: { job: PublicSongJob }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    const url = window.location.href;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      const input = document.createElement("input");
      input.value = url;
      input.setAttribute("readonly", "true");
      document.body.appendChild(input);
      input.select();
      document.execCommand("copy");
      input.remove();
    }
  }

  const mp3Href = `/api/jobs/${job.id}/audio?full=1&format=mp3&download=1`;
  const wavHref = `/api/jobs/${job.id}/audio?full=1&format=wav&download=1`;

  return (
    <div className="mt-8 space-y-4">
      <div className="rounded-3xl border border-[var(--line)] bg-white/70 p-5">
        <p className="text-sm uppercase tracking-[0.18em] text-[var(--copper)]">Keep it</p>
        <p className="mt-2 text-[var(--muted)]">
          Download the MP3 for phone &amp; text. We also email this private page to{" "}
          <span className="text-[var(--ink)]">{job.email || "you"}</span> when delivery mail is
          connected.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a className="rounded-full bg-[var(--ink)] px-5 py-3 text-white" href={mp3Href}>
            Download MP3
          </a>
          <a
            className="rounded-full border border-[var(--line)] bg-white px-5 py-3"
            href={wavHref}
          >
            Download WAV (studio)
          </a>
          {job.includeLyricPrint ? (
            <a
              className="rounded-full border border-[var(--line)] bg-white px-5 py-3"
              href={`/api/jobs/${job.id}/lyrics.pdf`}
            >
              Download lyric print
            </a>
          ) : null}
          <button
            type="button"
            onClick={copy}
            className="rounded-full border border-[var(--line)] bg-white px-5 py-3"
          >
            {copied ? "Link copied" : "Copy private link"}
          </button>
        </div>
      </div>
      <p className="text-sm text-[var(--muted)]">
        {brand.tagline} Share the private link only with people who should hear it.
      </p>
    </div>
  );
}
