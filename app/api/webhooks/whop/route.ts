import { unwrapWebhook } from "@whop/sdk/helpers";
import { writeFullAudio } from "@/lib/music";
import { getJob, updateJob } from "@/lib/store";

type WhopEvent = {
  type?: string;
  data?: {
    id?: string;
    metadata?: Record<string, unknown>;
  };
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

  if (event.type === "payment.succeeded") {
    const jobId = String(event.data?.metadata?.job_id || "");
    if (jobId) {
      const job = await getJob(jobId);
      if (job && !job.paidAt) {
        await writeFullAudio(job);
        await updateJob(job.id, {
          paidAt: new Date().toISOString(),
          fullReady: true,
          status: "delivered",
          whopPaymentId: event.data?.id || null,
        });
      }
    }
  }

  return new Response("OK", { status: 200 });
}
