"use client";

import { useEffect, useRef, useState } from "react";
import type { LyricCue } from "@/lib/cues";
import { listenRequirementHint, meetsListenRequirement } from "@/lib/listen";
import { PREVIEW_MAX_SECONDS } from "@/lib/preview-cap";

function formatTime(seconds: number) {
  const safe = Math.max(0, seconds);
  const m = Math.floor(safe / 60);
  const s = Math.floor(safe % 60);
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export function LyricAudio({
  src,
  cues,
  fallbackLyrics,
  autoPlay = false,
  maxPlaySeconds,
  onListenProgress,
}: {
  src: string;
  cues: LyricCue[];
  fallbackLyrics?: string;
  autoPlay?: boolean;
  /** When set (preview), hard-stop playback at this many seconds. */
  maxPlaySeconds?: number;
  /** Fired with accumulated real playtime (seeks ignored). Not fired from onLoadedData. */
  onListenProgress?: (info: {
    listenedSeconds: number;
    durationSeconds: number;
    complete: boolean;
  }) => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);
  const lastTickRef = useRef(0);
  const listenedRef = useRef(0);
  const completeRef = useRef(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [listened, setListened] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const cap =
    typeof maxPlaySeconds === "number" && maxPlaySeconds > 0
      ? maxPlaySeconds
      : null;

  useEffect(() => {
    listenedRef.current = 0;
    completeRef.current = false;
    lastTickRef.current = 0;
    setListened(0);
    setTime(0);
    setDuration(0);
    setPlaying(false);
  }, [src]);

  useEffect(() => {
    const node = audioRef.current;
    if (!node) return;

    const report = (nextListened: number, nextDuration: number) => {
      const complete = meetsListenRequirement(nextListened, nextDuration);
      if (complete) completeRef.current = true;
      onListenProgress?.({
        listenedSeconds: nextListened,
        durationSeconds: nextDuration,
        complete,
      });
    };

    const onTime = () => {
      const current = node.currentTime || 0;
      const rawDur = Number.isFinite(node.duration) ? node.duration : 0;
      const dur = cap && rawDur > 0 ? Math.min(rawDur, cap) : cap || rawDur;
      if (cap && current >= cap) {
        node.pause();
        try {
          node.currentTime = cap;
        } catch {
          /* ignore seek errors */
        }
        setTime(cap);
        if (dur > 0) setDuration(dur);
        setPlaying(false);
        lastTickRef.current = cap;
        return;
      }
      setTime(current);
      if (dur > 0) setDuration(dur);

      if (!node.paused && !node.ended) {
        const prev = lastTickRef.current;
        const delta = current - prev;
        // Count only forward playback ticks; ignore seeks/jumps.
        if (delta > 0 && delta < 1.25) {
          const next = listenedRef.current + delta;
          listenedRef.current = next;
          setListened(next);
          report(next, dur);
        }
      }
      lastTickRef.current = current;
    };

    const onMeta = () => {
      const dur = Number.isFinite(node.duration) ? node.duration : 0;
      if (dur > 0) setDuration(dur);
    };

    const onPlay = () => {
      setPlaying(true);
      setBlocked(false);
      lastTickRef.current = node.currentTime || 0;
    };
    const onPause = () => setPlaying(false);

    node.addEventListener("timeupdate", onTime);
    node.addEventListener("seeked", onTime);
    node.addEventListener("loadedmetadata", onMeta);
    node.addEventListener("durationchange", onMeta);
    node.addEventListener("play", onPlay);
    node.addEventListener("pause", onPause);
    node.addEventListener("ended", onPause);
    return () => {
      node.removeEventListener("timeupdate", onTime);
      node.removeEventListener("seeked", onTime);
      node.removeEventListener("loadedmetadata", onMeta);
      node.removeEventListener("durationchange", onMeta);
      node.removeEventListener("play", onPlay);
      node.removeEventListener("pause", onPause);
      node.removeEventListener("ended", onPause);
    };
  }, [src, onListenProgress, cap]);

  useEffect(() => {
    const node = audioRef.current;
    if (!node) return;
    node.load();
    if (!autoPlay) return;
    const attempt = node.play();
    if (attempt) {
      attempt.catch(() => setBlocked(true));
    }
  }, [src, autoPlay]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [time]);

  const active = cues.findIndex((cue) => time >= cue.start && time < cue.end);

  async function togglePlay() {
    const node = audioRef.current;
    if (!node) return;
    if (node.paused) {
      try {
        await node.play();
        setBlocked(false);
      } catch {
        setBlocked(true);
      }
    } else {
      node.pause();
    }
  }

  return (
    <div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={togglePlay}
          className="rounded-full bg-[var(--copper)] px-5 py-2 text-white"
        >
          {playing ? "Pause song" : "Play song"}
        </button>
        <p className="text-sm text-[var(--muted)]">
          {formatTime(time)}
          {cap ? ` / ${formatTime(cap)}` : duration ? ` / ${formatTime(duration)}` : ""}
        </p>
      </div>
      <audio
        ref={audioRef}
        className="mt-3 w-full"
        controls
        src={src}
        onSeeked={() => {
          const node = audioRef.current;
          if (!node || !cap) return;
          if ((node.currentTime || 0) > cap) {
            node.currentTime = cap;
            node.pause();
          }
        }}
      />
      <p className="mt-2 text-sm text-[var(--muted)]">
        {listenRequirementHint(listened, duration)}
      </p>
      {blocked ? (
        <p className="mt-2 text-sm text-[var(--copper-dark)]">Press Play song to hear it with the lyrics.</p>
      ) : null}
      <div className="mt-4 max-h-72 overflow-y-auto rounded-2xl border border-[var(--line)] bg-white p-4">
        {cues.length ? (
          cues.map((cue, index) => (
            <p
              key={`${cue.start}-${cue.text}`}
              ref={index === active ? activeRef : undefined}
              className={
                index === active
                  ? "serif py-1 text-lg text-[var(--ink)]"
                  : "py-1 text-[var(--muted)]"
              }
            >
              {cue.words?.length
                ? cue.words.map((word) => {
                    const on = time >= word.start && time < word.end;
                    return (
                      <span
                        key={`${word.start}-${word.text}`}
                        className={on ? "rounded-sm bg-[var(--copper)]/20 px-0.5 text-[var(--ink)]" : undefined}
                      >
                        {word.text}{" "}
                      </span>
                    );
                  })
                : cue.text}
            </p>
          ))
        ) : (
          <pre className="whitespace-pre-wrap text-[var(--muted)]">{fallbackLyrics}</pre>
        )}
      </div>
    </div>
  );
}
