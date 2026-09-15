import { fulfillPaidJob } from "./fulfill";
import { getJob, updateJob } from "./store";
import type { SongJob } from "./types";
import { getWhop, whopConfigured } from "./whop";
import { collectJobIdCandidates, unlockJobFromWhopPayment } from "./whop-unlock";

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function paymentMatchesJob(payment: unknown, jobId: string, checkoutSessionId: string | null): boolean {
  const candidates = collectJobIdCandidates(payment);
  if (candidates.includes(jobId)) return true;
  if (checkoutSessionId && candidates.includes(checkoutSessionId)) return true;

  const record = asRecord(payment) || {};
  const meta = asRecord(record.metadata);
  const membershipMeta = asRecord(record.membership_metadata);
  for (const bag of [meta, membershipMeta]) {
    if (!bag) continue;
    for (const key of ["job_id", "jobId", "custom_id", "customId"]) {
      if (String(bag[key] || "") === jobId) return true;
    }
  }
  return false;
}

function isPaidStatus(status: unknown): boolean {
  const value = String(status || "").toLowerCase();
  return value === "paid" || value === "succeeded" || value === "complete" || value === "completed";
}

export type RecoverResult =
  | {
      ok: true;
      already: boolean;
      jobId: string;
      paymentId: string | null;
      job: SongJob;
      source: "already_unlocked" | "whop_payment" | "checkout_session";
    }
  | {
      ok: false;
      code: "job_not_found" | "whop_unconfigured" | "payment_not_found" | "unlock_failed";
      detail?: string;
    };

/**
 * Post-pay recovery: if webhook lagged, find a matching paid Whop payment and unlock.
 * Safe to call repeatedly from /checkout/complete.
 */
export async function recoverPaidJobFromWhop(jobId: string): Promise<RecoverResult> {
  const job = await getJob(jobId);
  if (!job) {
    return { ok: false, code: "job_not_found", detail: `job ${jobId} missing` };
  }

  if (!whopConfigured()) {
    if (job.paidAt && job.fullReady) {
      return {
        ok: true,
        already: true,
        jobId: job.id,
        paymentId: job.whopPaymentId,
        job,
        source: "already_unlocked",
      };
    }
    return { ok: false, code: "whop_unconfigured" };
  }

  const client = getWhop();
  let matchedPayment: Record<string, unknown> | null = null;

  try {
    const page = await client.payments.list({
      account_id: process.env.WHOP_COMPANY_ID,
      status: "paid",
      first: 40,
    });

    let scanned = 0;
    for await (const payment of page) {
      scanned += 1;
      if (scanned > 40) break;
      if (!isPaidStatus(payment.status)) continue;
      if (!paymentMatchesJob(payment, job.id, job.checkoutSessionId)) continue;
      matchedPayment = payment as unknown as Record<string, unknown>;
      break;
    }
  } catch (error) {
    console.error("[recover] payments.list failed", error);
  }

  if (!matchedPayment && job.checkoutSessionId) {
    // Fallback: treat checkout configuration id as candidate for unlock helper
    matchedPayment = {
      id: job.whopPaymentId || null,
      status: "paid",
      checkout_configuration_id: job.checkoutSessionId,
      metadata: { job_id: job.id, jobId: job.id, custom_id: job.id },
    };
  }

  if (!matchedPayment) {
    if (job.paidAt && job.fullReady) {
      return {
        ok: true,
        already: true,
        jobId: job.id,
        paymentId: job.whopPaymentId,
        job,
        source: "already_unlocked",
      };
    }
    return {
      ok: false,
      code: "payment_not_found",
      detail: "No paid Whop payment matched this job yet",
    };
  }

  const paymentId =
    typeof matchedPayment.id === "string" && matchedPayment.id.startsWith("pay_")
      ? matchedPayment.id
      : job.whopPaymentId;

  if (job.paidAt && job.fullReady) {
    if (paymentId && paymentId !== job.whopPaymentId) {
      const stamped = (await updateJob(job.id, { whopPaymentId: paymentId })) || job;
      return {
        ok: true,
        already: true,
        jobId: stamped.id,
        paymentId,
        job: stamped,
        source: "already_unlocked",
      };
    }
    return {
      ok: true,
      already: true,
      jobId: job.id,
      paymentId: job.whopPaymentId,
      job,
      source: "already_unlocked",
    };
  }

  const unlocked = await unlockJobFromWhopPayment(matchedPayment);
  if (unlocked.ok) {
    return {
      ok: true,
      already: unlocked.already,
      jobId: unlocked.jobId,
      paymentId: unlocked.paymentId,
      job: unlocked.job,
      source: "whop_payment",
    };
  }

  // Last resort: direct fulfill if we already know the job id
  try {
    const next = await fulfillPaidJob(job, paymentId);
    return {
      ok: true,
      already: false,
      jobId: next.id,
      paymentId,
      job: next,
      source: "checkout_session",
    };
  } catch (error) {
    return {
      ok: false,
      code: "unlock_failed",
      detail: unlocked.detail || (error instanceof Error ? error.message : "unlock failed"),
    };
  }
}
