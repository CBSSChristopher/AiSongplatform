import { NextResponse } from "next/server";
import { createJob, publicJob } from "@/lib/store";
import { relationships, genres, voices, occasions } from "@/lib/brand";

const ids = {
  relationship: new Set(relationships.map((item) => item.id)),
  genre: new Set(genres.map((item) => item.id)),
  voice: new Set(voices.map((item) => item.id)),
  occasion: new Set(occasions.map((item) => item.id)),
};

export async function POST(request: Request) {
  const body = (await request.json()) as Record<string, unknown>;
  const recipientName = String(body.recipientName || "").trim();
  const email = String(body.email || "").trim();
  const relationship = String(body.relationship || "");
  const genre = String(body.genre || "");
  const voice = String(body.voice || "");
  const occasion = String(body.occasion || "");

  if (!recipientName) {
    return NextResponse.json({ error: "A name to sing is required." }, { status: 400 });
  }
  if (!email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required." }, { status: 400 });
  }
  if (!ids.relationship.has(relationship as never)) {
    return NextResponse.json({ error: "Choose who this song is for." }, { status: 400 });
  }
  if (!ids.genre.has(genre as never) || !ids.voice.has(voice as never)) {
    return NextResponse.json({ error: "Choose a sound and a voice." }, { status: 400 });
  }
  if (occasion && !ids.occasion.has(occasion as never)) {
    return NextResponse.json({ error: "Choose a valid occasion." }, { status: 400 });
  }

  const job = await createJob({
    recipientName,
    email,
    relationship: relationship as never,
    genre: genre as never,
    voice: voice as never,
    occasion: (occasion || "just-because") as never,
    qualities: String(body.qualities || "").slice(0, 800),
    memories: String(body.memories || "").slice(0, 1200),
    senderName: String(body.senderName || "").slice(0, 80),
    message: String(body.message || "").slice(0, 1200),
    marketingOptIn: Boolean(body.marketingOptIn),
    status: "intake",
  });

  return NextResponse.json({ job: publicJob(job) });
}
