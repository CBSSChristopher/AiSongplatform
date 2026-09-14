#!/usr/bin/env npx tsx
/**
 * Dry-run Whop unlock path — no real charge, no webhook signature needed.
 * Proves job_id attach/resolve + unlock (paidAt / fullReady) via simulated payment payload.
 */
import { createJob, getJob, updateJob } from "../lib/store";
import {
  checkoutJobMetadata,
  collectJobIdCandidates,
  matchesFreeSnuggle,
  unlockJobFromWhopPayment,
} from "../lib/whop-unlock";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main() {
  console.log("[test-whop-unlock] resolve candidates…");
  const meta = checkoutJobMetadata("job-abc", true);
  assert(meta.job_id === "job-abc", "metadata.job_id");
  assert(meta.jobId === "job-abc", "metadata.jobId");
  assert(meta.custom_id === "job-abc", "metadata.custom_id");

  const fromMeta = collectJobIdCandidates({
    id: "pay_test",
    metadata: { job_id: "from-meta" },
  });
  assert(fromMeta[0] === "from-meta", "resolve metadata.job_id");

  const fromCustom = collectJobIdCandidates({
    id: "pay_test",
    metadata: { custom_id: "from-custom" },
  });
  assert(fromCustom[0] === "from-custom", "resolve metadata.custom_id");

  const fromCheckout = collectJobIdCandidates({
    id: "pay_test",
    checkout_configuration_id: "ch_lookup",
    metadata: {},
  });
  assert(fromCheckout.includes("ch_lookup"), "resolve checkout_configuration_id");

  const missing = collectJobIdCandidates({ id: "pay_orphan", metadata: {} });
  assert(missing.length === 0, "empty candidates when nothing present");

  assert(matchesFreeSnuggle("freesnuggle"), "FREESNUGGLE case-insensitive");
  assert(matchesFreeSnuggle("FREESNUGGLE"), "FREESNUGGLE exact");
  assert(!matchesFreeSnuggle("WRONG"), "reject other codes");

  console.log("[test-whop-unlock] create job + simulate payment.succeeded…");
  const job = await createJob({
    recipientName: "Unlock Test",
    email: "unlock-test@example.com",
    relationship: "son",
    genre: "acoustic",
    voice: "male",
    occasion: "just-because",
    senderName: "QA",
    lyrics: "Verse 1\nA quiet proof line\n\nChorus\nUnlock without a charge",
    previewReady: true,
    status: "checkout",
  });

  const sessionId = `ch_dryrun_${job.id.slice(0, 8)}`;
  await updateJob(job.id, { checkoutSessionId: sessionId });

  // Path A: metadata.job_id
  const unlocked = await unlockJobFromWhopPayment({
    id: "pay_dryrun_meta",
    status: "paid",
    metadata: checkoutJobMetadata(job.id, false),
    checkout_configuration_id: sessionId,
  });
  assert(unlocked.ok, `unlock via metadata failed: ${JSON.stringify(unlocked)}`);
  assert(unlocked.jobId === job.id, "unlocked job id mismatch");

  const after = await getJob(job.id);
  assert(after?.paidAt, "paidAt set");
  assert(after?.fullReady, "fullReady set");
  assert(after?.whopPaymentId === "pay_dryrun_meta", "payment id stored");

  // Idempotent second call
  const again = await unlockJobFromWhopPayment({
    id: "pay_dryrun_meta",
    metadata: { job_id: job.id },
  });
  assert(again.ok && again.already, "second unlock should be already=true");

  // Path B: checkout_configuration_id only (no metadata) on a fresh job
  const job2 = await createJob({
    recipientName: "Checkout Lookup",
    email: "unlock-test2@example.com",
    relationship: "daughter",
    genre: "pop",
    voice: "female",
    occasion: "birthday",
    senderName: "QA",
    lyrics: "Verse 1\nLookup by session\n\nChorus\nStill unlocks",
    previewReady: true,
    status: "checkout",
  });
  const session2 = `ch_dryrun_${job2.id.slice(0, 8)}`;
  await updateJob(job2.id, { checkoutSessionId: session2 });

  const viaSession = await unlockJobFromWhopPayment({
    id: "pay_dryrun_session",
    metadata: {},
    checkout_configuration_id: session2,
  });
  assert(viaSession.ok, `unlock via checkout session failed: ${JSON.stringify(viaSession)}`);
  assert((await getJob(job2.id))?.paidAt, "job2 paidAt via session lookup");

  // Path C: missing job_id must fail loudly
  const failed = await unlockJobFromWhopPayment({
    id: "pay_dryrun_orphan",
    metadata: {},
  });
  assert(!failed.ok && failed.code === "missing_job_id", "missing job_id must not succeed");
  assert(failed.retryable, "missing job_id marked retryable");

  console.log("[test-whop-unlock] OK");
  console.log(
    JSON.stringify(
      {
        proof: "dry-run",
        freesnuggle: "POST /api/demo-pay { jobId, promoCode: 'FREESNUGGLE' }",
        jobsUnlocked: [job.id, job2.id],
        missingJobIdFails: true,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error("[test-whop-unlock] FAIL", error);
  process.exit(1);
});
