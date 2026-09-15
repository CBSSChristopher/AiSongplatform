export type LyricWordCue = {
  text: string;
  start: number;
  end: number;
};

export type LyricCue = {
  text: string;
  start: number;
  end: number;
  section: "verse" | "chorus" | "bridge";
  words?: LyricWordCue[];
};
