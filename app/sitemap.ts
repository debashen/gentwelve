import { siteUrl } from "@/lib/site-url";
import type { MetadataRoute } from "next";
import { env } from "@/lib/runtime";

export const dynamic = "force-dynamic";

const SITE_URL = siteUrl;

type SitemapProduct = { code: string; updatedAt: string };

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const result = await env.DB.prepare(
    `SELECT supplier_code AS code, updated_at AS updatedAt
     FROM products
     WHERE active = 1 AND curated = 1 AND image_url IS NOT NULL AND image_url != ''
       AND public_price_cents IS NOT NULL
       AND EXISTS (SELECT 1 FROM variants available WHERE available.product_code = products.supplier_code
         AND available.active = 1 AND COALESCE(available.stock_quantity, 0) > 0)
     ORDER BY updated_at DESC`,
  ).all<SitemapProduct>();

  return [
    { url: SITE_URL, lastModified: new Date(), changeFrequency: "daily", priority: 1 },
    ...result.results.map((product) => ({
      url: `${SITE_URL}/product/${encodeURIComponent(product.code)}`,
      lastModified: new Date(product.updatedAt),
      changeFrequency: "weekly" as const,
      priority: 0.8,
    })),
  ];
}
