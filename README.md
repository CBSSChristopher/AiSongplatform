# Hearloom

Personalized gift songs for families, milestones, and faith moments. Free preview, lyric approval, then a one-time Whop checkout.

This is an original product that follows the same **listen-before-you-buy** pattern as other custom-song gifts. It is not a copy of another brand’s name, copy, or design.

## Business names

Ship default: **Hearloom** (heirloom + hear). Easy to say in ads. Distinct from SongCuddle.

Other names you and Joe can swap in with `NEXT_PUBLIC_BRAND_NAME`:

| Name | Why it works |
| --- | --- |
| Hearloom | Keepsake. Memorable. Recommended. |
| NamedHeart | Literal: their name, your feeling. |
| Versekeep | Lyrics as the product. |
| KinChorus | Family / kids / parents. |
| Storytune | Memory-first. |
| DearKeep | Soft gift tone. |
| Hearthline | Home and faith adjacent. |
| KeepAMelody | Clear promise. |
| OurLittleSong | Kids / bedtime lane. |
| ForeverNote | Higher-ticket memorial / anniversary. |

Change the brand without a rewrite:

```bash
NEXT_PUBLIC_BRAND_NAME=KinChorus
NEXT_PUBLIC_BRAND_TAGLINE=A song your family can keep.
```

## What you get

- Public site: landing, 5-step create flow, lyric editor, 45s preview, checkout, private listening page
- Son and daughter as separate recipients (not a generic “children” bucket)
- Price shown before the funnel (`$39` song, `$19` lyric print)
- Checkout stays closed until the preview can play
- Honest AI disclosure
- Demo mode so you can test the whole funnel before Whop keys exist
- `npm run sync:whop` to create the product + plans on your Whop account

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

Cheaper/faster: `ANTHROPIC_MODEL=claude-sonnet-5`. OpenAI and Groq still work. If no key is set, Hearloom uses the built-in template.

## Sync to your Whop account

Use your existing [whop.com](https://whop.com) company. Sandbox is optional and not required.

1. Dashboard → Developer → Company API keys → Create (Admin). Copy `apik_...`.
2. Copy the company id (`biz_...`) from the dashboard URL.
3. Put them in `.env.local` with the public site URL:

```
WHOP_COMPANY_API_KEY=apik_...
WHOP_COMPANY_ID=biz_...
APP_URL=https://your-deployed-domain.com
```

4. Deploy so Whop can reach `/api/webhooks/whop`.
5. Run:

```bash
npm run sync:whop
```

That creates the Hearloom product, the `$39` song plan, the `$58` song+lyrics plan, and a webhook. The webhook signing secret is saved automatically when `APP_URL` is public https.

Hearloom never stores cards. Whop handles checkout; the webhook unlocks the full recording.

## Production music

The included preview is a generated instrumental so the funnel works without a music API. When you add a Suno / Replicate / similar key, replace `lib/music.ts` and keep the same `writePreviewAudio` / `writeFullAudio` contract.

## Stack

Next.js App Router, Whop Checkout embed (`@whop/checkout`), Whop API (`@whop/sdk`), file-backed job store in `data/` for the first version.
