import { connectDatabase, safeDatabaseError } from "./database.mjs";
let sql;
try {
  sql = connectDatabase();
  const [counts] = await sql`SELECT
    (SELECT COUNT(*)::int FROM products) AS products,
    (SELECT COUNT(*)::int FROM products WHERE active=1) AS active,
    (SELECT COUNT(*)::int FROM products WHERE curated=1) AS published,
    (SELECT COUNT(*)::int FROM variants) AS variants,
    (SELECT COUNT(*)::int FROM variants WHERE public_price_cents IS NOT NULL) AS priced_variants,
    (SELECT COUNT(*)::int FROM variants WHERE stock_quantity IS NOT NULL) AS stock_imported,
    (SELECT COUNT(*)::int FROM products p WHERE active=1 AND curated=1
      AND public_price_cents IS NOT NULL AND image_url IS NOT NULL AND image_url!=''
      AND EXISTS (SELECT 1 FROM variants v WHERE v.product_code=p.supplier_code AND v.active=1 AND v.stock_quantity>0)) AS publicly_visible`;
  console.log(JSON.stringify(counts, null, 2));
  console.log(JSON.stringify(await sql`SELECT mode,status,products_received,products_stored,started_at,finished_at FROM sync_runs ORDER BY id DESC LIMIT 10`, null, 2));
  if (!counts.products) console.log("Schema exists but catalogue is empty: run the full import.");
  else if (!counts.published) console.log("Products are imported but unpublished: review and bulk publish in /admin/catalogue.");
} catch (error) {
  console.error(process.env.DATABASE_URL ? safeDatabaseError(error) : "DATABASE_URL is not configured.");
  process.exitCode = 1;
} finally { await sql?.end(); }
