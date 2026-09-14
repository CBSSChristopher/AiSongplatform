import Link from "next/link";
import { brand } from "@/lib/brand";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export default function NotFound() {
  return (
    <div>
      <SiteHeader />
      <main className="px-5 py-20 md:px-10">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--copper)]">404</p>
        <h1 className="serif mt-3 text-4xl md:text-5xl">This page wandered off.</h1>
        <p className="mt-4 max-w-lg text-[var(--muted)]">
          The link may be old, or the song page is private. Head home and start a new gift song.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-full bg-[var(--copper)] px-6 py-3 text-white"
        >
          Back to {brand.name}
        </Link>
      </main>
      <SiteFooter />
    </div>
  );
}
