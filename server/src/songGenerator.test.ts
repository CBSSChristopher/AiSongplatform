import { test } from "node:test";
import assert from "node:assert/strict";
import { generateSong, ValidationError } from "./songGenerator.js";

test("generates a song with lyrics and a valid WAV clip", () => {
  const { song, wav } = generateSong({
    occasion: "family",
    mood: "gentle",
    recipient: "Grandma Rose",
    keywords: ["sunday dinners", "her garden"],
  });

  assert.ok(song.id, "song should have an id");
  assert.ok(song.title.length > 0, "song should have a title");
  assert.equal(song.recipient, "Grandma Rose");
  assert.ok(song.sections.length >= 3, "song should have multiple sections");
  assert.ok(song.durationSeconds > 5, "clip should be several seconds long");

  // WAV header sanity checks.
  assert.equal(wav.subarray(0, 4).toString("ascii"), "RIFF");
  assert.equal(wav.subarray(8, 12).toString("ascii"), "WAVE");
  assert.ok(wav.length > 44, "WAV should contain audio data");
});

test("is deterministic for identical inputs", () => {
  const input = {
    occasion: "birthday" as const,
    mood: "uplifting" as const,
    recipient: "Leo",
    keywords: ["soccer"],
  };
  const a = generateSong(input);
  const b = generateSong(input);
  assert.equal(a.song.title, b.song.title);
  assert.deepEqual(a.song.sections, b.song.sections);
  assert.ok(a.wav.equals(b.wav), "audio should be identical for identical inputs");
});

test("rejects a missing recipient", () => {
  assert.throws(
    () => generateSong({ occasion: "faith", mood: "hymn", recipient: "  " }),
    ValidationError,
  );
});

test("rejects an unknown occasion", () => {
  assert.throws(
    () =>
      generateSong({
        // @ts-expect-error deliberately invalid
        occasion: "nope",
        mood: "hymn",
        recipient: "Sam",
      }),
    ValidationError,
  );
});
