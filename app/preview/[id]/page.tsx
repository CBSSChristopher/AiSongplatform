import { PreviewStudio } from "@/components/PreviewStudio";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export default async function PreviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div>
      <SiteHeader />
      <main className="px-5 py-8 md:px-10">
        <PreviewStudio id={id} />
      </main>
      <SiteFooter />
    </div>
  );
}
