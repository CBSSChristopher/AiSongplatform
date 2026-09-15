export type LyricWordCue = {
  text: string;
  start: number;
  end: number;
};

export type LyricCue = {
  text: string;
  start: number;
  end: number;
  section: "verse" | "chorus" | "bridge";
  words?: LyricWordCue[];
};

/** Latest cue/word end across the set. */
export function cueSpanEnd(cues: LyricCue[]): number {
  let max = 0;
  for (const cue of cues) {
    if (cue.end > max) max = cue.end;
    for (const word of cue.words || []) {
      if (word.end > max) max = word.end;
    }
  }
  return max;
}

/** True when cues overrun or underrun audio by more than slackSec. */
export function cuesNeedRescale(
  cues: LyricCue[],
  audioDurationSec: number,
  slackSec = 2,
): boolean {
  if (!cues.length || !(audioDurationSec > 1)) return false;
  const end = cueSpanEnd(cues);
  if (!(end > 0.5)) return false;
  return Math.abs(end - audioDurationSec) > slackSec;
}

function scalePoint(t: number, factor: number, durationSec: number) {
  const next = t * factor;
  return Math.max(0, Math.min(durationSec, next));
}

/**
 * Proportionally fit cue + word stamps onto real audio duration.
 * Also expands near-zero / inverted word windows so highlights remain usable.
 */
export function rescaleCuesToDuration(
  cues: LyricCue[],
  audioDurationSec: number,
): LyricCue[] {
  if (!cues.length || !(audioDurationSec > 1)) return cues;
  const span = cueSpanEnd(cues);
  if (!(span > 0.5)) return cues;
  const factor = audioDurationSec / span;
  if (Math.abs(factor - 1) < 0.015) {
    return repairTinyWindows(cues, audioDurationSec);
  }

  const scaled = cues.map((cue) => {
    const words = (cue.words || []).map((word) => {
      let start = scalePoint(word.start, factor, audioDurationSec);
      let end = scalePoint(word.end, factor, audioDurationSec);
      if (end <= start) end = Math.min(audioDurationSec, start + 0.08);
      return { ...word, start, end };
    });
    let start = words.length
      ? words[0].start
      : scalePoint(cue.start, factor, audioDurationSec);
    let end = words.length
      ? words[words.length - 1].end
      : scalePoint(cue.end, factor, audioDurationSec);
    if (end <= start) end = Math.min(audioDurationSec, start + 0.2);
    return { ...cue, start, end, words: words.length ? words : cue.words };
  });

  return repairTinyWindows(scaled, audioDurationSec);
}

function repairTinyWindows(cues: LyricCue[], audioDurationSec: number): LyricCue[] {
  return cues.map((cue, index) => {
    const nextStart =
      index + 1 < cues.length ? cues[index + 1].start : audioDurationSec - 0.05;
    let start = cue.start;
    let end = cue.end;
    if (end <= start + 0.05) {
      end = Math.max(start + 0.25, Math.min(nextStart - 0.02, start + 2.5));
    }
    const words = (cue.words || []).slice();
    if (words.length) {
      for (let i = 0; i < words.length; i += 1) {
        const w = words[i];
        const wNext = i + 1 < words.length ? words[i + 1].start : end;
        let wEnd = w.end;
        if (wEnd <= w.start + 0.02) {
          wEnd = Math.max(w.start + 0.06, Math.min(wNext - 0.01, w.start + 0.45));
        }
        words[i] = { ...w, end: wEnd };
      }
      start = words[0].start;
      end = Math.max(end, words[words.length - 1].end);
    }
    return { ...cue, start, end, words: words.length ? words : cue.words };
  });
}
