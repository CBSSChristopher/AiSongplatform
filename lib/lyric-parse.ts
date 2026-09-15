import type { LyricCue } from "./cues";

function sectionOf(header: string): LyricCue["section"] {
  const value = header.toLowerCase();
  if (value.includes("chorus")) return "chorus";
  if (value.includes("bridge")) return "bridge";
  return "verse";
}

export type SungLine = { text: string; section: LyricCue["section"] };

/** Parse lyric script into sung lines (skips section headers). */
export function sungLines(lyrics: string): SungLine[] {
  const lines: SungLine[] = [];
  let section: LyricCue["section"] = "verse";
  for (const raw of lyrics.split("\n")) {
    const line = raw.trim();
    if (!line) continue;
    if (/^(verse|chorus|bridge|final chorus|pre-chorus|outro)\b/i.test(line) && line.length < 48) {
      section = sectionOf(line);
      continue;
    }
    lines.push({ text: line.replace(/^[-*]\s+/, ""), section });
  }
  return lines;
}

export type LyricSectionChunk = {
  section: LyricCue["section"];
  label: string;
  lines: string[];
};

/** Group consecutive sung lines into verse/chorus/bridge chunks for composition plans. */
export function lyricSections(lyrics: string): LyricSectionChunk[] {
  const lines = sungLines(lyrics);
  const chunks: LyricSectionChunk[] = [];
  for (const line of lines) {
    const last = chunks[chunks.length - 1];
    if (last && last.section === line.section) {
      last.lines.push(line.text);
      continue;
    }
    const count = chunks.filter((c) => c.section === line.section).length + 1;
    const label =
      line.section === "chorus"
        ? count > 1
          ? "Final chorus"
          : "Chorus"
        : line.section === "bridge"
          ? "Bridge"
          : `Verse ${count}`;
    chunks.push({ section: line.section, label, lines: [line.text] });
  }
  return chunks;
}

export function splitSyllables(word: string): string[] {
  const core = word.replace(/[^A-Za-z']/g, "");
  if (!core) return [word];
  const lower = core.toLowerCase();
  const isVowel = (index: number) => {
    const ch = lower[index];
    if ("aeiou".includes(ch)) return true;
    if (ch === "y") {
      const prev = index > 0 ? lower[index - 1] : "";
      return !"aeiou".includes(prev);
    }
    return false;
  };
  const groups: { start: number; end: number }[] = [];
  let i = 0;
  while (i < lower.length) {
    if (isVowel(i)) {
      const start = i;
      while (i < lower.length && isVowel(i)) i += 1;
      groups.push({ start, end: i });
    } else {
      i += 1;
    }
  }
  if (groups.length <= 1) return [core];
  const cuts = [0];
  for (let g = 1; g < groups.length; g += 1) {
    const consonants = groups[g].start - groups[g - 1].end;
    const onset = consonants <= 1 ? consonants : 1;
    cuts.push(groups[g].start - onset);
  }
  const parts: string[] = [];
  for (let c = 0; c < cuts.length; c += 1) {
    const end = c === cuts.length - 1 ? core.length : cuts[c + 1];
    const part = core.slice(cuts[c], end);
    if (part) parts.push(part);
  }
  return parts.length ? parts : [core];
}

/** Lowercase alphanumeric content tokens (drop tiny stopwords for match checks). */
const STOP = new Set([
  "a", "an", "the", "and", "or", "to", "of", "in", "on", "at", "for", "is", "it",
  "i", "im", "i'm", "you", "your", "my", "me", "we", "us", "be", "so", "as",
]);

export function normalizeLyricToken(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/[^a-z0-9']/g, "")
    .replace(/^'+|'+$/g, "");
}

export function contentWords(text: string): string[] {
  return text
    .split(/\s+/)
    .map(normalizeLyricToken)
    .filter((w) => w.length >= 2 && !STOP.has(w));
}

/**
 * Join REAL sung word stamps into a searchable blob.
 * Cue shells with zero words (paid fc06 Mayan / high-road) must NOT count as sung
 * via cue.text fallback — that is how unsung script lines leaked onto display.
 */
export function sungWordBlobFromCues(
  cues: { text?: string; words?: { text: string }[] }[],
): string {
  const parts: string[] = [];
  for (const c of cues || []) {
    for (const w of c.words || []) {
      parts.push(normalizeLyricToken(w.text));
    }
  }
  return parts.filter(Boolean).join(" ");
}

/** Cue lines that have display text but no word stamps (unsung shells). */
export function emptyWordCueTexts(
  cues: { text?: string; words?: { text: string }[] }[],
): string[] {
  const out: string[] = [];
  for (const c of cues || []) {
    const text = (c.text || "").trim();
    if (!text) continue;
    if (!(c.words || []).length) out.push(text);
  }
  return out;
}

/**
 * Display lyric lines that are missing from sung word stamps.
 * A line is missing when <50% of its content words appear in the sung blob.
 * Used to refuse publishing script lines EL never sang (fc06 fearlessly/Japan RCA).
 */
export function displayLinesMissingFromSung(
  displayLyrics: string,
  cues: { text?: string; words?: { text: string }[] }[],
): string[] {
  const blob = sungWordBlobFromCues(cues);
  const emptyShells = new Set(
    emptyWordCueTexts(cues).map((t) =>
      contentWords(t).join(" "),
    ),
  );
  if (!blob) {
    return sungLines(displayLyrics || "").map((l) => l.text);
  }
  const blobSet = new Set(blob.split(/\s+/).filter(Boolean));
  const missing: string[] = [];
  for (const line of sungLines(displayLyrics || "")) {
    const words = contentWords(line.text);
    if (words.length < 2) continue;
    const key = words.join(" ");
    // Explicit unsung cue shell (zero word stamps) — always missing.
    if (emptyShells.has(key)) {
      missing.push(line.text);
      continue;
    }
    const hits = words.filter((w) => blobSet.has(w)).length;
    if (hits / words.length < 0.5) missing.push(line.text);
  }
  // Also surface empty-word cue texts even if not in displayLyrics string.
  for (const shell of emptyWordCueTexts(cues)) {
    if (!missing.includes(shell)) missing.push(shell);
  }
  return missing;
}

/** Rebuild display lyrics from sung cue texts (never show unsung script / empty shells). */
export function lyricsFromSungCues(
  cues: { text?: string; words?: { text: string }[] }[],
): string {
  return (cues || [])
    .filter((c) => (c.words || []).length > 0)
    .map((c) => (c.text || "").trim())
    .filter(Boolean)
    .join("\n");
}

/** Drop cue shells with zero word stamps so UI never lists unsung lines. */
export function cuesWithSungWordsOnly<T extends { words?: { text: string }[] }>(
  cues: T[],
): T[] {
  return (cues || []).filter((c) => (c.words || []).length > 0);
}
