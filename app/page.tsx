import Image from "next/image";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

const moments = [
  {
    title: "A kitchen dance",
    body: "Their name in the chorus. The Sunday pancake stubbornness in verse two. A keepsake you press play on — not another thing that sits in a drawer.",
    image: "/brand/mood-listen.png",
    alt: "Quiet moment listening together at the kitchen table",
  },
  {
    title: "Flowers, then a song",
    body: "Pair the bouquet with something they can keep after the petals fade. The gift object is the recording — private page, download, share.",
    image: "/brand/mood-florist.png",
    alt: "Florist bouquet with a small gift tag",
  },
  {
    title: "A blessing, kept",
    body: "Wedding aisle, bedtime, anniversary. Same craft. Different story. Photography of the day, song for the forever part.",
    image: "/brand/mood-wedding.png",
    alt: "Wedding cake detail with soft linen light",
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
              {brand.name} turns a few true details into a personalized gift song — a digital
              keepsake you listen to first, then own. Free preview. Pay once if you want the full
              recording.
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
              alt="Someone listening to a gift song in soft linen light"
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 50vw"
              priority
            />
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[var(--photo-scrim)] to-transparent p-6 text-white">
              <p className="serif text-2xl">A gift you can press play on</p>
              <p className="mt-1 text-sm text-white/85">
                Private page · download · share — after you approve the preview
              </p>
            </div>
          </div>
        </section>

        <section id="how" className="px-5 py-12 md:px-10">
          <h2 className="serif text-4xl">Little songs. Kept feelings.</h2>
          <p className="mt-3 max-w-2xl text-[var(--muted)]">
            Think florist wrapping, photographer album, cake topper — then the song that belongs
            with the day. Photography-forward moments. The song is the object you leave with.
          </p>
          <div className="mt-8 grid gap-4 md:grid-cols-3">
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
                How a {brand.name} is made
              </p>
              <ol className="mt-6 space-y-4 text-[var(--muted)]">
                <li>1. Tell us who it&apos;s for — son, daughter, spouse, parent, friend.</li>
                <li>2. Approve the lyrics. Change any line.</li>
                <li>3. Hear a 45-second preview. Checkout stays closed until it plays.</li>
                <li>4. Pay once. Keep a private page to listen, download, and share.</li>
              </ol>
            </div>
            <div className="photo-frame relative aspect-[5/4]">
              <Image
                src="/brand/mood-wedding.png"
                alt="Wedding keepsake detail in warm light"
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
                alt="Florist arranging a bouquet as a gift partner"
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
                Add a song to the bouquet, the album, the day.
              </h2>
              <p className="mt-4 text-[var(--paper)]/80">
                {brand.name} is built as a gift object partners can offer beside flowers, prints,
                and cakes — without turning your shop into a music studio. Clients get a free
                preview; you stay the trusted door.
              </p>
              <a
                href={`mailto:${brand.supportEmail}?subject=${encodeURIComponent(
                  "Partner inquiry — florist / photographer",
                )}`}
                className="mt-6 inline-flex w-fit rounded-full bg-[var(--copper)] px-5 py-3 text-white hover:bg-[var(--copper-dark)]"
              >
                Open a partner conversation
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
                Yes. No card is required to draft lyrics or hear the preview. The full song is $
                {brand.songPrice}. A printable lyric page is optional for ${brand.lyricsPrice}.
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
                One-time checkout. {brand.name} never stores card numbers.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">What am I hearing?</h3>
              <p className="mt-2 text-[var(--muted)]">
                The preview sings your lyric lines as original generated music. Words highlight
                as they are sung. It is not a human studio recording artist.
              </p>
            </div>
            <div>
              <h3 className="font-semibold">When does it arrive?</h3>
              <p className="mt-2 text-[var(--muted)]">
                After payment, the full recording is released on a private page you can copy,
                download, and email to yourself. A lyric print PDF is optional.
              </p>
            </div>
          </div>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
