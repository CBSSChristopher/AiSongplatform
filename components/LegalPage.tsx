import type { ReactNode } from "react";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { brand } from "@/lib/brand";

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-2xl px-5 py-10">
        <p className="text-sm uppercase tracking-[0.2em] text-[var(--copper)]">{brand.name}</p>
        <h1 className="serif mt-3 text-4xl">{title}</h1>
        <div className="mt-8 space-y-5 text-[var(--muted)]">{children}</div>
      </main>
      <SiteFooter />
    </div>
  );
}
