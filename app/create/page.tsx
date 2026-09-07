import { CreateWizard } from "@/components/CreateWizard";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { brand } from "@/lib/brand";

export default async function CreatePage({
  searchParams,
}: {
  searchParams: Promise<{ occasion?: string }>;
}) {
  const { occasion } = await searchParams;
  return (
    <div>
      <SiteHeader />
      <main className="px-5 py-8 md:px-10">
        <p className="mb-4 text-center text-sm text-[var(--muted)]">
          {brand.tagline} Free preview. From ${brand.songPrice}.
        </p>
        <CreateWizard occasion={occasion} />
      </main>
      <SiteFooter />
    </div>
  );
}
