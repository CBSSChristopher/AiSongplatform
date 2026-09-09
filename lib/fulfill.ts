import { sendDeliveryEmail } from "./email";
import { writeFullAudio } from "./music";
import { getJob, updateJob } from "./store";
import type { SongJob } from "./types";

export async function fulfillPaidJob(job: SongJob, paymentId: string | null) {
  if (job.paidAt && job.fullReady) {
    return job;
  }

  await writeFullAudio(job);
  const next = await updateJob(job.id, {
    paidAt: new Date().toISOString(),
    fullReady: true,
    status: "delivered",
    whopPaymentId: paymentId ?? job.whopPaymentId,
  });
  const delivered = next ?? ((await getJob(job.id)) || job);
  await sendDeliveryEmail(delivered).catch((error) => console.error("[email]", error));
  return delivered;
}
