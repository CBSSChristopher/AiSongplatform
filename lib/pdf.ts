import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { brand } from "./brand";
import type { SongJob } from "./types";

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
    };
    return map[char] ?? " ";
  });
}

function wrap(text: string, width: number) {
  const lines: string[] = [];
  for (const raw of pdfSafe(text).split("\n")) {
    const line = raw.trimEnd();
    if (!line.trim()) {
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

export async function lyricPdf(job: SongJob) {
  const doc = await PDFDocument.create();
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const ink = rgb(0.106, 0.165, 0.141);
  const muted = rgb(0.357, 0.404, 0.373);
  const copper = rgb(0.706, 0.325, 0.165);
  const paper = rgb(0.957, 0.937, 0.894);

  let page = doc.addPage([612, 792]);
  page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: paper });
  let y = 720;

  const from = job.senderName.trim();
  const title = `A song for ${job.recipientName || "you"}`;
  page.drawText(brand.name, { x: 56, y, size: 12, font: serifBold, color: copper });
  y -= 28;
  page.drawText(pdfSafe(title), { x: 56, y, size: 26, font: serifBold, color: ink });
  y -= 22;
  page.drawText(brand.tagline, { x: 56, y, size: 12, font: serif, color: muted });
  y -= 18;
  if (from) {
    page.drawText(pdfSafe(`From ${from}`), { x: 56, y, size: 12, font: serif, color: muted });
    y -= 18;
  }
  y -= 10;

  for (const line of wrap(job.lyrics || "Lyrics will appear here.", 78)) {
    if (y < 72) {
      page = doc.addPage([612, 792]);
      page.drawRectangle({ x: 0, y: 0, width: 612, height: 792, color: paper });
      y = 720;
    }
    const heading = /^(Verse|Chorus|Bridge|Final chorus)/i.test(line);
    page.drawText(line || " ", {
      x: 56,
      y,
      size: heading ? 13 : 12,
      font: heading ? serifBold : serif,
      color: heading ? copper : ink,
    });
    y -= heading ? 20 : 16;
  }

  page.drawText("Keep this page with the recording. Personal use.", {
    x: 56,
    y: 40,
    size: 9,
    font: serif,
    color: muted,
  });

  return doc.save();
}
