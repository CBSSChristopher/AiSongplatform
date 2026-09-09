/// <reference types="@cloudflare/workers-types" />

interface CloudflareEnv {
  DB: D1Database;
  AUDIO: KVNamespace;
  ASSETS: Fetcher;
  NEXT_PUBLIC_BRAND_NAME: string;
  NEXT_PUBLIC_BRAND_TAGLINE: string;
  NEXT_PUBLIC_SUPPORT_EMAIL: string;
  NEXT_PUBLIC_SONG_PRICE: string;
  NEXT_PUBLIC_LYRICS_PRICE: string;
  APP_URL: string;
  LYRIC_PROVIDER: string;
  ANTHROPIC_MODEL: string;
  ANTHROPIC_API_KEY?: string;
  WHOP_COMPANY_API_KEY?: string;
  WHOP_COMPANY_ID?: string;
  WHOP_PRODUCT_ID: string;
  WHOP_PLAN_ID_SONG: string;
  WHOP_PLAN_ID_BUNDLE: string;
  WHOP_WEBHOOK_SECRET?: string;
}
