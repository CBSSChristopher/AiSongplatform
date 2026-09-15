"use client";

import { useCallback, useEffect, useState } from "react";
import { GIFT_CARD_QR_ID } from "@/lib/gift-card-id";
import type { PublicSongJob } from "@/lib/types";

/**
 * Printable gift card hook for GiftDeliveryTemplate.qrPrintSlot.
 * Photo (optional) + message + QR deep-link — linen / forest / copper.
 */
export function GiftCardPrint({ job }: { job: PublicSongJob }) {
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [previewBust, setPreviewBust] = useState(0);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const unlockPath = `/song/${job.id}`;
  const pdfHref = `/api/jobs/${job.id}/gift-card.pdf`;
  const pngHref = `/api/jobs/${job.id}/gift-card.png`;
  const printHref = `/song/${job.id}/gift-card`;

  useEffect(() => {
    let active = true;
    fetch(`/api/jobs/${job.id}/gift-photo`)
      .then(async (res) => {
        if (!res.ok) return null;
        const blob = await res.blob();
        return URL.createObjectURL(blob);
      })
      .then((url) => {
        if (active && url) setPhotoUrl(url);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [job.id, previewBust]);

  useEffect(() => {
    return () => {
      if (photoUrl) URL.revokeObjectURL(photoUrl);
    };
  }, [photoUrl]);

  const onPhoto = useCallback(
    async (file: File | null) => {
      if (!file) return;
      if (!file.type.startsWith("image/")) {
        setNote("Choose a photo (JPG or PNG).");
        return;
      }
      if (file.size > 4_500_000) {
        setNote("Keep the photo under about 4.5 MB.");
        return;
      }
      setBusy(true);
      setNote("");
      try {
        const body = new FormData();
        body.append("photo", file);
        const res = await fetch(`/api/jobs/${job.id}/gift-photo`, {
          method: "POST",
          body,
        });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error || "Could not save photo.");
        setPreviewBust((n) => n + 1);
        setNote("Photo saved on the card.");
      } catch (err) {
        setNote(err instanceof Error ? err.message : "Upload failed.");
      } finally {
        setBusy(false);
      }
    },
    [job.id],
  );

  const from = (job.senderName || "").trim();
  const written = (job.recipientName || "someone special").trim();
  const message =
    (job.message || "").trim() ||
    "A keepsake song — scan whenever you want to hear it again.";
  const title = (job.songTitle || "").trim() || `A song for ${written}`;

  return (
    <div className="space-y-5">
      <p className="text-[var(--muted)]">
        Print a soft card for the box or bag: their photo, your note, and a QR that opens
        this private song.
      </p>

      <div className="flex flex-wrap gap-3">
        <label className="cursor-pointer rounded-full border border-[var(--line)] bg-white px-5 py-3 text-sm">
          {busy ? "Saving photo…" : photoUrl ? "Change photo" : "Add a photo"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            disabled={busy}
            onChange={(event) => onPhoto(event.target.files?.[0] ?? null)}
          />
        </label>
        <a
          className="rounded-full bg-[var(--ink)] px-5 py-3 text-sm text-white"
          href={pdfHref}
        >
          Download PDF
        </a>
        <a
          className="rounded-full border border-[var(--line)] bg-white px-5 py-3 text-sm"
          href={pngHref}
          download
        >
          Download QR PNG
        </a>
        <a
          className="rounded-full border border-[var(--copper)]/40 bg-[#f8e7db] px-5 py-3 text-sm text-[var(--copper-dark)]"
          href={printHref}
          target="_blank"
          rel="noreferrer"
        >
          Print layout
        </a>
      </div>
      {note ? <p className="text-sm text-[var(--copper-dark)]">{note}</p> : null}

      {/* Live preview — same structure as print sheet */}
      <article
        id={GIFT_CARD_QR_ID}
        className="mx-auto max-w-sm overflow-hidden rounded-[1.5rem] border border-[var(--line)] bg-gradient-to-b from-[#fffaf2] to-[#f4efe4] shadow-[0_16px_40px_rgba(60,40,20,0.08)]"
      >
        <div className="space-y-4 p-5">
          <div>
            <p className="text-[10px] uppercase tracking-[0.22em] text-[var(--copper)]">
              SongSnuggle
            </p>
            <p className="mt-1 text-xs text-[var(--muted)]">A song they can keep.</p>
          </div>

          <div className="photo-frame aspect-[4/3] bg-[#eef3ee]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl || "/brand/mood-listen.png"}
              alt=""
              className="h-full w-full object-cover"
            />
          </div>

          <div>
            <h3 className="serif text-2xl text-[var(--ink)]">{title}</h3>
            <p className="mt-1 text-sm text-[var(--muted)]">
              For {written}
              {from ? <> · From {from}</> : null}
            </p>
            <p className="mt-3 text-[var(--ink)] leading-relaxed">{message}</p>
          </div>

          <div className="flex items-end justify-between gap-4 border-t border-[var(--line)] pt-4">
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
              src={`/api/jobs/${job.id}/gift-card.png?t=${previewBust}`}
              alt={`QR to ${unlockPath}`}
              width={96}
              height={96}
              className="rounded-xl border border-[var(--copper)]/40 bg-[#fffaf2] p-1"
            />
          </div>
        </div>
      </article>
    </div>
  );
}
