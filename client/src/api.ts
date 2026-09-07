import type { Catalog, GeneratedSong, SongRequest } from "./types";

async function parseError(res: Response): Promise<string> {
  try {
    const data = await res.json();
    return (data as { error?: string }).error ?? `Request failed (${res.status})`;
  } catch {
    return `Request failed (${res.status})`;
  }
}

export async function fetchCatalog(): Promise<Catalog> {
  const res = await fetch("/api/catalog");
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as Catalog;
}

export async function createSong(req: SongRequest): Promise<GeneratedSong> {
  const res = await fetch("/api/songs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(req),
  });
  if (!res.ok) throw new Error(await parseError(res));
  return (await res.json()) as GeneratedSong;
}
