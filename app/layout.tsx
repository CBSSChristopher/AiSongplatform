import type { Metadata } from "next";
import { Fraunces, Source_Sans_3 } from "next/font/google";
import { brand } from "@/lib/brand";
import "./globals.css";

const serif = Fraunces({
  variable: "--font-serif",
  subsets: ["latin"],
});

const sans = Source_Sans_3({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: `${brand.name} — ${brand.tagline}`,
  description:
    "Turn a name, a memory, and a few true details into a personalized song. Free preview. Pay after you listen. Delivered digitally.",
  metadataBase: new URL(process.env.APP_URL || "http://localhost:3000"),
  openGraph: {
    title: `${brand.name} — ${brand.tagline}`,
    description:
      "Personalized gift songs. Free preview, then a one-time checkout. A song they can keep.",
    type: "website",
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${serif.variable} ${sans.variable} h-full`}>
      <body className="min-h-full antialiased">{children}</body>
    </html>
  );
}
