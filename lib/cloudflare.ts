type SongBindings = {
  DB?: D1Database;
  AUDIO?: KVNamespace;
};

export async function cloudflareBindings(): Promise<SongBindings | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    const { env } = await getCloudflareContext({ async: true });
    if (env?.DB && env?.AUDIO) return env as SongBindings;
  } catch {
    return null;
  }
  return null;
}
