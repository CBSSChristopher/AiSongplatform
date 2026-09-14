import { writePreviewAudio } from "../lib/music";
import { readAudio } from "../lib/store";
import type { SongJob } from "../lib/types";

async function main() {
  const job: SongJob = {
    id: "music-test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "preview",
    recipientName: "Maya",
    relationship: "daughter",
    email: "a@b.c",
    marketingOptIn: false,
    genre: "acoustic",
    voice: "female",
    qualities: "",
    memories: "",
    occasion: "just-because",
    senderName: "Dad",
    message: "",
    lyrics: "Verse 1\nYellow backpack by the door\nYou walked out brave\n\nChorus\nThis is a song I made for Maya\nPlay it when you need me",
    lyricCues: [],
    includeLyricPrint: false,
    previewReady: false,
    fullReady: false,
    paidAt: null,
    whopPaymentId: null,
    checkoutSessionId: null,
  };
  const cues = await writePreviewAudio(job);
  if (cues.length < 4) throw new Error(`expected sung lines, got ${cues.length}`);
  if (!cues.some((cue) => cue.text.includes("Maya"))) throw new Error("chorus line missing");
  if (cues[0].end <= cues[0].start) throw new Error("cue timing inverted");
  for (let i = 1; i < cues.length; i += 1) {
    if (cues[i].start + 0.001 < cues[i - 1].start) throw new Error("cues went backwards");
  }
  const bytes = await readAudio(job.id, "preview");
  if (!bytes || bytes.length < 1000) throw new Error("wav missing");
  if (String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]) !== "RIFF") {
    throw new Error("wav magic missing");
  }
  console.log("music_ok", cues.length, bytes.length);
}

main();
