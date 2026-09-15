import { brand } from "./brand";
import type { SongJob } from "./types";
import { appUrl } from "./whop";

export function songUrl(jobId: string) {
  return `${appUrl()}/song/${jobId}`;
}

/** Default From when RESEND_FROM is unset. Domain must be verified in Resend. */
export const DEFAULT_RESEND_FROM = `SongSnuggle <hello@songsnuggle.com>`;

/**
 * Resolve Resend `from`. Accepts either a bare address or already-formatted
 * `Name <addr@domain>` so RESEND_FROM does not get double-wrapped.
 */
export function resolveResendFrom(raw = process.env.RESEND_FROM) {
  const value = (raw || "").trim();
  if (!value) return DEFAULT_RESEND_FROM;
  if (value.includes("<") && value.includes(">")) return value;
  return `${brand.name} <${value}>`;
}

export function deliveryMailto(job: SongJob) {
  const link = songUrl(job.id);
  const subject = encodeURIComponent(`Your ${brand.name} for ${job.recipientName}`);
  const body = encodeURIComponent(deliveryEmailText(job, link));
  return `mailto:${job.email}?subject=${subject}&body=${body}`;
}

export function deliveryEmailText(job: SongJob, link = songUrl(job.id)) {
  const giftNote = job.senderName
    ? `A small gift from ${job.senderName} — keep this link private.`
    : "A small gift song — keep this link private.";

  return [
    `A song for ${job.recipientName} is ready.`,
    "",
    giftNote,
    "",
    `Private listening page: ${link}`,
    job.includeLyricPrint ? "Your lyric print PDF is on that same page." : "",
    "",
    brand.tagline,
  ]
    .filter(Boolean)
    .join("\n");
}

export type DeliveryEmailResult =
  | { sent: true; reason: "sent" }
  | { sent: false; reason: "no_key" | "provider_error" | "exception" };

/**
 * Send unlock/delivery email via Resend when RESEND_API_KEY is set.
 * Missing key → skip with a clear log (unlock still succeeds).
 * Provider failure → soft-fail log only (caller must not roll back unlock).
 */
export async function sendDeliveryEmail(job: SongJob): Promise<DeliveryEmailResult> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) {
    console.info(
      "[email] RESEND_API_KEY missing — skipping delivery email (unlock still works). Set with: wrangler secret put RESEND_API_KEY",
    );
    return { sent: false, reason: "no_key" };
  }

  const from = resolveResendFrom();
  const link = songUrl(job.id);
  const subject = `Your ${brand.name} for ${job.recipientName}`;
  const text = deliveryEmailText(job, link);

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [job.email],
        subject,
        text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text();
      console.error("[email] Resend provider error", response.status, detail.slice(0, 300));
      return { sent: false, reason: "provider_error" };
    }

    console.info("[email] delivery email sent", { jobId: job.id, to: job.email });
    return { sent: true, reason: "sent" };
  } catch (error) {
    console.error("[email] Resend request failed", error);
    return { sent: false, reason: "exception" };
  }
}
