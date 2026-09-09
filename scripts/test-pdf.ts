import { writeFileSync } from "node:fs";
import { lyricPdf } from "../lib/pdf";
import type { SongJob } from "../lib/types";

async function main() {
  const job: SongJob = {
    id: "pdf-test",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "delivered",
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
    lyrics: "Verse 1\nYellow backpack by the door\n\nChorus\nThis is a song I made for Maya",
    includeLyricPrint: true,
    previewReady: true,
    fullReady: true,
    paidAt: new Date().toISOString(),
    whopPaymentId: "demo",
    checkoutSessionId: null,
  };
  const bytes = await lyricPdf(job);
  const buf = Buffer.from(bytes);
  if (!buf.subarray(0, 4).equals(Buffer.from("%PDF"))) {
    throw new Error("PDF magic missing");
  }
  writeFileSync("/tmp/songsnuggle-lyrics-test.pdf", buf);
  console.log("pdf_ok", buf.length);
}

main();
