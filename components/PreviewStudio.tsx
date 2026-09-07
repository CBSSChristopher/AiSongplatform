"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { brand } from "@/lib/brand";
import type { PublicSongJob } from "@/lib/types";

export function PreviewStudio({ id }: { id: string }) {
  const router = useRouter();
  const [job, setJob] = useState<PublicSongJob | null>(null);
  const [lyrics, setLyrics] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"save" | "preview" | null>(null);
  const [audioKey, setAudioKey] = useState(0);
  const [canHear, setCanHear] = useState(false);

  useEffect(() => {
    fetch(`/api/jobs/${id}`)
      .then(async (response) => {
        const json = await response.json();
        if (!response.ok) throw new Error(json.error);
        setJob(json.job);
        setLyrics(json.job.lyrics || "");
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  async function saveLyrics() {
    setBusy("save");
    setError("");
    try {
      const response = await fetch(`/api/jobs/${id}/lyrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lyrics }),
      });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setJob(json.job);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save lyrics.");
    } finally {
      setBusy(null);
    }
  }

  async function makePreview() {
    setBusy("preview");
    setError("");
    setCanHear(false);
    try {
      if (lyrics !== job?.lyrics) {
        const saved = await fetch(`/api/jobs/${id}/lyrics`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lyrics }),
        });
        const savedJson = await saved.json();
        if (!saved.ok) throw new Error(savedJson.error);
        setJob(savedJson.job);
      }
      const response = await fetch(`/api/jobs/${id}/preview`, { method: "POST" });
      const json = await response.json();
      if (!response.ok) throw new Error(json.error);
      setJob(json.job);
      setAudioKey((value) => value + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not make preview.");
    } finally {
      setBusy(null);
    }
  }

  if (!job && !error) {
    return <p className="text-[var(--muted)]">Finding your song…</p>;
  }
  if (!job) {
    return <p className="text-[var(--copper-dark)]">{error}</p>;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
      <section className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-6">
        <p className="text-sm text-[var(--muted)]">Made for {job.recipientName}</p>
        <h1 className="serif mt-2 text-3xl">Read the words. Make them yours.</h1>
        <textarea
          className="mt-4 min-h-80 w-full rounded-2xl border border-[var(--line)] bg-white p-4"
          value={lyrics}
          onChange={(event) => setLyrics(event.target.value)}
        />
        <p className="mt-2 text-xs text-[var(--muted)]">{lyrics.length} / 5,000</p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={saveLyrics}
            disabled={busy !== null}
            className="rounded-full border border-[var(--line)] px-4 py-2"
          >
            {busy === "save" ? "Saving…" : "Save changes"}
          </button>
          <button
            type="button"
            onClick={makePreview}
            disabled={busy !== null}
            className="rounded-full bg-[var(--copper)] px-4 py-2 text-white"
          >
            {busy === "preview" ? "Making preview…" : "Create preview"}
          </button>
        </div>
      </section>

      <section className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-6">
        <h2 className="serif text-2xl">Hear it first</h2>
        {job.previewReady ? (
          <>
            <audio
              key={audioKey}
              className="mt-4 w-full"
              controls
              src={`/api/jobs/${id}/audio`}
              onPlay={() => setCanHear(true)}
              onLoadedData={() => setCanHear(true)}
            />
            <p className="mt-3 text-sm text-[var(--muted)]">
              45-second preview. The full song continues this same recording.
            </p>
            <button
              type="button"
              disabled={!canHear}
              onClick={() => router.push(`/checkout/${id}`)}
              className="mt-6 w-full rounded-full bg-[var(--ink)] px-4 py-3 text-white disabled:opacity-40"
            >
              {canHear
                ? `Keep the whole song · $${brand.songPrice}`
                : "Play the preview to continue"}
            </button>
          </>
        ) : (
          <p className="mt-4 text-[var(--muted)]">
            Save or approve your lyrics, then create the preview. Checkout stays closed until
            you can actually listen.
          </p>
        )}
        {error ? <p className="mt-4 text-sm text-[var(--copper-dark)]">{error}</p> : null}
      </section>
    </div>
  );
}
