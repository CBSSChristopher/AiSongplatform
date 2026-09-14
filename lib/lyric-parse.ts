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
