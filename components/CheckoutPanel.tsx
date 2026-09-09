"use client";

import { WhopCheckoutEmbed } from "@whop/checkout/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { brand } from "@/lib/brand";

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
  const [print, setPrint] = useState(false);
  const [payload, setPayload] = useState<CheckoutResponse | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const total = brand.songPrice + (print ? brand.lyricsPrice : 0);

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

  async function demoPay() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/demo-pay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: id }),
      });
      const json = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(json.error);
      router.push(`/song/${id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo unlock failed.");
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl rounded-3xl border border-[var(--line)] bg-[var(--card)] p-6">
      <h1 className="serif text-3xl">Keep the whole song</h1>
      <p className="mt-2 text-[var(--muted)]">
        One-time payment. No subscription. Delivered as a private listening page.
      </p>
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
      <p className="mt-4 text-lg">
        Total ${total}.00
      </p>
      {!payload ? (
        <button
          type="button"
          onClick={startCheckout}
          disabled={busy}
          className="mt-6 w-full rounded-full bg-[var(--copper)] px-4 py-3 text-white"
        >
          {busy ? "Starting checkout…" : "Continue to checkout"}
        </button>
      ) : payload.mode === "demo" ? (
        <div className="mt-6">
          <p className="text-sm text-[var(--muted)]">
            Whop keys are not connected yet, so this unlocks in demo mode. Run
            `npm run sync:whop` when you are ready to take live payments.
          </p>
          <button
            type="button"
            onClick={demoPay}
            disabled={busy}
            className="mt-4 w-full rounded-full bg-[var(--ink)] px-4 py-3 text-white"
          >
            Unlock full song (demo)
          </button>
        </div>
      ) : (
        <div className="mt-6">
          <WhopCheckoutEmbed
            sessionId={payload.sessionId!}
            environment={payload.environment}
            theme="light"
            themeOptions={{ accentColor: "#b4532a", backgroundColor: "#fffaf2" }}
            returnUrl={`${window.location.origin}/checkout/complete?job=${id}`}
            onComplete={() => router.push(`/song/${id}`)}
          />
        </div>
      )}
      {error ? <p className="mt-4 text-sm text-[var(--copper-dark)]">{error}</p> : null}
    </div>
  );
}
