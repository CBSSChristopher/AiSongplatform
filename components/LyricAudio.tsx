"use client";

import { useEffect, useRef, useState } from "react";
import type { LyricCue } from "@/lib/cues";

export function LyricAudio({
  src,
  cues,
  fallbackLyrics,
  onReady,
}: {
  src: string;
  cues: LyricCue[];
  fallbackLyrics?: string;
  onReady?: () => void;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeRef = useRef<HTMLParagraphElement>(null);
  const [time, setTime] = useState(0);

  useEffect(() => {
    const node = audioRef.current;
    if (!node) return;
    const onTime = () => setTime(node.currentTime || 0);
    node.addEventListener("timeupdate", onTime);
    node.addEventListener("seeked", onTime);
    return () => {
      node.removeEventListener("timeupdate", onTime);
      node.removeEventListener("seeked", onTime);
    };
  }, [src]);

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [time]);

  const active = cues.findIndex((cue) => time >= cue.start && time < cue.end);

  return (
    <div>
      <audio
        ref={audioRef}
        className="mt-4 w-full"
        controls
        src={src}
        onPlay={onReady}
        onLoadedData={onReady}
      />
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
              {cue.text}
            </p>
          ))
        ) : (
          <pre className="whitespace-pre-wrap text-[var(--muted)]">{fallbackLyrics}</pre>
        )}
      </div>
    </div>
  );
}
