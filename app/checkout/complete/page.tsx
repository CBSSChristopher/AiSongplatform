import { CheckoutComplete } from "@/components/CheckoutComplete";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export default async function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; status?: string }>;
}) {
  const { job, status } = await searchParams;
  return (
    <div>
      <SiteHeader />
      <CheckoutComplete jobId={job} failed={status === "error"} />
      <SiteFooter />
    </div>
  );
}
