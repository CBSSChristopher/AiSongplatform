import { notFound } from "next/navigation";
import { GiftCardPrintSheet } from "@/components/GiftCardPrintSheet";
import { getJob, publicJob } from "@/lib/store";

export default async function GiftCardPrintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const job = await getJob(id);
  if (!job) notFound();
  if (!job.paidAt || !job.fullReady) notFound();

  return <GiftCardPrintSheet job={publicJob(job)} />;
}
