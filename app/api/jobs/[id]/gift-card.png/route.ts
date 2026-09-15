import { NextResponse } from "next/server";
import { giftCardQrPng } from "@/lib/gift-card";
import { getJob } from "@/lib/store";

/** QR PNG deep-linking to the private /song/[id] page. */
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
      { error: "The gift QR unlocks after the song is paid and ready." },
      { status: 402 },
    );
  }

  const bytes = await giftCardQrPng(job.id);
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-store",
    },
  });
}
