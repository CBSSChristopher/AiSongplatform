import type { MoodId, OccasionId } from "./types.js";

export interface OccasionMeta {
  id: OccasionId;
  label: string;
  emoji: string;
  blurb: string;
}

export interface MoodMeta {
  id: MoodId;
  label: string;
  emoji: string;
  tempoBpm: number;
  scale: "major" | "minor" | "pentatonic";
  /** Chord progression as scale-degree roots (0-indexed). */
  progression: number[];
  waveform: "sine" | "triangle";
}

export const OCCASIONS: OccasionMeta[] = [
  {
    id: "family",
    label: "Family",
    emoji: "\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\u200D\u{1F466}",
    blurb: "A warm tribute to the people who feel like home.",
  },
  {
    id: "birthday",
    label: "Birthday",
    emoji: "\u{1F382}",
    blurb: "Celebrate another year with a personal anthem.",
  },
  {
    id: "wedding",
    label: "Wedding",
    emoji: "\u{1F48D}",
    blurb: "Mark the vows with a song made for two.",
  },
  {
    id: "faith",
    label: "Faith",
    emoji: "\u{1F54A}\uFE0F",
    blurb: "A heartfelt hymn for worship and gratitude.",
  },
  {
    id: "memorial",
    label: "Remembrance",
    emoji: "\u{1F56F}\uFE0F",
    blurb: "A gentle song to honor a cherished memory.",
  },
  {
    id: "friendship",
    label: "Friendship",
    emoji: "\u{1F91D}",
    blurb: "For the friends who became chosen family.",
  },
];

export const MOODS: MoodMeta[] = [
  {
    id: "gentle",
    label: "Gentle",
    emoji: "\u{1F343}",
    tempoBpm: 72,
    scale: "major",
    progression: [0, 5, 3, 4],
    waveform: "sine",
  },
  {
    id: "uplifting",
    label: "Uplifting",
    emoji: "\u2600\uFE0F",
    tempoBpm: 100,
    scale: "major",
    progression: [0, 4, 5, 3],
    waveform: "triangle",
  },
  {
    id: "hymn",
    label: "Hymn",
    emoji: "\u26EA",
    tempoBpm: 66,
    scale: "major",
    progression: [0, 3, 4, 0],
    waveform: "sine",
  },
  {
    id: "lullaby",
    label: "Lullaby",
    emoji: "\u{1F319}",
    tempoBpm: 60,
    scale: "pentatonic",
    progression: [0, 5, 1, 4],
    waveform: "sine",
  },
  {
    id: "anthem",
    label: "Anthem",
    emoji: "\u{1F386}",
    tempoBpm: 116,
    scale: "major",
    progression: [0, 4, 5, 4],
    waveform: "triangle",
  },
];

export function getOccasion(id: string): OccasionMeta | undefined {
  return OCCASIONS.find((o) => o.id === id);
}

export function getMood(id: string): MoodMeta | undefined {
  return MOODS.find((m) => m.id === id);
}
