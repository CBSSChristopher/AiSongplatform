import { NextResponse } from "next/server";
import { publicJob } from "@/lib/store";
import { recoverPaidJobFromWhop } from "@/lib/whop-recover";

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { jobId?: string };
  const jobId = String(body.jobId || "").trim();
  if (!jobId) {
    return NextResponse.json({ ok: false, error: "jobId required" }, { status: 400 });
  }

  const result = await recoverPaidJobFromWhop(jobId);

  if (result.ok) {
    console.info(
      JSON.stringify({
        level: "info",
        event: "checkout_recover_ok",
        jobId: result.jobId,
        paymentId: result.paymentId,
        already: result.already,
        source: result.source,
      }),
    );
    return NextResponse.json({
      ok: true,
      unlocked: true,
      already: result.already,
      source: result.source,
      paymentId: result.paymentId,
      job: publicJob(result.job),
    });
  }

  console.warn(
    JSON.stringify({
      level: "warn",
      event: "checkout_recover_pending",
      jobId,
      code: result.code,
      detail: result.detail,
    }),
  );

  const status =
    result.code === "job_not_found" ? 404 : result.code === "whop_unconfigured" ? 503 : 202;

  return NextResponse.json(
    {
      ok: false,
      unlocked: false,
      error: result.code,
      detail: result.detail,
    },
    { status },
  );
}
