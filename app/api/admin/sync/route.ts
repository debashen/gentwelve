import { sourceDiagnostics } from "@/lib/sync-diagnostics";
import type { PreparedStatement } from "@/lib/database";
import { env } from "@/lib/runtime";
import { NextResponse } from "next/server";
import { extractProductVariants, fetchAmrodResponse, getAmrodToken, getProductCode, getSyncKey, normalisePrice, normaliseProduct, normaliseStock, streamJsonObjects } from "@/lib/amrod";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

type Dataset = "products" | "variants" | "prices" | "stock" | "enrichment";
type SyncRun = { id:number; mode:string; status:string; received:number; stored:number; error?:string|null; startedAt:string; finishedAt?:string|null; diagnostics?:Record<string,unknown> };

const modeFor = (dataset:Dataset,strategy?:string) => dataset === "products" ? strategy==="changes"?"changes":"full" : `${dataset}_full`;
const datasetFor = (mode:string):Dataset => mode.startsWith("variants_") ? "variants" : mode.startsWith("prices_") ? "prices" : mode.startsWith("stock_") ? "stock" : mode.startsWith("enrichment_") ? "enrichment" : "products";

async function authorised(request:Request) {
  const expected=getSyncKey();
  const user=await getChatGPTUser();
  return Boolean(user||(expected&&request.headers.get("x-sync-key")===expected));
}

function datasetFrom(value:string|null):Dataset {
  return value === "variants" || value === "prices" || value === "stock" || value === "enrichment" ? value : "products";
}

async function getRun(id?:number,dataset?:Dataset) {
  if(id)return env.DB.prepare("SELECT id,mode,status,products_received AS received,products_stored AS stored,error_message AS error,started_at AS startedAt,finished_at AS finishedAt,diagnostics FROM sync_runs WHERE id=? FOR UPDATE").bind(id).first<SyncRun>();
  const condition=dataset === "products" ? "mode IN ('full','changes')" : dataset ? "mode LIKE ?" : "1=1";
  const statement=env.DB.prepare(`SELECT id,mode,status,products_received AS received,products_stored AS stored,error_message AS error,started_at AS startedAt,finished_at AS finishedAt,diagnostics FROM sync_runs WHERE ${condition} ORDER BY id DESC LIMIT 1`);
  return (dataset&&dataset!=="products"?statement.bind(`${dataset}_%`):statement).first<SyncRun>();
}

async function flush(statements:PreparedStatement[]) {
  if(statements.length)await env.DB.batch(statements);
}

async function finishChunk(run:SyncRun,processed:number,storedThisChunk:number,reachedEnd:boolean) {
  const received=Number(run.received||0)+processed;
  const stored=Number(run.stored||0)+storedThisChunk;
  const status=reachedEnd?"complete":"running";
  if(reachedEnd && ["full", "prices_full", "stock_full"].includes(run.mode) && stored===0) throw new Error("Empty supplier snapshot rejected.");
  if(reachedEnd&&datasetFor(run.mode)==="stock") {
    await env.DB.prepare("UPDATE variants SET stock_quantity=0 WHERE last_stock_run IS DISTINCT FROM ?").bind(run.id).run();
  }
  if(reachedEnd&&datasetFor(run.mode)==="prices") {
    await env.DB.prepare("UPDATE variants SET supplier_price_cents=NULL,public_price_cents=NULL WHERE last_price_run IS DISTINCT FROM ?").bind(run.id).run();
    await env.DB.prepare(`UPDATE products SET supplier_price_cents=(SELECT MIN(v.supplier_price_cents) FROM variants v WHERE v.product_code=products.supplier_code AND v.active=1 AND v.supplier_price_cents IS NOT NULL),public_price_cents=(SELECT MIN(v.public_price_cents) FROM variants v WHERE v.product_code=products.supplier_code AND v.active=1 AND v.public_price_cents IS NOT NULL)`).run();
  }
  if(reachedEnd&&run.mode==="full"){
    await env.DB.prepare("UPDATE products SET active=0,curated=0,updated_at=? WHERE active=1 AND last_product_run IS DISTINCT FROM ?").bind(new Date().toISOString(),run.id).run();
    await env.DB.prepare("UPDATE variants SET active=0 WHERE product_code IN (SELECT supplier_code FROM products WHERE active=0)").run();
  }
  await env.DB.prepare("UPDATE sync_runs SET status=?,products_received=?,products_stored=?,error_message=NULL,finished_at=? WHERE id=?").bind(status,received,stored,reachedEnd?new Date().toISOString():null,run.id).run();
  if(reachedEnd)await env.DB.prepare("DELETE FROM sync_source_records WHERE run_id=?").bind(run.id).run();
  return {id:run.id,runId:run.id,dataset:datasetFor(run.mode),status,received,stored,diagnostics:run.diagnostics};
}

async function processVariants(run:SyncRun) {
  const limit=40;
  const rows=await env.DB.prepare("SELECT supplier_code,raw_json FROM products WHERE active=1 ORDER BY id LIMIT ? OFFSET ?").bind(limit,Number(run.received||0)).all<{supplier_code:string;raw_json:string}>();
  const now=new Date().toISOString();
  let stored=0,statements:PreparedStatement[]=[];
  for(const row of rows.results) {
    let raw:Record<string,unknown>;
    try{raw=JSON.parse(row.raw_json) as Record<string,unknown>}catch{continue}
    const variants=extractProductVariants(raw);
    if(!variants.length)continue; // Some supplier records have no embedded variant details.
    statements.push(env.DB.prepare("UPDATE variants SET active=0 WHERE product_code=?").bind(row.supplier_code));
    for(const variant of variants) {
      stored++;
      statements.push(env.DB.prepare(`INSERT INTO variants (product_code,full_code,colour,size,image_url,active,updated_at) VALUES (?,?,?,?,?,1,?) ON CONFLICT(full_code) DO UPDATE SET product_code=excluded.product_code,colour=excluded.colour,size=excluded.size,image_url=excluded.image_url,active=1,updated_at=excluded.updated_at`).bind(variant.productCode||row.supplier_code,variant.fullCode,variant.colour,variant.size,variant.imageUrl,now));
      if(statements.length>=25){await flush(statements);statements=[]}
    }
  }
  await flush(statements);
  return finishChunk(run,rows.results.length,stored,rows.results.length<limit);
}

async function processEnrichment(run:SyncRun) {
  const limit=100;
  const rows=await env.DB.prepare("SELECT id,raw_json FROM products ORDER BY id LIMIT ? OFFSET ?").bind(limit,Number(run.received||0)).all<{id:number;raw_json:string}>();
  const now=new Date().toISOString();
  let stored=0,statements:PreparedStatement[]=[];
  for(const row of rows.results) {
    try {
      const product=normaliseProduct(JSON.parse(row.raw_json) as Record<string,unknown>);
      if(!product)continue;
      stored++;
      statements.push(env.DB.prepare("UPDATE products SET name=?,description=?,product_type=?,category=?,brand=?,image_url=?,minimum_quantity=?,branding_methods_json=?,updated_at=? WHERE id=?").bind(product.name,product.description,product.productType,product.category,product.brand,product.imageUrl,product.minimumQuantity,JSON.stringify(product.brandingMethods),now,row.id));
      if(statements.length>=25){await flush(statements);statements=[]}
    } catch { /* preserve the imported record for manual review */ }
  }
  await flush(statements);
  return finishChunk(run,rows.results.length,stored,rows.results.length<limit);
}

async function processRemote(run:SyncRun) {
  const dataset=datasetFor(run.mode);
  const path=dataset==="prices"?"/Prices/":dataset==="stock"?"/Stock/":run.mode==="changes"?"/Products/GetUpdatedProductsAndBranding":"/Products/GetProductsAndBranding";
  const batchSize=dataset==="products"?200:500;
  if(!run.diagnostics?.completeResponse){
    // Read once, reject truncated JSON, and stage the entire response atomically.
    const response=await fetchAmrodResponse(path,await getAmrodToken());
    const rows:Record<string,unknown>[]=[];
    for await(const row of streamJsonObjects(response))rows.push(row);
    if(!rows.length&&run.mode!=="changes")throw new Error("Empty supplier snapshot rejected.");
    const diagnostics={...sourceDiagnostics(rows,dataset),endpoint:path};
    await env.DB.prepare("DELETE FROM sync_source_records WHERE run_id=?").bind(run.id).run();
    for(let offset=0;offset<rows.length;offset+=200){
      const batch=rows.slice(offset,offset+200).map((payload,index)=>({ordinal:offset+index,payload}));
      await env.DB.prepare("INSERT INTO sync_source_records(run_id,ordinal,payload) SELECT ?,ordinal,payload FROM jsonb_to_recordset(?::text::jsonb) AS r(ordinal integer,payload jsonb)").bind(run.id,JSON.stringify(batch)).run();
    }
    // Old interrupted runs must restart from this stable snapshot.
    await env.DB.prepare("UPDATE sync_runs SET diagnostics=?::text::jsonb,products_received=0,products_stored=0 WHERE id=?").bind(JSON.stringify(diagnostics),run.id).run();
    return {id:run.id,runId:run.id,dataset,status:"running",received:0,stored:0,diagnostics};
  }
  const staged=await env.DB.prepare("SELECT payload FROM sync_source_records WHERE run_id=? AND ordinal>=? ORDER BY ordinal LIMIT ?").bind(run.id,Number(run.received||0),batchSize).all<{payload:Record<string,unknown>}>();
  const now=new Date().toISOString();
  let processed=0,stored=0;const reachedEnd=staged.results.length<batchSize;let statements:PreparedStatement[]=[];
  for(const {payload:row} of staged.results) {
    processed++;
    if(dataset==="products") {
      const action=Number(row.ActionType??row.actionType??0);
      const code=getProductCode(row);
      if((action===2||row.active===false||row.isActive===false||row.discontinued===true||row.isDiscontinued===true)&&code){stored++;statements.push(env.DB.prepare("UPDATE products SET active=0,curated=0,updated_at=? WHERE supplier_code=?").bind(now,code))}
      else {const product=normaliseProduct(row);if(product){stored++;statements.push(env.DB.prepare(`INSERT INTO products (supplier_code,name,description,product_type,category,brand,image_url,minimum_quantity,branding_methods_json,raw_json,active,curated,created_at,updated_at,last_product_run) VALUES (?,?,?,?,?,?,?,?,?,?,1,0,?,?,?) ON CONFLICT(supplier_code) DO UPDATE SET name=excluded.name,description=excluded.description,product_type=excluded.product_type,category=excluded.category,brand=excluded.brand,image_url=excluded.image_url,minimum_quantity=excluded.minimum_quantity,branding_methods_json=excluded.branding_methods_json,raw_json=excluded.raw_json,active=1,updated_at=excluded.updated_at,last_product_run=excluded.last_product_run`).bind(product.supplierCode,product.name,product.description,product.productType,product.category,product.brand,product.imageUrl,product.minimumQuantity,JSON.stringify(product.brandingMethods),product.rawJson,now,now,run.id));if(run.mode==="changes")for(const variant of extractProductVariants(row))statements.push(env.DB.prepare(`INSERT INTO variants (product_code,full_code,colour,size,image_url,active,updated_at) VALUES (?,?,?,?,?,1,?) ON CONFLICT(full_code) DO UPDATE SET product_code=excluded.product_code,colour=excluded.colour,size=excluded.size,image_url=excluded.image_url,active=1,updated_at=excluded.updated_at`).bind(variant.productCode||product.supplierCode,variant.fullCode,variant.colour,variant.size,variant.imageUrl,now))}}
    } else if(dataset==="prices") {
      const price=normalisePrice(row);
      if(price){stored++;statements.push(env.DB.prepare(`INSERT INTO variants (product_code,full_code,supplier_price_cents,public_price_cents,active,updated_at,last_price_run) VALUES (?,?,?,?,1,?,?) ON CONFLICT(full_code) DO UPDATE SET supplier_price_cents=excluded.supplier_price_cents,public_price_cents=excluded.public_price_cents,updated_at=excluded.updated_at,last_price_run=excluded.last_price_run`).bind(price.productCode,price.fullCode,price.supplierPriceCents,price.publicPriceCents,now,run.id))}
    } else {
      const stock=normaliseStock(row);
      if(stock){stored++;statements.push(env.DB.prepare(`INSERT INTO variants (product_code,full_code,stock_quantity,active,updated_at,last_stock_run) VALUES (?,?,?,1,?,?) ON CONFLICT(full_code) DO UPDATE SET stock_quantity=excluded.stock_quantity,updated_at=excluded.updated_at,last_stock_run=excluded.last_stock_run`).bind(stock.productCode,stock.fullCode,stock.stockQuantity,now,run.id))}
    }
    if(statements.length>=25){await flush(statements);statements=[]}
  }
  await flush(statements);
  return finishChunk(run,processed,stored,reachedEnd);
}

async function overview() {
  const [products,variants,prices,stock,ready,productRun,variantRun,priceRun,stockRun,enrichmentRun]=await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE active=1").first<{count:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM variants WHERE active=1").first<{count:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM variants WHERE active=1 AND public_price_cents IS NOT NULL").first<{count:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM variants WHERE active=1 AND stock_quantity IS NOT NULL").first<{count:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE active=1 AND public_price_cents IS NOT NULL AND image_url IS NOT NULL AND image_url!='' AND category IS NOT NULL AND category!=''").first<{count:number}>(),
    getRun(undefined,"products"),getRun(undefined,"variants"),getRun(undefined,"prices"),getRun(undefined,"stock"),getRun(undefined,"enrichment")
  ]);
  return {runs:{products:productRun,variants:variantRun,prices:priceRun,stock:stockRun,enrichment:enrichmentRun},metrics:{products:Number(products?.count||0),variants:Number(variants?.count||0),prices:Number(prices?.count||0),stock:Number(stock?.count||0),ready:Number(ready?.count||0)}};
}

export async function GET(request:Request) {
  if(!await authorised(request))return NextResponse.json({error:"Not authorised"},{status:401});
  try{return NextResponse.json(await overview())}catch{return NextResponse.json({error:"Import status unavailable. Check database configuration and migrations."},{status:503})}
}

async function handlePost(request:Request) {
  if(!await authorised(request))return NextResponse.json({error:"Not authorised"},{status:401});
  const url=new URL(request.url),requestedRunId=Number(url.searchParams.get("runId")||0);
  if(!requestedRunId) {
    const dataset=datasetFrom(url.searchParams.get("type")),mode=modeFor(dataset,url.searchParams.get("strategy")||undefined);
    await env.DB.prepare("UPDATE sync_runs SET status='failed',error_message='Superseded by a new import.',finished_at=? WHERE status='running' AND mode=?").bind(new Date().toISOString(),mode).run();
    const created=await env.DB.prepare("INSERT INTO sync_runs (mode,status,started_at) VALUES (?,?,?) RETURNING id").bind(mode,"running",new Date().toISOString()).first<{id:number}>();
    if(!created?.id)return NextResponse.json({error:"Could not create import run."},{status:500});
    return NextResponse.json({ok:true,id:created.id,runId:created.id,dataset,status:"running",received:0,stored:0},{status:202});
  }
  const run=await getRun(requestedRunId);
  if(!run)return NextResponse.json({error:"Import run not found."},{status:404});
  if(run.status==="failed")return NextResponse.json({error:"Import was superseded. Start a new run."},{status:409});
  if(run.status==="complete")return NextResponse.json({ok:true,...run,dataset:datasetFor(run.mode)});
  return NextResponse.json({ok:true,...await(datasetFor(run.mode)==="variants"?processVariants(run):datasetFor(run.mode)==="enrichment"?processEnrichment(run):processRemote(run))});
}

export async function POST(request: Request) {
  if(!await authorised(request))return NextResponse.json({error:"Not authorised"},{status:401});
  try {
    // Serialize starts/chunks across admin and scheduled runners; rollback the entire
    // chunk on failure so a retry cannot skip partially written supplier records.
    return await env.DB.transaction(async()=>{
      await env.DB.prepare("SELECT pg_advisory_xact_lock(1274138)").first();
      return handlePost(request);
    });
  } catch {
    const id=Number(new URL(request.url).searchParams.get("runId"));
    if(Number.isSafeInteger(id)&&id>0)await env.DB.prepare("UPDATE sync_runs SET error_message='Supplier fetch or database processing failed. Retry to resume the last committed chunk.' WHERE id=? AND status='running'").bind(id).run().catch(()=>{});
    return NextResponse.json({error:"Import failed. Check supplier configuration and database setup, then resume."},{status:503});
  }
}
