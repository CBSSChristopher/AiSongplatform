"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LyricCue } from "@/lib/cues";
import { cuesNeedRescale, rescaleCuesToDuration } from "@/lib/cues";
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
  gift = false,
  title,
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
  /** Soft gift framing for private /song and post-pay. */
  gift?: boolean;
  title?: string;
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

  const fittedCues = useMemo(() => {
    const list = cues || [];
    if (!list.length) return list;
    const target = cap || duration;
    if (target > 1 && cuesNeedRescale(list, target, 2)) {
      return rescaleCuesToDuration(list, target);
    }
    return list;
  }, [cues, duration, cap]);

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

  const active = fittedCues.findIndex((cue) => time >= cue.start && time < cue.end);
  const progress =
    (cap || duration) > 0 ? Math.min(100, (time / (cap || duration)) * 100) : 0;

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

  const player = (
    <>
      <div className={`flex flex-wrap items-center gap-3 ${gift ? "" : "mt-4"}`}>
        <button
          type="button"
          onClick={togglePlay}
          className={
            gift
              ? "rounded-full bg-[var(--copper)] px-7 py-3 text-base font-medium text-white shadow-sm"
              : "rounded-full bg-[var(--copper)] px-5 py-2 text-white"
          }
        >
          {playing ? "Pause" : gift ? "Play gift" : "Play song"}
        </button>
        <p className="text-sm text-[var(--muted)]">
          {formatTime(time)}
          {cap ? ` / ${formatTime(cap)}` : duration ? ` / ${formatTime(duration)}` : ""}
        </p>
      </div>

      {gift ? (
        <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[var(--line)]">
          <div
            className="h-full rounded-full bg-[var(--copper)] transition-[width] duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      ) : null}

      {/* Keep the element for playback; hide native chrome in gift mode. */}
      <audio
        ref={audioRef}
        className={gift ? "sr-only" : "mt-3 w-full"}
        controls={!gift}
        src={src}
        preload="metadata"
        onSeeked={() => {
          const node = audioRef.current;
          if (!node || !cap) return;
          if ((node.currentTime || 0) > cap) {
            node.currentTime = cap;
            node.pause();
          }
        }}
      />

      {!gift ? (
        <p className="mt-2 text-sm text-[var(--muted)]">
          {listenRequirementHint(listened, duration)}
        </p>
      ) : null}

      {blocked ? (
        <p className="mt-2 text-sm text-[var(--copper-dark)]">
          Press {gift ? "Play gift" : "Play song"} to hear it with the lyrics.
        </p>
      ) : null}

      <div
        className={
          gift
            ? "mt-5 max-h-80 overflow-y-auto rounded-2xl border border-[var(--line)] bg-[#fffaf4]/90 p-5 shadow-inner"
            : "mt-4 max-h-72 overflow-y-auto rounded-2xl border border-[var(--line)] bg-white p-4"
        }
      >
        {gift ? (
          <p className="mb-3 text-xs uppercase tracking-[0.18em] text-[var(--copper)]">
            Lyrics
          </p>
        ) : null}
        {fittedCues.length ? (
          fittedCues.map((cue, index) => (
            <p
              key={`${cue.start}-${cue.text}`}
              ref={index === active ? activeRef : undefined}
              className={
                index === active
                  ? "serif py-1.5 text-lg text-[var(--ink)]"
                  : "py-1.5 text-[var(--muted)]"
              }
            >
              {cue.words?.length
                ? cue.words.map((word) => {
                    const on = time >= word.start && time < word.end;
                    return (
                      <span
                        key={`${word.start}-${word.text}`}
                        className={
                          on
                            ? "rounded-sm bg-[var(--copper)]/25 px-0.5 text-[var(--ink)]"
                            : undefined
                        }
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
    </>
  );

  if (!gift) return <div>{player}</div>;

  return (
    <div className="mt-6 overflow-hidden rounded-[1.75rem] border border-[var(--line)] bg-gradient-to-b from-[#fff8f1] via-[#f7f1e8] to-[#eef3ee] p-1 shadow-[0_18px_50px_rgba(60,40,20,0.08)]">
      <div className="rounded-[1.5rem] border border-white/70 bg-white/55 p-5 backdrop-blur-sm md:p-7">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-[var(--copper)]">
              A song they can keep
            </p>
            {title ? <h2 className="serif mt-2 text-2xl text-[var(--ink)]">{title}</h2> : null}
          </div>
          <span
            aria-hidden
            className="mt-1 inline-flex h-10 w-10 items-center justify-center rounded-full border border-[var(--copper)]/30 bg-[#f8e7db] text-[var(--copper-dark)]"
          >
            ♡
          </span>
        </div>
        <div className="mt-5">{player}</div>
      </div>
    </div>
  );
}
