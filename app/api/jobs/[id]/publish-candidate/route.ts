import { NextResponse } from "next/server";
import { getJob, publicJob, updateJob } from "@/lib/store";
import type { LyricCue } from "@/lib/cues";
import type { PreviewGateResult } from "@/lib/preview-acceptance-gate";

/**
 * Admin-only: mark a job previewReady using already-uploaded KV audio + cues.
 * For MC ear candidates after local EL single-compose + wrangler kv put.
 * Does NOT claim product DONE — MC owns ear.
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
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  const cues = Array.isArray(body.cues) ? body.cues : [];
  if (!cues.length) {
    return NextResponse.json({ error: "cues required." }, { status: 400 });
  }
  const audioDurationSec =
    typeof body.audioDurationSec === "number" && body.audioDurationSec > 1
      ? body.audioDurationSec
      : null;
  if (!audioDurationSec) {
    return NextResponse.json({ error: "audioDurationSec required." }, { status: 400 });
  }

  const next = await updateJob(id, {
    lyricCues: cues,
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
