import { NextResponse } from "next/server";
import { brand } from "@/lib/brand";
import { lyricPdf } from "@/lib/pdf";
import { getJob } from "@/lib/store";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }
  if (!job.paidAt) {
    return NextResponse.json({ error: "The lyric print unlocks after payment." }, { status: 402 });
  }
  if (!job.includeLyricPrint) {
    return NextResponse.json({ error: "This order did not include a lyric print." }, { status: 403 });
  }

  const bytes = await lyricPdf(job);
  const filename = `${job.recipientName || brand.fileSlug}-lyrics.pdf`.replace(/[^\w.-]+/g, "-");
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
