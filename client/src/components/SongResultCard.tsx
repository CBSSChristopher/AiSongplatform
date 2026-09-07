import { useEffect, useRef, useState } from "react";
import type { GeneratedSong } from "../types";

interface Props {
  song: GeneratedSong;
}

export function SongResultCard({ song }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [copied, setCopied] = useState(false);

  // Reset the audio element whenever a new song arrives.
  useEffect(() => {
    audioRef.current?.load();
  }, [song.id]);

  const lyricsText = song.sections
    .map((s) => `[${s.label}]\n${s.lines.join("\n")}`)
    .join("\n\n");

  async function copyLyrics() {
    try {
      await navigator.clipboard.writeText(`${song.title}\n\n${lyricsText}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <article className="song">
      <div className="song__head">
        <h2 className="song__title">{song.title}</h2>
        <p className="song__meta">
          {`For ${song.recipient}${song.sender ? ` \u00b7 from ${song.sender}` : ""} \u00b7 ${song.tempoBpm} BPM \u00b7 ${song.durationSeconds}s`}
        </p>
      </div>

      <div className="player">
        <audio ref={audioRef} controls preload="auto" src={song.audioUrl}>
          Your browser does not support the audio element.
        </audio>
        <a className="player__download" href={song.audioUrl} download={`${song.title}.wav`}>
          Download clip
        </a>
      </div>

      <div className="lyrics">
        {song.sections.map((section, i) => (
          <div className="lyrics__section" key={`${section.label}-${i}`}>
            <h3 className="lyrics__label">{section.label}</h3>
            {section.lines.map((line, j) => (
              <p className="lyrics__line" key={j}>
                {line}
              </p>
            ))}
          </div>
        ))}
      </div>

      <button className="ghost-btn" type="button" onClick={copyLyrics}>
        {copied ? "Copied!" : "Copy lyrics"}
      </button>
    </article>
  );
}
