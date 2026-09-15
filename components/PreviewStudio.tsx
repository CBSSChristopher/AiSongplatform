"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { brand } from "@/lib/brand";
import type { PublicSongJob } from "@/lib/types";
import { LyricAudio } from "@/components/LyricAudio";

export function PreviewStudio({ id }: { id: string }) {
  const router = useRouter();
  const [job, setJob] = useState<PublicSongJob | null>(null);
  const [lyrics, setLyrics] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<"save" | "preview" | "listen" | "refresh" | null>(null);
  const [previousLyrics, setPreviousLyrics] = useState<string | null>(null);
  const [playWhenReady, setPlayWhenReady] = useState(false);
  const [localListened, setLocalListened] = useState(0);
  const persistingRef = useRef(false);

  useEffect(() => {
    fetch(`/api/jobs/${id}`)
      .then(async (response) => {
        const json = (await response.json()) as { error?: string; job?: PublicSongJob };
        if (!response.ok) throw new Error(json.error || "Could not make preview.");
        setJob(json.job ?? null);
        setLyrics(json.job?.lyrics || "");
      })
      .catch((err: Error) => setError(err.message));
  }, [id]);

  const persistListen = useCallback(
    async (listenedSeconds: number, durationSeconds: number) => {
      if (persistingRef.current) return;
      persistingRef.current = true;
      setBusy("listen");
      setError("");
      try {
        const response = await fetch(`/api/jobs/${id}/listen`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ listenedSeconds, durationSeconds }),
        });
        const json = (await response.json()) as { error?: string; job?: PublicSongJob };
        if (!response.ok) throw new Error(json.error || "Could not record listen proof.");
        setJob(json.job ?? null);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not record listen proof.");
      } finally {
        persistingRef.current = false;
        setBusy(null);
      }
    },
    [id],
  );

  const onListenProgress = useCallback(
    (info: { listenedSeconds: number; durationSeconds: number; complete: boolean }) => {
      setLocalListened(info.listenedSeconds);
      if (!info.complete) return;
      if (job?.listenCompletedAt) return;
      void persistListen(info.listenedSeconds, info.durationSeconds);
    },
    [job?.listenCompletedAt, persistListen],
  );

  async function saveLyrics() {
    setBusy("save");
    setError("");
    try {
      const response = await fetch(`/api/jobs/${id}/lyrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lyrics }),
      });
      const json = (await response.json()) as { error?: string; job?: PublicSongJob };
      if (!response.ok) throw new Error(json.error || "Could not make preview.");
      setJob(json.job ?? null);
      setLocalListened(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save lyrics.");
    } finally {
      setBusy(null);
    }
  }

  async function tryNewLyrics() {
    const saved = (job?.lyrics || "").trim();
    const current = lyrics.trim();
    const heavilyEdited = current.length > 0 && current !== saved;
    if (heavilyEdited) {
      const ok = window.confirm(
        "You've edited these lyrics. Try a fresh draft instead? You can undo once.",
      );
      if (!ok) return;
    }
    setBusy("refresh");
    setError("");
    try {
      const response = await fetch(`/api/jobs/${id}/lyrics`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ regenerate: true }),
      });
      const json = (await response.json()) as { error?: string; job?: PublicSongJob };
      if (!response.ok) throw new Error(json.error || "Could not draft new lyrics.");
      const nextLyrics = json.job?.lyrics || "";
      setPreviousLyrics(lyrics);
      setLyrics(nextLyrics);
      setJob(json.job ?? null);
      setLocalListened(0);
      setPlayWhenReady(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not draft new lyrics.");
    } finally {
      setBusy(null);
    }
  }

  function undoLyrics() {
    if (previousLyrics === null) return;
    setLyrics(previousLyrics);
    setPreviousLyrics(null);
    setError("");
  }

  async function makePreview() {
    setBusy("preview");
    setError("");
    setPlayWhenReady(false);
    setLocalListened(0);
    try {
      if (lyrics !== job?.lyrics) {
        const saved = await fetch(`/api/jobs/${id}/lyrics`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lyrics }),
        });
        const savedJson = (await saved.json()) as { error?: string; job?: PublicSongJob };
        if (!saved.ok) throw new Error(savedJson.error || "Could not save lyrics.");
        setJob(savedJson.job ?? null);
      }
      const response = await fetch(`/api/jobs/${id}/preview`, { method: "POST" });
      const json = (await response.json()) as { error?: string; job?: PublicSongJob };
      if (!response.ok) throw new Error(json.error || "Could not make preview.");
      setJob(json.job ?? null);
      setPlayWhenReady(true);
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

  const listened = Boolean(job.listenCompletedAt);
  const checkoutLabel = listened
    ? `Keep the whole song · $${brand.songPrice}`
    : busy === "listen"
      ? "Saving listen proof…"
      : localListened > 0
        ? "Keep playing to unlock checkout"
        : "Play the preview to continue";

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
            onClick={tryNewLyrics}
            disabled={busy !== null}
            className="rounded-full border border-[var(--copper)] bg-[#f8e7db] px-4 py-2 text-[var(--copper-dark)]"
          >
            {busy === "refresh" ? "Writing a fresh draft…" : "Try new lyrics"}
          </button>
          {previousLyrics !== null ? (
            <button
              type="button"
              onClick={undoLyrics}
              disabled={busy !== null}
              className="rounded-full border border-[var(--line)] px-4 py-2 text-sm text-[var(--muted)]"
            >
              Undo
            </button>
          ) : null}
          <button
            type="button"
            onClick={makePreview}
            disabled={busy !== null}
            className="rounded-full bg-[var(--copper)] px-4 py-2 text-white"
          >
            {busy === "preview" ? "Making preview…" : "Create preview"}
          </button>
        </div>
        <p className="mt-2 text-xs text-[var(--muted)]">
          Want a different feel? Try new lyrics — same story, fresh words. You can still edit before
          the preview.
        </p>
      </section>

      <section className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-6">
        <h2 className="serif text-2xl">Hear it first</h2>
        {job.previewReady ? (
          <>
            <LyricAudio
              key={job.updatedAt}
              src={`/api/jobs/${id}/audio?format=mp3&t=${encodeURIComponent(job.updatedAt)}`}
              cues={job.lyricCues || []}
              fallbackLyrics={job.lyrics}
              autoPlay={playWhenReady}
              onListenProgress={onListenProgress}
            />
            <p className="mt-3 text-sm text-[var(--muted)]">
              The preview sings your lyric lines over a backing track. Each word highlights as it
              is sung. This is original generated music, not a studio recording artist.
            </p>
            <button
              type="button"
              disabled={!listened || busy !== null}
              onClick={() => router.push(`/checkout/${id}`)}
              className="mt-6 w-full rounded-full bg-[var(--ink)] px-4 py-3 text-white disabled:opacity-40"
            >
              {checkoutLabel}
            </button>
            {!listened ? (
              <p className="mt-2 text-xs text-[var(--muted)]">
                Checkout stays locked until the preview actually plays (not just loads).
              </p>
            ) : null}
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
