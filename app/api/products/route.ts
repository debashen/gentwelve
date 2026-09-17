import { env } from "@/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const search = (url.searchParams.get("q") ?? "").trim();
    const filter = (url.searchParams.get("filter") ?? "Discover").trim();
    const page = Math.max(0, Number.parseInt(url.searchParams.get("page") ?? "0", 10) || 0);
    const pageSize = 48;
    const conditions = [
      "active = 1",
      "curated = 1",
      "public_price_cents IS NOT NULL",
      "image_url IS NOT NULL",
      "image_url != ''",
      "EXISTS (SELECT 1 FROM variants stocked_variant WHERE stocked_variant.product_code = products.supplier_code AND stocked_variant.active = 1 AND COALESCE(stocked_variant.stock_quantity, 0) > 0)",
    ];
    const bindings: unknown[] = [];
    if (search) { conditions.push("(name ILIKE ? OR supplier_code ILIKE ? OR brand ILIKE ?)"); const q = `%${search}%`; bindings.push(q, q, q); }
    if (filter === "Under R100") { conditions.push("COALESCE((SELECT MIN(v.public_price_cents) FROM variants v WHERE v.product_code=products.supplier_code AND v.active=1 AND COALESCE(v.stock_quantity,0)>0 AND v.public_price_cents IS NOT NULL),public_price_cents) < ?"); bindings.push(10000); }
    else if (filter === "Under R250") { conditions.push("COALESCE((SELECT MIN(v.public_price_cents) FROM variants v WHERE v.product_code=products.supplier_code AND v.active=1 AND COALESCE(v.stock_quantity,0)>0 AND v.public_price_cents IS NOT NULL),public_price_cents) < ?"); bindings.push(25000); }
    else if (filter === "Trending") conditions.push("trending = 1");
    else if (filter === "New") conditions.push("new_arrival = 1");
    else if (filter !== "Discover") { conditions.push("category = ?"); bindings.push(filter); }
    const where = conditions.join(" AND ");
    const [result, count] = await Promise.all([
      env.DB.prepare(`SELECT supplier_code AS code, name, category, brand, image_url AS image, COALESCE((SELECT MIN(v.public_price_cents) FROM variants v WHERE v.product_code=products.supplier_code AND v.active=1 AND COALESCE(v.stock_quantity,0)>0 AND v.public_price_cents IS NOT NULL),public_price_cents) AS priceCents, minimum_quantity AS minimumQuantity, branding_methods_json AS methods, COALESCE((SELECT SUM(v.stock_quantity) FROM variants v WHERE v.product_code=products.supplier_code AND v.active=1 AND COALESCE(v.stock_quantity,0)>0),0) AS stockQuantity, (SELECT STRING_AGG(DISTINCT NULLIF(TRIM(v.colour),''), ',') FROM variants v WHERE v.product_code=products.supplier_code AND v.active=1 AND COALESCE(v.stock_quantity,0)>0) AS colours, (SELECT STRING_AGG(DISTINCT NULLIF(TRIM(v.size),''), ',') FROM variants v WHERE v.product_code=products.supplier_code AND v.active=1 AND COALESCE(v.stock_quantity,0)>0) AS sizes FROM products WHERE ${where} ORDER BY featured DESC,trending DESC,new_arrival DESC,display_priority DESC,updated_at DESC LIMIT ? OFFSET ?`).bind(...bindings, pageSize, page * pageSize).all<Record<string, unknown>>(),
      env.DB.prepare(`SELECT COUNT(*) AS total FROM products WHERE ${where}`).bind(...bindings).first<{ total: number }>(),
    ]);
    const total = Number(count?.total ?? 0);
    return NextResponse.json({ products: result.results.map(row => ({ ...row, methods: JSON.parse(String(row.methods || "[]")), colours: String(row.colours||"").split(",").filter(Boolean), sizes: String(row.sizes||"").split(",").filter(Boolean) })), total, page, hasMore: (page + 1) * pageSize < total });
  } catch {
    return NextResponse.json({ products: [], total: 0, page: 0, hasMore: false, unavailable: true }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
