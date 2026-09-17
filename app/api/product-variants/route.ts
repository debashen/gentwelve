import { env } from "@/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

type VariantRow = {
  code: string;
  colour: string | null;
  size: string | null;
  stock: number | null;
};

export async function GET(request: Request) {
  const code = new URL(request.url).searchParams.get("code")?.trim();
  if (!code) return NextResponse.json({ variants: [] });

  try {
    const result = await env.DB.prepare(
      `SELECT full_code AS code, colour, size, stock_quantity AS stock
       FROM variants
       WHERE product_code = ? AND active = 1
         AND EXISTS (SELECT 1 FROM products p WHERE p.supplier_code=variants.product_code
           AND p.active=1 AND p.curated=1 AND p.public_price_cents IS NOT NULL
           AND p.image_url IS NOT NULL AND p.image_url!='') AND COALESCE(stock_quantity, 0) > 0
       ORDER BY COALESCE(colour, ''), COALESCE(size, ''), full_code`,
    ).bind(code).all<VariantRow>();

    return NextResponse.json({
      variants: result.results.map((variant) => ({
        code: variant.code,
        colour: variant.colour?.trim() ?? "",
        size: variant.size?.trim() ?? "",
        stock: Math.max(0, Number(variant.stock ?? 0)),
      })),
    });
  } catch {
    return NextResponse.json({ variants: [], unavailable: true }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
