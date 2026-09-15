"use client";

import { useEffect, useState } from "react";
import { GIFT_CARD_QR_ID } from "@/lib/gift-card-id";
import type { PublicSongJob } from "@/lib/types";

/** Full-page print layout for box/bag gift cards. */
export function GiftCardPrintSheet({ job }: { job: PublicSongJob }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const from = (job.senderName || "").trim();
  const written = (job.recipientName || "someone special").trim();
  const message =
    (job.message || "").trim() ||
    "A keepsake song — scan whenever you want to hear it again.";
  const title = (job.songTitle || "").trim() || `A song for ${written}`;

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;
    fetch(`/api/jobs/${job.id}/gift-photo`)
      .then(async (res) => {
        if (!res.ok) return null;
        const blob = await res.blob();
        objectUrl = URL.createObjectURL(blob);
        return objectUrl;
      })
      .then((url) => {
        if (active && url) setPhotoUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [job.id]);

  return (
    <div className="min-h-screen bg-[var(--paper)] px-4 py-8 print:bg-white print:p-0">
      <div className="mx-auto mb-6 flex max-w-md flex-wrap gap-3 print:hidden">
        <button
          type="button"
          onClick={() => window.print()}
          className="rounded-full bg-[var(--copper)] px-5 py-3 text-white"
        >
          Print card
        </button>
        <a
          href={`/api/jobs/${job.id}/gift-card.pdf`}
          className="rounded-full border border-[var(--line)] bg-white px-5 py-3"
        >
          Download PDF
        </a>
        <a href={`/song/${job.id}`} className="rounded-full px-5 py-3 text-[var(--muted)]">
          Back to song
        </a>
      </div>

      <article
        id={GIFT_CARD_QR_ID}
        className="mx-auto w-full max-w-[5in] overflow-hidden rounded-[1.25rem] border border-[var(--line)] bg-gradient-to-b from-[#fffaf2] to-[#f4efe4] shadow-[0_16px_40px_rgba(60,40,20,0.08)] print:max-w-none print:rounded-none print:border-0 print:shadow-none"
        style={{ aspectRatio: "5 / 7" }}
      >
        <div className="flex h-full flex-col gap-4 p-6">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--copper)]">
              SongSnuggle
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">A song they can keep.</p>
          </div>

          <div className="photo-frame min-h-0 flex-1 bg-[#eef3ee]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl || "/brand/mood-listen.png"}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>

          <div>
            <h1 className="serif text-3xl text-[var(--ink)]">{title}</h1>
            <p className="mt-1 text-sm text-[var(--muted)]">
              For {written}
              {from ? <> · From {from}</> : null}
            </p>
            <p className="mt-3 text-[var(--ink)] leading-relaxed">{message}</p>
          </div>

          <div className="mt-auto flex items-end justify-between gap-4 border-t border-[var(--line)] pt-4">
            <div className="text-sm">
              <p className="text-xs uppercase tracking-[0.18em] text-[var(--copper)]">
                Scan to open
              </p>
              <p className="mt-1 font-medium text-[var(--ink)]">their private song</p>
              <p className="mt-2 text-xs text-[var(--muted)]">
                Tuck this card in the box or bag.
              </p>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={`/api/jobs/${job.id}/gift-card.png`}
              alt="QR code to private song"
              width={112}
              height={112}
              className="rounded-xl border border-[var(--copper)]/40 bg-[#fffaf2] p-1"
            />
          </div>
        </div>
      </article>
    </div>
  );
}
