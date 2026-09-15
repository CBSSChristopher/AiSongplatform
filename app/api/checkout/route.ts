import { NextResponse } from "next/server";
import { brand } from "@/lib/brand";
import { getJob, publicJob, updateJob } from "@/lib/store";
import { appUrl, demoCheckoutEnabled, getWhop, songPlanId, whopConfigured } from "@/lib/whop";
import { checkoutJobMetadata, checkoutRedirectUrl } from "@/lib/whop-unlock";

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
    return NextResponse.json({ error: "Create and listen to the preview before checkout." }, { status: 400 });
  }
  if (!job.listenCompletedAt) {
    return NextResponse.json(
      { error: "Listen to the preview first. Checkout stays locked until play progress is recorded." },
      { status: 400 },
    );
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

  try {
    const redirect = appUrl();
    const metadata = checkoutJobMetadata(job.id, includeLyricPrint);
    const checkout = await getWhop().checkoutConfigurations.create({
      account_id: process.env.WHOP_COMPANY_ID,
      plan_id: planId,
      mode: "payment",
      metadata,
      // Card + crypto (+ Apple/Google Pay). No Bank Wire / ACH.
      payment_method_configuration: {
        enabled: ["card", "crypto", "apple_pay", "google_pay"],
        disabled: [
          "bank_wire",
          "us_bank_account",
          "us_bank_transfer",
          "acss_debit",
          "pay_by_bank",
        ],
        include_platform_defaults: false,
      },
      ...(redirect.startsWith("https://")
        ? { redirect_url: checkoutRedirectUrl(redirect, job.id) }
        : {}),
    });

    await updateJob(job.id, { checkoutSessionId: checkout.id });

    return NextResponse.json({
      mode: "whop",
      sessionId: checkout.id,
      planId,
      environment: process.env.WHOP_SANDBOX === "true" ? "sandbox" : "production",
      job: next ? publicJob(next) : publicJob(job),
      // Echo so clients / logs can confirm attachment without reading secrets
      jobIdAttached: job.id,
    });
  } catch (error) {
    const message =
      error && typeof error === "object" && "body" in error
        ? JSON.stringify((error as { body?: unknown }).body)
        : error instanceof Error
          ? error.message
          : "Whop checkout failed.";
    console.error("[checkout]", message);
    return NextResponse.json(
      { error: "Whop checkout could not start. Check the API key permissions and try again." },
      { status: 502 },
    );
  }
}
