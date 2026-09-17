import { env } from "@/lib/runtime";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const allowedEvents=new Set(["product_view","whatsapp_click","search","filter"]);
const clean=(value:unknown,max:number)=>typeof value==="string"?value.trim().slice(0,max):null;

export async function POST(request:Request){
 try{
  const body=await request.json() as Record<string,unknown>;
  const eventType=clean(body.eventType,32);
  const sessionId=clean(body.sessionId,80);
  if(!eventType||!allowedEvents.has(eventType)||!sessionId)return NextResponse.json({error:"Invalid event."},{status:400});
  await env.DB.prepare("INSERT INTO catalogue_events (event_type,product_code,quantity,search_query,filter_name,session_id,created_at) VALUES (?,?,?,?,?,?,?)").bind(eventType,clean(body.productCode,80),clean(body.quantity,40),clean(body.searchQuery,120),clean(body.filterName,60),sessionId,new Date().toISOString()).run();
  return NextResponse.json({ok:true});
 }catch{
  return NextResponse.json({error:"Event unavailable."},{status:503});
 }
}
