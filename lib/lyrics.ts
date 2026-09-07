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

export type LyricProvider = "openai" | "anthropic" | "groq" | "template";

export function resolveLyricProvider(): LyricProvider {
  const forced = (process.env.LYRIC_PROVIDER || "").toLowerCase();
  if (forced === "template") return "template";
  if (forced === "openai" || forced === "anthropic" || forced === "groq") {
    return forced;
  }
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.GROQ_API_KEY) return "groq";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "template";
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

function lyricPrompt(job: SongJob) {
  return [
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
}

const systemPrompt = "You write short, personal gift-song lyrics. No copyrighted songs.";

async function generateOpenAICompatible(options: {
  apiKey: string;
  baseUrl: string;
  model: string;
  prompt: string;
}) {
  const response = await fetch(`${options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      temperature: 0.8,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: options.prompt },
      ],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Lyric API ${response.status}: ${detail.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content?.trim();
  if (!content) throw new Error("Lyric API returned empty text.");
  return content;
}

async function generateAnthropic(options: { apiKey: string; model: string; prompt: string }) {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": options.apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model,
      max_tokens: 1200,
      temperature: 0.8,
      system: systemPrompt,
      messages: [{ role: "user", content: options.prompt }],
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Anthropic ${response.status}: ${detail.slice(0, 300)}`);
  }

  const json = (await response.json()) as {
    content?: { type?: string; text?: string }[];
  };
  const content = json.content?.find((block) => block.type === "text")?.text?.trim();
  if (!content) throw new Error("Anthropic returned empty text.");
  return content;
}

export async function generateLyrics(job: SongJob): Promise<string> {
  const provider = resolveLyricProvider();
  const prompt = lyricPrompt(job);

  try {
    if (provider === "openai") {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("OPENAI_API_KEY is missing.");
      return await generateOpenAICompatible({
        apiKey,
        baseUrl: process.env.OPENAI_BASE_URL || "https://api.openai.com/v1",
        model: process.env.OPENAI_MODEL || "gpt-4.1-mini",
        prompt,
      });
    }

    if (provider === "groq") {
      const apiKey = process.env.GROQ_API_KEY || process.env.OPENAI_API_KEY;
      if (!apiKey) throw new Error("GROQ_API_KEY is missing.");
      return await generateOpenAICompatible({
        apiKey,
        baseUrl: process.env.GROQ_BASE_URL || "https://api.groq.com/openai/v1",
        model: process.env.GROQ_MODEL || "llama-3.3-70b-versatile",
        prompt,
      });
    }

    if (provider === "anthropic") {
      const apiKey = process.env.ANTHROPIC_API_KEY;
      if (!apiKey) throw new Error("ANTHROPIC_API_KEY is missing.");
      return await generateAnthropic({
        apiKey,
        model: process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5",
        prompt,
      });
    }
  } catch (error) {
    console.error("[lyrics]", provider, error);
    return draftLyrics(job);
  }

  return draftLyrics(job);
}
