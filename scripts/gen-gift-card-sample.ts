#!/usr/bin/env npx tsx
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { giftCardPdf, giftCardQrPng, GIFT_CARD_QR_ID } from "../lib/gift-card";
import type { SongJob } from "../lib/types";

async function main() {
  const job: SongJob = {
    id: "sample-gift-card-qr",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    status: "delivered",
    recipientName: "Malia",
    namePronunciation: "mah-LEE-yah",
    relationship: "daughter",
    email: "hello@songsnuggle.com",
    marketingOptIn: false,
    genre: "pop",
    voice: "female",
    qualities: "Warm, curious, brave",
    memories: "Sunday pancakes",
    occasion: "birthday",
    senderName: "Dad",
    message: "Happy birthday. I hope this song finds you on a quiet morning and makes you smile.",
    songTitle: "For Malia, Today",
    lyrics: "",
    lyricCues: [],
    includeLyricPrint: false,
    previewReady: true,
    previewGate: null,
    listenCompletedAt: null,
    fullReady: true,
    paidAt: new Date().toISOString(),
    audioDurationSec: 120,
    masterSourceId: null,
    masterFingerprint: null,
    whopPaymentId: "sample",
    checkoutSessionId: null,
  };

  const outDir = path.join(process.cwd(), "screenshots", "gift-card");
  mkdirSync(outDir, { recursive: true });

  const pdf = Buffer.from(await giftCardPdf(job, "https://songsnuggle.com/song/sample-gift-card-qr"));
  const qr = await giftCardQrPng(job.id, "https://songsnuggle.com/song/sample-gift-card-qr");
  const pdfPath = path.join(outDir, "ss-gift-card-qr-sample.pdf");
  const qrPath = path.join(outDir, "ss-gift-card-qr-sample.png");
  writeFileSync(pdfPath, pdf);
  writeFileSync(qrPath, qr);

  if (!pdf.subarray(0, 4).equals(Buffer.from("%PDF"))) {
    throw new Error("PDF magic missing");
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        id: GIFT_CARD_QR_ID,
        pdfPath,
        qrPath,
        pdfBytes: pdf.length,
        qrBytes: qr.length,
        unlockUrl: "https://songsnuggle.com/song/sample-gift-card-qr",
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
