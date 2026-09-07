import { NextResponse } from "next/server";
import { writePreviewAudio } from "@/lib/music";
import { getJob, publicJob, updateJob } from "@/lib/store";

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }
  if (!job.lyrics.trim()) {
    return NextResponse.json({ error: "Approve lyrics before making a preview." }, { status: 400 });
  }

  await writePreviewAudio({ ...job });
  const next = await updateJob(id, {
    previewReady: true,
    status: "preview",
  });

  return NextResponse.json({ job: next ? publicJob(next) : publicJob({ ...job, previewReady: true }) });
}
