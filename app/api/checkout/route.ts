import { NextResponse } from "next/server";
import { brand } from "@/lib/brand";
import { getJob, publicJob, updateJob } from "@/lib/store";
import { appUrl, demoCheckoutEnabled, getWhop, songPlanId, whopConfigured } from "@/lib/whop";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    jobId?: string;
    includeLyricPrint?: boolean;
  };
  const jobId = String(body.jobId || "");
  const includeLyricPrint = Boolean(body.includeLyricPrint);
  const job = await getJob(jobId);
  if (!job) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }
  if (!job.previewReady) {
    return NextResponse.json({ error: "Listen to the preview before checkout." }, { status: 400 });
  }

  const next = await updateJob(job.id, {
    includeLyricPrint,
    status: "checkout",
  });

  if (demoCheckoutEnabled() && !whopConfigured()) {
    return NextResponse.json({
      mode: "demo",
      job: next ? publicJob(next) : publicJob(job),
      amount: includeLyricPrint ? brand.songPrice + brand.lyricsPrice : brand.songPrice,
    });
  }

  const planId = songPlanId(includeLyricPrint);
  if (!planId) {
    return NextResponse.json(
      { error: "Whop plan IDs are missing. Run npm run sync:whop after adding API keys." },
      { status: 500 },
    );
  }

  const whop = getWhop();
  const checkout = await whop.checkoutConfigurations.create({
    account_id: process.env.WHOP_COMPANY_ID,
    plan_id: planId,
    mode: "payment",
    metadata: {
      job_id: job.id,
      include_lyric_print: includeLyricPrint,
    },
    redirect_url: `${appUrl()}/checkout/complete?job=${job.id}`,
  });

  await updateJob(job.id, { checkoutSessionId: checkout.id });

  return NextResponse.json({
    mode: "whop",
    sessionId: checkout.id,
    planId,
    environment: process.env.WHOP_SANDBOX === "true" ? "sandbox" : "production",
    job: next ? publicJob(next) : publicJob(job),
  });
}
