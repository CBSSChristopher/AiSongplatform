import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/whop";

export default function sitemap(): MetadataRoute.Sitemap {
  const base = appUrl();
  return ["", "/create", "/privacy", "/terms", "/refunds"].map((path) => ({
    url: `${base}${path || "/"}`,
    changeFrequency: "weekly",
    priority: path === "" ? 1 : 0.6,
  }));
}
