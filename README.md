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

Optional: set `OPENAI_API_KEY` in `.env.local` for stronger lyrics. Without it, Hearloom uses the built-in writer.

## Sync to your Whop account

1. Create or open the company on [sandbox.whop.com](https://sandbox.whop.com) (test) or [whop.com](https://whop.com) (live).
2. Developer → Company API key with product, plan, checkout, webhook, and payment read/create scopes.
3. Copy the company id (`biz_...`) from the dashboard URL.
4. Put them in `.env.local`:

```
WHOP_COMPANY_API_KEY=apik_...
WHOP_COMPANY_ID=biz_...
WHOP_SANDBOX=true
APP_URL=https://your-deployed-domain.com
```

5. Deploy or tunnel the app so Whop can reach `/api/webhooks/whop`.
6. Run:

```bash
npm run sync:whop
```

That creates:

- Product: `{brand} personalized song`
- Plan: Complete song at `$39`
- Plan: Song + lyric print at `$58`
- Webhook to `/api/webhooks/whop` for `payment.succeeded`

7. Paste `WHOP_WEBHOOK_SECRET` from the webhook row in the Whop dashboard into `.env.local`.
8. Set `WHOP_SANDBOX=false` and repeat on production when you are ready to take real money.

Hearloom never stores cards. Whop handles checkout; the webhook unlocks the full recording.

## Production music

The included preview is a generated instrumental so the funnel works without a music API. When you add a Suno / Replicate / similar key, replace `lib/music.ts` and keep the same `writePreviewAudio` / `writeFullAudio` contract.

## Stack

Next.js App Router, Whop Checkout embed (`@whop/checkout`), Whop API (`@whop/sdk`), file-backed job store in `data/` for the first version.
