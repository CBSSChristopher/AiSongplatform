import { NextResponse } from "next/server";
import { brand } from "@/lib/brand";
import { getJob, readAudio } from "@/lib/store";
import { PREVIEW_MAX_SECONDS, capPreviewBytes } from "@/lib/preview-cap";
import { mp3XingMismatch, wavDurationSeconds } from "@/lib/mp3";

function parseRange(header: string | null, size: number): { start: number; end: number } | null {
  if (!header || !header.startsWith("bytes=") || size <= 0) return null;
  const spec = header.slice(6).trim();
  // Single range only (Safari/iOS audio uses one).
  const [startRaw, endRaw] = spec.split("-", 2);
  let start: number;
  let end: number;
  if (startRaw === "") {
    // suffix: bytes=-N
    const suffix = Number(endRaw);
    if (!Number.isFinite(suffix) || suffix <= 0) return null;
    start = Math.max(0, size - suffix);
    end = size - 1;
  } else {
    start = Number(startRaw);
    end = endRaw === undefined || endRaw === "" ? size - 1 : Number(endRaw);
    if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
    if (start < 0 || start >= size) return null;
    end = Math.min(end, size - 1);
    if (end < start) return null;
  }
  return { start, end };
}

function fixedAudioBody(bytes: Uint8Array): Uint8Array {
  // Contiguous buffer so CF/workerd can advertise Content-Length (streams drop it).
  return bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength
    ? bytes
    : bytes.slice();
}

function asBodyInit(bytes: Uint8Array): BodyInit {
  const u8 = fixedAudioBody(bytes);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

function audioResponse(
  bytes: Uint8Array,
  contentType: string,
  request: Request,
  extraHeaders: Record<string, string> = {},
) {
  const body = fixedAudioBody(bytes);
  const size = body.byteLength;
  const base: Record<string, string> = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-cache, no-store, must-revalidate",
    ...extraHeaders,
  };

  const rangeHeader = request.headers.get("range");
  if (rangeHeader && !parseRange(rangeHeader, size)) {
    return new Response(null, {
      status: 416,
      headers: {
        ...base,
        "Content-Range": `bytes */${size}`,
        "Content-Length": "0",
      },
    });
  }

  const range = parseRange(rangeHeader, size);
  const isHead = request.method === "HEAD";
  if (!range) {
    // Prefer platform Response + Uint8Array over NextResponse(Buffer) — OpenNext
    // stream-wraps NextResponse and Cloudflare then omits Content-Length on GET.
    return new Response(isHead ? null : asBodyInit(body), {
      status: 200,
      headers: {
        ...base,
        "Content-Length": String(size),
      },
    });
  }

  const { start, end } = range;
  const chunk = fixedAudioBody(body.subarray(start, end + 1));
  return new Response(isHead ? null : asBodyInit(chunk), {
    status: 206,
    headers: {
      ...base,
      "Content-Length": String(chunk.byteLength),
      "Content-Range": `bytes ${start}-${end}/${size}`,
    },
  });
}

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }

  const url = new URL(request.url);
  const wantFull = url.searchParams.get("full") === "1";
  if (wantFull && !job.paidAt) {
    return NextResponse.json({ error: "Full song unlocks after payment." }, { status: 402 });
  }

  const kind = wantFull && job.fullReady ? "full" : "preview";
  if (kind === "preview" && !job.previewReady) {
    return NextResponse.json({ error: "Preview is not ready yet." }, { status: 409 });
  }

  try {
    const download = url.searchParams.get("download") === "1";
    const formatParam = (url.searchParams.get("format") || "").toLowerCase();
    // Playback + phone download: MP3. Studio master: format=wav only.
    const wantWav = formatParam === "wav";
    const wantMp3 = !wantWav;

    let bytes: Uint8Array | null = null;
    let contentType = "audio/wav";
    let ext = "wav";

    if (wantMp3) {
      bytes = await readAudio(id, kind, "mp3");
      // Paid full must never ship truncated preview MP3 with lying Xing.
      if (kind === "full" && bytes && mp3XingMismatch(bytes)) {
        console.error("[audio] full MP3 Xing/filesize mismatch — falling back to WAV", { id });
        bytes = null;
      }
      if (kind === "full" && bytes) {
        // Extra guard: if WAV master is clearly longer than ~preview, refuse preview-sized MP3.
        const wav = await readAudio(id, "full", "wav");
        const wavSec = wav ? wavDurationSeconds(wav) : 0;
        if (wavSec > PREVIEW_MAX_SECONDS + 8 && bytes.byteLength < 1_200_000) {
          // ~45s @128kbps ≈ 720KB; 1.2MB is still preview-ish for gift 85s@192k (~2MB).
          const estSec = (bytes.byteLength * 8) / 160_000;
          if (estSec < PREVIEW_MAX_SECONDS + 5) {
            console.error("[audio] full MP3 looks preview-length — falling back to WAV", {
              id,
              mp3Bytes: bytes.byteLength,
              wavSec,
            });
            bytes = null;
          }
        }
      }
      if (bytes && bytes.byteLength > 0) {
        contentType = "audio/mpeg";
        ext = "mp3";
      } else {
        bytes = await readAudio(id, kind, "wav");
        contentType = "audio/wav";
        ext = "wav";
      }
    } else {
      bytes = await readAudio(id, kind, "wav");
      contentType = "audio/wav";
      ext = "wav";
    }

    if (!bytes || bytes.byteLength === 0) {
      return NextResponse.json({ error: "Audio file missing." }, { status: 404 });
    }

    // Unpaid preview: MUSIC BAR heartfelt may exceed 45s marketing copy (Einstein G).
    // Cap to stored audioDurationSec when ≥60; else legacy 45s.
    if (kind === "preview") {
      const stored = job.audioDurationSec;
      const capSec =
        typeof stored === "number" && stored >= 60
          ? Math.min(stored, 90)
          : PREVIEW_MAX_SECONDS;
      bytes = capPreviewBytes(bytes, contentType, capSec);
    }

    const filename = `${job.recipientName || brand.fileSlug}-${kind}.${ext}`.replace(
      /[^\w.-]+/g,
      "-",
    );
    return audioResponse(bytes, contentType, request, {
      ...(download ? { "Content-Disposition": `attachment; filename="${filename}"` } : {}),
    });
  } catch {
    return NextResponse.json({ error: "Audio file missing." }, { status: 404 });
  }
}

export async function HEAD(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  // audioResponse already omits body when request.method === HEAD.
  return GET(request, context);
}
