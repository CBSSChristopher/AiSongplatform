import { draftLyrics } from "../lib/lyrics";
import type { SongJob } from "../lib/types";

const job = {
  id: "test",
  createdAt: "",
  updatedAt: "",
  status: "lyrics",
  recipientName: "Maya",
  relationship: "daughter",
  email: "a@b.c",
  marketingOptIn: false,
  genre: "acoustic",
  voice: "female",
  qualities: "brave before school",
  memories: "the yellow backpack on the first day",
  occasion: "birthday",
  senderName: "Dad",
  message: "I am proud of you",
  lyrics: "",
  includeLyricPrint: false,
  previewReady: false,
  fullReady: false,
  paidAt: null,
  whopPaymentId: null,
  checkoutSessionId: null,
} as SongJob;

const lyrics = draftLyrics(job);
if (!lyrics.includes("Maya")) throw new Error("Lyrics must include the name");
if (!lyrics.includes("Chorus")) throw new Error("Lyrics must include a chorus");
console.log("lyrics ok\n");
console.log(lyrics);
