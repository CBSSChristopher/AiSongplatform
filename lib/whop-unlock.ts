import { fulfillPaidJob } from "./fulfill";
import { getJob, getJobByCheckoutSessionId } from "./store";
import type { SongJob } from "./types";

/** Internal promo — unlocks without charging Joseph. Not a Whop dashboard coupon. */
export const FREESNUGGLE_CODE = "FREESNUGGLE";

export const PAID_WEBHOOK_TYPES = new Set([
  "payment.succeeded",
  "payment.paid",
]);

export function matchesFreeSnuggle(code: unknown): boolean {
  return String(code ?? "")
    .trim()
    .toUpperCase() === FREESNUGGLE_CODE;
}

export function checkoutJobMetadata(jobId: string, includeLyricPrint: boolean) {
  return {
    job_id: jobId,
    jobId,
    custom_id: jobId,
    include_lyric_print: includeLyricPrint ? "true" : "false",
  };
}

export function checkoutRedirectUrl(baseUrl: string, jobId: string) {
  const root = baseUrl.replace(/\/$/, "");
  return `${root}/checkout/complete?job=${encodeURIComponent(jobId)}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function pickString(...candidates: unknown[]): string {
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    if (typeof candidate === "number" && Number.isFinite(candidate)) return String(candidate);
  }
  return "";
}

function jobIdFromMetadata(meta: Record<string, unknown> | null): string {
  if (!meta) return "";
  return pickString(
    meta.job_id,
    meta.jobId,
    meta.custom_id,
    meta.customId,
    meta.job,
    meta.order_id,
    meta.orderId,
  );
}

/**
 * Resolve SongSnuggle job id from every place Whop may put checkout metadata.
 * Prefer explicit metadata, then checkout_configuration_id (stored as checkoutSessionId).
 */
export function collectJobIdCandidates(data: unknown): string[] {
  const payment = asRecord(data) || {};
  const metadata = asRecord(payment.metadata);
  const membership = asRecord(payment.membership);
  const membershipMeta = asRecord(membership?.metadata);
  const plan = asRecord(payment.plan);
  const planMeta = asRecord(plan?.metadata);
  const product = asRecord(payment.product);
  const productMeta = asRecord(product?.metadata);
  const checkoutConfig = asRecord(payment.checkout_configuration);
  const checkoutMeta = asRecord(checkoutConfig?.metadata);

  const direct = [
    jobIdFromMetadata(metadata),
    jobIdFromMetadata(checkoutMeta),
    jobIdFromMetadata(membershipMeta),
    jobIdFromMetadata(planMeta),
    jobIdFromMetadata(productMeta),
    pickString(
      payment.custom_id,
      payment.customId,
      payment.job_id,
      payment.jobId,
      checkoutConfig?.id,
      payment.checkout_configuration_id,
      payment.checkout_session_id,
      payment.checkoutConfigurationId,
    ),
  ].filter(Boolean);

  // De-dupe while preserving order
  const seen = new Set<string>();
  const out: string[] = [];
  for (const id of direct) {
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

export type UnlockResult =
  | { ok: true; jobId: string; paymentId: string | null; already: boolean; job: SongJob }
  | {
      ok: false;
      code: "missing_job_id" | "job_not_found" | "fulfill_failed";
      retryable: boolean;
      paymentId: string | null;
      candidates: string[];
      detail?: string;
    };

export async function unlockJobFromWhopPayment(data: unknown): Promise<UnlockResult> {
  const payment = asRecord(data) || {};
  const paymentId = pickString(payment.id) || null;
  const candidates = collectJobIdCandidates(data);

  let job: SongJob | null = null;
  let resolvedId = "";

  for (const candidate of candidates) {
    // Prefer looking up as job id first
    job = await getJob(candidate);
    if (job) {
      resolvedId = candidate;
      break;
    }
    // Fallback: candidate may be a checkout configuration id (ch_…)
    job = await getJobByCheckoutSessionId(candidate);
    if (job) {
      resolvedId = job.id;
      break;
    }
  }

  // Last resort: checkout_configuration_id alone even if already tried as getJob
  const checkoutConfigId = pickString(
    payment.checkout_configuration_id,
    asRecord(payment.checkout_configuration)?.id,
  );
  if (!job && checkoutConfigId) {
    job = await getJobByCheckoutSessionId(checkoutConfigId);
    if (job) resolvedId = job.id;
  }

  if (!resolvedId && !job) {
    const hasAnyHint = candidates.length > 0;
    return {
      ok: false,
      code: hasAnyHint ? "job_not_found" : "missing_job_id",
      retryable: true,
      paymentId,
      candidates,
      detail: hasAnyHint
        ? `No song matched candidates: ${candidates.join(",")}`
        : "payment.succeeded had no job_id / custom_id / checkout_configuration_id",
    };
  }

  if (!job) {
    return {
      ok: false,
      code: "job_not_found",
      retryable: true,
      paymentId,
      candidates,
      detail: `job_id=${resolvedId} not in store`,
    };
  }

  try {
    const already = Boolean(job.paidAt && job.fullReady);
    const next = await fulfillPaidJob(job, paymentId);
    return {
      ok: true,
      jobId: next.id,
      paymentId,
      already,
      job: next,
    };
  } catch (error) {
    return {
      ok: false,
      code: "fulfill_failed",
      retryable: true,
      paymentId,
      candidates: [job.id, ...candidates],
      detail: error instanceof Error ? error.message : "fulfill failed",
    };
  }
}

export function isPaidWhopEvent(type: unknown): boolean {
  return PAID_WEBHOOK_TYPES.has(String(type || ""));
}
