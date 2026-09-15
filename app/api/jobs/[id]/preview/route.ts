import { NextResponse } from "next/server";
import { writePreviewAudio } from "@/lib/music";
import { getJob, publicJob, updateJob } from "@/lib/store";
import type { PreviewGateResult } from "@/lib/preview-acceptance-gate";

function gateFromError(error: unknown, jobId: string): PreviewGateResult | null {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (!/PREVIEW_GATE_FAIL/i.test(message)) return null;
  return {
    pass: false,
    failures: [{ id: "einstein_intelligibility", reason: message.slice(0, 500) }],
    proofs: [],
    checkedAt: new Date().toISOString(),
    jobId,
  };
}

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }
  if (!job.lyrics.trim()) {
    return NextResponse.json({ error: "Approve lyrics before making a preview." }, { status: 400 });
  }

  try {
    const {
      cues,
      audioDurationSec,
      previewGate,
      lyrics: sungLyrics,
      masterSourceId,
      masterFingerprint,
    } = await writePreviewAudio({ ...job });
    // writePreviewAudio throws on code-blocking failures. Ear/intelligibility may
    // still leave gate.pass=false — previewReady allowed for MC ear URL, honest gate.
    if (!previewGate.pass) {
      const { codeBlockingFailures } = await import("@/lib/preview-acceptance-gate");
      const blocking = codeBlockingFailures(previewGate);
      if (blocking.length) {
        await updateJob(id, {
          previewReady: false,
          previewGate,
          lyricCues: cues,
          lyrics: sungLyrics || job.lyrics,
          audioDurationSec: audioDurationSec || null,
          masterSourceId,
          masterFingerprint,
        });
        return NextResponse.json(
          {
            error: "PREVIEW_GATE_FAIL",
            previewGate,
            job: publicJob({ ...job, previewReady: false, previewGate }),
          },
          { status: 422 },
        );
      }
    }

    const next = await updateJob(id, {
      previewReady: true,
      previewGate,
      listenCompletedAt: null,
      status: "preview",
      lyricCues: cues,
      // Align display lyrics to sung cues — never keep unsung script after compose.
      lyrics: sungLyrics || job.lyrics,
      audioDurationSec: audioDurationSec || null,
      masterSourceId,
      masterFingerprint,
    });

    return NextResponse.json({
      job: next
        ? publicJob(next)
        : publicJob({
            ...job,
            previewReady: true,
            previewGate,
            listenCompletedAt: null,
          }),
      previewGate,
    });
  } catch (error) {
    console.error("[preview]", error);
    const message =
      error instanceof Error ? error.message : "Could not create preview audio.";
    const attached =
      error &&
      typeof error === "object" &&
      "previewGate" in error &&
      (error as { previewGate?: PreviewGateResult }).previewGate
        ? (error as { previewGate: PreviewGateResult }).previewGate
        : null;
    let previewGate = attached ?? gateFromError(error, id);
    try {
      // Re-run is expensive; persist failure marker so audit can see refuse.
      if (previewGate) {
        await updateJob(id, { previewReady: false, previewGate });
      }
    } catch {
      /* ignore persist errors */
    }
    const status = /PREVIEW_GATE_FAIL/i.test(message)
      ? 422
      : /XAI_API_KEY|not set|missing/i.test(message)
        ? 502
        : /rate limit|429/i.test(message)
          ? 502
          : 502;
    return NextResponse.json(
      { error: message, previewGate: previewGate ?? undefined },
      { status },
    );
  }
}
