import {NextResponse} from "next/server";
import {z} from "zod";
import {DB} from "@/lib/database";
import {sameOrigin,limitPublicRequest,limitedBody} from "@/lib/public-security";
import {fail,noStore} from "@/lib/sales/http";
import {campaignStatus,type Campaign} from "@/lib/campaigns";
export async function POST(request:Request){try{sameOrigin(request);await limitPublicRequest(request,"campaign-event",300);const bytes=await limitedBody(request,2000);const input=z.object({id:z.string().uuid(),visitor:z.string().uuid(),event:z.enum(["impression","click","dismiss","product_view"]),productCode:z.string().max(200).optional()}).strict().parse(JSON.parse(bytes.toString()));
 const campaign=await DB.prepare("SELECT data FROM marketing_campaigns WHERE id=?::uuid").bind(input.id).first<{data:Campaign}>();if(!campaign||campaignStatus(campaign.data)!=="Active")return NextResponse.json({ok:true},{headers:noStore});
 await DB.prepare("INSERT INTO marketing_events(campaign_id,visitor,event,product_code) SELECT ?::uuid,?::uuid,?,? WHERE NOT EXISTS (SELECT 1 FROM marketing_events WHERE campaign_id=?::uuid AND visitor=?::uuid AND event=? AND COALESCE(product_code,'')=? AND created_at>now()-interval '1 minute')").bind(input.id,input.visitor,input.event,input.productCode||null,input.id,input.visitor,input.event,input.productCode||"").run();return NextResponse.json({ok:true},{headers:noStore});
}catch(e){return fail(e)}}
