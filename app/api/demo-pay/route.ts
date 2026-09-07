import { NextResponse } from "next/server";
import { writeFullAudio } from "@/lib/music";
import { getJob, publicJob, updateJob } from "@/lib/store";
import { demoCheckoutEnabled } from "@/lib/whop";

export async function POST(request: Request) {
  if (!demoCheckoutEnabled()) {
    return NextResponse.json({ error: "Demo checkout is off." }, { status: 403 });
  }
  const body = (await request.json()) as { jobId?: string };
  const job = await getJob(String(body.jobId || ""));
  if (!job) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }

  await writeFullAudio(job);
  const next = await updateJob(job.id, {
    paidAt: new Date().toISOString(),
    fullReady: true,
    status: "delivered",
    whopPaymentId: "demo",
  });

  return NextResponse.json({ job: next ? publicJob(next) : publicJob(job) });
}
