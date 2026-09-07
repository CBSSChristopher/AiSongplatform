import Link from "next/link";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export default async function CheckoutCompletePage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; status?: string }>;
}) {
  const { job, status } = await searchParams;
  const ok = status !== "error";
  return (
    <div>
      <SiteHeader />
      <main className="mx-auto max-w-lg px-5 py-16 text-center">
        <h1 className="serif text-4xl">{ok ? "Payment received" : "Checkout did not finish"}</h1>
        <p className="mt-4 text-[var(--muted)]">
          {ok
            ? "We are releasing your full recording. If the page is still preparing, wait a few seconds and open your song."
            : "You can return to checkout and try again. No extra charge is taken unless Whop shows a receipt."}
        </p>
        {job ? (
          <Link
            href={ok ? `/song/${job}` : `/checkout/${job}`}
            className="mt-8 inline-block rounded-full bg-[var(--copper)] px-5 py-3 text-white"
          >
            {ok ? "Open my song" : "Return to checkout"}
          </Link>
        ) : null}
      </main>
      <SiteFooter />
    </div>
  );
}
