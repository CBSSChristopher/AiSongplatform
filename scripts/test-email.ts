/**
 * Dry-run delivery email without calling Resend (no key / no spend).
 * Usage: npx tsx scripts/test-email.ts
 *
 * With a real key (optional local check only — do not commit keys):
 *   RESEND_API_KEY=re_xxx npx tsx scripts/test-email.ts --send
 */
import {
  DEFAULT_RESEND_FROM,
  deliveryEmailText,
  resolveResendFrom,
  sendDeliveryEmail,
  songUrl,
} from "../lib/email";
import type { SongJob } from "../lib/types";

const job: SongJob = {
  id: "email-dry-run",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  status: "delivered",
  recipientName: "Maya",
  namePronunciation: "",
  relationship: "daughter",
  email: "buyer@example.com",
  marketingOptIn: false,
  genre: "acoustic",
  voice: "female",
  qualities: "",
  memories: "",
  occasion: "just-because",
  senderName: "Dad",
  message: "",
    songTitle: "",
  lyrics: "Chorus\nThis is a song I made for Maya",
  lyricCues: [],
  includeLyricPrint: true,
  previewReady: true,
  listenCompletedAt: null,
  fullReady: true,
  paidAt: new Date().toISOString(),
  whopPaymentId: "demo",
  checkoutSessionId: null,
};

async function main() {
  const wantSend = process.argv.includes("--send");
  const from = resolveResendFrom();
  const link = songUrl(job.id);
  const text = deliveryEmailText(job, link);

  console.log("dry_run_ok");
  console.log("from:", from);
  console.log("default_from:", DEFAULT_RESEND_FROM);
  console.log("to:", job.email);
  console.log("link:", link);
  console.log("--- body ---");
  console.log(text);
  console.log("--- end ---");

  if (!wantSend) {
    // Simulate missing-key path (clear the env for this process only if unset already).
    const hadKey = Boolean(process.env.RESEND_API_KEY?.trim());
    if (!hadKey) {
      const result = await sendDeliveryEmail(job);
      if (result.reason !== "no_key") {
        throw new Error(`expected no_key skip, got ${result.reason}`);
      }
      console.log("skip_ok reason=no_key (RESEND_API_KEY unset — unlock would still work)");
    } else {
      console.log("RESEND_API_KEY is set locally; skip dry-run of no_key path. Pass --send to actually send.");
    }
    return;
  }

  if (!process.env.RESEND_API_KEY?.trim()) {
    throw new Error("--send requires RESEND_API_KEY");
  }
  const result = await sendDeliveryEmail(job);
  console.log("send_result", result);
  if (!result.sent) process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
