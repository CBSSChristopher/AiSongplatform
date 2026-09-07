export type OccasionId =
  | "family"
  | "birthday"
  | "wedding"
  | "faith"
  | "memorial"
  | "friendship";

export type MoodId = "gentle" | "uplifting" | "hymn" | "lullaby" | "anthem";

export interface SongRequest {
  occasion: OccasionId;
  mood: MoodId;
  recipient: string;
  sender?: string;
  keywords?: string[];
  message?: string;
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
