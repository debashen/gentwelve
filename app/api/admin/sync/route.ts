import { env } from "@/lib/runtime";
import { NextResponse } from "next/server";
import { extractProductVariants, fetchAmrodResponse, getAmrodToken, getProductCode, getSyncKey, normalisePrice, normaliseProduct, normaliseStock, streamJsonObjects } from "@/lib/amrod";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

type Dataset = "products" | "variants" | "prices" | "stock" | "enrichment";
type SyncRun = { id:number; mode:string; status:string; received:number; stored:number; error?:string|null; startedAt:string; finishedAt?:string|null };

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
  if(id)return env.DB.prepare("SELECT id,mode,status,products_received AS received,products_stored AS stored,error_message AS error,started_at AS startedAt,finished_at AS finishedAt FROM sync_runs WHERE id=?").bind(id).first<SyncRun>();
  const condition=dataset === "products" ? "mode IN ('full','changes')" : dataset ? "mode LIKE ?" : "1=1";
  const statement=env.DB.prepare(`SELECT id,mode,status,products_received AS received,products_stored AS stored,error_message AS error,started_at AS startedAt,finished_at AS finishedAt FROM sync_runs WHERE ${condition} ORDER BY id DESC LIMIT 1`);
  return (dataset&&dataset!=="products"?statement.bind(`${dataset}_%`):statement).first<SyncRun>();
}

async function flush(statements:D1PreparedStatement[]) {
  if(statements.length)await env.DB.batch(statements);
}

async function finishChunk(run:SyncRun,processed:number,storedThisChunk:number,reachedEnd:boolean) {
  const received=Number(run.received||0)+processed;
  const stored=Number(run.stored||0)+storedThisChunk;
  const status=reachedEnd?"complete":"running";
  if(reachedEnd&&datasetFor(run.mode)==="prices") {
    await env.DB.prepare(`UPDATE products SET supplier_price_cents=(SELECT MIN(v.supplier_price_cents) FROM variants v WHERE v.product_code=products.supplier_code AND v.supplier_price_cents IS NOT NULL),public_price_cents=(SELECT MIN(v.public_price_cents) FROM variants v WHERE v.product_code=products.supplier_code AND v.public_price_cents IS NOT NULL) WHERE EXISTS (SELECT 1 FROM variants v WHERE v.product_code=products.supplier_code AND v.public_price_cents IS NOT NULL)`).run();
  }
  if(reachedEnd&&run.mode==="full"){
    await env.DB.prepare("UPDATE products SET active=0,curated=0,updated_at=? WHERE active=1 AND updated_at<?").bind(new Date().toISOString(),run.startedAt).run();
  }
  await env.DB.prepare("UPDATE sync_runs SET status=?,products_received=?,products_stored=?,error_message=NULL,finished_at=? WHERE id=?").bind(status,received,stored,reachedEnd?new Date().toISOString():null,run.id).run();
  return {id:run.id,runId:run.id,dataset:datasetFor(run.mode),status,received,stored};
}

async function processVariants(run:SyncRun) {
  const limit=40;
  const rows=await env.DB.prepare("SELECT supplier_code,raw_json FROM products ORDER BY id LIMIT ? OFFSET ?").bind(limit,Number(run.received||0)).all<{supplier_code:string;raw_json:string}>();
  const now=new Date().toISOString();
  let stored=0,statements:D1PreparedStatement[]=[];
  for(const row of rows.results) {
    let raw:Record<string,unknown>;
    try{raw=JSON.parse(row.raw_json) as Record<string,unknown>}catch{continue}
    for(const variant of extractProductVariants(raw)) {
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
  let stored=0,statements:D1PreparedStatement[]=[];
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
  const response=await fetchAmrodResponse(path,await getAmrodToken());
  const now=new Date().toISOString();
  let seen=0,processed=0,stored=0,reachedEnd=true,statements:D1PreparedStatement[]=[];
  for await(const row of streamJsonObjects(response)) {
    if(seen++<Number(run.received||0))continue;
    processed++;
    if(dataset==="products") {
      const action=Number(row.ActionType??row.actionType??0);
      const code=getProductCode(row);
      if(run.mode==="changes"&&action===2&&code){stored++;statements.push(env.DB.prepare("UPDATE products SET active=0,curated=0,updated_at=? WHERE supplier_code=?").bind(now,code))}
      else {const product=normaliseProduct(row);if(product){stored++;statements.push(env.DB.prepare(`INSERT INTO products (supplier_code,name,description,product_type,category,brand,image_url,minimum_quantity,branding_methods_json,raw_json,active,curated,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,1,0,?,?) ON CONFLICT(supplier_code) DO UPDATE SET name=excluded.name,description=excluded.description,product_type=excluded.product_type,category=excluded.category,brand=excluded.brand,image_url=excluded.image_url,minimum_quantity=excluded.minimum_quantity,branding_methods_json=excluded.branding_methods_json,raw_json=excluded.raw_json,active=1,updated_at=excluded.updated_at`).bind(product.supplierCode,product.name,product.description,product.productType,product.category,product.brand,product.imageUrl,product.minimumQuantity,JSON.stringify(product.brandingMethods),product.rawJson,now,now));if(run.mode==="changes")for(const variant of extractProductVariants(row))statements.push(env.DB.prepare(`INSERT INTO variants (product_code,full_code,colour,size,image_url,active,updated_at) VALUES (?,?,?,?,?,1,?) ON CONFLICT(full_code) DO UPDATE SET product_code=excluded.product_code,colour=excluded.colour,size=excluded.size,image_url=excluded.image_url,active=1,updated_at=excluded.updated_at`).bind(variant.productCode||product.supplierCode,variant.fullCode,variant.colour,variant.size,variant.imageUrl,now))}}
    } else if(dataset==="prices") {
      const price=normalisePrice(row);
      if(price){stored++;statements.push(env.DB.prepare(`INSERT INTO variants (product_code,full_code,supplier_price_cents,public_price_cents,active,updated_at) VALUES (?,?,?,?,1,?) ON CONFLICT(full_code) DO UPDATE SET supplier_price_cents=excluded.supplier_price_cents,public_price_cents=excluded.public_price_cents,active=1,updated_at=excluded.updated_at`).bind(price.productCode,price.fullCode,price.supplierPriceCents,price.publicPriceCents,now))}
    } else {
      const stock=normaliseStock(row);
      if(stock){stored++;statements.push(env.DB.prepare(`INSERT INTO variants (product_code,full_code,stock_quantity,active,updated_at) VALUES (?,?,?,1,?) ON CONFLICT(full_code) DO UPDATE SET stock_quantity=excluded.stock_quantity,active=1,updated_at=excluded.updated_at`).bind(stock.productCode,stock.fullCode,stock.stockQuantity,now))}
    }
    if(statements.length>=25){await flush(statements);statements=[]}
    if(processed>=batchSize){reachedEnd=false;break}
  }
  await flush(statements);
  return finishChunk(run,processed,stored,reachedEnd);
}

async function overview() {
  const [products,variants,prices,stock,ready,productRun,variantRun,priceRun,stockRun,enrichmentRun]=await Promise.all([
    env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE active=1").first<{count:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM variants WHERE active=1").first<{count:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM variants WHERE public_price_cents IS NOT NULL").first<{count:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM variants WHERE stock_quantity IS NOT NULL").first<{count:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM products WHERE active=1 AND public_price_cents IS NOT NULL AND image_url IS NOT NULL AND image_url!='' AND category IS NOT NULL AND category!=''").first<{count:number}>(),
    getRun(undefined,"products"),getRun(undefined,"variants"),getRun(undefined,"prices"),getRun(undefined,"stock"),getRun(undefined,"enrichment")
  ]);
  return {runs:{products:productRun,variants:variantRun,prices:priceRun,stock:stockRun,enrichment:enrichmentRun},metrics:{products:products?.count||0,variants:variants?.count||0,prices:prices?.count||0,stock:stock?.count||0,ready:ready?.count||0}};
}

export async function GET(request:Request) {
  if(!await authorised(request))return NextResponse.json({error:"Not authorised"},{status:401});
  return NextResponse.json(await overview());
}

export async function POST(request:Request) {
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
  if(run.status==="complete")return NextResponse.json({ok:true,...run,dataset:datasetFor(run.mode)});
  try{return NextResponse.json({ok:true,...await(datasetFor(run.mode)==="variants"?processVariants(run):datasetFor(run.mode)==="enrichment"?processEnrichment(run):processRemote(run))})}
  catch(error){const message=error instanceof Error?error.message:"Unknown sync failure";await env.DB.prepare("UPDATE sync_runs SET status='failed',error_message=?,finished_at=? WHERE id=?").bind(message,new Date().toISOString(),run.id).run();return NextResponse.json({error:message,id:run.id,runId:run.id,dataset:datasetFor(run.mode),status:"failed",received:run.received,stored:run.stored},{status:500})}
}
