import { NextResponse } from "next/server";
import { meetsListenRequirement } from "@/lib/listen";
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
  if (!job.previewReady) {
    return NextResponse.json({ error: "Create a preview before recording listen proof." }, { status: 400 });
  }

  let listenedSeconds = 0;
  let durationSeconds = 0;
  try {
    const body = (await request.json()) as {
      listenedSeconds?: number;
      durationSeconds?: number;
    };
    listenedSeconds = Number(body.listenedSeconds) || 0;
    durationSeconds = Number(body.durationSeconds) || 0;
  } catch {
    return NextResponse.json({ error: "Invalid listen proof payload." }, { status: 400 });
  }

  if (!meetsListenRequirement(listenedSeconds, durationSeconds)) {
    return NextResponse.json(
      {
        error: "Keep playing the preview — checkout unlocks after real listen progress.",
        listenedSeconds,
        durationSeconds,
      },
      { status: 400 },
    );
  }

  if (job.listenCompletedAt) {
    return NextResponse.json({ job: publicJob(job) });
  }

  const next = await updateJob(id, {
    listenCompletedAt: new Date().toISOString(),
  });

  return NextResponse.json({ job: next ? publicJob(next) : publicJob(job) });
}
