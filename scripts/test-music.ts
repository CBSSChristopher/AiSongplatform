import { splitSyllables, sungLines, writePreviewAudio } from "../lib/music";
import { readAudio } from "../lib/store";
import type { SongJob } from "../lib/types";

async function main() {
  process.env.MUSIC_PROVIDER = "synth";
  const job: SongJob = {
    id: "music-test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "preview",
    recipientName: "Maya",
    namePronunciation: "",
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
    songTitle: "",
    lyrics: "Verse 1\nYellow backpack by the door\nYou walked out brave\n\nChorus\nThis is a song I made for Maya\nPlay it when you need me",
    lyricCues: [],
    includeLyricPrint: false,
    previewReady: false,
  listenCompletedAt: null,
    fullReady: false,
    paidAt: null,
    whopPaymentId: null,
    checkoutSessionId: null,
  };
  if (sungLines(job.lyrics).length !== 4) throw new Error("headers should not be sung");
  if (splitSyllables("Maya").length < 2) throw new Error("Maya should split into syllables");

  const cues = await writePreviewAudio(job);
  if (cues.length < 4) throw new Error(`expected sung lines, got ${cues.length}`);
  if (!cues.some((cue) => cue.text.includes("Maya"))) throw new Error("chorus line missing");
  if (cues[0].end <= cues[0].start) throw new Error("cue timing inverted");
  for (let i = 1; i < cues.length; i += 1) {
    if (cues[i].start + 0.001 < cues[i - 1].start) throw new Error("cues went backwards");
  }
  const maya = cues.find((cue) => cue.text.includes("Maya"));
  if (!maya?.words?.some((word) => word.text.includes("Maya"))) {
    throw new Error("Maya word cue missing");
  }
  for (const cue of cues) {
    if (!cue.words?.length) throw new Error(`line missing word cues: ${cue.text}`);
    if (cue.words[0].start < cue.start - 0.01) throw new Error("word started before line");
    const last = cue.words[cue.words.length - 1];
    if (last.end > cue.end + 0.05) throw new Error("word ran past line");
  }
  const bytes = await readAudio(job.id, "preview");
  if (!bytes || bytes.length < 1000) throw new Error("wav missing");
  const wav = Buffer.from(bytes);
  if (String.fromCharCode(wav[0], wav[1], wav[2], wav[3]) !== "RIFF") {
    throw new Error("wav magic missing");
  }
  const sampleRate = wav.readUInt32LE(24);
  const dataBytes = wav.subarray(44);
  const first = maya ?? cues[0];
  const start = Math.floor(first.start * sampleRate) * 2;
  const end = Math.min(dataBytes.length, Math.floor(first.end * sampleRate) * 2);
  let energy = 0;
  let count = 0;
  for (let i = start; i + 1 < end; i += 2) {
    const sample = dataBytes.readInt16LE(i);
    energy += sample * sample;
    count += 1;
  }
  const rms = Math.sqrt(energy / Math.max(count, 1)) / 32767;
  if (rms < 0.02) throw new Error(`sung line too quiet: ${rms}`);

  const longJob: SongJob = {
    ...job,
    id: "music-test-long",
    lyrics: `Verse 1
${"Filler line about morning light\n".repeat(12)}Chorus
This is a song I made for Maya
Play it when you need me`,
  };
  const longCues = await writePreviewAudio(longJob);
  if (!longCues.some((cue) => cue.text.includes("Maya"))) {
    throw new Error("preview dropped the named chorus line");
  }

  console.log("music_ok", cues.length, bytes.length, rms.toFixed(3), "long", longCues.length);
}

main();
