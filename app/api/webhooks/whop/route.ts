import { unwrapWebhook } from "@whop/sdk/helpers";
import {
  isPaidWhopEvent,
  unlockJobFromWhopPayment,
} from "@/lib/whop-unlock";

type WhopEvent = {
  type?: string;
  data?: unknown;
};

export async function POST(request: Request) {
  const payload = await request.text();
  const headers = Object.fromEntries(request.headers);

  let event: WhopEvent;
  try {
    event = unwrapWebhook<WhopEvent>(payload, {
      headers,
      key: process.env.WHOP_WEBHOOK_SECRET,
    });
  } catch {
    return new Response("Invalid webhook", { status: 400 });
  }

  if (!isPaidWhopEvent(event.type)) {
    return new Response("OK", { status: 200 });
  }

  const result = await unlockJobFromWhopPayment(event.data);

  if (result.ok) {
    console.info(
      JSON.stringify({
        level: "info",
        event: "whop_unlock_ok",
        type: event.type,
        jobId: result.jobId,
        paymentId: result.paymentId,
        already: result.already,
      }),
    );
    return Response.json({
      ok: true,
      unlocked: true,
      jobId: result.jobId,
      already: result.already,
    });
  }

  console.error(
    JSON.stringify({
      level: "error",
      event: "whop_unlock_failed",
      type: event.type,
      code: result.code,
      retryable: result.retryable,
      paymentId: result.paymentId,
      candidates: result.candidates,
      detail: result.detail,
    }),
  );

  // Non-silent: never 200 without unlock on a paid event.
  const status = result.code === "missing_job_id" ? 422 : result.code === "job_not_found" ? 404 : 500;
  return Response.json(
    {
      ok: false,
      unlocked: false,
      error: result.code,
      retryable: result.retryable,
      candidates: result.candidates,
      detail: result.detail,
    },
    { status },
  );
}
