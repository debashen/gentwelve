import { env } from "@/lib/runtime";
import { NextResponse } from "next/server";
import { getChatGPTUser } from "@/app/chatgpt-auth";

export const dynamic = "force-dynamic";

export async function GET(request:Request){
 if(!await getChatGPTUser())return NextResponse.json({error:"Not authorised"},{status:401});
 const requested=Number.parseInt(new URL(request.url).searchParams.get("days")||"30",10);
 const days=[7,30,90].includes(requested)?requested:30;
 const since=new Date(Date.now()-days*86400000).toISOString();
 const [summary,daily,topProducts,searches,filters]=await Promise.all([
  env.DB.prepare("SELECT COUNT(DISTINCT session_id) AS visitors,SUM(CASE WHEN event_type='product_view' THEN 1 ELSE 0 END) AS productViews,SUM(CASE WHEN event_type='whatsapp_click' THEN 1 ELSE 0 END) AS enquiries,SUM(CASE WHEN event_type='search' THEN 1 ELSE 0 END) AS searches FROM catalogue_events WHERE created_at>=?").bind(since).first<Record<string,number>>(),
  env.DB.prepare("SELECT substr(created_at,1,10) AS date,SUM(CASE WHEN event_type='product_view' THEN 1 ELSE 0 END) AS views,SUM(CASE WHEN event_type='whatsapp_click' THEN 1 ELSE 0 END) AS enquiries FROM catalogue_events WHERE created_at>=? GROUP BY substr(created_at,1,10) ORDER BY date ASC").bind(since).all<Record<string,unknown>>(),
  env.DB.prepare("SELECT e.product_code AS code,COALESCE(p.name,e.product_code) AS name,p.image_url AS image,SUM(CASE WHEN e.event_type='product_view' THEN 1 ELSE 0 END) AS views,SUM(CASE WHEN e.event_type='whatsapp_click' THEN 1 ELSE 0 END) AS enquiries FROM catalogue_events e LEFT JOIN products p ON p.supplier_code=e.product_code WHERE e.created_at>=? AND e.product_code IS NOT NULL AND e.event_type IN ('product_view','whatsapp_click') GROUP BY e.product_code,p.name,p.image_url ORDER BY enquiries DESC,views DESC LIMIT 10").bind(since).all<Record<string,unknown>>(),
  env.DB.prepare("SELECT search_query AS term,COUNT(*) AS count FROM catalogue_events WHERE created_at>=? AND event_type='search' AND search_query IS NOT NULL AND search_query!='' GROUP BY lower(search_query) ORDER BY count DESC LIMIT 10").bind(since).all<Record<string,unknown>>(),
  env.DB.prepare("SELECT filter_name AS name,COUNT(*) AS count FROM catalogue_events WHERE created_at>=? AND event_type='filter' AND filter_name IS NOT NULL AND filter_name!='' GROUP BY filter_name ORDER BY count DESC LIMIT 8").bind(since).all<Record<string,unknown>>()
 ]);
 const views=Number(summary?.productViews||0),enquiries=Number(summary?.enquiries||0);
 return NextResponse.json({days,summary:{visitors:Number(summary?.visitors||0),productViews:views,enquiries,searches:Number(summary?.searches||0),conversion:views?Number(((enquiries/views)*100).toFixed(1)):0},daily:daily.results,topProducts:topProducts.results,searches:searches.results,filters:filters.results});
}
