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

  const subject = encodeURIComponent(`Your ${brand.name} for ${job.recipientName}`);
  const body =
    typeof window === "undefined"
      ? ""
      : encodeURIComponent(
          [
            `A song for ${job.recipientName} is ready.`,
            "",
            `Private listening page: ${window.location.href}`,
            job.includeLyricPrint ? "Your lyric print PDF is on that same page." : "",
          ]
            .filter(Boolean)
            .join("\n"),
        );
  const mailto = `mailto:${job.email}?subject=${subject}&body=${body}`;

  return (
    <div className="mt-6 flex flex-wrap gap-3">
      <a
        className="rounded-full bg-[var(--ink)] px-5 py-3 text-white"
        href={`/api/jobs/${job.id}/audio?full=1&download=1`}
      >
        Download the recording
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
      <a className="rounded-full border border-[var(--line)] bg-white px-5 py-3" href={mailto}>
        Email this to myself
      </a>
    </div>
  );
}
