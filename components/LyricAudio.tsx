"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { LyricCue } from "@/lib/cues";
import {
  cueSpanEnd,
  cuesNeedRescale,
  rescaleCuesToDuration,
  resolvePlayableDurationSec,
  sealCueGaps,
} from "@/lib/cues";
import { listenRequirementHint, meetsListenRequirement } from "@/lib/listen";

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
  encodedDurationSec,
  jobId,
  onListenProgress,
  gift = false,
  title,
}: {
  src: string;
  cues: LyricCue[];
  fallbackLyrics?: string;
  autoPlay?: boolean;
  /** When set (preview ONLY), hard-stop playback at this many seconds. Never pass on gift/full. */
  maxPlaySeconds?: number;
  /** Authoritative encode length (WAV PCM / job.audioDurationSec). Beats HTMLMediaElement.duration. */
  encodedDurationSec?: number | null;
  /** Optional: POST /repair-cues when client detects span mismatch on full play. */
  jobId?: string;
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
  const lastTickRef = useRef(0);
  const listenedRef = useRef(0);
  const completeRef = useRef(false);
  const repairPostedRef = useRef(false);
  const [time, setTime] = useState(0);
  const [mediaDuration, setMediaDuration] = useState(0);
  const [listened, setListened] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);

  // Preview cap must NEVER apply on full/unlocked playback.
  const cap =
    typeof maxPlaySeconds === "number" && maxPlaySeconds > 0
      ? maxPlaySeconds
      : null;

  const cueEnd = useMemo(() => cueSpanEnd(cues || []), [cues]);

  const playableDuration = useMemo(() => {
    if (cap) return cap;
    return resolvePlayableDurationSec({
      encodedSec: encodedDurationSec,
      mediaSec: mediaDuration,
      cueEndSec: cueEnd,
      slackSec: 2,
    });
  }, [cap, encodedDurationSec, mediaDuration, cueEnd]);

  const fittedCues = useMemo(() => {
    const list = cues || [];
    if (!list.length) return list;
    // Full play: fit to TRUE playable duration — never to inflated media alone.
    const target = playableDuration;
    if (target > 1 && cuesNeedRescale(list, target, 2)) {
      return rescaleCuesToDuration(list, target);
    }
    if (target > 1) return sealCueGaps(list, target);
    return list;
  }, [cues, playableDuration]);

  const [playSrc, setPlaySrc] = useState(src);
  const objectUrlRef = useRef<string | null>(null);
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    listenedRef.current = 0;
    completeRef.current = false;
    lastTickRef.current = 0;
    repairPostedRef.current = false;
    setListened(0);
    setTime(0);
    setMediaDuration(0);
    setPlaying(false);
  }, [src]);

  // Systemic continuous-play: buffer same-origin MP3 as a blob URL so Safari
  // does not depend on progressive Range/Content-Length mid-stream.
  useEffect(() => {
    let cancelled = false;
    if (objectUrlRef.current) {
      URL.revokeObjectURL(objectUrlRef.current);
      objectUrlRef.current = null;
    }
    setPlaySrc(src);
    const abs = src.startsWith("http") ? src : `${window.location.origin}${src}`;
    (async () => {
      try {
        const res = await fetch(abs, {
          credentials: "same-origin",
          cache: "no-store",
          headers: { Accept: "audio/mpeg,audio/*,*/*" },
        });
        if (!res.ok || cancelled) return;
        const buf = await res.arrayBuffer();
        if (cancelled || buf.byteLength < 1024) return;
        const url = URL.createObjectURL(
          new Blob([buf], { type: res.headers.get("content-type") || "audio/mpeg" }),
        );
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrlRef.current = url;
        setPlaySrc(url);
      } catch {
        /* keep network src — Range fast-path still required */
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [src]);

  // Optional soft repair when full cues disagree with encoded/true duration.
  useEffect(() => {
    if (cap || !jobId || repairPostedRef.current) return;
    if (!(playableDuration > 1) || !(cueEnd > 0.5)) return;
    if (Math.abs(cueEnd - playableDuration) <= 2) return;
    repairPostedRef.current = true;
    void fetch(`/api/jobs/${jobId}/repair-cues`, { method: "POST" }).catch(
      () => {
        /* best-effort */
      },
    );
  }, [cap, jobId, playableDuration, cueEnd]);

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
      if (rawDur > 0) setMediaDuration(rawDur);

      const trueDur = resolvePlayableDurationSec({
        encodedSec: encodedDurationSec,
        mediaSec: rawDur,
        cueEndSec: cueEnd,
        slackSec: 2,
      });
      const dur = cap && trueDur > 0 ? Math.min(trueDur, cap) : cap || trueDur;

      if (cap && current >= cap) {
        node.pause();
        try {
          node.currentTime = cap;
        } catch {
          /* ignore seek errors */
        }
        setTime(cap);
        setPlaying(false);
        lastTickRef.current = cap;
        return;
      }
      setTime(current);

      if (!node.paused && !node.ended) {
        const prev = lastTickRef.current;
        const delta = current - prev;
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
      if (dur > 0) setMediaDuration(dur);
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
  }, [playSrc, onListenProgress, cap, encodedDurationSec, cueEnd]);
  // If playback stalls (waiting > 2.5s with no progress), nudge currentTime and resume.
  useEffect(() => {
    const node = audioRef.current;
    if (!node) return;
    const clearStall = () => {
      if (stallTimerRef.current) {
        clearTimeout(stallTimerRef.current);
        stallTimerRef.current = null;
      }
    };
    const onWaiting = () => {
      clearStall();
      const frozenAt = node.currentTime || 0;
      stallTimerRef.current = setTimeout(() => {
        if (node.paused || node.ended) return;
        if (Math.abs((node.currentTime || 0) - frozenAt) > 0.15) return;
        try {
          node.currentTime = Math.max(0, frozenAt + 0.05);
          void node.play().catch(() => undefined);
        } catch {
          /* ignore */
        }
      }, 2500);
    };
    const onPlaying = () => clearStall();
    node.addEventListener("waiting", onWaiting);
    node.addEventListener("playing", onPlaying);
    node.addEventListener("timeupdate", clearStall);
    return () => {
      clearStall();
      node.removeEventListener("waiting", onWaiting);
      node.removeEventListener("playing", onPlaying);
      node.removeEventListener("timeupdate", clearStall);
    };
  }, [playSrc]);


  useEffect(() => {
    const node = audioRef.current;
    if (!node) return;
    node.load();
    if (!autoPlay) return;
    const attempt = node.play();
    if (attempt) {
      attempt.catch(() => setBlocked(true));
    }
  }, [playSrc, autoPlay]);

  // JOSEPH LOCK: lyric sync / karaoke highlight DEFERRED — static lyrics text only.
  const progress =
    playableDuration > 0
      ? Math.min(100, (time / playableDuration) * 100)
      : 0;

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
          {playableDuration
            ? ` / ${formatTime(playableDuration)}`
            : ""}
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

      <audio
        ref={audioRef}
        className={gift ? "sr-only" : "mt-3 w-full"}
        controls={!gift}
        src={playSrc}
        preload="auto"
        playsInline
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
          {listenRequirementHint(listened, playableDuration || mediaDuration)}
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
          fittedCues.map((cue) => (
            <p
              key={`${cue.start}-${cue.text}`}
              className="py-1.5 text-[var(--ink)]"
            >
              {cue.text}
            </p>
          ))
        ) : (
          <pre className="whitespace-pre-wrap text-[var(--ink)]">
            {fallbackLyrics}
          </pre>
        )}
      </div>
    </>
  );

  if (!gift) return <div>{player}</div>;

  // Gift chrome lives in GiftDeliveryTemplate; keep a soft inner frame when used alone.
  return (
    <div className="mt-2">{player}</div>
  );
}
