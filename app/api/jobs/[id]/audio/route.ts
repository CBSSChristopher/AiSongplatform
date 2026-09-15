import { NextResponse } from "next/server";
import { brand } from "@/lib/brand";
import { getJob, readAudio } from "@/lib/store";

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
    const bytes = await readAudio(id, kind);
    if (!bytes) {
      return NextResponse.json({ error: "Audio file missing." }, { status: 404 });
    }
    const download = url.searchParams.get("download") === "1";
    const filename = `${job.recipientName || brand.fileSlug}-${kind}.wav`.replace(/[^\w.-]+/g, "-");
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "audio/wav",
        "Cache-Control": "no-store",
        ...(download
          ? { "Content-Disposition": `attachment; filename="${filename}"` }
          : {}),
      },
    });
  } catch {
    return NextResponse.json({ error: "Audio file missing." }, { status: 404 });
  }
}
