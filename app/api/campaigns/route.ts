import {NextResponse} from "next/server";
import {DB} from "@/lib/database";
import {campaignStatus,campaignMatches,type CampaignRecord} from "@/lib/campaigns";
export const dynamic="force-dynamic";
export async function GET(request:Request){const q=new URL(request.url).searchParams;const page=q.get("page");if(!["home","browse","product"].includes(page||""))return NextResponse.json({items:[]},{status:400});
 try{const rows=(await DB.prepare("SELECT id,data,version FROM marketing_campaigns WHERE data->>'enabled'='true' AND data->>'published'='true' ORDER BY (data->>'priority')::int DESC,updated_at DESC LIMIT 200").all<CampaignRecord>()).results;
 const items=rows.filter(c=>campaignStatus(c.data)==="Active"&&campaignMatches(c.data,{page:page as "home"|"browse"|"product",category:(q.get("category")||"").slice(0,200),product:(q.get("product")||"").slice(0,200)})).slice(0,8).map(c=>({id:c.id,data:c.data,version:c.version}));return NextResponse.json({items},{headers:{"Cache-Control":"no-store"}})}catch{return NextResponse.json({items:[]},{headers:{"Cache-Control":"no-store"}})}
}
