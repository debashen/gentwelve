import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {z} from "zod";
import {DB} from "@/lib/database";
import {admin,fail,jsonBody,noStore} from "@/lib/sales/http";
import {audit,SalesError} from "@/lib/sales/store";
import {campaignSchema} from "@/lib/campaigns";
export const dynamic="force-dynamic";
export async function GET(request:Request){try{await admin(request);
 const [rows,categories]=await Promise.all([DB.prepare(`SELECT c.id,c.data,c.version,c.updated_at AS updatedAt,
 (SELECT COUNT(*) FROM marketing_events e WHERE e.campaign_id=c.id AND e.event='impression') AS impressions,
 (SELECT COUNT(*) FROM marketing_events e WHERE e.campaign_id=c.id AND e.event='click') AS clicks,
 (SELECT COUNT(*) FROM marketing_events e WHERE e.campaign_id=c.id AND e.event='dismiss') AS dismissals,
 (SELECT COUNT(*) FROM marketing_events e WHERE e.campaign_id=c.id AND e.event='product_view') AS productViews,
 (SELECT COUNT(*) FROM sales_enquiries e WHERE e.details->>'campaignId'=c.id::text) AS requests,
 (SELECT COALESCE(SUM(d.total_cents),0)::bigint FROM sales_documents d JOIN sales_enquiries e ON d.enquiry_id=e.id WHERE e.details->>'campaignId'=c.id::text AND d.kind='quote' AND d.number IS NOT NULL AND d.status!='cancelled') AS quoteValue
 FROM marketing_campaigns c ORDER BY c.updated_at DESC LIMIT 200`).all(),DB.prepare("SELECT DISTINCT category FROM products WHERE active=1 AND category IS NOT NULL ORDER BY category").all()]);return NextResponse.json({items:rows.results,categories:categories.results.map(r=>r.category)},{headers:noStore})
}catch(e){return fail(e)}}
export async function POST(request:Request){try{const actor=await admin(request);const {id,version,data}=z.object({id:z.string().uuid().optional(),version:z.number().int().positive().optional(),data:campaignSchema}).strict().parse(await jsonBody(request));
 const result=await DB.transaction(async()=>{
 for(const code of data.products)if(!await DB.prepare("SELECT id FROM products WHERE supplier_code=?").bind(code).first())throw new SalesError(`Product ${code} does not exist.`);
 for(const category of data.categories)if(!await DB.prepare("SELECT id FROM products WHERE category=? LIMIT 1").bind(category).first())throw new SalesError(`Category ${category} does not exist.`);
 for(const image of [data.desktopImage,data.mobileImage].filter(Boolean)){const asset=image.split("/").pop();if(!await DB.prepare("SELECT id FROM marketing_assets WHERE id=?::uuid").bind(asset).first())throw new SalesError("Campaign image not found.")}
 const campaignId=id||randomUUID();if(id){if(!version)throw new SalesError("Version required.");const r=await DB.prepare("UPDATE marketing_campaigns SET data=?::text::jsonb,version=version+1,updated_at=now() WHERE id=?::uuid AND version=?").bind(JSON.stringify(data),id,version).run();if(!r.changes)throw new SalesError("Campaign changed. Reload before saving.",409)}else await DB.prepare("INSERT INTO marketing_campaigns(id,data) VALUES(?::uuid,?::text::jsonb)").bind(campaignId,JSON.stringify(data)).run();await audit(campaignId,"campaign_saved",actor,{enabled:data.enabled,published:data.published});return {id:campaignId};
 });return NextResponse.json(result,{headers:noStore});
}catch(e){return fail(e)}}
