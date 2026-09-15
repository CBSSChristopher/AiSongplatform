import { WhopClient } from "@whop/sdk";

export function whopConfigured() {
  return Boolean(process.env.WHOP_COMPANY_API_KEY && process.env.WHOP_COMPANY_ID);
}

export function demoCheckoutEnabled() {
  if (process.env.DEMO_CHECKOUT === "false") return false;
  if (process.env.DEMO_CHECKOUT === "true") return true;
  return !whopConfigured();
}

export function getWhop() {
  const token = process.env.WHOP_COMPANY_API_KEY;
  if (!token) throw new Error("WHOP_COMPANY_API_KEY is missing");

  return new WhopClient({
    token,
    baseUrl: process.env.WHOP_SANDBOX === "true"
      ? "https://sandbox-api.whop.com/api/v1"
      : "https://api.whop.com/api/v1",
  });
}

export function appUrl() {
  return process.env.APP_URL || "https://songsnuggle.com";
}

export function songPlanId(includeLyricPrint: boolean) {
  if (includeLyricPrint) {
    return process.env.WHOP_PLAN_ID_BUNDLE || process.env.WHOP_PLAN_ID_SONG || "";
  }
  return process.env.WHOP_PLAN_ID_SONG || "";
}
