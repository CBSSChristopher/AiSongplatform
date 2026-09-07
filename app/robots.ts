import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/whop";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
