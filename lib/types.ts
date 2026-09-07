import type { GenreId, OccasionId, RelationshipId, VoiceId } from "./brand";

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
  lyrics: string;
  includeLyricPrint: boolean;
  previewReady: boolean;
  fullReady: boolean;
  paidAt: string | null;
  whopPaymentId: string | null;
  checkoutSessionId: string | null;
};

export type PublicSongJob = Omit<SongJob, "whopPaymentId" | "checkoutSessionId">;
