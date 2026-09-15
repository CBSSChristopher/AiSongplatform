import type { GenreId, OccasionId, RelationshipId, VoiceId } from "./brand";
import type { LyricCue } from "./cues";

export type JobStatus =
  | "intake"
  | "lyrics"
  | "preview"
  | "checkout"
  | "paid"
  | "delivered";

export type SongJob = {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: JobStatus;
  recipientName: string;
  /** Optional how-to-say-it guide for singing; never used as lyric spelling. */
  namePronunciation: string;
  relationship: RelationshipId | "";
  email: string;
  marketingOptIn: boolean;
  genre: GenreId | "";
  voice: VoiceId | "";
  qualities: string;
  memories: string;
  occasion: OccasionId | "";
  senderName: string;
  message: string;
  /** Optional display title chosen/typed by the giver. */
  songTitle: string;
  lyrics: string;
  lyricCues: LyricCue[];
  includeLyricPrint: boolean;
  previewReady: boolean;
  listenCompletedAt: string | null;
  fullReady: boolean;
  paidAt: string | null;
  whopPaymentId: string | null;
  checkoutSessionId: string | null;
};

export type PublicSongJob = Omit<SongJob, "whopPaymentId" | "checkoutSessionId">;
