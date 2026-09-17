import { env } from "@/lib/runtime";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

async function authorised() { return Boolean(await getChatGPTUser()); }

export async function GET(request:Request) {
  if(!await authorised())return NextResponse.json({error:"Not authorised"},{status:401});
  const url=new URL(request.url);
  const search=(url.searchParams.get("q")||"").trim();
  const status=url.searchParams.get("status")||"draft";
  const category=(url.searchParams.get("category")||"").trim();
  const placement=(url.searchParams.get("placement")||"").trim();
  const requestedPage=Number.parseInt(url.searchParams.get("page")||"0",10);
  const page=Number.isFinite(requestedPage)?Math.max(0,requestedPage):0;
  const pageSize=60;
  const conditions=["p.active=1"];
  const bindings:unknown[]=[];
  if(status==="draft")conditions.push("p.curated=0");
  if(status==="published")conditions.push("p.curated=1");
  if(search){conditions.push("(p.name LIKE ? OR p.supplier_code LIKE ? OR p.brand LIKE ?)");const value=`%${search}%`;bindings.push(value,value,value)}
  if(category){conditions.push("p.category=?");bindings.push(category)}
  if(placement==="featured")conditions.push("p.featured=1");
  if(placement==="trending")conditions.push("p.trending=1");
  if(placement==="new")conditions.push("p.new_arrival=1");
  const [result,categories,total,eligible]=await Promise.all([
    env.DB.prepare(`SELECT p.id,p.supplier_code AS code,p.name,p.category,p.brand,p.image_url AS image,p.public_price_cents AS priceCents,p.minimum_quantity AS minimumQuantity,p.curated,p.featured,p.trending,p.new_arrival AS newArrival,p.display_priority AS displayPriority,COALESCE((SELECT SUM(v.stock_quantity) FROM variants v WHERE v.product_code=p.supplier_code AND v.stock_quantity IS NOT NULL),0) AS stock,CASE WHEN p.public_price_cents IS NOT NULL AND p.image_url IS NOT NULL AND p.image_url!='' AND p.category IS NOT NULL AND p.category!='' AND EXISTS (SELECT 1 FROM variants v WHERE v.product_code=p.supplier_code AND COALESCE(v.stock_quantity,0)>0) THEN 1 ELSE 0 END AS eligible FROM products p WHERE ${conditions.join(" AND ")} ORDER BY p.curated DESC,p.featured DESC,p.trending DESC,p.new_arrival DESC,p.display_priority DESC,p.name ASC LIMIT ? OFFSET ?`).bind(...bindings,pageSize,page*pageSize).all<Record<string,unknown>>(),
    env.DB.prepare("SELECT DISTINCT category FROM products WHERE active=1 AND category IS NOT NULL AND category!='' ORDER BY category").all<{category:string}>(),
    env.DB.prepare(`SELECT COUNT(*) AS count FROM products p WHERE ${conditions.join(" AND ")}`).bind(...bindings).first<{count:number}>(),
    env.DB.prepare("SELECT COUNT(*) AS count FROM products p WHERE p.active=1 AND p.curated=0 AND p.public_price_cents IS NOT NULL AND p.image_url IS NOT NULL AND p.image_url!='' AND p.category IS NOT NULL AND p.category!='' AND EXISTS (SELECT 1 FROM variants v WHERE v.product_code=p.supplier_code AND COALESCE(v.stock_quantity,0)>0)").first<{count:number}>()
  ]);
  const matchingTotal=total?.count||0;
  return NextResponse.json({products:result.results,categories:categories.results.map(row=>row.category),total:matchingTotal,eligible:eligible?.count||0,page,pageSize,hasMore:(page+1)*pageSize<matchingTotal});
}

export async function POST(request:Request) {
  if(!await authorised())return NextResponse.json({error:"Not authorised"},{status:401});
  const body=await request.json() as {action?:string;confirmed?:boolean};
  if(body.action!=="publish_all_eligible"||body.confirmed!==true)return NextResponse.json({error:"Bulk publication was not confirmed."},{status:400});
  const result=await env.DB.prepare("UPDATE products AS p SET curated=1,updated_at=? WHERE p.active=1 AND p.curated=0 AND p.public_price_cents IS NOT NULL AND p.image_url IS NOT NULL AND p.image_url!='' AND p.category IS NOT NULL AND p.category!='' AND EXISTS (SELECT 1 FROM variants v WHERE v.product_code=p.supplier_code AND COALESCE(v.stock_quantity,0)>0)").bind(new Date().toISOString()).run();
  return NextResponse.json({ok:true,published:Number(result.meta.changes||0)});
}

export async function PATCH(request:Request) {
  if(!await authorised())return NextResponse.json({error:"Not authorised"},{status:401});
  const body=await request.json() as {id?:number;curated?:boolean;featured?:boolean;trending?:boolean;newArrival?:boolean;displayPriority?:number};
  if(!Number.isInteger(body.id))return NextResponse.json({error:"Invalid catalogue update."},{status:400});
  if(body.curated===true){
    const ready=await env.DB.prepare("SELECT 1 AS ready FROM products p WHERE p.id=? AND p.active=1 AND p.public_price_cents IS NOT NULL AND p.image_url IS NOT NULL AND p.image_url!='' AND p.category IS NOT NULL AND p.category!='' AND EXISTS (SELECT 1 FROM variants v WHERE v.product_code=p.supplier_code AND COALESCE(v.stock_quantity,0)>0)").bind(body.id).first<{ready:number}>();
    if(!ready)return NextResponse.json({error:"This product needs an image, price, category and available stock before it can be published."},{status:400});
  }
  const fields:string[]=[],values:unknown[]=[];
  if(typeof body.curated==="boolean"){fields.push("curated=?");values.push(body.curated?1:0)}
  if(typeof body.featured==="boolean"){fields.push("featured=?");values.push(body.featured?1:0)}
  if(typeof body.trending==="boolean"){fields.push("trending=?");values.push(body.trending?1:0)}
  if(typeof body.newArrival==="boolean"){fields.push("new_arrival=?");values.push(body.newArrival?1:0)}
  if(Number.isInteger(body.displayPriority)&&Number(body.displayPriority)>=0&&Number(body.displayPriority)<=100){fields.push("display_priority=?");values.push(Number(body.displayPriority))}
  if(!fields.length)return NextResponse.json({error:"No valid catalogue changes were supplied."},{status:400});
  fields.push("updated_at=?");values.push(new Date().toISOString(),body.id);
  await env.DB.prepare(`UPDATE products SET ${fields.join(",")} WHERE id=?`).bind(...values).run();
  return NextResponse.json({ok:true,id:body.id});
}
