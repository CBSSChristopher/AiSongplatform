import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { brand } from "@/lib/brand";
import { SeoJsonLd } from "@/components/SeoJsonLd";
import "./globals.css";

const serif = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
});

const sans = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
});

const siteUrl = process.env.APP_URL || "https://songsnuggle.com";

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description:
    "Turn a name, a memory, and a few true details into a personalized song gift. Free preview. Pay after you listen. Delivered digitally.",
  metadataBase: new URL(siteUrl),
  alternates: {
    canonical: "/",
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
  },
  openGraph: {
    title: `${brand.name} — ${brand.tagline}`,
    description:
      "A keepsake song for birthdays, weddings, and quiet thank-yous. Free preview, then a one-time checkout.",
    type: "website",
    url: siteUrl,
    siteName: brand.name,
    images: [
      {
        url: "/brand/mood-listen.png",
        width: 1200,
        height: 630,
        alt: `${brand.name} — a song they can keep`,
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: `${brand.name} — ${brand.tagline}`,
    description:
      "Personalized gift songs. Free preview, then a one-time checkout. A song they can keep.",
    images: ["/brand/mood-listen.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} h-full`}>
      <body className="min-h-full antialiased">
        <SeoJsonLd />
        {children}
      </body>
    </html>
  );
}
