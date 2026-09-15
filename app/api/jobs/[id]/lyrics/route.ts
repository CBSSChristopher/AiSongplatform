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
  let regenerate = false;
  try {
    const body = (await request.json()) as { lyrics?: string; regenerate?: boolean };
    if (body.regenerate === true) {
      regenerate = true;
    } else if (typeof body.lyrics === "string" && body.lyrics.trim()) {
      lyrics = body.lyrics.trim().slice(0, 5000);
    }
  } catch {
    lyrics = "";
  }

  if (!lyrics) {
    try {
      lyrics = await generateLyrics(job, { fresh: regenerate });
    } catch (error) {
      console.error("[lyrics-route]", error);
      const message =
        error instanceof Error ? error.message : "Could not generate lyrics.";
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }

  const next = await updateJob(id, {
    lyrics,
    status: "lyrics",
    previewReady: false,
    listenCompletedAt: null,
    fullReady: false,
  });

  return NextResponse.json({ job: next ? publicJob(next) : publicJob(job) });
}
