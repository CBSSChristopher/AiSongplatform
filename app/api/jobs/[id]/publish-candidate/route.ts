import { NextResponse } from "next/server";
import { cueSpanEnd } from "@/lib/cues";
import type { LyricCue } from "@/lib/cues";
import {
  cuesWithSungWordsOnly,
  displayLinesMissingFromSung,
  lyricsFromSungCues,
} from "@/lib/lyric-parse";
import type { PreviewGateResult } from "@/lib/preview-acceptance-gate";
import { getJob, publicJob, updateJob } from "@/lib/store";

/**
 * Admin-only: mark a job previewReady using already-uploaded KV audio + cues.
 * For MC ear candidates after local EL single-compose + wrangler kv put.
 * Does NOT claim product DONE — MC owns ear.
 *
 * Hard rules (fc06 RCA):
 * - audioDurationSec must be true published length (refuse plan/120 lie vs cue span)
 * - display lyrics must match sung word stamps (align to sung cues if body.lyrics omitted)
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const secret = process.env.REPAIR_SECRET || process.env.ADMIN_REPAIR_SECRET || "";
  const header = request.headers.get("x-repair-secret") || "";
  if (!secret || header !== secret) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }

  let body: {
    cues?: LyricCue[];
    audioDurationSec?: number;
    previewGate?: PreviewGateResult;
    lyrics?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  let cues = cuesWithSungWordsOnly(Array.isArray(body.cues) ? body.cues : []);
  if (!cues.length) {
    return NextResponse.json({ error: "cues required after dropping unsung shells." }, { status: 400 });
  }
  const audioDurationSec =
    typeof body.audioDurationSec === "number" && body.audioDurationSec > 1
      ? body.audioDurationSec
      : null;
  if (!audioDurationSec) {
    return NextResponse.json({ error: "audioDurationSec required." }, { status: 400 });
  }

  const span = cueSpanEnd(cues);
  if (span > 0.5 && Math.abs(span - audioDurationSec) > 2.5) {
    return NextResponse.json(
      {
        error:
          "audioDurationSec honesty fail: cue span vs claimed duration (>2.5s). " +
          "Pass true published WAV/MP3 length — never composition-plan target.",
        cueSpanSec: span,
        audioDurationSec,
      },
      { status: 422 },
    );
  }

  // Prefer explicit sung lyrics; else rebuild from cue texts (what was sung).
  const sungLyrics = (body.lyrics || "").trim() || lyricsFromSungCues(cues);
  const missing = displayLinesMissingFromSung(sungLyrics, cues);
  if (missing.length) {
    return NextResponse.json(
      {
        error:
          "Display lyric line(s) missing from sung word stamps — align display to sung or recompose.",
        missing: missing.slice(0, 8),
      },
      { status: 422 },
    );
  }

  const next = await updateJob(id, {
    lyricCues: cues,
    lyrics: sungLyrics,
    previewReady: true,
    previewGate: body.previewGate ?? job.previewGate ?? null,
    audioDurationSec,
    status: "preview",
    listenCompletedAt: null,
  });

  return NextResponse.json({
    job: next ? publicJob(next) : publicJob({ ...job, previewReady: true }),
    note: "MC ear candidate publish — not product DONE",
  });
}
