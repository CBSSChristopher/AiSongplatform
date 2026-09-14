import { NextResponse } from "next/server";
import { fulfillPaidJob } from "@/lib/fulfill";
import { getJob, publicJob } from "@/lib/store";
import { demoCheckoutEnabled } from "@/lib/whop";
import { matchesFreeSnuggle } from "@/lib/whop-unlock";

export async function POST(request: Request) {
  const body = (await request.json()) as { jobId?: string; promoCode?: string };
  const freeSnuggle = matchesFreeSnuggle(body.promoCode);

  if (!demoCheckoutEnabled() && !freeSnuggle) {
    return NextResponse.json(
      { error: "Demo checkout is off. Use Whop pay, or enter promo FREESNUGGLE." },
      { status: 403 },
    );
  }

  const job = await getJob(String(body.jobId || ""));
  if (!job) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }
  if (!job.previewReady || !job.listenCompletedAt) {
    return NextResponse.json(
      { error: "Listen to the preview before unlocking the song." },
      { status: 400 },
    );
  }

  const paymentTag = freeSnuggle ? "freesnuggle" : "demo";
  const next = await fulfillPaidJob(job, paymentTag);
  console.info(
    JSON.stringify({
      level: "info",
      event: "promo_or_demo_unlock",
      jobId: next.id,
      path: paymentTag,
      // never log the raw code beyond the known tag
    }),
  );
  return NextResponse.json({ job: publicJob(next), path: paymentTag });
}
