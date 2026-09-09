import { CheckoutPanel } from "@/components/CheckoutPanel";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export default async function CheckoutPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <SiteHeader />
      <main className="px-5 py-8 md:px-10">
        <CheckoutPanel id={id} />
      </main>
      <SiteFooter />
    </div>
  );
}
