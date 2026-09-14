import Image from "next/image";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

const moments = [
  {
    title: "A kitchen dance",
    body: "Their name in the chorus. The little Sunday habits in verse two. A song for the ordinary days that matter.",
    image: "/brand/mood-kitchen.png",
    alt: "Parent and child laughing together while baking in a linen kitchen",
  },
  {
    title: "Flowers, then a song",
    body: "When the bouquet fades, they still have the song. Easy to add beside an arrangement or a print.",
    image: "/brand/mood-florist.png",
    alt: "Florist handing a bouquet to a recipient",
  },
  {
    title: "A blessing, kept",
    body: "Weddings, anniversaries, quiet thank-yous. One song that holds the day.",
    image: "/brand/mood-wedding.png",
    alt: "Wedding couple beside a small cake",
  },
  {
    title: "A birthday they can keep",
    body: "Candles go out. A birthday song with their name in it stays.",
    image: "/brand/mood-birthday.png",
    alt: "Family at a kids birthday table with cake",
  },
  {
    title: "A day worth a song",
    body: "Graduation, the walk across the stage, the hug after. Mark it with music.",
    image: "/brand/mood-graduation.png",
    alt: "Graduate hugging family with diploma",
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
              Share a few true details. Hear a free preview. Buy the full song only if you love
              it.
            </p>
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Link
                href="/create"
                className="rounded-full bg-[var(--copper)] px-6 py-3 text-white hover:bg-[var(--copper-dark)]"
              >
                Create my free preview
              </Link>
              <p className="text-sm text-[var(--muted)]">
                From ${brand.songPrice}. No card to start. Lyrics you can edit.
              </p>
            </div>
          </div>
          <div className="photo-frame relative aspect-[4/5] md:aspect-[5/6]">
            <Image
              src="/brand/mood-listen.png"
              alt="Couple sharing a song on a phone in soft linen light"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[var(--photo-scrim)] to-transparent p-6 text-white">
              <p className="serif text-2xl">Listen first. Buy if it feels right.</p>
              <p className="mt-1 text-sm text-white/85">Free preview · one-time checkout</p>
            </div>
          </div>
        </section>

        <section id="how" className="px-5 py-12 md:px-10">
          <h2 className="serif text-4xl">Little songs. Big days.</h2>
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            Birthdays, bouquets, weddings, graduations — a personal song that belongs with the
            moment.
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {moments.map((moment) => (
              <article
                key={moment.title}
                className="overflow-hidden rounded-3xl border border-[var(--line)] bg-[var(--card)]"
              >
                <div className="relative aspect-[4/3]">
                  <Image
                    src={moment.image}
                    alt={moment.alt}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 33vw"
                  />
                </div>
                <div className="p-6">
                  <h3 className="serif text-2xl">{moment.title}</h3>
                  <p className="mt-3 text-[var(--muted)]">{moment.body}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section className="px-5 py-12 md:px-10">
          <div className="grid gap-8 rounded-[2rem] border border-[var(--line)] bg-[var(--card)] p-8 md:grid-cols-2 md:items-center md:p-10">
            <div>
              <p className="text-sm uppercase tracking-[0.2em] text-[var(--copper)]">
                How it works
              </p>
              <ol className="mt-6 list-decimal space-y-4 pl-5 text-[var(--muted)]">
                <li>Tell us who it&apos;s for.</li>
                <li>Approve the lyrics — change any line.</li>
                <li>Hear a short preview first. Buy only after you listen.</li>
                <li>Pay once and get the full recording to keep and share.</li>
              </ol>
            </div>
            <div className="photo-frame relative aspect-[5/4]">
              <Image
                src="/brand/mood-wedding.png"
                alt="Wedding couple beside a small cake"
                fill
                className="object-cover"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
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
                className="rounded-full border border-[var(--line)] bg-[var(--card)] px-4 py-2 hover:border-[var(--copper)]"
              >
                {label}
              </Link>
            ))}
          </div>
        </section>

        <section id="partners" className="px-5 py-12 md:px-10">
          <div className="grid gap-8 overflow-hidden rounded-[2rem] border border-[var(--line)] bg-[var(--ink)] text-[var(--paper)] md:grid-cols-2 md:items-stretch">
            <div className="relative min-h-[240px] md:min-h-full">
              <Image
                src="/brand/mood-florist.png"
                alt="Florist handing a bouquet to a recipient"
                fill
                className="object-cover opacity-90"
                sizes="(max-width: 768px) 100vw, 50vw"
              />
            </div>
            <div className="flex flex-col justify-center p-8 md:p-10">
              <p className="text-sm uppercase tracking-[0.2em] text-[var(--gold)]">
                For florists &amp; photographers
              </p>
              <h2 className="serif mt-3 text-3xl md:text-4xl">
                Offer a song with the flowers or the album.
              </h2>
              <p className="mt-4 text-[var(--paper)]/80">
                Your clients get a free preview. You stay the person they trust for the day. No
                studio setup required.
              </p>
              <a
                href={`mailto:${brand.supportEmail}?subject=${encodeURIComponent(
                  "Partner inquiry — florist / photographer",
                )}`}
                className="mt-6 inline-flex w-fit rounded-full bg-[var(--copper)] px-5 py-3 text-white hover:bg-[var(--copper-dark)]"
              >
                Say hello
              </a>
            </div>
          </div>
        </section>

        <section className="px-5 py-12 md:px-10">
          <h2 className="serif text-4xl">A few things to know</h2>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <div>
              <h3 className="font-semibold">Is the preview free?</h3>
              <p className="mt-2 text-[var(--muted)]">
                Yes. No card needed to draft lyrics or hear the preview. Full song is $
                {brand.songPrice}. Optional lyric print is ${brand.lyricsPrice}.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">Is this AI?</h3>
              <p className="mt-2 text-[var(--muted)]">
                Yes. We use AI for lyrics and music from what you share. You edit and approve the
                words before we make the recording.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">How do I pay?</h3>
              <p className="mt-2 text-[var(--muted)]">
                One-time checkout. We never store your card.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">What am I hearing?</h3>
              <p className="mt-2 text-[var(--muted)]">
                An AI-made preview of your song — not a live studio singer. Words light up as they
                play.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">When do I get it?</h3>
              <p className="mt-2 text-[var(--muted)]">
                Right after you pay — a link to listen, download, and send. Lyric PDF is optional.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
