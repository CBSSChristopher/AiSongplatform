#!/usr/bin/env npx tsx
/**
 * Unit proof: previewGate.pass cannot lie.
 * - intelligibility false → overall pass false + failures non-empty includes that id
 * - ear checklist false → same
 * - empty failures while proofs show pass:false is FORBIDDEN
 */
import {
  runPreviewAcceptanceGate,
  codeBlockingFailures,
  EAR_PENDING_PROOF_IDS,
} from "../lib/preview-acceptance-gate";
import type { LyricCue } from "../lib/cues";

function minimalCues(): LyricCue[] {
  const words = (line: string, start: number) => {
    const parts = line.split(/\s+/);
    const step = 0.35;
    return parts.map((text, i) => ({
      text,
      start: start + i * step,
      end: start + (i + 1) * step,
    }));
  };
  return [
    { text: "Hello Malia my love", start: 0, end: 2.5, words: words("Hello Malia my love", 0) },
    { text: "You light the Mayan road", start: 3, end: 6, words: words("You light the Mayan road", 3) },
    { text: "High road forever sung", start: 7, end: 10, words: words("High road forever sung", 7) },
    { text: "Keep the melody close", start: 11, end: 14, words: words("Keep the melody close", 11) },
  ];
}

function assert(cond: boolean, msg: string) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

function checkGateTheater() {
  const cues = minimalCues();
  // Tiny fake WAV header so publishedBytesLength > 512 path partially runs —
  // spectral will fail; we still care about intelligibility/ear in failures.
  const wav = new Uint8Array(2048);
  wav[0] = 0x52; wav[1] = 0x49; wav[2] = 0x46; wav[3] = 0x46;
  wav[8] = 0x57; wav[9] = 0x41; wav[10] = 0x56; wav[11] = 0x45;

  const result = runPreviewAcceptanceGate({
    job: {
      id: "00000000-0000-4000-8000-00000000fc06",
      lyrics: cues.map((c) => c.text).join("\n"),
      lyricCues: cues,
      occasion: "birthday",
      previewReady: false,
      audioDurationSec: 85,
    },
    publishedWav: wav,
    publishedMp3: null,
    cues,
    audioDurationSec: 85,
    singleComposeSource: true,
    dualComposeUsed: false,
    sungAligned: true,
    stampCount: 20,
    forceInstrumentalFalse: true,
    lyricsInEveryChunk: true,
    provider: "elevenlabs",
    giftFramingPresent: true,
    payPathPresent: true,
    asrOverlap: null,
    coldLinkEarPass: null, // pending → fail
    masterSourceId: "mst_fc06_test",
    masterFingerprint: "fnv1a_test",
    gatePhase: "preview",
  });

  const intel = result.proofs.find((p) => p.id === "einstein_intelligibility");
  const ear = result.proofs.find((p) => p.id === "elon_cold_link_ear_checklist");
  assert(!!intel && intel.pass === false, "intelligibility proof must be false");
  assert(!!ear && ear.pass === false, "cold_link_ear proof must be false");
  assert(result.pass === false, "overall pass must be false when intelligibility/ear false");
  assert(result.failures.length > 0, "failures[] must be non-empty");
  assert(
    result.failures.some((f) => f.id === "einstein_intelligibility"),
    "failures must list einstein_intelligibility",
  );
  assert(
    result.failures.some((f) => f.id === "elon_cold_link_ear_checklist"),
    "failures must list elon_cold_link_ear_checklist",
  );

  // Empty failures while any proof.pass===false is FORBIDDEN
  const failedProofs = result.proofs.filter((p) => !p.pass);
  for (const fp of failedProofs) {
    assert(
      result.failures.some((f) => f.id === fp.id),
      `failed proof ${fp.id} missing from failures[]`,
    );
  }

  // codeBlockingFailures excludes ear-pending
  const blocking = codeBlockingFailures(result);
  assert(
    !blocking.some((f) => EAR_PENDING_PROOF_IDS.has(f.id)),
    "codeBlockingFailures must not include ear-pending ids",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        pass: result.pass,
        failureCount: result.failures.length,
        earPendingInFailures: result.failures
          .filter((f) => EAR_PENDING_PROOF_IDS.has(f.id))
          .map((f) => f.id),
        sampleFailures: result.failures.slice(0, 8).map((f) => f.id),
      },
      null,
      2,
    ),
  );
}

function checkParallelFullFails() {
  const cues = minimalCues();
  const wav = new Uint8Array(4096);
  const result = runPreviewAcceptanceGate({
    job: {
      id: "00000000-0000-4000-8000-00000000fc06",
      lyrics: cues.map((c) => c.text).join("\n"),
      lyricCues: cues,
      occasion: "birthday",
      previewReady: true,
      audioDurationSec: 120,
    },
    publishedWav: wav,
    cues,
    audioDurationSec: 120,
    singleComposeSource: true,
    dualComposeUsed: false,
    sungAligned: true,
    stampCount: 20,
    forceInstrumentalFalse: true,
    lyricsInEveryChunk: true,
    provider: "elevenlabs",
    giftFramingPresent: true,
    payPathPresent: true,
    asrOverlap: 0.9,
    coldLinkEarPass: true,
    masterSourceId: "mst_new_full",
    priorMasterSourceId: "mst_old_preview",
    previewDerivedFromFull: false,
    parallelFullRecompose: true,
    gatePhase: "promote",
  });
  assert(result.pass === false, "parallel full recompose must fail gate");
  assert(
    result.failures.some((f) => f.id === "elon_refuse_parallel_full_recompose"),
    "must list elon_refuse_parallel_full_recompose",
  );
  console.log(
    JSON.stringify(
      {
        ok: true,
        parallelCasePass: result.pass,
        hasRefuseProof: result.failures.some(
          (f) => f.id === "elon_refuse_parallel_full_recompose",
        ),
      },
      null,
      2,
    ),
  );
}

function checkDerivedPassesSameMaster() {
  const cues = minimalCues();
  // Extend cues span ~120s-ish for duration checks — use last end 84 for music bar
  const result = runPreviewAcceptanceGate({
    job: {
      id: "00000000-0000-4000-8000-00000000fc06",
      lyrics: cues.map((c) => c.text).join("\n"),
      lyricCues: cues,
      occasion: "birthday",
      previewReady: true,
      audioDurationSec: 14,
    },
    publishedWav: new Uint8Array(4096),
    cues,
    audioDurationSec: 14,
    singleComposeSource: true,
    dualComposeUsed: false,
    sungAligned: true,
    stampCount: 20,
    forceInstrumentalFalse: true,
    lyricsInEveryChunk: true,
    provider: "elevenlabs",
    giftFramingPresent: true,
    payPathPresent: true,
    asrOverlap: 0.9,
    coldLinkEarPass: true,
    masterSourceId: "mst_full",
    priorMasterSourceId: "mst_old",
    previewDerivedFromFull: true,
    parallelFullRecompose: true, // was parallel but derived clears it
    gatePhase: "promote",
  });
  const same = result.proofs.find((p) => p.id === "elon_same_master_source_id");
  const refuse = result.proofs.find((p) => p.id === "elon_refuse_parallel_full_recompose");
  const extendsP = result.proofs.find((p) => p.id === "elon_full_extends_preview_master");
  assert(!!same && same.pass, "derived → same_master ok");
  assert(!!refuse && refuse.pass, "derived → refuse parallel ok");
  assert(!!extendsP && extendsP.pass, "derived → extends ok");
  console.log(JSON.stringify({ ok: true, derivedSameMaster: true }, null, 2));
}

checkGateTheater();
checkParallelFullFails();
checkDerivedPassesSameMaster();
console.log("PROVE_GATE_CANNOT_LIE: PASS");
