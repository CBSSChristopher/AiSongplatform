import { NextResponse } from "next/server";
import { getJob, publicJob } from "@/lib/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }
  return NextResponse.json({ job: publicJob(job) });
}
