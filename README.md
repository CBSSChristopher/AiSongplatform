# SongSnuggle

Public site: [songsnuggle.com](https://songsnuggle.com) (Cloudflare).

Personalized gift songs for families, milestones, and faith moments. Free preview, lyric approval, then a one-time Whop checkout.

This is an original product that follows the same **listen-before-you-buy** pattern as other custom-song gifts. It is not a copy of another brand’s name, copy, or design.

## Names

| Layer | Name |
| --- | --- |
| Public brand / domain | **SongSnuggle** (`songsnuggle.com`) |
| Repo / package / code | Hearloom |

Change the public label without a rewrite:

```bash
NEXT_PUBLIC_BRAND_NAME=SongSnuggle
NEXT_PUBLIC_BRAND_TAGLINE=A song they can keep.
NEXT_PUBLIC_SUPPORT_EMAIL=hello@songsnuggle.com
APP_URL=https://songsnuggle.com
```

## What you get

- Public site: landing, 5-step create flow, lyric editor, 45s preview, checkout, private listening page
- Son and daughter as separate recipients (not a generic “children” bucket)
- Price shown before the funnel (`$39` song, `$19` lyric print)
- Checkout stays closed until the preview can play
- Honest AI disclosure
- Demo mode so you can test the whole funnel before Whop keys exist
- `npm run sync:whop` to create or update the product + plans on your Whop account

## Local demo

```bash
npm install
cp .env.example .env.local
npm run dev
```

Open http://localhost:3000. Create a song, hear the preview, then **Unlock full song (demo)**.

Best lyrics: Anthropic Claude Opus. Add this to `.env.local` and restart:

```bash
LYRIC_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-opus-5
```

Cheaper/faster: `ANTHROPIC_MODEL=claude-sonnet-5`. OpenAI and Groq still work. If no key is set, SongSnuggle uses the built-in template.

## Go live on songsnuggle.com

The domain is already on Cloudflare. Point it at a **Node** host that can write files (`data/` stores jobs and WAV audio). A Cloudflare Worker cannot use that disk store until we add D1/R2.

Joe paste — Cloudflare DNS (zone `songsnuggle.com`):

```
# Apex: A or CNAME to your Node host, Proxied (orange cloud)
# www:  CNAME songsnuggle.com, Proxied

APP_URL=https://songsnuggle.com
```

Then in `.env.local` (or the host’s secrets):

```
NEXT_PUBLIC_BRAND_NAME=SongSnuggle
NEXT_PUBLIC_SUPPORT_EMAIL=hello@songsnuggle.com
APP_URL=https://songsnuggle.com
```

Redeploy, then run `npm run sync:whop` so Whop can create the webhook at `https://songsnuggle.com/api/webhooks/whop`. Without that public https webhook, a live $39 payment will charge and will not auto-unlock the song.

## Sync to your Whop account

Use your existing [whop.com](https://whop.com) company. Sandbox is optional and not required.

1. Dashboard → Developer → Company API keys → Create (Admin). Copy `apik_...`.
2. Copy the company id (`biz_...`) from the dashboard URL.
3. Put them in `.env.local` with the public site URL:

```
WHOP_COMPANY_API_KEY=apik_...
WHOP_COMPANY_ID=biz_...
APP_URL=https://songsnuggle.com
```

4. Deploy so Whop can reach `/api/webhooks/whop`.
5. Run:

```bash
npm run sync:whop
```

If product/plan IDs already exist, this **updates** the SongSnuggle product title instead of creating a second product. The webhook signing secret is saved automatically when `APP_URL` is public https.

SongSnuggle never stores cards. Whop handles checkout; the webhook unlocks the full recording. The private page lets you listen, download, copy the link, and download a lyric PDF if that add-on was purchased.

## Production music

The included preview is a generated instrumental so the funnel works without a music API. When you add a Suno / Replicate / similar key, replace `lib/music.ts` and keep the same `writePreviewAudio` / `writeFullAudio` contract.

## Stack

Next.js App Router, Whop Checkout embed (`@whop/checkout`), Whop API (`@whop/sdk`), file-backed job store in `data/` for the first version.
