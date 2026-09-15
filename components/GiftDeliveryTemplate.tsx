"use client";

import type { ReactNode } from "react";
import { LyricAudio } from "@/components/LyricAudio";
import { SongDelivery } from "@/components/SongDelivery";
import type { LyricCue } from "@/lib/cues";
import type { PublicSongJob } from "@/lib/types";

/**
 * Shared gift delivery layout for every paid /song page (and post-pay deep-links).
 * Linen / forest / copper present chrome — gift feeling, not tool UI.
 */
export function GiftDeliveryTemplate({
  job,
  audioSrc,
  cues,
  encodedDurationSec,
  emailSlot,
  qrPrintSlot,
}: {
  job: PublicSongJob;
  audioSrc: string;
  cues: LyricCue[];
  encodedDurationSec?: number | null;
  /** Hook for branded delivery email preview / CTA */
  emailSlot?: ReactNode;
  /** Hook for QR print card */
  qrPrintSlot?: ReactNode;
}) {
  const from = (job.senderName || "").trim();
  const written = (job.recipientName || "").trim();
  const pronunciation = (job.namePronunciation || "").trim();
  const displayTitle =
    (job.songTitle || "").trim() ||
    (written ? `For ${written}` : "Your song");

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--copper)]">
          Your gift is ready
        </p>
        <h1 className="serif text-4xl text-[var(--ink)]">{displayTitle}</h1>
        <div className="text-[var(--muted)]">
          <p>
            Made for <span className="text-[var(--ink)]">{written || "someone special"}</span>
            {from ? <> · From {from}</> : null}
          </p>
          {pronunciation ? (
            <p className="mt-1 text-sm">
              Said like <span className="italic text-[var(--ink)]">{pronunciation}</span>
            </p>
          ) : null}
        </div>
        <p className="pt-1 text-[var(--muted)]">
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
      </header>

      {/* Gift-framed player — linen / forest / copper */}
      <div className="overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-gradient-to-b from-[#fff8f1] via-[#f7f1e8] to-[#eef3ee] p-1 shadow-[0_18px_50px_rgba(60,40,20,0.08)]">
        <div className="rounded-[1.5rem] border border-white/70 bg-white/55 p-5 backdrop-blur-sm md:p-7">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.22em] text-[var(--copper)]">
                A song they can keep
              </p>
              <h2 className="serif mt-2 text-2xl text-[var(--ink)]">{displayTitle}</h2>
            </div>
            <span
              aria-hidden
              className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--copper)]/30 bg-[#f8e7db] text-[var(--copper-dark)]"
            >
              ♡
            </span>
          </div>

          <LyricAudio
            gift
            jobId={job.id}
            title={displayTitle}
            src={audioSrc}
            cues={cues}
            fallbackLyrics={job.lyrics}
            encodedDurationSec={encodedDurationSec}
            /* full/unlocked: never pass maxPlaySeconds */
          />
        </div>
      </div>

      <SongDelivery job={job} />

      {emailSlot ? (
        <section className="rounded-3xl border border-dashed border-[var(--line)] bg-white/50 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--copper)]">
            Branded email
          </p>
          <div className="mt-3">{emailSlot}</div>
        </section>
      ) : null}

      {qrPrintSlot ? (
        <section className="rounded-3xl border border-dashed border-[var(--line)] bg-white/50 p-5">
          <p className="text-xs uppercase tracking-[0.18em] text-[var(--copper)]">
            Print card + QR
          </p>
          <div className="mt-3">{qrPrintSlot}</div>
        </section>
      ) : null}
    </div>
  );
}
