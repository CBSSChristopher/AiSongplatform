import type { SongJob } from "./types";
import { relationships, occasions, genres } from "./brand";

function labelFor(
  list: readonly { id: string; label: string }[],
  id: string,
  fallback: string,
) {
  return list.find((item) => item.id === id)?.label ?? fallback;
}

function clean(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function draftLyrics(job: SongJob): string {
  const name = clean(job.recipientName) || "you";
  const who = labelFor(relationships, job.relationship, "someone I love");
  const occasion = labelFor(occasions, job.occasion, "this moment");
  const qualities = clean(job.qualities) || "the way you show up";
  const memories = clean(job.memories) || "the ordinary days that became our favorite ones";
  const message = clean(job.message) || "I hope you hear how much you mean to me";
  const from = clean(job.senderName);
  const fromLine = from ? `From ${from}` : "";

  return [
    `Verse 1`,
    `${name}, I keep a list of little things`,
    `The ${qualities.toLowerCase()}`,
    `I think of you on quiet evenings`,
    `And ${memories.toLowerCase()}`,
    ``,
    `Chorus`,
    `This is a song I made for ${name}`,
    `A keepsake for ${who.toLowerCase()}, for ${occasion.toLowerCase()}`,
    `If a melody could hold a person`,
    `It would sound like this`,
    ``,
    `Verse 2`,
    `I wrote it down the way I'd say it`,
    `${message}`,
    `No perfect rhyme, just what is true`,
    `A gift you can play when you need to`,
    ``,
    `Bridge`,
    `Keep this close when the room is still`,
    `A song they can keep, a love you can hear`,
    fromLine,
    ``,
    `Final chorus`,
    `This is a song I made for ${name}`,
    `Play it again. It's yours.`,
  ]
    .filter((line) => line !== undefined)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function generateLyrics(job: SongJob): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

  if (!apiKey) return draftLyrics(job);

  const prompt = [
    "Write original song lyrics for a personalized gift.",
    "Use the details below. Do not invent last names, medical facts, or tragedies.",
    "Keep it warm, specific, and singable. English only.",
    "Structure: Verse 1, Chorus, Verse 2, Bridge, Final chorus.",
    "Put the recipient first name in the chorus.",
    `Recipient name: ${job.recipientName}`,
    `Relationship: ${labelFor(relationships, job.relationship, "loved one")}`,
    `Occasion: ${labelFor(occasions, job.occasion, "just because")}`,
    `Genre: ${labelFor(genres, job.genre, "acoustic")}`,
    `Qualities: ${job.qualities || "none given"}`,
    `Memory: ${job.memories || "none given"}`,
    `Message: ${job.message || "none given"}`,
    `From: ${job.senderName || "unsigned"}`,
  ].join("\n");

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model,
      temperature: 0.8,
      messages: [
        {
          role: "system",
          content: "You write short, personal gift-song lyrics. No copyrighted songs.",
        },
        { role: "user", content: prompt },
      ],
    }),
  });

  if (!response.ok) {
    return draftLyrics(job);
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  return content || draftLyrics(job);
}
