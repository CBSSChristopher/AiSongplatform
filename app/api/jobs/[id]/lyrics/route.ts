import { NextResponse } from "next/server";
import { generateLyrics } from "@/lib/lyrics";
import { getJob, publicJob, updateJob } from "@/lib/store";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }

  let lyrics = "";
  try {
    const body = (await request.json()) as { lyrics?: string };
    if (typeof body.lyrics === "string" && body.lyrics.trim()) {
      lyrics = body.lyrics.trim().slice(0, 5000);
    }
  } catch {
    lyrics = "";
  }

  if (!lyrics) {
    lyrics = await generateLyrics(job);
  }

  const next = await updateJob(id, {
    lyrics,
    status: "lyrics",
    previewReady: false,
    fullReady: false,
  });

  return NextResponse.json({ job: next ? publicJob(next) : publicJob(job) });
}
