import Image from "next/image";
import Link from "next/link";
import { brand } from "@/lib/brand";

export function SiteHeader() {
  return (
    <header className="flex items-center justify-between gap-4 px-5 py-5 md:px-10">
      <Link href="/" className="flex items-center gap-2" aria-label={brand.name}>
        <Image
          src="/brand/wordmark-clean.png"
          alt={brand.name}
          width={220}
          height={48}
          className="h-9 w-auto md:h-10"
          priority
        />
      </Link>
      <nav className="flex items-center gap-5 text-sm text-[var(--muted)]">
        <Link href="/#how" className="hidden hover:text-[var(--ink)] sm:inline">
          How it works
        </Link>
        <Link href="/#partners" className="hidden hover:text-[var(--ink)] sm:inline">
          Partners
        </Link>
        <Link
          href="/create"
          className="rounded-full bg-[var(--copper)] px-4 py-2 text-white hover:bg-[var(--copper-dark)]"
        >
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
        Songs are made with AI from the details you share. You review the lyrics before we make
        the preview.
      </p>
    </footer>
  );
}
