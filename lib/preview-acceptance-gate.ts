/**
 * Elon preview acceptance gate (mandatory before previewReady / public URL).
 * Sources: Elon 6 + Atlas 10s buyer bar + Joseph 5-check + Einstein MUST-PASS A–G
 * (/workspace/songsnuggle/music/MUST-PASS-PREVIEW-CHECKLIST.md).
 *
 * FAIL ⇒ do not flip previewReady, do not publish public preview audio.
 * Human ear (MC) still owns product done/not-done — this gate is code proof only.
 */

import type { LyricCue } from "./cues";
import {
  activeCueIndex,
  cueSpanEnd,
  cuesLookEqualSliced,
  wordsLookUnreliable,
} from "./cues";
import {
  looksInstrumentalOnly,
  vocalPresenceFromWav,
} from "./music-elevenlabs";
import type { SongJob } from "./types";
import { displayLinesMissingFromSung } from "./lyric-parse";

/** MUSIC BAR v2 — heartfelt preview floor/default (Einstein G). */
export const MUSIC_BAR_FLOOR_SEC = 60;
export const MUSIC_BAR_DEFAULT_SEC = 70;
export const MUSIC_BAR_DENSE_SEC = 85;

export type PreviewGateProofId =
  // Elon 6
  | "elon_audio_plays_e2e"
  | "elon_vocal_not_instrumental"
  | "elon_lyric_cues_map_to_sung"
  | "elon_sync_not_equal_slice"
  | "elon_ui_line_changes_ge3"
  | "elon_cold_link_ear_checklist"
  // Atlas 10s buyer bar
  | "atlas_singing_voice_plus_bed"
  | "atlas_lyrics_on_screen"
  | "atlas_words_light_in_sync"
  | "atlas_gift_framing"
  | "atlas_obvious_pay_path"
  | "atlas_no_spinner_gt_10s"
  // Joseph 5-check
  | "joseph_leave_finding_10s"
  | "joseph_singing_music_le2s"
  | "joseph_see_lyrics"
  | "joseph_sync_follow_along"
  | "joseph_pay_path_usable"
  // Einstein A–G
  | "einstein_single_compose_source"
  | "einstein_with_timestamps_real_words"
  | "einstein_force_instrumental_false"
  | "einstein_lyrics_in_every_chunk"
  | "einstein_vocal_on_published_bytes"
  | "einstein_intelligibility"
  | "einstein_cue_span_matches_audio"
  | "einstein_karaoke_only_if_sung_aligned"
  | "einstein_music_bar_duration"
  | "einstein_xai_same_rules"
  | "einstein_el_music_sung_preview"
  | "einstein_display_lyrics_match_sung"
  // Elon / Joseph ONE-master
  | "elon_same_master_source_id"
  | "elon_full_extends_preview_master"
  | "elon_refuse_parallel_full_recompose";

export type PreviewGateProof = {
  id: PreviewGateProofId;
  pass: boolean;
  reason: string;
  detail?: Record<string, unknown>;
};

export type PreviewGateResult = {
  pass: boolean;
  failures: Array<{ id: PreviewGateProofId; reason: string }>;
  proofs: PreviewGateProof[];
  checkedAt: string;
  jobId: string;
  /** midFrac alone is NEVER sufficient — recorded for audit only. */
  midFrac?: number;
  publishedBytesKind?: "wav" | "mp3" | "none";
  publishedBytesLength?: number;
  sungAligned?: boolean;
  equalSliced?: boolean;
  singleComposeSource?: boolean;
  provider?: "elevenlabs" | "xai" | "synth" | "unknown";
  masterSourceId?: string | null;
  masterFingerprint?: string | null;
};

export type PreviewGateInput = {
  job: Pick<
    SongJob,
    | "id"
    | "lyrics"
    | "lyricCues"
    | "occasion"
    | "previewReady"
    | "audioDurationSec"
  > & {
    previewGate?: PreviewGateResult | null;
  };
  /** Exact bytes that /audio will serve (or that were just written for publish). */
  publishedWav?: Uint8Array | null;
  publishedMp3?: Uint8Array | null;
  cues: LyricCue[];
  audioDurationSec: number;
  /** True when one detailed compose fed both audio + cues (no parallel /v1/music MP3). */
  singleComposeSource: boolean;
  /** True when composition used with_timestamps and got usable words_timestamps. */
  sungAligned: boolean;
  stampCount?: number;
  forceInstrumentalFalse?: boolean;
  lyricsInEveryChunk?: boolean;
  provider: "elevenlabs" | "xai" | "synth" | "unknown";
  /** Ban xAI TTS+bed gift path unless real graph stamps (not distributeCues). */
  xaiHasRealGraphStamps?: boolean;
  /** Optional: ASR content-word overlap 0–1 vs job lyrics. */
  asrOverlap?: number | null;
  /** Human cold-link ear checklist recorded (MC). Never auto-true for product ship. */
  coldLinkEarPass?: boolean | null;
  /** Gift framing + pay path present in preview UI (code-level wiring check). */
  giftFramingPresent?: boolean;
  payPathPresent?: boolean;
  /** Dual-compose was used for this render — hard FAIL. */
  dualComposeUsed?: boolean;
  /**
   * Joseph ONE-master: shared compose/source id for preview + full.
   * Required for paid/promote gates; preview-only may mint a new id.
   */
  masterSourceId?: string | null;
  /** Fingerprint of published master head bytes. */
  masterFingerprint?: string | null;
  /** Prior preview master id (from job) — must match when full is gated. */
  priorMasterSourceId?: string | null;
  /** Prior preview fingerprint for relatedness check. */
  priorPreviewFingerprint?: string | null;
  /** Preview bytes (before overwrite) for relatedness — optional. */
  priorPreviewBytes?: Uint8Array | null;
  /**
   * True when preview KV was derived as a truncate/cap of THIS full master
   * in the same publish transaction (by construction).
   */
  previewDerivedFromFull?: boolean;
  /** True when a separate full recompose replaced an unrelated preview take. */
  parallelFullRecompose?: boolean;
  /** Gate mode: preview publish vs full/promote. */
  gatePhase?: "preview" | "full" | "promote";
};

function fail(
  id: PreviewGateProofId,
  reason: string,
  detail?: Record<string, unknown>,
): PreviewGateProof {
  return { id, pass: false, reason, detail };
}

function ok(
  id: PreviewGateProofId,
  reason: string,
  detail?: Record<string, unknown>,
): PreviewGateProof {
  return { id, pass: true, reason, detail };
}

function countWordStamps(cues: LyricCue[]): number {
  let n = 0;
  for (const c of cues || []) n += (c.words || []).length;
  return n;
}

function usableSungWordStamps(cues: LyricCue[]): boolean {
  const words = countWordStamps(cues);
  if (words < 8) return false;
  if (cuesLookEqualSliced(cues)) return false;
  let unreliableLines = 0;
  let withWords = 0;
  for (const c of cues) {
    if ((c.words || []).length >= 2) {
      withWords += 1;
      if (wordsLookUnreliable(c)) unreliableLines += 1;
    }
  }
  if (withWords < 3) return false;
  if (unreliableLines > withWords * 0.5) return false;
  return true;
}

/** Simulate UI line changes across playhead (≥3 distinct active lines). */
export function proveUiLineChanges(
  cues: LyricCue[],
  durationSec: number,
  minLines = 3,
): { pass: boolean; distinct: number; samples: number[] } {
  if (!cues.length || !(durationSec > 1)) {
    return { pass: false, distinct: 0, samples: [] };
  }
  const seen = new Set<number>();
  const samples: number[] = [];
  const steps = Math.max(12, Math.min(48, Math.floor(durationSec * 2)));
  for (let i = 0; i < steps; i += 1) {
    const t = (i / Math.max(1, steps - 1)) * Math.max(0, durationSec - 0.05);
    const idx = activeCueIndex(cues, t);
    if (idx >= 0) {
      seen.add(idx);
      samples.push(idx);
    }
  }
  return { pass: seen.size >= minLines, distinct: seen.size, samples };
}

export function musicBarTargetSeconds(job: {
  occasion: string;
  lyrics: string;
}): number {
  const heartfelt = [
    "birthday",
    "anniversary",
    "in-memory",
    "thank-you",
    "wedding",
  ].includes(job.occasion);
  if (!heartfelt) return 45;
  const words = (job.lyrics || "").split(/\s+/).filter(Boolean).length;
  if (words >= 180) return MUSIC_BAR_DENSE_SEC;
  return MUSIC_BAR_DEFAULT_SEC;
}

/**
 * Run the full acceptance gate. Call BEFORE writing public preview / flipping previewReady.
 */
export function runPreviewAcceptanceGate(
  input: PreviewGateInput,
): PreviewGateResult {
  const proofs: PreviewGateProof[] = [];
  const cues = input.cues || [];
  const dur =
    input.audioDurationSec > 1
      ? input.audioDurationSec
      : cueSpanEnd(cues) || 0;
  const publishedWav = input.publishedWav || null;
  const publishedMp3 = input.publishedMp3 || null;
  const publishedBytes = publishedMp3?.byteLength
    ? publishedMp3
    : publishedWav;
  const publishedKind: "wav" | "mp3" | "none" = publishedMp3?.byteLength
    ? "mp3"
    : publishedWav?.byteLength
      ? "wav"
      : "none";

  const equalSliced = cuesLookEqualSliced(cues);
  const sungWords = usableSungWordStamps(cues);
  const sungAligned = Boolean(input.sungAligned && sungWords && !equalSliced);

  let midFrac = 0;
  let instrumental = true;
  if (publishedWav && publishedWav.byteLength > 64) {
    const presence = vocalPresenceFromWav(publishedWav);
    midFrac = presence.midFrac;
    // midFrac alone ≠ pass — still require sung alignment for vocal proof
    instrumental = looksInstrumentalOnly(publishedWav, sungAligned);
  } else if (publishedKind === "mp3" && !publishedWav) {
    // Cannot FFT MP3 in-worker without decode — fail vocal-on-published unless stamps strong
    instrumental = !sungAligned;
    proofs.push(
      fail(
        "einstein_vocal_on_published_bytes",
        "Published bytes are MP3-only without same-source WAV for spectral gate — refuse (need WAV from single detailed compose).",
      ),
    );
  }

  // --- Einstein A: single compose ---
  if (input.dualComposeUsed) {
    proofs.push(
      fail(
        "einstein_single_compose_source",
        "Dual-compose used (parallel /v1/music MP3 + /v1/music/detailed) — Joseph may hear different bytes than gated WAV/cues.",
      ),
    );
  } else if (!input.singleComposeSource) {
    proofs.push(
      fail(
        "einstein_single_compose_source",
        "Published audio + cues are not proven from one detailed compose.",
      ),
    );
  } else {
    proofs.push(
      ok(
        "einstein_single_compose_source",
        "Single-compose source flag set (no parallel /v1/music MP3).",
      ),
    );
  }

  // --- Einstein B: force_instrumental + lyrics in chunks ---
  if (input.forceInstrumentalFalse === false) {
    proofs.push(
      fail(
        "einstein_force_instrumental_false",
        "force_instrumental was not false.",
      ),
    );
  } else {
    proofs.push(
      ok(
        "einstein_force_instrumental_false",
        "force_instrumental false (or omitted) on compose path.",
      ),
    );
  }
  if (input.lyricsInEveryChunk === false) {
    proofs.push(
      fail(
        "einstein_lyrics_in_every_chunk",
        "Composition plan had empty / instrumental-only chunk text.",
      ),
    );
  } else {
    proofs.push(
      ok(
        "einstein_lyrics_in_every_chunk",
        "Lyrics present in composition chunks (or N/A for non-EL).",
        { provider: input.provider },
      ),
    );
  }

  // --- Einstein C / Elon sync ---
  if (!cues.length) {
    proofs.push(
      fail("elon_lyric_cues_map_to_sung", "No lyric cues — refuse publish."),
    );
    proofs.push(
      fail(
        "einstein_with_timestamps_real_words",
        "Missing words_timestamps / cues.",
      ),
    );
  } else if (equalSliced) {
    proofs.push(
      fail(
        "elon_sync_not_equal_slice",
        "Equal-time distributeCues fingerprint — fake karaoke sync (a16 RCA).",
      ),
    );
    proofs.push(
      fail(
        "einstein_with_timestamps_real_words",
        "Word stamps look equal-sliced — not sung-aligned.",
      ),
    );
  } else if (!sungWords) {
    proofs.push(
      fail(
        "elon_lyric_cues_map_to_sung",
        "Cues lack usable sung word stamps (need real with_timestamps words).",
      ),
    );
    proofs.push(
      fail(
        "einstein_with_timestamps_real_words",
        `Insufficient/unreliable word stamps (count=${countWordStamps(cues)}, sungAligned=${input.sungAligned}).`,
      ),
    );
  } else {
    proofs.push(
      ok(
        "elon_lyric_cues_map_to_sung",
        "Usable sung word stamps present.",
        { words: countWordStamps(cues) },
      ),
    );
    proofs.push(
      ok("elon_sync_not_equal_slice", "Not equal-sliced distributeCues."),
    );
    proofs.push(
      ok(
        "einstein_with_timestamps_real_words",
        "Real word timestamps usable.",
        { stampCount: input.stampCount ?? countWordStamps(cues) },
      ),
    );
  }

  // --- Elon / Einstein vocal on published bytes ---
  if (!(publishedBytes && publishedBytes.byteLength > 512)) {
    proofs.push(
      fail("elon_audio_plays_e2e", "No published audio bytes to serve."),
    );
    proofs.push(
      fail(
        "einstein_vocal_on_published_bytes",
        "No published audio for vocal gate.",
      ),
    );
  } else if (instrumental) {
    proofs.push(
      fail(
        "elon_vocal_not_instrumental",
        `Published audio looks instrumental / no sung presence (midFrac=${midFrac.toFixed(3)}; midFrac alone ≠ pass).`,
        { midFrac },
      ),
    );
    if (!proofs.some((p) => p.id === "einstein_vocal_on_published_bytes")) {
      proofs.push(
        fail(
          "einstein_vocal_on_published_bytes",
          `Spectral/instrumental gate failed on published ${publishedKind} (midFrac=${midFrac.toFixed(3)}).`,
          { midFrac },
        ),
      );
    }
  } else if (!sungAligned) {
    // Stronger than midFrac: require sung stamps too
    proofs.push(
      fail(
        "elon_vocal_not_instrumental",
        `midFrac=${midFrac.toFixed(3)} but missing sung-aligned stamps — midFrac alone ≠ vocal intelligibility.`,
        { midFrac },
      ),
    );
    if (!proofs.some((p) => p.id === "einstein_vocal_on_published_bytes")) {
      proofs.push(
        fail(
          "einstein_vocal_on_published_bytes",
          "Published bytes cleared weak spectral check but not sung-aligned — refuse.",
          { midFrac },
        ),
      );
    }
  } else {
    proofs.push(
      ok(
        "elon_audio_plays_e2e",
        `Published ${publishedKind} bytes present (${publishedBytes.byteLength}).`,
      ),
    );
    proofs.push(
      ok(
        "elon_vocal_not_instrumental",
        `Vocal presence + sung stamps (midFrac=${midFrac.toFixed(3)}; stamps required).`,
        { midFrac },
      ),
    );
    if (!proofs.some((p) => p.id === "einstein_vocal_on_published_bytes")) {
      proofs.push(
        ok(
          "einstein_vocal_on_published_bytes",
          "Vocal gate on published WAV passed with sung alignment.",
          { midFrac },
        ),
      );
    }
  }

  // --- Display lyrics must match sung stamps (fc06: never show unsung script) ---
  {
    const display = (input.job.lyrics || "").trim();
    const missing = display
      ? displayLinesMissingFromSung(display, cues)
      : [];
    if (missing.length) {
      proofs.push(
        fail(
          "einstein_display_lyrics_match_sung",
          `Display lyric line(s) missing from sung word stamps (${missing.length}): ` +
            missing
              .slice(0, 3)
              .map((l) => `"${l.slice(0, 72)}"`)
              .join("; "),
          { missingCount: missing.length, missing: missing.slice(0, 6) },
        ),
      );
    } else if (display && cues.length) {
      proofs.push(
        ok(
          "einstein_display_lyrics_match_sung",
          "Every display lyric line appears in sung word stamps.",
        ),
      );
    } else {
      proofs.push(
        fail(
          "einstein_display_lyrics_match_sung",
          "No display lyrics and/or cues to verify sung match.",
        ),
      );
    }
  }

  // Cue span ≈ audio
  const span = cueSpanEnd(cues);
  if (cues.length && dur > 1 && span > 0.5 && Math.abs(span - dur) > 2.5) {
    proofs.push(
      fail(
        "einstein_cue_span_matches_audio",
        `Cue span ${span.toFixed(1)}s vs audio ${dur.toFixed(1)}s (>2.5s slack).`,
      ),
    );
  } else if (cues.length && dur > 1) {
    proofs.push(
      ok(
        "einstein_cue_span_matches_audio",
        `Cue span ≈ audio (${span.toFixed(1)}s / ${dur.toFixed(1)}s).`,
      ),
    );
  } else {
    proofs.push(
      fail(
        "einstein_cue_span_matches_audio",
        "Cannot verify cue span vs audio duration.",
      ),
    );
  }

  // JOSEPH LOCK: rolling/synced lyric highlight KILLED — static lyrics only.
  // Karaoke sync follow-along + equal-slice highlight checks are DEFERRED (not mandatory).
  // Cues may still exist for later; UI must not karaoke. Record as deferred PASS.
  proofs.push(
    ok(
      "einstein_karaoke_only_if_sung_aligned",
      "DEFERRED (Joseph lock): karaoke highlight disabled — static lyrics only; cues retained for later.",
      { karaokeUiEnabled: false, sungAligned, equalSliced },
    ),
  );
  proofs.push(
    ok(
      "atlas_words_light_in_sync",
      "DEFERRED (Joseph lock): word-light sync not required while static lyrics ship.",
    ),
  );
  proofs.push(
    ok(
      "joseph_sync_follow_along",
      "DEFERRED (Joseph lock): sync follow-along off — static lyrics visible instead.",
    ),
  );

  // UI ≥3 line changes was a karaoke follow proof — deferred under Joseph lock.
  const lineProof = proveUiLineChanges(cues, dur || span || 45, 3);
  proofs.push(
    ok(
      "elon_ui_line_changes_ge3",
      `DEFERRED (Joseph lock): karaoke line-follow not mandatory (distinct=${lineProof.distinct} if cues present).`,
      { distinct: lineProof.distinct, deferred: true },
    ),
  )

  // Intelligibility: ASR floor OR human ear — never midFrac alone; ban weak xAI+bed
  const asr = input.asrOverlap;
  const ear = input.coldLinkEarPass;
  let intelligibilityPass = false;
  let intelligibilityReason = "";
  if (input.provider === "xai") {
    intelligibilityPass = false;
    intelligibilityReason =
      "xAI TTS+bed intelligibility (even Whisper≈0.95) ≠ MUSIC bar product pass — EL Music required.";
  } else if (typeof asr === "number" && asr >= 0.5 && sungAligned && !instrumental) {
    intelligibilityPass = true;
    intelligibilityReason = `ASR overlap ${(asr * 100).toFixed(0)}% + sung stamps on EL path.`;
  } else if (ear === true && sungAligned && !instrumental && input.provider === "elevenlabs") {
    intelligibilityPass = true;
    intelligibilityReason =
      "Human cold-link ear checklist recorded PASS (MC).";
  } else {
    intelligibilityPass = false;
    if (ear === false) {
      intelligibilityReason = "Cold-link ear checklist FAIL.";
    } else if (typeof asr === "number") {
      intelligibilityReason = `ASR overlap ${(asr * 100).toFixed(0)}% below 50% floor.`;
    } else {
      intelligibilityReason =
        "Intelligibility pending: need ASR ≥50% content-word overlap OR MC cold-link ear PASS on live URL. Sung stamps+spectrum necessary but not sufficient.";
    }
  }
  proofs.push(
    intelligibilityPass
      ? ok("einstein_intelligibility", intelligibilityReason)
      : fail("einstein_intelligibility", intelligibilityReason),
  );
  proofs.push(
    intelligibilityPass && ear === true
      ? ok(
          "elon_cold_link_ear_checklist",
          "Cold-link ear checklist recorded PASS.",
        )
      : fail(
          "elon_cold_link_ear_checklist",
          ear === false
            ? "Cold-link ear checklist FAIL."
            : "Cold-link ear checklist not recorded — MC owns ear; code will not claim fixed.",
        ),
  );

  // Atlas / Joseph UX proofs (code-level)
  const lyricsOnScreen = cues.length >= 2 || Boolean(input.job.lyrics?.trim());
  proofs.push(
    lyricsOnScreen
      ? ok("atlas_lyrics_on_screen", "Lyrics/cues available for on-screen display.")
      : fail("atlas_lyrics_on_screen", "No lyrics for on-screen display."),
  );
  proofs.push(
    lyricsOnScreen
      ? ok("joseph_see_lyrics", "Lyrics present for Joseph check.")
      : fail("joseph_see_lyrics", "No lyrics visible."),
  );

  const gift = input.giftFramingPresent !== false;
  const pay = input.payPathPresent !== false;
  proofs.push(
    gift
      ? ok("atlas_gift_framing", "Gift framing assumed present in PreviewStudio.")
      : fail("atlas_gift_framing", "Gift framing missing."),
  );
  proofs.push(
    pay
      ? ok("atlas_obvious_pay_path", "Pay/checkout path present in preview UI.")
      : fail("atlas_obvious_pay_path", "Pay path missing."),
  );
  proofs.push(
    pay
      ? ok("joseph_pay_path_usable", "Checkout path wired for Joseph check.")
      : fail("joseph_pay_path_usable", "Pay path not usable."),
  );

  // Atlas singing+bed / Joseph hear ≤2s — proxy via vocal+duration
  if (!instrumental && sungAligned && publishedBytes) {
    proofs.push(
      ok(
        "atlas_singing_voice_plus_bed",
        "Sung-aligned vocal on published bytes (bed implied by EL Music / mix).",
      ),
    );
    proofs.push(
      ok(
        "joseph_singing_music_le2s",
        "Code proxy: vocal+stamps present (human confirms ≤2s after Play).",
      ),
    );
    proofs.push(
      ok(
        "joseph_leave_finding_10s",
        "Code proxy: audio+lyrics+cues ready (human confirms leave Finding ≤10s).",
      ),
    );
    proofs.push(
      ok(
        "atlas_no_spinner_gt_10s",
        "Code proxy: preview assets ready (human confirms no spinner >10s).",
      ),
    );
  } else {
    proofs.push(
      fail(
        "atlas_singing_voice_plus_bed",
        "No singing voice+bed proof on published bytes.",
      ),
    );
    proofs.push(
      fail(
        "joseph_singing_music_le2s",
        "Cannot claim singing+music ≤2s without vocal+stamps.",
      ),
    );
    proofs.push(
      fail(
        "joseph_leave_finding_10s",
        "Finding leave ≤10s requires working vocal preview.",
      ),
    );
    proofs.push(
      fail(
        "atlas_no_spinner_gt_10s",
        "Spinner/ready bar fails without publishable vocal preview.",
      ),
    );
  }

  // MUSIC BAR duration (heartfelt)
  const barTarget = musicBarTargetSeconds(input.job);
  if (barTarget >= MUSIC_BAR_FLOOR_SEC) {
    if (!(dur >= MUSIC_BAR_FLOOR_SEC - 0.5)) {
      proofs.push(
        fail(
          "einstein_music_bar_duration",
          `Heartfelt preview ${dur.toFixed(1)}s < MUSIC BAR floor ${MUSIC_BAR_FLOOR_SEC}s (target ${barTarget}s).`,
        ),
      );
    } else {
      proofs.push(
        ok(
          "einstein_music_bar_duration",
          `Duration ${dur.toFixed(1)}s meets MUSIC BAR floor (≥${MUSIC_BAR_FLOOR_SEC}s).`,
        ),
      );
    }
  } else {
    proofs.push(
      ok(
        "einstein_music_bar_duration",
        `Non-heartfelt preview target ${barTarget}s — MUSIC BAR N/A.`,
      ),
    );
  }

  // xAI TTS+bed is NEVER the product preview fix (MC: Whisper-high a16 still FAIL — ≠ MUSIC bar).
  // Priority path: EL Music single-compose sung preview only.
  if (input.provider === "xai") {
    proofs.push(
      fail(
        "einstein_xai_same_rules",
        "xAI TTS+bed ≠ MUSIC bar — refuse as product preview (even if ASR/Whisper high). EL Music single-compose required.",
      ),
    );
    proofs.push(
      fail(
        "einstein_el_music_sung_preview",
        "Provider is xAI TTS+bed — not EL Music single-compose sung preview.",
      ),
    );
  } else if (input.provider === "elevenlabs") {
    proofs.push(
      ok(
        "einstein_xai_same_rules",
        "Provider elevenlabs — not xAI TTS+bed gift path.",
      ),
    );
    if (input.singleComposeSource && !input.dualComposeUsed && sungAligned) {
      proofs.push(
        ok(
          "einstein_el_music_sung_preview",
          "EL Music single-compose with sung-aligned stamps.",
        ),
      );
    } else {
      proofs.push(
        fail(
          "einstein_el_music_sung_preview",
          "EL path missing single-compose and/or sung-aligned stamps.",
        ),
      );
    }
  } else {
    proofs.push(
      fail(
        "einstein_xai_same_rules",
        `Provider ${input.provider} is not EL Music sung preview.`,
      ),
    );
    proofs.push(
      fail(
        "einstein_el_music_sung_preview",
        `Provider ${input.provider} — need EL Music single-compose.`,
      ),
    );
  }


  // --- Elon / Joseph ONE-master (SHIP, not optional) ---
  {
    const phase = input.gatePhase || "preview";
    const srcId = (input.masterSourceId || "").trim();
    const priorId = (input.priorMasterSourceId || "").trim();
    const parallel = Boolean(input.parallelFullRecompose);
    const derived = Boolean(input.previewDerivedFromFull);

    if (phase === "preview") {
      if (!srcId) {
        proofs.push(
          fail(
            "elon_same_master_source_id",
            "Preview publish missing masterSourceId — mint from published bytes.",
          ),
        );
      } else {
        proofs.push(
          ok(
            "elon_same_master_source_id",
            `Preview masterSourceId=${srcId}`,
            { masterSourceId: srcId },
          ),
        );
      }
      // Preview-only: full-extends + refuse-parallel are N/A until full exists.
      proofs.push(
        ok(
          "elon_full_extends_preview_master",
          "N/A at preview phase — full not published yet.",
          { phase },
        ),
      );
      proofs.push(
        ok(
          "elon_refuse_parallel_full_recompose",
          "N/A at preview phase — no full recompose yet.",
          { phase },
        ),
      );
    } else {
      // full / promote
      if (!srcId) {
        proofs.push(
          fail(
            "elon_same_master_source_id",
            "Full/promote missing masterSourceId.",
          ),
        );
      } else if (priorId && priorId !== srcId && !derived) {
        proofs.push(
          fail(
            "elon_same_master_source_id",
            `Full masterSourceId ${srcId} ≠ preview ${priorId} and preview was not re-derived from full.`,
            { masterSourceId: srcId, priorMasterSourceId: priorId },
          ),
        );
      } else {
        proofs.push(
          ok(
            "elon_same_master_source_id",
            derived && priorId && priorId !== srcId
              ? `Preview re-derived from full; masterSourceId now ${srcId} (was ${priorId}).`
              : `Shared masterSourceId=${srcId}`,
            { masterSourceId: srcId, priorMasterSourceId: priorId || null, derived },
          ),
        );
      }

      if (parallel && !derived) {
        proofs.push(
          fail(
            "elon_refuse_parallel_full_recompose",
            "Parallel full recompose without replacing preview from that full master — product FAIL (Joseph ONE-master).",
          ),
        );
        proofs.push(
          fail(
            "elon_full_extends_preview_master",
            "Full does not extend/match preview master (parallel render).",
          ),
        );
      } else if (derived) {
        proofs.push(
          ok(
            "elon_refuse_parallel_full_recompose",
            "Preview KV overwritten/capped from this full master — dual-take cleared.",
          ),
        );
        proofs.push(
          ok(
            "elon_full_extends_preview_master",
            "Preview derived as cap/overwrite of full master (same take by construction).",
          ),
        );
      } else {
        // Byte relatedness when both available
        const prev = input.priorPreviewBytes;
        const fullBytes = publishedBytes;
        if (prev && fullBytes && prev.byteLength > 512 && fullBytes.byteLength > 512) {
          const headN = Math.min(48_000, prev.byteLength, fullBytes.byteLength);
          let same = 0;
          for (let i = 0; i < headN; i += 1) if (prev[i] === fullBytes[i]) same += 1;
          const ratio = headN ? same / headN : 0;
          if (ratio >= 0.98 || (priorId && priorId === srcId && ratio >= 0.5)) {
            proofs.push(
              ok(
                "elon_full_extends_preview_master",
                `Full extends/matches preview head (${(ratio * 100).toFixed(1)}%).`,
                { ratio },
              ),
            );
            proofs.push(
              ok(
                "elon_refuse_parallel_full_recompose",
                "No parallel full recompose detected.",
              ),
            );
          } else {
            proofs.push(
              fail(
                "elon_full_extends_preview_master",
                `Full vs preview head match only ${(ratio * 100).toFixed(1)}% — not same take.`,
                { ratio },
              ),
            );
            proofs.push(
              fail(
                "elon_refuse_parallel_full_recompose",
                "Suspected parallel full recompose — refuse or overwrite preview from full.",
              ),
            );
          }
        } else if (priorId && priorId === srcId) {
          proofs.push(
            ok(
              "elon_full_extends_preview_master",
              "Same masterSourceId retained for full.",
            ),
          );
          proofs.push(
            ok(
              "elon_refuse_parallel_full_recompose",
              "Same masterSourceId — not a parallel swap.",
            ),
          );
        } else {
          proofs.push(
            fail(
              "elon_full_extends_preview_master",
              "Cannot prove full extends preview (missing prior bytes/id and not derived).",
            ),
          );
          proofs.push(
            fail(
              "elon_refuse_parallel_full_recompose",
              "Cannot prove full is not a parallel recompose.",
            ),
          );
        }
      }
    }
  }


  // Dedupe by id (keep first)
  const seen = new Set<string>();
  const deduped: PreviewGateProof[] = [];
  for (const p of proofs) {
    if (seen.has(p.id)) continue;
    seen.add(p.id);
    deduped.push(p);
  }

  // Elon NO-GO: pass MUST NOT be true while intelligibility OR cold-link ear is false.
  // Empty failures[] while any proof.pass===false is FORBIDDEN — list every failed proof.
  // Karaoke sync proofs remain deferred (Joseph lock) via ok() above; they do not lie.
  // Product DONE still owned by Master Chief / Joseph ear — this flag is code honesty only.
  const failures = deduped
    .filter((p) => !p.pass)
    .map((p) => ({ id: p.id, reason: p.reason }));

  return {
    pass: failures.length === 0,
    failures,
    proofs: deduped,
    checkedAt: new Date().toISOString(),
    jobId: input.job.id,
    midFrac,
    publishedBytesKind: publishedKind,
    publishedBytesLength: publishedBytes?.byteLength || 0,
    sungAligned,
    equalSliced,
    singleComposeSource: input.singleComposeSource && !input.dualComposeUsed,
    provider: input.provider,
    masterSourceId: input.masterSourceId || null,
    masterFingerprint: input.masterFingerprint || null,
  };
}


/** Proofs that may stay FAIL until MC ear / ASR — still counted in pass/failures. */
export const EAR_PENDING_PROOF_IDS = new Set<PreviewGateProofId>([
  "einstein_intelligibility",
  "elon_cold_link_ear_checklist",
]);

/** Failures that mean bad/mismatched audio — block writing public bytes. */
export function codeBlockingFailures(
  result: PreviewGateResult,
): Array<{ id: PreviewGateProofId; reason: string }> {
  return result.failures.filter((f) => !EAR_PENDING_PROOF_IDS.has(f.id));
}

/** Throw with structured message when gate fails (blocks previewReady). */
export function assertPreviewGateOrThrow(result: PreviewGateResult): void {
  if (result.pass) return;
  const top = result.failures
    .slice(0, 6)
    .map((f) => `${f.id}: ${f.reason}`)
    .join(" | ");
  throw new Error(
    `PREVIEW_GATE_FAIL: ${result.failures.length} proof(s) failed — ${top}`,
  );
}
