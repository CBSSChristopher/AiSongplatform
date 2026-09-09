import { brand } from "./brand";
import type { SongJob } from "./types";
import { appUrl } from "./whop";

export function songUrl(jobId: string) {
  return `${appUrl()}/song/${jobId}`;
}

export function deliveryMailto(job: SongJob) {
  const link = songUrl(job.id);
  const subject = encodeURIComponent(`Your ${brand.name} for ${job.recipientName}`);
  const body = encodeURIComponent(
    [
      `A song for ${job.recipientName} is ready.`,
      "",
      `Private listening page: ${link}`,
      job.includeLyricPrint ? "Your lyric print PDF is on that same page." : "",
      "",
      brand.tagline,
    ]
      .filter(Boolean)
      .join("\n"),
  );
  return `mailto:${job.email}?subject=${subject}&body=${body}`;
}

export async function sendDeliveryEmail(job: SongJob) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false as const, reason: "no_key" };
  }

  const from = process.env.RESEND_FROM || brand.supportEmail;
  const link = songUrl(job.id);
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: `${brand.name} <${from}>`,
      to: [job.email],
      subject: `Your ${brand.name} for ${job.recipientName}`,
      text: [
        `A song for ${job.recipientName} is ready.`,
        "",
        `Listen and download: ${link}`,
        job.includeLyricPrint ? "Your lyric print PDF is on that same page." : "",
        "",
        brand.tagline,
      ]
        .filter(Boolean)
        .join("\n"),
    }),
  });

  if (!response.ok) {
    const detail = await response.text();
    console.error("[email]", response.status, detail.slice(0, 300));
    return { sent: false as const, reason: "provider_error" };
  }

  return { sent: true as const, reason: "sent" };
}
