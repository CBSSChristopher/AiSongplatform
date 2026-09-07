import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { PublicSongJob, SongJob } from "./types";

const dataDir = path.join(process.cwd(), "data");
const jobsPath = path.join(dataDir, "jobs.json");

let writeChain: Promise<void> = Promise.resolve();

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

export function publicJob(job: SongJob): PublicSongJob {
  return {
    id: job.id,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    status: job.status,
    recipientName: job.recipientName,
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
    lyrics: job.lyrics,
    includeLyricPrint: job.includeLyricPrint,
    previewReady: job.previewReady,
    fullReady: job.fullReady,
    paidAt: job.paidAt,
  };
}

export async function createJob(partial: Partial<SongJob>): Promise<SongJob> {
  const now = new Date().toISOString();
  const job: SongJob = {
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
    status: "intake",
    recipientName: "",
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
    lyrics: "",
    includeLyricPrint: false,
    previewReady: false,
    fullReady: false,
    paidAt: null,
    whopPaymentId: null,
    checkoutSessionId: null,
    ...partial,
  };
  await enqueue(async () => {
    const jobs = await readJobs();
    jobs.push(job);
    await writeJobs(jobs);
  });
  return job;
}

export async function getJob(id: string): Promise<SongJob | null> {
  const jobs = await readJobs();
  return jobs.find((job) => job.id === id) ?? null;
}

export async function updateJob(id: string, patch: Partial<SongJob>): Promise<SongJob | null> {
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

export function audioPath(jobId: string, kind: "preview" | "full") {
  return path.join(dataDir, "audio", `${jobId}-${kind}.wav`);
}

function enqueue(work: () => Promise<void>) {
  writeChain = writeChain.then(work, work);
  return writeChain;
}
