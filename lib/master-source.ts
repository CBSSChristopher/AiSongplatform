/**
 * Joseph ONE-master / Elon same-source proofs.
 * Preview and paid full must share one compose take — never parallel recomposes.
 */
export function audioHeadFingerprint(bytes: Uint8Array, take = 96_000): string {
  if (!bytes?.byteLength) return "empty";
  const n = Math.min(bytes.byteLength, take);
  // FNV-1a 64-ish over head bytes (deterministic, no crypto dep in edge).
  let h = 2166136261;
  for (let i = 0; i < n; i += 1) {
    h ^= bytes[i]!;
    h = Math.imul(h, 16777619);
  }
  const lenTag = bytes.byteLength.toString(16);
  return `fnv1a_${(h >>> 0).toString(16)}_${n}_${lenTag}`;
}

/** True when preview looks like a head/cap of full (same family), not a parallel render. */
export function bytesLookSameMasterFamily(
  preview: Uint8Array | null | undefined,
  full: Uint8Array | null | undefined,
): { ok: boolean; reason: string; previewFp?: string; fullFp?: string } {
  if (!full?.byteLength) {
    return { ok: false, reason: "Missing full master bytes." };
  }
  const fullFp = audioHeadFingerprint(full);
  if (!preview?.byteLength) {
    return {
      ok: true,
      reason: "No preview bytes — full master is sole source (preview will be derived).",
      fullFp,
    };
  }
  const previewFp = audioHeadFingerprint(preview);
  // Exact head match (WAV PCM / identical encode family).
  const headN = Math.min(48_000, preview.byteLength, full.byteLength);
  let same = 0;
  for (let i = 0; i < headN; i += 1) {
    if (preview[i] === full[i]) same += 1;
  }
  const ratio = headN > 0 ? same / headN : 0;
  if (ratio >= 0.98) {
    return {
      ok: true,
      reason: `Preview head matches full (${(ratio * 100).toFixed(1)}% of ${headN} bytes).`,
      previewFp,
      fullFp,
    };
  }
  // Same fingerprint algorithm on aligned heads (truncate-derived MP3 may differ after Xing rewrite).
  if (previewFp.split("_").slice(0, 2).join("_") === fullFp.split("_").slice(0, 2).join("_") && ratio >= 0.5) {
    return {
      ok: true,
      reason: `Preview/full share head fingerprint family (ratio=${ratio.toFixed(3)}).`,
      previewFp,
      fullFp,
    };
  }
  return {
    ok: false,
    reason:
      `Preview and full look like parallel renders (head match ${(ratio * 100).toFixed(1)}%). ` +
      `Joseph ONE-master: replace preview with cap of full — never keep dual takes.`,
    previewFp,
    fullFp,
  };
}

export function newMasterSourceId(jobId: string, fingerprint: string): string {
  const short = fingerprint.replace(/[^a-f0-9]/gi, "").slice(0, 12) || "0";
  return `mst_${jobId.slice(0, 8)}_${short}`;
}
