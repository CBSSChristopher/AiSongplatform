import { NextResponse } from "next/server";
import { fulfillPaidJob } from "@/lib/fulfill";
import { getJob, publicJob } from "@/lib/store";
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

  const next = await fulfillPaidJob(job, "demo");
  return NextResponse.json({ job: publicJob(next) });
}
