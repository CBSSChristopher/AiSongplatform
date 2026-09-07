#!/usr/bin/env npx tsx
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { WhopClient } from "@whop/sdk";
import { brand } from "../lib/brand";

function loadEnv() {
  for (const file of [".env.local", ".env"]) {
    if (!existsSync(file)) continue;
    for (const line of readFileSync(file, "utf8").split("\n")) {
      const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
      if (!match) continue;
      const key = match[1];
      const value = match[2].replace(/^["']|["']$/g, "");
      if (!process.env[key]) process.env[key] = value;
    }
  }
}

function upsertEnv(updates: Record<string, string>) {
  const file = existsSync(".env.local") ? ".env.local" : ".env.example";
  const target = file === ".env.example" ? ".env.local" : file;
  const current = existsSync(target) ? readFileSync(target, "utf8") : existsSync(".env.example") ? readFileSync(".env.example", "utf8") : "";
  const lines = current.split("\n");
  const keys = new Set(Object.keys(updates));
  const next = lines.map((line) => {
    const match = line.match(/^([A-Z0-9_]+)=/);
    if (match && keys.has(match[1])) {
      keys.delete(match[1]);
      return `${match[1]}=${updates[match[1]]}`;
    }
    return line;
  });
  for (const key of keys) next.push(`${key}=${updates[key]}`);
  writeFileSync(target, `${next.filter((line, i, arr) => !(line === "" && arr[i - 1] === "")).join("\n").trim()}\n`);
  return target;
}

async function main() {
  loadEnv();
  const token = process.env.WHOP_COMPANY_API_KEY;
  const accountId = process.env.WHOP_COMPANY_ID;
  if (!token || !accountId) {
    console.error("Set WHOP_COMPANY_API_KEY and WHOP_COMPANY_ID first.");
    process.exit(1);
  }

  const client = new WhopClient({
    token,
    baseUrl: process.env.WHOP_SANDBOX === "true"
      ? "https://sandbox-api.whop.com/api/v1"
      : "https://api.whop.com/api/v1",
  });

  const product = await client.products.create({
    account_id: accountId,
    title: `${brand.name} personalized song`,
    headline: brand.tagline,
    description: "A personalized gift song with a free preview, lyric approval, and email delivery after payment.",
    visibility: "visible",
  });

  const song = await client.plans.create({
    account_id: accountId,
    product_id: product.id,
    plan_type: "one_time",
    initial_price: brand.songPrice,
    currency: "usd",
    title: "Complete song",
    description: "Full personalized recording, private listening page, and MP3-style download.",
    visibility: "visible",
    unlimited_stock: true,
  });

  const bundle = await client.plans.create({
    account_id: accountId,
    product_id: product.id,
    plan_type: "one_time",
    initial_price: brand.songPrice + brand.lyricsPrice,
    currency: "usd",
    title: "Song + lyric print",
    description: "Full song plus a printable lyric keepsake PDF.",
    visibility: "visible",
    unlimited_stock: true,
  });

  const appUrl = process.env.APP_URL || "http://localhost:3000";
  let webhookId = "";
  try {
    const webhook = await client.webhooks.create({
      url: `${appUrl}/api/webhooks/whop`,
      events: ["payment.succeeded"],
    });
    webhookId = webhook.id;
  } catch (error) {
    console.warn("Webhook create skipped (add it in the Whop dashboard if this failed):", error);
  }

  const saved = upsertEnv({
    WHOP_PRODUCT_ID: product.id,
    WHOP_PLAN_ID_SONG: song.id,
    WHOP_PLAN_ID_BUNDLE: bundle.id,
    ...(webhookId ? { WHOP_WEBHOOK_ID: webhookId } : {}),
  });

  console.log(`Created Whop product ${product.id}`);
  console.log(`Song plan ${song.id} @ $${brand.songPrice}`);
  console.log(`Bundle plan ${bundle.id} @ $${brand.songPrice + brand.lyricsPrice}`);
  if (webhookId) console.log(`Webhook ${webhookId} -> ${appUrl}/api/webhooks/whop`);
  console.log(`IDs written to ${saved}`);
  console.log("Copy WHOP_WEBHOOK_SECRET from the Whop dashboard webhook row.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
