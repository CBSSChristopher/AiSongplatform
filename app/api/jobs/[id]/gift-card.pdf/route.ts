import { NextResponse } from "next/server";
import { brand } from "@/lib/brand";
import { giftCardPdf } from "@/lib/gift-card";
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
  if (!job.paidAt || !job.fullReady) {
    return NextResponse.json(
      { error: "The gift card unlocks after the song is paid and ready." },
      { status: 402 },
    );
  }

  const bytes = await giftCardPdf(job);
  const filename = `${job.recipientName || brand.fileSlug}-gift-card.pdf`.replace(
    /[^\w.-]+/g,
    "-",
  );
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
