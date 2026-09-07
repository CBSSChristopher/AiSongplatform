import Link from "next/link";
import { brand } from "@/lib/brand";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

const moments = [
  {
    title: "A kitchen dance",
    body: "Their name in the chorus. The Sunday pancake stubbornness in verse two.",
  },
  {
    title: "A birthday that isn't stuff",
    body: "For the person who says they don't need anything. Give them something they couldn't buy.",
  },
  {
    title: "A blessing, kept",
    body: "Worship, bedtime, or a family milestone. Same funnel. Different story.",
  },
];

export default function Home() {
  return (
    <div>
      <SiteHeader />
      <main>
        <section className="grid gap-10 px-5 pb-16 pt-6 md:grid-cols-2 md:items-center md:px-10">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-[var(--copper)]">
              {brand.tagline}
            </p>
            <h1 className="serif mt-3 text-5xl leading-tight md:text-6xl">
              Their name. Your memory. A song they can keep.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-[var(--muted)]">
              Hearloom turns a few true details into a personalized song. Listen to a free
              preview first. Pay once if you want the full recording.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/create"
                className="rounded-full bg-[var(--copper)] px-6 py-3 text-white"
              >
                Create my free preview
              </Link>
              <p className="text-sm text-[var(--muted)]">
                From ${brand.songPrice}. No card to start. Lyrics you can edit.
              </p>
            </div>
          </div>
          <div className="rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-8">
            <p className="serif text-2xl">How a Hearloom is made</p>
            <ol className="mt-6 space-y-4 text-[var(--muted)]">
              <li>1. Tell us who it&apos;s for — son, daughter, spouse, parent, friend.</li>
              <li>2. Approve the lyrics. Change any line.</li>
              <li>3. Hear a 45-second preview. Checkout stays closed until it plays.</li>
              <li>4. Buy through Whop. We email the private listening page.</li>
            </ol>
          </div>
        </section>

        <section id="how" className="px-5 py-12 md:px-10">
          <h2 className="serif text-4xl">Little songs. Kept feelings.</h2>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
            {moments.map((moment) => (
              <article
                key={moment.title}
                className="rounded-3xl border border-[var(--line)] bg-[var(--card)] p-6"
              >
                <h3 className="serif text-2xl">{moment.title}</h3>
                <p className="mt-3 text-[var(--muted)]">{moment.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="px-5 py-12 md:px-10">
          <h2 className="serif text-4xl">Start from the occasion</h2>
          <div className="mt-6 flex flex-wrap gap-3">
            {[
              ["birthday", "Birthdays"],
              ["anniversary", "Anniversaries"],
              ["wedding", "Weddings"],
              ["bedtime", "Kids / bedtime"],
              ["baptism", "Faith & blessings"],
            ].map(([id, label]) => (
              <Link
                key={id}
                href={`/create?occasion=${id}`}
                className="rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2"
              >
                {label}
              </Link>
            ))}
          </div>
        </section>

        <section className="px-5 py-12 md:px-10">
          <h2 className="serif text-4xl">A few things to know</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Is the preview free?</h3>
              <p className="mt-2 text-[var(--muted)]">
                Yes. No card is required to draft lyrics or hear the preview. The full song is
                ${brand.songPrice}. A printable lyric page is optional for ${brand.lyricsPrice}.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">Is this AI?</h3>
              <p className="mt-2 text-[var(--muted)]">
                Yes. Lyrics and music are generated with AI tools from the details you provide.
                You edit and approve the words before we make the recording.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">How do I pay?</h3>
              <p className="mt-2 text-[var(--muted)]">
                Checkout runs through your Whop account. Hearloom never stores card numbers.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">When does it arrive?</h3>
              <p className="mt-2 text-[var(--muted)]">
                After payment, the full recording is released on a private page you can share.
                Demo mode unlocks instantly so you can test before connecting Whop.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
