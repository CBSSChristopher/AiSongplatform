# AiSongPlatform

An AI song platform/builder for families, faith communities, and loved ones to
build custom heartfelt music clips.

Pick an occasion and a mood, add the name and a few cherished memories, and the
app writes custom lyrics and synthesizes a playable music clip on the fly.

## Tech stack

- **client/** &mdash; Vite + React + TypeScript UI
- **server/** &mdash; Express + TypeScript API that generates lyrics and renders a
  16-bit PCM WAV clip (pure Node, no external audio dependencies)
- npm workspaces tie the two together

## Getting started

```bash
npm install     # install all workspace dependencies
npm run dev     # start the API (:3001) and the web app (:5173) together
```

Then open http://localhost:5173.

The Vite dev server proxies `/api/*` to the Express server on port 3001, so you
only need to open the client URL.

## Useful scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Run server + client together (hot reload) |
| `npm run dev:server` | Run only the Express API |
| `npm run dev:client` | Run only the Vite web app |
| `npm run build` | Type-check and build both packages |
| `npm run typecheck` | Type-check server and client |
| `npm run lint` | Lint the client |
| `npm test` | Run the server test suite |

## API

| Method | Route | Purpose |
| --- | --- | --- |
| `GET` | `/api/health` | Liveness check |
| `GET` | `/api/catalog` | Available occasions and moods |
| `POST` | `/api/songs` | Generate a song (returns lyrics + metadata) |
| `GET` | `/api/songs/:id` | Fetch a previously generated song |
| `GET` | `/api/songs/:id/audio` | Download the generated WAV clip |

Example:

```bash
curl -X POST http://localhost:3001/api/songs \
  -H 'Content-Type: application/json' \
  -d '{"occasion":"family","mood":"gentle","recipient":"Grandma Rose","keywords":["sunday dinners","her garden"]}'
```

## Cloud Agent environment

`.cursor/environment.json` configures the Cursor Cloud Agent environment:

- `install`: `npm ci`
- `terminals`: runs `dev:server` (:3001) and `dev:client` (:5173)
- `ports`: exposes 5173 (web) and 3001 (api)
