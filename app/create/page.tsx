import type { Metadata } from "next";
import { CreateWizard } from "@/components/CreateWizard";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { brand } from "@/lib/brand";

const siteUrl = process.env.APP_URL || "https://songsnuggle.com";
const createUrl = `${siteUrl}/create`;

export const metadata: Metadata = {
  title: "Create a personalized song gift | SongSnuggle",
  description:
    "Share a name and a few true details. Hear a free preview. Buy the full song only if you love it — from $39.",
  alternates: {
    canonical: "/create",
  },
  openGraph: {
    title: "Create a personalized song gift | SongSnuggle",
    description:
      "Share a name and a few true details. Hear a free preview. Buy the full song only if you love it — from $39.",
    type: "website",
    url: createUrl,
    siteName: brand.name,
    images: [
      {
        url: "/brand/mood-listen.png",
        width: 1200,
        height: 630,
        alt: `${brand.name} — create a song they can keep`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "Create a personalized song gift | SongSnuggle",
    description:
      "Share a name and a few true details. Hear a free preview. Buy only if you love it — from $39.",
    images: ["/brand/mood-listen.png"],
  },
};

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
