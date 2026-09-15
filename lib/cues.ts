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

/**
 * Resolve TRUE playable duration for lyric fit.
 * Prefer encodedSeconds (WAV PCM / job metadata). Never trust inflated
 * HTMLMediaElement / lying Xing alone when it disagrees with cue span or encode.
 */
export function resolvePlayableDurationSec(input: {
  encodedSec?: number | null;
  mediaSec?: number | null;
  cueEndSec?: number | null;
  slackSec?: number;
}): number {
  const slack = input.slackSec ?? 2;
  const encoded =
    typeof input.encodedSec === "number" && input.encodedSec > 1
      ? input.encodedSec
      : 0;
  const media =
    typeof input.mediaSec === "number" &&
    Number.isFinite(input.mediaSec) &&
    input.mediaSec > 1
      ? input.mediaSec
      : 0;
  const cueEnd =
    typeof input.cueEndSec === "number" && input.cueEndSec > 0.5
      ? input.cueEndSec
      : 0;

  if (encoded > 1) return encoded;

  // Media and cues agree → trust media.
  if (media > 1 && cueEnd > 0.5 && Math.abs(media - cueEnd) <= slack) {
    return media;
  }

  // Inflated media (classic Xing lie) vs healthy cue span → keep cue timeline.
  if (media > 1 && cueEnd > 0.5 && media > cueEnd + slack) {
    return cueEnd;
  }

  // Media shorter than cues → fit down to media (truncated / preview edge).
  if (media > 1 && cueEnd > 0.5 && cueEnd > media + slack) {
    return media;
  }

  if (media > 1) return media;
  if (cueEnd > 0.5) return cueEnd;
  return 0;
}

/** Word stamps look collapsed / wrong-unit → prefer line-level highlight. */
export function wordsLookUnreliable(cue: LyricCue): boolean {
  const words = cue.words || [];
  if (words.length < 2) return false;
  const spans = words.map((w) => Math.max(0, w.end - w.start));
  const tiny = spans.filter((s) => s < 0.02).length;
  if (tiny >= Math.ceil(words.length * 0.4)) return true;
  const keys = new Set(
    words.map((w) => `${w.start.toFixed(3)}-${w.end.toFixed(3)}`),
  );
  if (keys.size < words.length * 0.5) return true;
  const starts = words.map((w) => w.start);
  const spread = Math.max(...starts) - Math.min(...starts);
  if (spread < 0.05 && words.length >= 3) return true;
  return false;
}

/**
 * Active lyric index without dead zones between cues.
 * Last cue whose start <= t (stays on last line through gaps and outro).
 */
export function activeCueIndex(cues: LyricCue[], timeSec: number): number {
  if (!cues.length) return -1;
  let idx = -1;
  for (let i = 0; i < cues.length; i += 1) {
    if (cues[i]!.start <= timeSec) idx = i;
    else break;
  }
  return idx;
}

function scalePoint(t: number, factor: number, durationSec: number) {
  const next = t * factor;
  return Math.max(0, Math.min(durationSec, next));
}

/**
 * Proportionally fit cue + word stamps onto real audio duration.
 * Seals inter-cue gaps so highlight never goes blank between lines.
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
    return sealCueGaps(cues, audioDurationSec);
  }

  const scaled = cues.map((cue) => {
    const words = (cue.words || []).map((word) => {
      let start = scalePoint(word.start, factor, audioDurationSec);
      let end = scalePoint(word.end, factor, audioDurationSec);
      if (end <= start) end = Math.min(audioDurationSec, start + 0.08);
      return { ...word, start, end };
    });
    let start = words.length
      ? words[0]!.start
      : scalePoint(cue.start, factor, audioDurationSec);
    let end = words.length
      ? words[words.length - 1]!.end
      : scalePoint(cue.end, factor, audioDurationSec);
    if (end <= start) end = Math.min(audioDurationSec, start + 0.2);
    return { ...cue, start, end, words: words.length ? words : cue.words };
  });

  return sealCueGaps(scaled, audioDurationSec);
}

/** Extend each cue end to the next start (and last toward duration). */
export function sealCueGaps(
  cues: LyricCue[],
  audioDurationSec: number,
): LyricCue[] {
  if (!cues.length) return cues;
  return cues.map((cue, index) => {
    const nextStart =
      index + 1 < cues.length ? cues[index + 1]!.start : audioDurationSec;
    let start = cue.start;
    let end = cue.end;

    if (end <= start + 0.05) {
      end = Math.max(start + 0.25, Math.min(nextStart - 0.02, start + 2.5));
    }
    // Close dead zone to next cue (or track end).
    if (nextStart > start) {
      end = Math.max(end, Math.min(nextStart, Math.max(start + 0.05, nextStart)));
    }

    const unreliable = wordsLookUnreliable(cue);
    const words = unreliable ? [] : (cue.words || []).slice();
    if (words.length) {
      for (let i = 0; i < words.length; i += 1) {
        const w = words[i]!;
        const wNext = i + 1 < words.length ? words[i + 1]!.start : end;
        let wEnd = w.end;
        if (wEnd <= w.start + 0.02) {
          wEnd = Math.max(w.start + 0.06, Math.min(wNext - 0.01, w.start + 0.45));
        }
        words[i] = { ...w, end: wEnd };
      }
      start = words[0]!.start;
      end = Math.max(end, words[words.length - 1]!.end);
    }

    return {
      ...cue,
      start,
      end,
      words: unreliable ? undefined : words.length ? words : cue.words,
    };
  });
}
