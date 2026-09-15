"use client";

import { WhopCheckoutEmbed } from "@whop/checkout/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { brand } from "@/lib/brand";
import type { PublicSongJob } from "@/lib/types";

type CheckoutResponse = {
  mode: "demo" | "whop";
  sessionId?: string;
  planId?: string;
  environment?: "sandbox" | "production";
  amount?: number;
  error?: string;
};

export function CheckoutPanel({ id }: { id: string }) {
  const router = useRouter();
  const [job, setJob] = useState<PublicSongJob | null>(null);
  const [loadingJob, setLoadingJob] = useState(true);
  const [gateError, setGateError] = useState("");
  const [print, setPrint] = useState(false);
  const [payload, setPayload] = useState<CheckoutResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [promoCode, setPromoCode] = useState("");
  const total = brand.songPrice + (print ? brand.lyricsPrice : 0);

  useEffect(() => {
    setLoadingJob(true);
    fetch(`/api/jobs/${id}`)
      .then(async (response) => {
        const json = (await response.json()) as { error?: string; job?: PublicSongJob };
        if (!response.ok) throw new Error(json.error || "Song not found.");
        const next = json.job ?? null;
        setJob(next);
        if (!next?.previewReady || !next.listenCompletedAt) {
          setGateError("Listen to the preview first. Checkout stays locked until play progress is recorded.");
        }
      })
      .catch((err: Error) => setGateError(err.message))
      .finally(() => setLoadingJob(false));
  }, [id]);

  function togglePrint(next: boolean) {
    setPrint(next);
    setPayload(null);
  }

  async function startCheckout() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: id, includeLyricPrint: print }),
      });
      const json = (await response.json()) as CheckoutResponse;
      if (!response.ok) throw new Error(json.error || "Checkout failed.");
      setPayload(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Checkout failed.");
    } finally {
      setBusy(false);
    }
  }

  async function unlockWithCode(path: "demo" | "promo") {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/demo-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: id,
          ...(path === "promo" ? { promoCode } : {}),
        }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(json.error || "Unlock failed.");
      router.push(`/song/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unlock failed.");
      setBusy(false);
    }
  }

  const locked = !loadingJob && (Boolean(gateError) || !job?.listenCompletedAt);
  const completeUrl = `/checkout/complete?job=${encodeURIComponent(id)}`;

  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-[var(--line)] bg-[var(--card)] p-6">
      <h1 className="serif text-3xl">Keep the whole song</h1>
      <p className="mt-2 text-[var(--muted)]">
        One-time payment. No subscription. Delivered as a private listening page.
      </p>
      {loadingJob ? (
        <p className="mt-6 text-[var(--muted)]">Checking listen proof…</p>
      ) : locked ? (
        <div className="mt-6 rounded-2xl border border-[var(--copper)] bg-[#f8e7db] p-4">
          <p className="text-sm text-[var(--copper-dark)]">
            {gateError || "Listen to the preview before checkout."}
          </p>
          <Link
            href={`/preview/${id}`}
            className="mt-4 inline-flex rounded-full bg-[var(--ink)] px-4 py-2 text-white"
          >
            Back to preview
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 rounded-2xl border border-[var(--copper)] bg-[#f8e7db] p-4">
            <div className="flex items-center justify-between">
              <span>Complete song</span>
              <strong>${brand.songPrice}.00</strong>
            </div>
            <p className="mt-1 text-sm text-[var(--muted)]">Full recording after payment.</p>
          </div>
          <label className="mt-4 flex items-start justify-between gap-4 rounded-2xl border border-[var(--line)] p-4">
            <span>
              <strong>Words to keep</strong>
              <span className="mt-1 block text-sm text-[var(--muted)]">
                Optional lyric print PDF. ${brand.lyricsPrice}.
              </span>
            </span>
            <input type="checkbox" checked={print} onChange={(event) => togglePrint(event.target.checked)} />
          </label>
          <p className="mt-4 text-lg">Total ${total}.00</p>
          <p className="mt-3 text-sm text-[var(--muted)]">
            By continuing you agree to{" "}
            <Link href="/terms" className="underline decoration-[var(--copper)] underline-offset-2">
              SongSnuggle Terms &amp; Conditions
            </Link>
            .
          </p>
          {!payload ? (
            <button
              type="button"
              onClick={startCheckout}
              disabled={busy}
              className="mt-6 w-full rounded-full bg-[var(--copper)] px-4 py-3 text-white"
            >
              {busy ? "Starting checkout…" : "Get My Song"}
            </button>
          ) : payload.mode === "demo" ? (
            <div className="mt-6">
              <p className="text-sm text-[var(--muted)]">
                Whop keys are not connected yet, so this unlocks in demo mode.
              </p>
              <button
                type="button"
                onClick={() => unlockWithCode("demo")}
                disabled={busy}
                className="mt-4 w-full rounded-full bg-[var(--ink)] px-4 py-3 text-white"
              >
                Get My Song
              </button>
            </div>
          ) : (
            <div className="mt-6">
              <WhopCheckoutEmbed
                sessionId={payload.sessionId!}
                environment={payload.environment}
                theme="light"
                themeOptions={{ accentColor: "#b4532a", backgroundColor: "#fffaf2" }}
                returnUrl={`${typeof window !== "undefined" ? window.location.origin : ""}${completeUrl}`}
                prefill={job?.email ? { email: job.email } : undefined}
                hideTermsAndConditions
                onComplete={() => router.push(completeUrl)}
              />
              <p className="mt-3 text-center text-xs text-[var(--muted)]">
                Payment processed for SongSnuggle.{" "}
                <Link href="/terms" className="underline underline-offset-2">
                  SongSnuggle Terms &amp; Conditions
                </Link>
              </p>
            </div>
          )}
        </>
      )}
      <div className="mt-6 rounded-2xl border border-dashed border-[var(--line)] p-4">
        <p className="text-sm text-[var(--muted)]">Have a promo code?</p>
        <div className="mt-2 flex gap-2">
          <input
            value={promoCode}
            onChange={(event) => setPromoCode(event.target.value)}
            placeholder="Enter code"
            className="min-w-0 flex-1 rounded-full border border-[var(--line)] bg-white px-4 py-2 text-sm"
            autoComplete="off"
          />
          <button
            type="button"
            onClick={() => unlockWithCode("promo")}
            disabled={busy || !promoCode.trim()}
            className="rounded-full bg-[var(--ink)] px-4 py-2 text-sm text-white disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
      {error ? <p className="mt-4 text-sm text-[var(--copper-dark)]">{error}</p> : null}
    </div>
  );
}
