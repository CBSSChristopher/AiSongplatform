import { useEffect, useMemo, useState } from "react";
import { createSong, fetchCatalog } from "./api";
import type { Catalog, GeneratedSong, MoodId, OccasionId } from "./types";
import { SongResultCard } from "./components/SongResultCard";

const FALLBACK_KEYWORDS_PLACEHOLDER =
  "Sunday dinners, her garden, the lake house";

export default function App() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [occasion, setOccasion] = useState<OccasionId>("family");
  const [mood, setMood] = useState<MoodId>("gentle");
  const [recipient, setRecipient] = useState("");
  const [sender, setSender] = useState("");
  const [keywords, setKeywords] = useState("");
  const [message, setMessage] = useState("");

  const [song, setSong] = useState<GeneratedSong | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCatalog()
      .then(setCatalog)
      .catch((e: unknown) =>
        setCatalogError(e instanceof Error ? e.message : "Failed to load catalog"),
      );
  }, []);

  const selectedOccasion = useMemo(
    () => catalog?.occasions.find((o) => o.id === occasion),
    [catalog, occasion],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!recipient.trim()) {
      setError("Please tell us who this song is for.");
      return;
    }
    setLoading(true);
    try {
      const result = await createSong({
        occasion,
        mood,
        recipient,
        sender: sender || undefined,
        keywords: keywords
          .split(",")
          .map((k) => k.trim())
          .filter(Boolean),
        message: message || undefined,
      });
      setSong(result);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="hero">
        <div className="hero__badge">AiSongPlatform</div>
        <h1 className="hero__title">
          Heartfelt songs, <span>made for someone.</span>
        </h1>
        <p className="hero__subtitle">
          Craft a custom music clip for the people who matter &mdash; family,
          faith, friends, and every occasion in between.
        </p>
      </header>

      <main className="layout">
        <section className="panel" aria-label="Song builder">
          <form className="form" onSubmit={handleSubmit}>
            <fieldset className="field">
              <legend>Occasion</legend>
              <div className="chip-grid">
                {catalog?.occasions.map((o) => (
                  <button
                    type="button"
                    key={o.id}
                    className={`chip ${occasion === o.id ? "chip--active" : ""}`}
                    onClick={() => setOccasion(o.id)}
                    aria-pressed={occasion === o.id}
                  >
                    <span className="chip__emoji" aria-hidden>
                      {o.emoji}
                    </span>
                    {o.label}
                  </button>
                ))}
              </div>
              {selectedOccasion && (
                <p className="field__hint">{selectedOccasion.blurb}</p>
              )}
            </fieldset>

            <fieldset className="field">
              <legend>Mood</legend>
              <div className="chip-grid">
                {catalog?.moods.map((m) => (
                  <button
                    type="button"
                    key={m.id}
                    className={`chip ${mood === m.id ? "chip--active" : ""}`}
                    onClick={() => setMood(m.id)}
                    aria-pressed={mood === m.id}
                  >
                    <span className="chip__emoji" aria-hidden>
                      {m.emoji}
                    </span>
                    {m.label}
                    <span className="chip__meta">{m.tempoBpm} BPM</span>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="field-row">
              <label className="field">
                <span className="field__label">Who is it for?</span>
                <input
                  className="input"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="Grandma Rose"
                  maxLength={60}
                  required
                />
              </label>
              <label className="field">
                <span className="field__label">From (optional)</span>
                <input
                  className="input"
                  value={sender}
                  onChange={(e) => setSender(e.target.value)}
                  placeholder="The whole family"
                  maxLength={60}
                />
              </label>
            </div>

            <label className="field">
              <span className="field__label">
                Special memories <span className="field__muted">(comma separated)</span>
              </span>
              <input
                className="input"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder={FALLBACK_KEYWORDS_PLACEHOLDER}
                maxLength={160}
              />
            </label>

            <label className="field">
              <span className="field__label">A note to weave in (optional)</span>
              <textarea
                className="input textarea"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Anything you'd like the song to capture..."
                rows={3}
                maxLength={280}
              />
            </label>

            {error && <p className="alert">{error}</p>}

            <button className="submit" type="submit" disabled={loading}>
              {loading ? "Composing\u2026" : "Compose the song \u266A"}
            </button>
          </form>
        </section>

        <section className="panel panel--result" aria-label="Generated song">
          {catalogError && (
            <p className="alert">Couldn&apos;t reach the studio: {catalogError}</p>
          )}
          {song ? (
            <SongResultCard song={song} />
          ) : (
            <div className="placeholder">
              <div className="placeholder__note" aria-hidden>
                &#9835;
              </div>
              <h2>Your song will appear here</h2>
              <p>
                Fill in a few details and press compose. We&apos;ll write custom
                lyrics and generate a playable music clip in seconds.
              </p>
            </div>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>
          Made with care for the moments worth remembering. Every clip is
          generated on the fly &mdash; no two songs are the same.
        </p>
      </footer>
    </div>
  );
}
