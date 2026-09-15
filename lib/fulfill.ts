import { sendDeliveryEmail } from "./email";
import { writeFullAudio } from "./music";
import { getJob, updateJob } from "./store";
import type { SongJob } from "./types";

/**
 * Unlock full song after Whop payment.succeeded, demo-pay, or FREESNUGGLE.
 * Delivery email is best-effort: Resend failures are logged and never roll back unlock.
 */
export async function fulfillPaidJob(job: SongJob, paymentId: string | null) {
  if (job.paidAt && job.fullReady) {
    return job;
  }

  const { cues, audioDurationSec } = await writeFullAudio(job);
  const next = await updateJob(job.id, {
    paidAt: new Date().toISOString(),
    fullReady: true,
    status: "delivered",
    lyricCues: cues.length ? cues : job.lyricCues,
    audioDurationSec: audioDurationSec || job.audioDurationSec || null,
    whopPaymentId: paymentId ?? job.whopPaymentId,
  });
  const delivered = next ?? ((await getJob(job.id)) || job);

  // Soft-fail: unlock already persisted above.
  try {
    const result = await sendDeliveryEmail(delivered);
    if (!result.sent) {
      console.info("[email] delivery skipped or soft-failed after unlock", {
        jobId: delivered.id,
        reason: result.reason,
      });
    }
  } catch (error) {
    console.error("[email] unexpected error after unlock (unlock kept)", error);
  }

  return delivered;
}
