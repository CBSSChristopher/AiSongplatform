import { readFile } from "node:fs/promises";
import path from "node:path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import QRCode from "qrcode";
import { brand } from "./brand";
import type { SongJob } from "./types";
import { songUrl } from "./email";
import { cloudflareBindings } from "./cloudflare";

import { GIFT_CARD_QR_ID } from "./gift-card-id";
export { GIFT_CARD_QR_ID };

export function giftCardUnlockUrl(jobId: string) {
  return songUrl(jobId);
}

export function giftPhotoKey(jobId: string) {
  return `gift-photo:${jobId}`;
}

export function giftPhotoPath(jobId: string) {
  return path.join(process.cwd(), "data", "gift-photos", `${jobId}.bin`);
}

export async function writeGiftPhoto(jobId: string, bytes: Uint8Array, contentType: string) {
  const env = await cloudflareBindings();
  const header = new TextEncoder().encode(`${contentType}\n`);
  const payload = new Uint8Array(header.length + bytes.length);
  payload.set(header, 0);
  payload.set(bytes, header.length);
  if (env?.AUDIO) {
    await env.AUDIO.put(giftPhotoKey(jobId), payload);
    return;
  }
  const { mkdir, writeFile } = await import("node:fs/promises");
  const file = giftPhotoPath(jobId);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, payload);
}

export async function readGiftPhoto(
  jobId: string,
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const env = await cloudflareBindings();
  let raw: Uint8Array | null = null;
  if (env?.AUDIO) {
    const value = await env.AUDIO.get(giftPhotoKey(jobId), { type: "arrayBuffer" });
    raw = value ? new Uint8Array(value) : null;
  } else {
    try {
      raw = new Uint8Array(await readFile(giftPhotoPath(jobId)));
    } catch {
      raw = null;
    }
  }
  if (!raw || raw.length < 4) return null;
  const nl = raw.indexOf(10); // \n
  if (nl <= 0 || nl > 64) return null;
  const contentType = new TextDecoder().decode(raw.subarray(0, nl)).trim() || "image/jpeg";
  return { bytes: raw.subarray(nl + 1), contentType };
}

function pdfSafe(value: string) {
  return value.replace(/[^\t\n\r\x20-\x7e]/g, (char) => {
    const map: Record<string, string> = {
      "\u2018": "'",
      "\u2019": "'",
      "\u201c": '"',
      "\u201d": '"',
      "\u2013": "-",
      "\u2014": "-",
      "\u2026": "...",
      "\u2661": "",
      "\u2665": "",
    };
    return map[char] ?? " ";
  });
}

function wrap(text: string, width: number) {
  const lines: string[] = [];
  for (const raw of pdfSafe(text).split("\n")) {
    const line = raw.trim();
    if (!line) {
      lines.push("");
      continue;
    }
    let current = "";
    for (const word of line.split(/\s+/)) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > width) {
        if (current) lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

async function loadMoodImage(): Promise<{ bytes: Uint8Array; kind: "png" | "jpg" } | null> {
  try {
    const bytes = new Uint8Array(
      await readFile(path.join(process.cwd(), "public", "brand", "mood-listen.png")),
    );
    // Asset may be JPEG bytes saved with a .png name.
    if (bytes[0] === 0x89 && bytes[1] === 0x50) return { bytes, kind: "png" };
    if (bytes[0] === 0xff && bytes[1] === 0xd8) return { bytes, kind: "jpg" };
    return { bytes, kind: "jpg" };
  } catch {
    return null;
  }
}

/**
 * Printable 5x7 gift card PDF — linen / forest / copper.
 * Photo (optional upload or soft brand mood) + message + QR deep-link to /song/[id].
 */
export async function giftCardPdf(job: SongJob, unlockUrl = giftCardUnlockUrl(job.id)) {
  const doc = await PDFDocument.create();
  // 5" x 7" at 72 dpi
  const width = 360;
  const height = 504;
  const page = doc.addPage([width, height]);

  const linen = rgb(0.957, 0.937, 0.894);
  const card = rgb(1, 0.98, 0.949);
  const forest = rgb(0.106, 0.165, 0.141);
  const muted = rgb(0.357, 0.404, 0.373);
  const copper = rgb(0.706, 0.325, 0.165);
  const line = rgb(0.89, 0.847, 0.776);
  const forestSoft = rgb(0.933, 0.953, 0.933);

  page.drawRectangle({ x: 0, y: 0, width, height, color: linen });
  page.drawRectangle({
    x: 14,
    y: 14,
    width: width - 28,
    height: height - 28,
    color: card,
    borderColor: line,
    borderWidth: 1,
  });

  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const sans = await doc.embedFont(StandardFonts.Helvetica);

  page.drawText(brand.name, {
    x: 32,
    y: height - 42,
    size: 11,
    font: serifBold,
    color: copper,
  });
  page.drawText(brand.tagline, {
    x: 32,
    y: height - 56,
    size: 8,
    font: sans,
    color: muted,
  });

  // Photo frame
  const photoX = 32;
  const photoY = height - 250;
  const photoW = width - 64;
  const photoH = 168;
  page.drawRectangle({
    x: photoX,
    y: photoY,
    width: photoW,
    height: photoH,
    color: forestSoft,
    borderColor: line,
    borderWidth: 1,
  });

  const uploaded = await readGiftPhoto(job.id);
  let drewPhoto = false;
  if (uploaded?.bytes?.length) {
    try {
      const img =
        uploaded.contentType.includes("png")
          ? await doc.embedPng(uploaded.bytes)
          : await doc.embedJpg(uploaded.bytes);
      const scale = Math.min(photoW / img.width, photoH / img.height);
      const iw = img.width * scale;
      const ih = img.height * scale;
      page.drawImage(img, {
        x: photoX + (photoW - iw) / 2,
        y: photoY + (photoH - ih) / 2,
        width: iw,
        height: ih,
      });
      drewPhoto = true;
    } catch {
      drewPhoto = false;
    }
  }
  if (!drewPhoto) {
    const mood = await loadMoodImage();
    if (mood) {
      try {
        const img =
          mood.kind === "png" ? await doc.embedPng(mood.bytes) : await doc.embedJpg(mood.bytes);
        const scale = Math.max(photoW / img.width, photoH / img.height);
        const iw = img.width * scale;
        const ih = img.height * scale;
        page.drawImage(img, {
          x: photoX + (photoW - iw) / 2,
          y: photoY + (photoH - ih) / 2,
          width: iw,
          height: ih,
        });
        // soft linen scrim so text stays gift-like
        page.drawRectangle({
          x: photoX,
          y: photoY,
          width: photoW,
          height: 36,
          color: rgb(0.106, 0.165, 0.141),
          opacity: 0.28,
        });
        drewPhoto = true;
      } catch {
        drewPhoto = false;
      }
    }
  }
  if (!drewPhoto) {
    const initial = pdfSafe((job.recipientName || "?").trim().charAt(0).toUpperCase() || "?");
    page.drawText(initial, {
      x: photoX + photoW / 2 - 14,
      y: photoY + photoH / 2 - 18,
      size: 48,
      font: serifBold,
      color: copper,
    });
  }

  const written = pdfSafe((job.recipientName || "someone special").trim());
  const from = pdfSafe((job.senderName || "").trim());
  const title =
    pdfSafe((job.songTitle || "").trim()) || `A song for ${written}`;

  let y = photoY - 22;
  page.drawText(title, {
    x: 32,
    y,
    size: 16,
    font: serifBold,
    color: forest,
  });
  y -= 16;
  page.drawText(`For ${written}${from ? `  ·  From ${from}` : ""}`, {
    x: 32,
    y,
    size: 9,
    font: sans,
    color: muted,
  });
  y -= 18;

  const message =
    (job.message || "").trim() ||
    "A keepsake song — scan the code whenever you want to hear it again.";
  for (const lineText of wrap(message, 46).slice(0, 5)) {
    page.drawText(lineText || " ", {
      x: 32,
      y,
      size: 10,
      font: serif,
      color: forest,
    });
    y -= 13;
  }

  // QR bottom-right
  const qrPng = await QRCode.toBuffer(unlockUrl, {
    type: "png",
    width: 180,
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#1b2a24", light: "#fffaf2" },
  });
  const qrImage = await doc.embedPng(qrPng);
  const qrSize = 88;
  const qrX = width - 32 - qrSize;
  const qrY = 28;
  page.drawRectangle({
    x: qrX - 6,
    y: qrY - 6,
    width: qrSize + 12,
    height: qrSize + 12,
    color: card,
    borderColor: copper,
    borderWidth: 1,
  });
  page.drawImage(qrImage, { x: qrX, y: qrY, width: qrSize, height: qrSize });

  page.drawText("Scan to open", {
    x: 32,
    y: qrY + qrSize - 8,
    size: 8,
    font: sans,
    color: copper,
  });
  page.drawText("their private song", {
    x: 32,
    y: qrY + qrSize - 20,
    size: 9,
    font: serifBold,
    color: forest,
  });
  page.drawText("Tuck this card in the box or bag.", {
    x: 32,
    y: qrY + 18,
    size: 8,
    font: sans,
    color: muted,
  });
  page.drawText(GIFT_CARD_QR_ID, {
    x: 32,
    y: qrY + 6,
    size: 6,
    font: sans,
    color: line,
  });

  return doc.save();
}

/** Standalone QR PNG (deep-link) for bag stickers / proofs. */
export async function giftCardQrPng(jobId: string, unlockUrl = giftCardUnlockUrl(jobId)) {
  return QRCode.toBuffer(unlockUrl, {
    type: "png",
    width: 512,
    margin: 2,
    errorCorrectionLevel: "M",
    color: { dark: "#1b2a24", light: "#f4efe4" },
  });
}
