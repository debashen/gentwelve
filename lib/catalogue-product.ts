import {brandingOptions,type BrandingOption} from "./sales/branding";
import {productDescriptionHtml,productImages} from "./product-content";
import { env } from "@/lib/runtime";

export type ProductPageProduct = {
  id:number;
  descriptionHtml:string;
  images:string[];
  branding:BrandingOption[];
  code: string;
  name: string;
  description: string;
  category: string;
  brand: string;
  image: string;
  priceCents: number;
  minimumQuantity: number;
  methods: string[];
  stock: number;
};

export type ProductPageVariant = {
  code: string;
  colour: string;
  size: string;
  stock: number|null;
  priceCents: number;
};

export type RelatedProduct = {
  code: string;
  name: string;
  category: string;
  image: string;
  priceCents: number;
};

type ProductRow = Omit<ProductPageProduct, "methods"|"descriptionHtml"|"images"|"branding"> & { methods: string;raw:string };

export async function getProductPageData(code: string) {
  const product = await env.DB.prepare(
    `SELECT id,raw_json AS raw,supplier_code AS code, name, COALESCE(description, '') AS description,
      COALESCE(category, 'Products') AS category, COALESCE(brand, '') AS brand,
      image_url AS image, COALESCE((SELECT MIN(v.public_price_cents) FROM variants v
        WHERE v.product_code = products.supplier_code AND v.active = 1
          AND COALESCE(v.stock_quantity, 0) > 0 AND v.public_price_cents IS NOT NULL), public_price_cents) AS priceCents,
      COALESCE(minimum_quantity, 0) AS minimumQuantity, branding_methods_json AS methods,
      COALESCE((SELECT SUM(v.stock_quantity) FROM variants v WHERE v.product_code = products.supplier_code
        AND v.active = 1 AND COALESCE(v.stock_quantity, 0) > 0), 0) AS stock
     FROM products
     WHERE supplier_code = ? AND active = 1 AND curated = 1 AND image_url IS NOT NULL AND image_url != ''
       AND public_price_cents IS NOT NULL
       AND EXISTS (SELECT 1 FROM variants available WHERE available.product_code = products.supplier_code
         AND available.active = 1 AND COALESCE(available.stock_quantity, 0) > 0)`,
  ).bind(code).first<ProductRow>();

  if (!product) return null;

  const [variants, related] = await Promise.all([
    env.DB.prepare(
      `SELECT full_code AS code, COALESCE(colour, '') AS colour, COALESCE(size, '') AS size,
        stock_quantity AS stock, COALESCE(public_price_cents, ?) AS priceCents
       FROM variants WHERE product_code = ? AND active = 1
       ORDER BY COALESCE(colour, ''), COALESCE(size, ''), full_code`,
    ).bind(product.priceCents, code).all<ProductPageVariant>(),
    env.DB.prepare(
      `SELECT supplier_code AS code, name, COALESCE(category, 'Products') AS category, image_url AS image,
        COALESCE((SELECT MIN(v.public_price_cents) FROM variants v WHERE v.product_code = products.supplier_code
          AND v.active = 1 AND COALESCE(v.stock_quantity, 0) > 0 AND v.public_price_cents IS NOT NULL), public_price_cents) AS priceCents
       FROM products WHERE supplier_code != ? AND category = ? AND active = 1 AND curated = 1
         AND image_url IS NOT NULL AND image_url != '' AND public_price_cents IS NOT NULL
         AND EXISTS (SELECT 1 FROM variants available WHERE available.product_code = products.supplier_code
           AND available.active = 1 AND COALESCE(available.stock_quantity, 0) > 0)
       ORDER BY featured DESC, trending DESC, display_priority DESC, updated_at DESC LIMIT 4`,
    ).bind(code, product.category).all<RelatedProduct>(),
  ]);

  let methods: string[] = [];
  try {
    const parsed = JSON.parse(product.methods);
    if (Array.isArray(parsed)) methods = parsed.map(String);
  } catch { /* keep the product page available */ }

  let raw:Record<string,unknown>={};try{raw=JSON.parse(product.raw)}catch{}
  const {raw:privateRaw,...safe}=product;void privateRaw;
  return {
    product: { ...safe, methods,descriptionHtml:productDescriptionHtml(product.description),images:productImages(raw,product.image),branding:brandingOptions(raw) } as ProductPageProduct,
    variants: variants.results.map((variant) => ({
      ...variant,
      colour: String(variant.colour ?? "").trim(),
      size: String(variant.size ?? "").trim(),
      stock: variant.stock===null?null:Math.max(0, Number(variant.stock)),
      priceCents: Math.max(0, Number(variant.priceCents ?? product.priceCents)),
    })),
    related: related.results,
  };
}
