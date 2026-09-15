import type { OccasionId } from "./brand";

/** Soft gift-voice title suggestions — never “AI-y”. */
export function suggestedSongTitles(input: {
  recipientName?: string;
  occasion?: string;
  relationship?: string;
}): string[] {
  const name = (input.recipientName || "").trim().split(/\s+/)[0] || "";
  const occasion = (input.occasion || "just-because") as OccasionId | string;
  const out: string[] = [];

  if (name) {
    if (occasion === "birthday") {
      out.push(`Happy Birthday, ${name}`);
      out.push(`For ${name}, Today`);
    } else if (occasion === "anniversary") {
      out.push(`Still Us, ${name}`);
      out.push(`All These Years`);
    } else if (occasion === "wedding") {
      out.push(`Our Day, ${name}`);
      out.push(`Begin With You`);
    } else if (occasion === "thank-you") {
      out.push(`Thank You, ${name}`);
      out.push(`Because of You`);
    } else if (occasion === "in-memory") {
      out.push(`Remembering ${name}`);
      out.push(`Kept Close`);
    } else {
      out.push(`A Song for ${name}`);
      out.push(`Just for ${name}`);
    }
  } else {
    out.push("A Song for You");
    out.push("Made for Keeping");
  }

  if (!out.includes("Keep This Close")) out.push("Keep This Close");
  return out.slice(0, 3);
}

export function normalizeSongTitle(raw: string): string {
  return String(raw || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 80);
}
