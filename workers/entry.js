/**
 * SongSnuggle Worker entry: audio Range fast-path BEFORE OpenNext.
 *
 * OpenNext turns NextResponse bodies into streams and Cloudflare then drops
 * Content-Length on GET — Safari/iOS <audio> stalls mid-play (5–12s).
 * Serving MP3 from KV here with a fixed-length Uint8Array body keeps
 * Content-Length + Accept-Ranges + 206 honest for /preview and /song.
 */
import openNext from "../.open-next/worker.js";

export {
  DOQueueHandler,
  DOShardedTagCache,
  BucketCachePurge,
} from "../.open-next/worker.js";

const PREVIEW_MAX_SECONDS = 45;

function parseRange(header, size) {
  if (!header || !header.startsWith("bytes=") || size <= 0) return null;
  const spec = header.slice(6).trim();
  const [startRaw, endRaw] = spec.split("-", 2);
  let start;
  let end;
  if (startRaw === "") {
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

function audioKey(jobId, kind, format) {
  return format === "mp3" ? `audio:${jobId}:${kind}:mp3` : `audio:${jobId}:${kind}`;
}

function fixedBody(bytes) {
  // Contiguous ArrayBuffer-backed view so workerd sets Content-Length.
  const copy = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return copy.byteOffset === 0 && copy.byteLength === copy.buffer.byteLength
    ? copy
    : copy.slice();
}

function buildAudioResponse(bytes, contentType, request, extra = {}) {
  const body = fixedBody(bytes);
  const size = body.byteLength;
  const base = {
    "Content-Type": contentType,
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, no-cache, no-store, must-revalidate",
    "X-Audio-Fastpath": "1",
    ...extra,
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
    return new Response(isHead ? null : body, {
      status: 200,
      headers: {
        ...base,
        "Content-Length": String(size),
      },
    });
  }

  const { start, end } = range;
  const chunk = body.subarray(start, end + 1);
  const out = fixedBody(chunk);
  return new Response(isHead ? null : out, {
    status: 206,
    headers: {
      ...base,
      "Content-Length": String(out.byteLength),
      "Content-Range": `bytes ${start}-${end}/${size}`,
    },
  });
}

/** Byte-truncate MP3 by duration ratio (Xing rewrite deferred — prefer full preview MP3). */
function roughCapMp3(bytes, maxSeconds) {
  if (!bytes || maxSeconds <= 0 || bytes.byteLength < 4096) return bytes;
  // ~180kbps average; only cut if clearly longer than cap.
  const maxBytes = Math.floor((180_000 * maxSeconds) / 8) + 65_536;
  if (bytes.byteLength <= maxBytes) return bytes;
  return bytes.subarray(0, maxBytes);
}

async function tryServeAudio(request, env) {
  if (!env?.AUDIO || !env?.DB) return null;
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/jobs\/([0-9a-f-]{36})\/audio\/?$/i);
  if (!match) return null;
  if (request.method !== "GET" && request.method !== "HEAD") return null;

  const id = match[1];
  const row = await env.DB.prepare("SELECT json FROM jobs WHERE id = ?")
    .bind(id)
    .first();
  if (!row?.json) {
    return new Response(JSON.stringify({ error: "Song not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json", "X-Audio-Fastpath": "1" },
    });
  }

  let job;
  try {
    job = typeof row.json === "string" ? JSON.parse(row.json) : row.json;
  } catch {
    return new Response(JSON.stringify({ error: "Song not found." }), {
      status: 404,
      headers: { "Content-Type": "application/json", "X-Audio-Fastpath": "1" },
    });
  }

  const wantFull = url.searchParams.get("full") === "1";
  if (wantFull && !job.paidAt) {
    return new Response(JSON.stringify({ error: "Full song unlocks after payment." }), {
      status: 402,
      headers: { "Content-Type": "application/json", "X-Audio-Fastpath": "1" },
    });
  }

  // Joseph ONE-master / dual-asset P0: paid+fullReady → default serves FULL
  // (same master as ?full=1). Never leave stale preview as default after promote.
  const kind =
    job.paidAt && job.fullReady
      ? "full"
      : wantFull && job.fullReady
        ? "full"
        : "preview";
  if (kind === "preview" && !job.previewReady) {
    return new Response(JSON.stringify({ error: "Preview is not ready yet." }), {
      status: 409,
      headers: { "Content-Type": "application/json", "X-Audio-Fastpath": "1" },
    });
  }

  const download = url.searchParams.get("download") === "1";
  const formatParam = (url.searchParams.get("format") || "").toLowerCase();
  const wantWav = formatParam === "wav";
  // Elon P0: ?format=mp3 must NEVER return WAV.
  const wantMp3Explicit = formatParam === "mp3";

  let bytes = null;
  let contentType = "audio/mpeg";
  let ext = "mp3";

  if (!wantWav) {
    const mp3 = await env.AUDIO.get(audioKey(id, kind, "mp3"), {
      type: "arrayBuffer",
    });
    if (mp3 && mp3.byteLength > 0) {
      bytes = new Uint8Array(mp3);
      contentType = "audio/mpeg";
      ext = "mp3";
    }
  }

  if ((!bytes || bytes.byteLength === 0) && wantMp3Explicit) {
    return new Response(
      JSON.stringify({
        error: "MP3 not available for this song (format=mp3 never returns WAV).",
      }),
      {
        status: 404,
        headers: { "Content-Type": "application/json", "X-Audio-Fastpath": "1" },
      },
    );
  }

  if (!bytes || bytes.byteLength === 0) {
    const wav = await env.AUDIO.get(audioKey(id, kind, "wav"), {
      type: "arrayBuffer",
    });
    if (wav && wav.byteLength > 0) {
      bytes = new Uint8Array(wav);
      contentType = "audio/wav";
      ext = "wav";
    }
  }

  if (!bytes || bytes.byteLength === 0) {
    return new Response(JSON.stringify({ error: "Audio file missing." }), {
      status: 404,
      headers: { "Content-Type": "application/json", "X-Audio-Fastpath": "1" },
    });
  }

  if (kind === "preview" && contentType.includes("mpeg")) {
    const stored = job.audioDurationSec;
    const capSec =
      typeof stored === "number" && stored >= 60
        ? Math.min(stored, 90)
        : PREVIEW_MAX_SECONDS;
    // Only rough-cap when stored duration says we are over marketing cap and
    // the object is clearly longer; MUSIC BAR (≥60s) keeps full body.
    if (!(typeof stored === "number" && stored >= 60)) {
      bytes = roughCapMp3(bytes, capSec);
    }
  }

  const filename = `${(job.recipientName || "songsnuggle")}-${kind}.${ext}`.replace(
    /[^\w.-]+/g,
    "-",
  );

  return buildAudioResponse(bytes, contentType, request, {
    ...(download ? { "Content-Disposition": `attachment; filename="${filename}"` } : {}),
  });
}

export default {
  async fetch(request, env, ctx) {
    try {
      const audio = await tryServeAudio(request, env);
      if (audio) return audio;
    } catch (err) {
      console.error("[audio-fastpath]", err);
    }
    return openNext.fetch(request, env, ctx);
  },
};
