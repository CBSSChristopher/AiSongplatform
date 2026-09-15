import { brand } from "@/lib/brand";

const siteUrl = process.env.APP_URL || "https://songsnuggle.com";

/** Soft gift voice Product + FAQPage JSON-LD (Week-1 SEO). */
export function SeoJsonLd() {
  const product = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: `${brand.name} personalized song gift`,
    description:
      "A personalized keepsake song for birthdays, weddings, and quiet thank-yous. Free preview. Pay once after you listen.",
    brand: {
      "@type": "Brand",
      name: brand.name,
    },
    url: siteUrl,
    image: `${siteUrl}/brand/mood-listen.png`,
    offers: [
      {
        "@type": "Offer",
        name: "Full song",
        price: String(brand.songPrice),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: `${siteUrl}/create`,
      },
      {
        "@type": "Offer",
        name: "Full song + lyric print",
        price: String(brand.songPrice + brand.lyricsPrice),
        priceCurrency: "USD",
        availability: "https://schema.org/InStock",
        url: `${siteUrl}/create`,
      },
    ],
  };

  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: [
      {
        "@type": "Question",
        name: "Is the preview free?",
        acceptedAnswer: {
          "@type": "Answer",
          text: `Yes. No card needed to draft lyrics or hear the preview. Full song is $${brand.songPrice}. Optional lyric print is $${brand.lyricsPrice}.`,
        },
      },
      {
        "@type": "Question",
        name: "How do I pay?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "One-time checkout. We never store your card.",
        },
      },
      {
        "@type": "Question",
        name: "When do I get it?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "Right after you pay — a link to listen, download, and send. Lyric PDF is optional.",
        },
      },
      {
        "@type": "Question",
        name: "What am I hearing?",
        acceptedAnswer: {
          "@type": "Answer",
          text: "A preview of your song made from the details you share — not a live studio singer. Words light up as they play.",
        },
      },
    ],
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(product) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faq) }}
      />
    </>
  );
}
