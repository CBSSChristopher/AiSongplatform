import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { cloudflareBindings } from "./cloudflare";
import type { PublicSongJob, SongJob } from "./types";

const dataDir = path.join(process.cwd(), "data");
const jobsPath = path.join(dataDir, "jobs.json");

let writeChain: Promise<void> = Promise.resolve();

export function publicJob(job: SongJob): PublicSongJob {
  return {
    id: job.id,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    status: job.status,
    recipientName: job.recipientName,
    namePronunciation: job.namePronunciation || "",
    relationship: job.relationship,
    email: job.email,
    marketingOptIn: job.marketingOptIn,
    genre: job.genre,
    voice: job.voice,
    qualities: job.qualities,
    memories: job.memories,
    occasion: job.occasion,
    senderName: job.senderName,
    message: job.message,
    songTitle: job.songTitle || "",
    lyrics: job.lyrics,
    lyricCues: job.lyricCues || [],
    includeLyricPrint: job.includeLyricPrint,
    previewReady: job.previewReady,
    previewGate: job.previewGate ?? null,
    listenCompletedAt: job.listenCompletedAt ?? null,
    fullReady: job.fullReady,
    paidAt: job.paidAt,
    audioDurationSec: job.audioDurationSec ?? null,
    masterSourceId: job.masterSourceId ?? null,
    masterFingerprint: job.masterFingerprint ?? null,
  };
}

async function readJobs(): Promise<SongJob[]> {
  try {
    const raw = await readFile(jobsPath, "utf8");
    return JSON.parse(raw) as SongJob[];
  } catch {
    return [];
  }
}

async function writeJobs(jobs: SongJob[]) {
  await mkdir(dataDir, { recursive: true });
  await writeFile(jobsPath, JSON.stringify(jobs, null, 2));
}

function parseJob(raw: string): SongJob {
  return JSON.parse(raw) as SongJob;
}

export async function createJob(partial: Partial<SongJob>): Promise<SongJob> {
  const now = new Date().toISOString();
  const job: SongJob = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: "intake",
    recipientName: "",
    namePronunciation: "",
    relationship: "",
    email: "",
    marketingOptIn: false,
    genre: "",
    voice: "",
    qualities: "",
    memories: "",
    occasion: "",
    senderName: "",
    message: "",
    songTitle: "",
    lyrics: "",
    lyricCues: [],
    includeLyricPrint: false,
    previewReady: false,
    masterSourceId: null,
    masterFingerprint: null,
    previewGate: null,
    listenCompletedAt: null,
    fullReady: false,
    paidAt: null,
    audioDurationSec: null,
    whopPaymentId: null,
    checkoutSessionId: null,
    ...partial,
  };

  const env = await cloudflareBindings();
  if (env?.DB) {
    await env.DB.prepare("INSERT INTO jobs (id, json, updated_at) VALUES (?, ?, ?)")
      .bind(job.id, JSON.stringify(job), job.updatedAt)
      .run();
    return job;
  }

  await enqueue(async () => {
    const jobs = await readJobs();
    jobs.push(job);
    await writeJobs(jobs);
  });
  return job;
}

export async function getJob(id: string): Promise<SongJob | null> {
  const env = await cloudflareBindings();
  if (env?.DB) {
    const row = await env.DB.prepare("SELECT json FROM jobs WHERE id = ?")
      .bind(id)
      .first<{ json: string }>();
    return row?.json ? parseJob(row.json) : null;
  }
  const jobs = await readJobs();
  return jobs.find((job) => job.id === id) ?? null;
}


export async function getJobByCheckoutSessionId(checkoutSessionId: string): Promise<SongJob | null> {
  const id = String(checkoutSessionId || "").trim();
  if (!id) return null;

  const env = await cloudflareBindings();
  if (env?.DB) {
    // D1 has no JSON index; scan recent rows is not available — fall back to reading via json_extract if present.
    try {
      const row = await env.DB.prepare(
        "SELECT json FROM jobs WHERE json_extract(json, '$.checkoutSessionId') = ? LIMIT 1",
      )
        .bind(id)
        .first<{ json: string }>();
      if (row?.json) return parseJob(row.json);
    } catch {
      // Older D1 schemas / SQLite without json_extract support — ignore and fall through.
    }
    return null;
  }

  const jobs = await readJobs();
  return jobs.find((job) => job.checkoutSessionId === id) ?? null;
}

export async function updateJob(id: string, patch: Partial<SongJob>): Promise<SongJob | null> {
  const env = await cloudflareBindings();
  if (env?.DB) {
    const current = await getJob(id);
    if (!current) return null;
    const next: SongJob = {
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    await env.DB.prepare("UPDATE jobs SET json = ?, updated_at = ? WHERE id = ?")
      .bind(JSON.stringify(next), next.updatedAt, id)
      .run();
    return next;
  }

  let next: SongJob | null = null;
  await enqueue(async () => {
    const jobs = await readJobs();
    const index = jobs.findIndex((job) => job.id === id);
    if (index === -1) return;
    next = {
      ...jobs[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    jobs[index] = next;
    await writeJobs(jobs);
  });
  return next;
}

export function audioPath(jobId: string, kind: "preview" | "full", format: "wav" | "mp3" = "wav") {
  const ext = format === "mp3" ? "mp3" : "wav";
  return path.join(dataDir, "audio", `${jobId}-${kind}.${ext}`);
}

export function audioKey(jobId: string, kind: "preview" | "full", format: "wav" | "mp3" = "wav") {
  return format === "mp3" ? `audio:${jobId}:${kind}:mp3` : `audio:${jobId}:${kind}`;
}

export async function writeAudio(
  jobId: string,
  kind: "preview" | "full",
  bytes: Buffer | Uint8Array,
  format: "wav" | "mp3" = "wav",
) {
  const env = await cloudflareBindings();
  const payload = bytes instanceof Buffer ? bytes : Buffer.from(bytes);
  if (env?.AUDIO) {
    await env.AUDIO.put(audioKey(jobId, kind, format), payload);
    return;
  }
  const file = audioPath(jobId, kind, format);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, payload);
}

export async function readAudio(
  jobId: string,
  kind: "preview" | "full",
  format: "wav" | "mp3" = "wav",
): Promise<Uint8Array | null> {
  const env = await cloudflareBindings();
  if (env?.AUDIO) {
    const value = await env.AUDIO.get(audioKey(jobId, kind, format), { type: "arrayBuffer" });
    return value ? new Uint8Array(value) : null;
  }
  try {
    return new Uint8Array(await readFile(audioPath(jobId, kind, format)));
  } catch {
    return null;
  }
}

export async function deleteAudio(
  jobId: string,
  kind: "preview" | "full",
  format: "wav" | "mp3" = "wav",
) {
  const env = await cloudflareBindings();
  if (env?.AUDIO) {
    await env.AUDIO.delete(audioKey(jobId, kind, format));
    return;
  }
  try {
    const { unlink } = await import("node:fs/promises");
    await unlink(audioPath(jobId, kind, format));
  } catch {
    /* missing is fine */
  }
}

function enqueue(work: () => Promise<void>) {
  writeChain = writeChain.then(work, work);
  return writeChain;
}
