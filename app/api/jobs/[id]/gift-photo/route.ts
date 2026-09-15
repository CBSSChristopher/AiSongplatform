import { NextResponse } from "next/server";
import { getJob } from "@/lib/store";
import { readGiftPhoto, writeGiftPhoto } from "@/lib/gift-card";

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
    return NextResponse.json({ error: "Not unlocked." }, { status: 402 });
  }
  const photo = await readGiftPhoto(id);
  if (!photo) {
    return NextResponse.json({ error: "No gift photo yet." }, { status: 404 });
  }
  return new NextResponse(Buffer.from(photo.bytes), {
    headers: {
      "Content-Type": photo.contentType,
      "Cache-Control": "no-store",
    },
  });
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  const job = await getJob(id);
  if (!job) {
    return NextResponse.json({ error: "Song not found." }, { status: 404 });
  }
  if (!job.paidAt || !job.fullReady) {
    return NextResponse.json(
      { error: "Add a photo after the song is unlocked." },
      { status: 402 },
    );
  }

  const form = await request.formData();
  const file = form.get("photo");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
  }
  const type = file.type || "image/jpeg";
  if (!/^image\/(jpeg|jpg|png|webp)$/i.test(type)) {
    return NextResponse.json({ error: "Use a JPG, PNG, or WebP photo." }, { status: 400 });
  }
  if (file.size > 4_500_000) {
    return NextResponse.json({ error: "Keep the photo under about 4.5 MB." }, { status: 400 });
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  await writeGiftPhoto(id, bytes, type);
  return NextResponse.json({ ok: true });
}
