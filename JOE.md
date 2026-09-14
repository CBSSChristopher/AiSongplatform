# Joe / Grok handoff — SongSnuggle

Read this file first. Then `README.md`. Do not start from `main`.

This is an original listen-before-you-buy gift-song product. Public brand **SongSnuggle**. Code/repo name **Hearloom**. People: Court (Chris) and Joe (Joseph). Company on Whop: **Pirate Ventures**.

## Share these links

| What | URL |
| --- | --- |
| Live site | https://songsnuggle.com |
| www | https://www.songsnuggle.com |
| GitHub repo | https://github.com/CBSSChristopher/AiSongplatform |
| Working branch | `cursor/hearloom-whop-platform-00d4` |
| Pull request | https://github.com/CBSSChristopher/AiSongplatform/pull/2 |
| Whop dashboard | https://whop.com/dashboard |

`main` is still the empty initial commit. All product code is on the branch / PR above.

## Grok: clone this, not main

```bash
git clone https://github.com/CBSSChristopher/AiSongplatform.git
cd AiSongplatform
git fetch origin cursor/hearloom-whop-platform-00d4
git checkout cursor/hearloom-whop-platform-00d4
npm install
cp .env.example .env.local
```

Local demo: `npm run dev` → http://localhost:3000

Production deploy: `npm run deploy` (OpenNext + Wrangler, Worker name `songsnuggle`).

## Product rules (do not break)

- Original product. Do **not** copy SongCuddle name, copy, design, or testimonials.
- Public name is SongSnuggle. Hearloom stays package/repo/code only.
- Price on the homepage: **$39** song, **$19** optional lyric print.
- Son and daughter are separate recipients, not a generic “children” bucket.
- Checkout stays closed until the 45s preview can play.
- Honest AI disclosure is allowed. Do not put internal/dev notes on live pages (no “demo mode”, “funnel”, “run npm run sync:whop”).
- Never store cards. Whop handles checkout. Webhook unlocks the full song.
- Footer: original product, not affiliated with other personalized-song brands.
- Do not merge the PR unless Court/Joe ask.
- Never commit `.env.local` or API keys. Never print secrets.

## What is already live

Whop was synced to the **live** Pirate Ventures company. Sandbox was skipped on purpose.

| Item | Value |
| --- | --- |
| Worker | `songsnuggle` |
| Custom domains | songsnuggle.com, www.songsnuggle.com |
| D1 | `songsnuggle-jobs` (`bdcd7ace-9eba-4052-b5c5-f2abaac854a2`) |
| KV | `songsnuggle-audio` (`4f8262cb903743708308da8c8b3ea2dc`) |
| Cloudflare account | `c26984df74d264105345ad1f424067b5` |
| Product | SongSnuggle personalized song |
| Product ID | `prod_luh7orH2mbK32` |
| Song plan | `$39` `plan_oh2x5D1LKgd3N` |
| Song + lyric print | `$58` `plan_NlUq7bNsff0y0` |
| Webhook URL | `https://songsnuggle.com/api/webhooks/whop` |
| Demo checkout on production | **off** |

Do **not** run `npm run sync:whop` again unless those IDs are missing. A second run with IDs present **updates** the existing product. A run without IDs would create a duplicate.

## Joe’s Whop job (no files required)

Joe is Whop owner. He does not need the GitHub repo to finish checkout.

1. Log into https://whop.com/dashboard as Pirate Ventures Admin/Owner.
2. Open product **SongSnuggle personalized song** (`prod_luh7orH2mbK32`).
3. Make it **Visible**. Attach to the company storefront/experience if it is hidden.
4. Confirm webhook `https://songsnuggle.com/api/webhooks/whop` exists (`payment.succeeded`, `payment.failed`).
5. Buy one **$39** song on https://songsnuggle.com, confirm the private page unlocks, then refund.

No API keys in chat. Joe already owns the Whop company.

## If Joe’s Grok bot will change code

GitHub: invite Joe (write) to `CBSSChristopher/AiSongplatform`. Point the bot at branch `cursor/hearloom-whop-platform-00d4`.

Cloudflare: Joe needs Workers + DNS edit on zone `songsnuggle.com` to deploy. Secrets stay in the Worker (`wrangler secret put`), not the repo.

Worker secrets (names only — values are already on Cloudflare):

- `WHOP_COMPANY_API_KEY`
- `ANTHROPIC_API_KEY`
- `WHOP_WEBHOOK_SECRET`

`WHOP_COMPANY_ID` and plan IDs are non-secret vars in `wrangler.jsonc`.

Optional later: `RESEND_API_KEY`, `RESEND_FROM`.

## Stack and map

Next.js 16 App Router, React 19, Tailwind 4, `@whop/sdk`, `@whop/checkout`, OpenNext Cloudflare.

| Path | Role |
| --- | --- |
| `app/page.tsx` | Landing + FAQ |
| `app/create` | 5-step create wizard |
| `app/preview/[id]` | Lyric edit + 45s preview |
| `app/checkout/[id]` | Whop embed |
| `app/song/[id]` | Private delivery after pay |
| `app/api/jobs/*` | Jobs, lyrics, preview, audio, PDF |
| `app/api/checkout` | Creates Whop checkout session |
| `app/api/webhooks/whop` | Unlocks after `payment.succeeded` |
| `lib/brand.ts` | Name, prices, recipients, genres |
| `lib/lyrics.ts` | Anthropic default; OpenAI/Groq optional; template fallback |
| `lib/music.ts` | In-house WAV synth (instrumental, not vocals) |
| `lib/store.ts` | Local `data/` or Cloudflare D1 + KV |
| `lib/fulfill.ts` | Shared paid fulfillment |
| `scripts/sync-whop.ts` | Create/update Whop product + webhook |
| `wrangler.jsonc` | Worker, domain, D1, KV, public vars |

Lyrics: `LYRIC_PROVIDER=anthropic`, `ANTHROPIC_MODEL=claude-opus-5`. If the key fails, lyrics silently fall back to the built-in template (line starts with “If a melody could hold a person”). Groq (lyric API) is **not** Grok (this bot).

Music: the preview **follows the lyric script**. Each sung line gets a timed melody; the UI highlights that line while the audio plays. It is original generated music, not a studio vocal. Replace `lib/music.ts` and keep `writePreviewAudio` / `writeFullAudio` when adding Suno or similar.

Local `next dev` uses `data/jobs.json` and `data/audio/`. Production uses D1 + KV. Disk will not persist on Workers.

## Funnel

1. `/create` — who it’s for, name, email, genre, voice, memories.
2. Lyrics generated, user can edit.
3. Preview audio. Checkout disabled until it can play.
4. Pay $39 or $58 via Whop embed.
5. Webhook → full WAV + optional lyric PDF on `/song/[id]`.

Without the public https webhook, a live payment can charge and **not** unlock.

## Not done yet

1. One live $39 purchase + refund (required before ads).
2. Sung vocals (still instrumental).
3. Resend email from `hello@songsnuggle.com`.
4. Merge PR `#2` into `main` (only if Court/Joe want that).

## Joe paste for Grok

```
Work in github.com/CBSSChristopher/AiSongplatform
Branch: cursor/hearloom-whop-platform-00d4
Read JOE.md first, then README.md.
Live site: https://songsnuggle.com
Public brand: SongSnuggle. Code name: Hearloom.
Do not copy SongCuddle. Do not commit secrets.
Whop is already live on Pirate Ventures: prod_luh7orH2mbK32, $39 plan_oh2x5D1LKgd3N, $58 plan_NlUq7bNsff0y0.
Webhook: https://songsnuggle.com/api/webhooks/whop
Do not create a second Whop product.
```
