import type { OccasionId, SongSection } from "./types.js";

/** Small deterministic PRNG so a given seed always yields the same lyrics. */
export function makeRng(seed: number): () => number {
  let state = seed >>> 0 || 1;
  return () => {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
    return state / 0xffffffff;
  };
}

export function seedFromString(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function pick<T>(rng: () => number, items: T[]): T {
  return items[Math.floor(rng() * items.length) % items.length];
}

const OPENERS: Record<OccasionId, string[]> = {
  family: [
    "In every quiet morning, {name}, you are here",
    "Through all the years we're gathered, {name}, drawing near",
  ],
  birthday: [
    "Another candle glowing, {name}, burning bright",
    "The world got a little warmer, {name}, on your night",
  ],
  wedding: [
    "Two hearts became one story, {name}, hand in hand",
    "Today we build a promise, {name}, where we stand",
  ],
  faith: [
    "We lift our voices skyward, {name}, in your name",
    "Through grace that never falters, {name}, still the same",
  ],
  memorial: [
    "The photographs still whisper, {name}, soft and low",
    "You left a light behind you, {name}, that still glows",
  ],
  friendship: [
    "Through all the ordinary days, {name}, you showed up",
    "You carried me through storms, {name}, filled my cup",
  ],
};

const CHORUS_LEADS: Record<OccasionId, string[]> = {
  family: ["So here's to us, to home, to holding on"],
  birthday: ["So happy birthday, {name}, this one's for you"],
  wedding: ["So take my hand and never let it go"],
  faith: ["And we will sing, and we will not be moved"],
  memorial: ["And we will carry you inside our song"],
  friendship: ["So thank you, friend, for every single mile"],
};

const KEYWORD_LINES = [
  "I still remember {kw}, and it stays",
  "There's {kw} in the corners of my mind",
  "The way you brought us {kw}, warm and kind",
];

const CLOSERS = [
  "and love will lead us home",
  "a melody that stays",
  "through all our nights and days",
  "the chorus of our hearts",
];

export function buildLyrics(params: {
  occasion: OccasionId;
  recipient: string;
  keywords: string[];
  seed: number;
}): { title: string; sections: SongSection[] } {
  const rng = makeRng(params.seed);
  const name = params.recipient.trim() || "you";

  const fill = (line: string, kw?: string) =>
    line.replace(/\{name\}/g, name).replace(/\{kw\}/g, kw ?? "the little things");

  const verse1: string[] = [
    fill(pick(rng, OPENERS[params.occasion])),
    fill(`And ${pick(rng, ["I", "we"])} would ${pick(rng, ["cross the sky", "wait for you", "start again"])}, ${pick(rng, CLOSERS)}`),
  ];

  const keywords = params.keywords.filter(Boolean);
  const verse2: string[] = [];
  if (keywords.length > 0) {
    verse2.push(fill(pick(rng, KEYWORD_LINES), keywords[0]));
    verse2.push(
      fill(
        keywords[1]
          ? pick(rng, KEYWORD_LINES)
          : "And every day I'm grateful that you're mine",
        keywords[1],
      ),
    );
  } else {
    verse2.push(fill("I count the quiet blessings one by one"));
    verse2.push(fill(`And ${pick(rng, ["know", "trust", "feel"])} that ${pick(rng, CLOSERS)}`));
  }

  const chorus: string[] = [
    fill(pick(rng, CHORUS_LEADS[params.occasion])),
    fill(`You're ${pick(rng, ["the reason", "the melody", "the reason why"])}, ${pick(rng, CLOSERS)}`),
  ];

  const title = fill(
    pick(rng, [
      "Song for {name}",
      "{name}, This One's for You",
      "The Melody of {name}",
      "Home Is {name}",
    ]),
  );

  const sections: SongSection[] = [
    { label: "Verse 1", lines: verse1 },
    { label: "Chorus", lines: chorus },
    { label: "Verse 2", lines: verse2 },
    { label: "Chorus", lines: chorus },
  ];

  return { title, sections };
}
