"use client";

import { useEffect, useRef, useState } from "react";
import type { LyricCue } from "@/lib/cues";

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
  onReady,
  autoPlay = false,
}: {
  src: string;
  cues: LyricCue[];
  fallbackLyrics?: string;
  onReady?: () => void;
  autoPlay?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const node = audioRef.current;
    if (!node) return;
    const onTime = () => setTime(node.currentTime || 0);
    const onPlay = () => {
      setPlaying(true);
      setBlocked(false);
    };
    const onPause = () => setPlaying(false);
    node.addEventListener("timeupdate", onTime);
    node.addEventListener("seeked", onTime);
    node.addEventListener("play", onPlay);
    node.addEventListener("pause", onPause);
    node.addEventListener("ended", onPause);
    return () => {
      node.removeEventListener("timeupdate", onTime);
      node.removeEventListener("seeked", onTime);
      node.removeEventListener("play", onPlay);
      node.removeEventListener("pause", onPause);
      node.removeEventListener("ended", onPause);
    };
  }, [src]);

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
        <p className="text-sm text-[var(--muted)]">{formatTime(time)}</p>
      </div>
      <audio
        ref={audioRef}
        className="mt-3 w-full"
        controls
        src={src}
        onPlay={onReady}
        onLoadedData={onReady}
      />
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
