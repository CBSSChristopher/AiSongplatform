export const brand = {
  name: process.env.NEXT_PUBLIC_BRAND_NAME || "Hearloom",
  tagline: process.env.NEXT_PUBLIC_BRAND_TAGLINE || "A song they can keep.",
  supportEmail: process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "hello@hearloom.app",
  songPrice: Number(process.env.NEXT_PUBLIC_SONG_PRICE || "39"),
  lyricsPrice: Number(process.env.NEXT_PUBLIC_LYRICS_PRICE || "19"),
};

export const relationships = [
  { id: "husband", label: "Husband" },
  { id: "wife", label: "Wife" },
  { id: "boyfriend", label: "Boyfriend" },
  { id: "girlfriend", label: "Girlfriend" },
  { id: "son", label: "Son" },
  { id: "daughter", label: "Daughter" },
  { id: "father", label: "Father" },
  { id: "mother", label: "Mother" },
  { id: "sibling", label: "Sibling" },
  { id: "friend", label: "Friend" },
  { id: "myself", label: "Myself" },
  { id: "other", label: "Someone special" },
] as const;

export const genres = [
  { id: "acoustic", label: "Acoustic / Folk" },
  { id: "pop", label: "Pop" },
  { id: "country", label: "Country" },
  { id: "rnb", label: "R&B" },
  { id: "rock", label: "Rock" },
  { id: "worship", label: "Worship" },
  { id: "lullaby", label: "Lullaby" },
  { id: "jazz", label: "Jazz" },
] as const;

export const voices = [
  { id: "female", label: "Female voice" },
  { id: "male", label: "Male voice" },
  { id: "any", label: "No preference" },
] as const;

export const occasions = [
  { id: "just-because", label: "Just because" },
  { id: "birthday", label: "Birthday" },
  { id: "anniversary", label: "Anniversary" },
  { id: "wedding", label: "Wedding" },
  { id: "thank-you", label: "Thank you" },
  { id: "in-memory", label: "In memory" },
  { id: "baptism", label: "Baptism / blessing" },
  { id: "bar-mitzvah", label: "Bar / Bat Mitzvah" },
  { id: "bedtime", label: "Bedtime" },
  { id: "other", label: "Something else" },
] as const;

export type RelationshipId = (typeof relationships)[number]["id"];
export type GenreId = (typeof genres)[number]["id"];
export type VoiceId = (typeof voices)[number]["id"];
export type OccasionId = (typeof occasions)[number]["id"];
