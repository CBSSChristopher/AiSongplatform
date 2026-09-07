export type OccasionId =
  | "family"
  | "birthday"
  | "wedding"
  | "faith"
  | "memorial"
  | "friendship";

export type MoodId = "gentle" | "uplifting" | "hymn" | "lullaby" | "anthem";

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
  progression: number[];
  waveform: "sine" | "triangle";
}

export interface Catalog {
  occasions: OccasionMeta[];
  moods: MoodMeta[];
}

export interface SongSection {
  label: string;
  lines: string[];
}

export interface GeneratedSong {
  id: string;
  title: string;
  occasion: OccasionId;
  mood: MoodId;
  recipient: string;
  sender?: string;
  tempoBpm: number;
  durationSeconds: number;
  sections: SongSection[];
  audioUrl: string;
  createdAt: string;
}

export interface SongRequest {
  occasion: OccasionId;
  mood: MoodId;
  recipient: string;
  sender?: string;
  keywords?: string[];
  message?: string;
}
