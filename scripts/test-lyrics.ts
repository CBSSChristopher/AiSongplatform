import { draftLyrics, resolveLyricProvider } from "../lib/lyrics";
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

process.env.LYRIC_PROVIDER = "template";
if (resolveLyricProvider() !== "template") throw new Error("template provider failed");
delete process.env.LYRIC_PROVIDER;
process.env.OPENAI_API_KEY = "sk-test";
if (resolveLyricProvider() !== "openai") throw new Error("openai provider failed");
delete process.env.OPENAI_API_KEY;
process.env.GROQ_API_KEY = "gsk-test";
if (resolveLyricProvider() !== "groq") throw new Error("groq provider failed");
delete process.env.GROQ_API_KEY;
process.env.ANTHROPIC_API_KEY = "sk-ant-test";
if (resolveLyricProvider() !== "anthropic") throw new Error("anthropic provider failed");

console.log("lyrics ok\n");
console.log(lyrics);
