export type LyricCue = {
  text: string;
  start: number;
  end: number;
  section: "verse" | "chorus" | "bridge";
};
