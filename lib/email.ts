import { brand } from "./brand";
import type { SongJob } from "./types";
import { appUrl } from "./whop";

export function songUrl(jobId: string) {
  return `${appUrl()}/song/${jobId}`;
}

export function audioDownloadUrl(jobId: string) {
  return `${appUrl()}/api/jobs/${jobId}/audio?full=1&format=mp3&download=1`;
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
  const fromLine = job.senderName.trim()
    ? `A gift from ${job.senderName}.`
    : "A gift song, made just for them.";
  const download = audioDownloadUrl(job.id);

  return [
    `Your song for ${job.recipientName} is ready.`,
    "",
    fromLine,
    "",
    `Listen (private): ${link}`,
    `Download MP3: ${download}`,
    job.includeLyricPrint ? "Your lyric print is on the same private page." : "",
    "",
    "Keep this link private — it is their song.",
    "",
    brand.tagline,
    `— ${brand.name}`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Branded gift HTML for Resend. Sample also written under audit/email-share/. */
export function deliveryEmailHtml(job: SongJob, link = songUrl(job.id)) {
  const download = audioDownloadUrl(job.id);
  const fromLine = job.senderName.trim()
    ? `A gift from <strong style="color:#1c1410;">${escapeHtml(job.senderName)}</strong>`
    : "A gift song, made just for them";
  const recipient = escapeHtml(job.recipientName || "someone special");
  const lyricLine = job.includeLyricPrint
    ? `<p style="margin:0 0 16px;color:#6b5b52;font-size:15px;line-height:1.5;">Your lyric print PDF is waiting on the same private page.</p>`
    : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Your ${escapeHtml(brand.name)} for ${recipient}</title>
</head>
<body style="margin:0;padding:0;background:#f6f0ea;font-family:Georgia,'Times New Roman',serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f0ea;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:560px;background:#fffaf6;border-radius:24px;border:1px solid #e8ddd3;overflow:hidden;">
          <tr>
            <td style="padding:28px 28px 8px;background:linear-gradient(135deg,#2a1f18 0%,#5c3d2e 100%);">
              <p style="margin:0;color:#e8c4a8;font-size:12px;letter-spacing:0.22em;text-transform:uppercase;font-family:Helvetica,Arial,sans-serif;">${escapeHtml(brand.name)}</p>
              <h1 style="margin:12px 0 0;color:#fffaf6;font-size:28px;font-weight:normal;line-height:1.25;">Your song for ${recipient} is ready</h1>
            </td>
          </tr>
          <tr>
            <td style="padding:24px 28px 8px;">
              <p style="margin:0 0 12px;color:#6b5b52;font-size:16px;line-height:1.55;">${fromLine}.</p>
              <p style="margin:0 0 20px;color:#1c1410;font-size:17px;line-height:1.5;">Open the private listening page, play it, download the MP3 for phone &amp; text — this is theirs to keep.</p>
              ${lyricLine}
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 12px;">
                <tr>
                  <td style="border-radius:999px;background:#c47a4a;">
                    <a href="${escapeHtml(link)}" style="display:inline-block;padding:14px 22px;color:#fffaf6;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:15px;font-weight:600;">Play their song</a>
                  </td>
                </tr>
              </table>
              <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 20px;">
                <tr>
                  <td style="border-radius:999px;border:1px solid #d4c4b6;background:#fff;">
                    <a href="${escapeHtml(download)}" style="display:inline-block;padding:12px 20px;color:#1c1410;text-decoration:none;font-family:Helvetica,Arial,sans-serif;font-size:14px;">Download MP3</a>
                  </td>
                </tr>
              </table>
              <p style="margin:0 0 8px;color:#8a7a70;font-size:13px;line-height:1.5;font-family:Helvetica,Arial,sans-serif;">Keep this link private — it unlocks the full recording.</p>
              <p style="margin:0;color:#8a7a70;font-size:13px;line-height:1.5;font-family:Helvetica,Arial,sans-serif;word-break:break-all;">${escapeHtml(link)}</p>
            </td>
          </tr>
          <tr>
            <td style="padding:20px 28px 28px;border-top:1px solid #efe4da;">
              <p style="margin:0;color:#6b5b52;font-size:14px;font-style:italic;">${escapeHtml(brand.tagline)}</p>
              <p style="margin:8px 0 0;color:#8a7a70;font-size:12px;font-family:Helvetica,Arial,sans-serif;">Questions? ${escapeHtml(brand.supportEmail)}</p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
  const subject = `Your ${brand.name} for ${job.recipientName} is ready`;
  const text = deliveryEmailText(job, link);
  const html = deliveryEmailHtml(job, link);

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
        html,
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
