import Link from "next/link";
import { brand } from "@/lib/brand";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-4 px-5 py-5 md:px-10">
      <Link href="/" className="serif text-2xl tracking-tight">
        {brand.name}
      </Link>
      <nav className="flex items-center gap-5 text-sm text-[var(--muted)]">
        <Link href="/#how" className="hover:text-[var(--ink)]">
          How it works
        </Link>
        <Link href="/create" className="rounded-full bg-[var(--copper)] px-4 py-2 text-white">
          Free preview
        </Link>
      </nav>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-[var(--line)] px-5 py-8 text-sm text-[var(--muted)] md:px-10">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <p>
          {brand.name}. {brand.tagline}
        </p>
        <p>
          <Link href="/privacy" className="hover:text-[var(--ink)]">
            Privacy
          </Link>
          {" · "}
          <Link href="/terms" className="hover:text-[var(--ink)]">
            Terms
          </Link>
          {" · "}
          <Link href="/refunds" className="hover:text-[var(--ink)]">
            Refunds
          </Link>
          {" · "}
          <a href={`mailto:${brand.supportEmail}`}>{brand.supportEmail}</a>
        </p>
      </div>
      <p className="mt-3 max-w-3xl text-xs leading-5">
        Songs are created with AI lyric and music tools from the details you share. You review
        lyrics before a preview is made. This is an original product, not affiliated with other
        personalized-song brands.
      </p>
    </footer>
  );
}
