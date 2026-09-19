import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { DB } from "@/lib/database";
import { admin,fail,jsonBody,noStore } from "@/lib/sales/http";
import { audit,createCustomer,getBusiness,getCustomer,SalesError } from "@/lib/sales/store";
import { businessSchema,customerSchema,enquiryInput,sequenceSchema } from "@/lib/sales/validation";
import { providerReadiness } from "@/lib/sales/providers";
import { createQuote,type SalesDocument } from "@/lib/sales/documents";
export const dynamic="force-dynamic";
type Context={params:Promise<{resource:string}>};
export async function GET(request:Request,context:Context){try{
  await admin(request);const {resource}=await context.params;const url=new URL(request.url);
  if(resource==="products"){
    const q=`%${(url.searchParams.get("q")||"").slice(0,200)}%`;
    return NextResponse.json({items:(await DB.prepare("SELECT supplier_code AS code,name,public_price_cents AS priceCents,minimum_quantity AS minimumQuantity FROM products WHERE active=1 AND (name ILIKE ? OR supplier_code ILIKE ?) ORDER BY name LIMIT 30").bind(q,q).all()).results},{headers:noStore});
  }
  if(resource==="documents"){
    const page=z.coerce.number().int().min(0).max(100000).parse(url.searchParams.get("page")||0);
    const conditions=["1=1"],values:unknown[]=[];
    for(const [param,column] of [["kind","kind"],["customer","customer_id"],["status","effective_status"]]){const value=url.searchParams.get(param);if(value){if(param==="customer")z.string().uuid().parse(value);if(param==="status"&&url.searchParams.get("kind")==="order"&&["paid","pending_payment"].includes(value)){conditions.push(`status!='cancelled' AND paid_cents${value==="paid"?">=":"<"}total_cents`)}else{conditions.push(`${column}=?`);values.push(value)}}}
    const search=url.searchParams.get("q");if(search){conditions.push("(number ILIKE ? OR snapshot->'customer'->>'name' ILIKE ?)");values.push(`%${search.slice(0,200)}%`,`%${search.slice(0,200)}%`)}
    const rows=await DB.prepare(`SELECT id,kind,number,effective_status AS status,total_cents,paid_cents,customer_id,snapshot->'customer'->>'name' AS customerName,expires_on,due_on,created_at FROM sales_document_summary WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT 51 OFFSET ?`).bind(...values,page*50).all<SalesDocument>();
    return NextResponse.json({items:rows.results.slice(0,50),hasMore:rows.results.length>50,page},{headers:noStore});
  }
  if(resource==="dashboard"){
    const customer=url.searchParams.get("customer");
    if(customer){z.string().uuid().parse(customer);const summary=await DB.prepare("SELECT COUNT(*) AS orders,COALESCE(SUM(total_cents),0)::bigint AS value,COALESCE(SUM(paid_cents),0)::bigint AS paid,COALESCE(SUM(GREATEST(total_cents-paid_cents,0)),0)::bigint AS balance FROM sales_document_summary WHERE customer_id=?::uuid AND kind='order' AND status!='cancelled'").bind(customer).first();return NextResponse.json(summary,{headers:noStore})}

    const counts=await DB.prepare("SELECT kind,effective_status AS status,COUNT(*) AS count,COALESCE(SUM(total_cents),0)::bigint AS value FROM sales_document_summary GROUP BY kind,effective_status").all();
    const month=await DB.prepare("SELECT kind,COUNT(*) AS count,COALESCE(SUM(total_cents),0)::bigint AS value FROM sales_documents WHERE created_at>=date_trunc('month',now()) AND status!='cancelled' GROUP BY kind").all();
    const enquiries=await DB.prepare("SELECT COUNT(*) AS count FROM sales_enquiries WHERE status='new'").first();
    const balances=await DB.prepare("SELECT COALESCE(SUM(GREATEST(total_cents-paid_cents,0)) FILTER (WHERE kind='invoice' AND number IS NOT NULL AND status!='cancelled'),0)::bigint AS outstanding,COUNT(*) FILTER(WHERE kind='order' AND status!='cancelled' AND paid_cents>=total_cents) AS paidOrders,COUNT(*) FILTER(WHERE kind='order' AND status!='cancelled' AND paid_cents<total_cents) AS awaitingPayment,COUNT(*) FILTER(WHERE kind='invoice' AND number IS NOT NULL AND status!='cancelled' AND paid_cents<total_cents) AS outstandingInvoices FROM sales_document_summary").first();
    return NextResponse.json({counts:counts.results,month:month.results,enquiries:enquiries?.count||0,...balances},{headers:noStore});
  }
  if(resource==="settings")return NextResponse.json({...await getBusiness(),providerReadiness:providerReadiness(),sequences:(await DB.prepare("SELECT kind,prefix,next_number AS nextNumber FROM sales_number_sequences ORDER BY kind").all()).results,contacts:(await DB.prepare("SELECT id,contact_name AS name FROM sales_contacts ORDER BY contact_name").all()).results},{headers:noStore});
  if(resource==="customers"){
    const id=url.searchParams.get("id");if(id)return NextResponse.json(await getCustomer(z.string().uuid().parse(id)),{headers:noStore});
    const page=z.coerce.number().int().min(0).max(100000).parse(url.searchParams.get("page")||0);const q=`%${(url.searchParams.get("q")||"").slice(0,200)}%`;
    const rows=await DB.prepare("SELECT id,name,data,version,created_at AS createdAt FROM sales_customers WHERE archived=false AND (name ILIKE ? OR data->>'email' ILIKE ? OR data->>'mobile' ILIKE ?) ORDER BY name,id LIMIT 51 OFFSET ?").bind(q,q,q,page*50).all();
    return NextResponse.json({items:rows.results.slice(0,50),hasMore:rows.results.length>50,page},{headers:noStore});
  }
  if(resource==="enquiries")return NextResponse.json({items:(await DB.prepare("SELECT id,customer_id AS customerId,contact_name AS contactName,source,details,status,created_at AS createdAt FROM sales_enquiries ORDER BY created_at DESC LIMIT 100").all()).results},{headers:noStore});
  throw new SalesError("Not found.",404);
}catch(error){return fail(error)}}
export async function POST(request:Request,context:Context){try{
  const actor=await admin(request);const {resource}=await context.params;const body=await jsonBody(request);
  if(resource==="documents")return NextResponse.json(await createQuote(body,actor),{headers:noStore});
  if(resource==="customers"){const data=customerSchema.parse(body);const id=await DB.transaction(()=>createCustomer(data,actor));return NextResponse.json({id},{headers:noStore})}
  if(resource==="enquiries"){const data=enquiryInput.parse(body);const id=randomUUID();await DB.transaction(async()=>{await DB.prepare("INSERT INTO sales_enquiries(id,customer_id,contact_name,source,details) VALUES(?::uuid,?::uuid,?,?,?::text::jsonb)").bind(id,data.customerId,data.contactName,data.source,JSON.stringify(data)).run();await audit(id,"enquiry_created",actor)});return NextResponse.json({id},{headers:noStore})}
  throw new SalesError("Not found.",404);
}catch(error){return fail(error)}}
export async function PUT(request:Request,context:Context){try{
  const actor=await admin(request);const {resource}=await context.params;const body=await jsonBody(request);
  if(resource==="settings"){
    const parsed=z.object({data:businessSchema,version:z.number().int().positive(),sequences:sequenceSchema}).strict().parse(body);
    await DB.transaction(async()=>{
      const result=await DB.prepare("UPDATE sales_business_settings SET data=?::text::jsonb,version=version+1,updated_at=now() WHERE id='default' AND version=?").bind(JSON.stringify(parsed.data),parsed.version).run();
      if(!result.changes)throw new SalesError("Settings changed in another window. Reload before saving.",409);
      if(!await DB.prepare("SELECT id FROM sales_contacts WHERE id=?").bind(parsed.data.defaultSalespersonId).first())throw new SalesError("Choose an existing salesperson.");
      // Never move a sequence backwards, including after prefix changes.
      for(const sequence of parsed.sequences){const result=await DB.prepare("UPDATE sales_number_sequences SET prefix=?,next_number=? WHERE kind=? AND next_number<=?").bind(sequence.prefix,sequence.nextNumber,sequence.kind,sequence.nextNumber).run();if(!result.changes)throw new SalesError("Document numbering cannot move backwards. Reload settings.",409)}
      await audit("settings","business_settings_updated",actor);
    });return NextResponse.json({ok:true},{headers:noStore});
  }
  if(resource==="customers"){
    const parsed=z.object({id:z.string().uuid(),data:customerSchema,version:z.number().int().positive(),archived:z.boolean().default(false)}).strict().parse(body);
    await DB.transaction(async()=>{const result=await DB.prepare("UPDATE sales_customers SET name=?,data=?::text::jsonb,archived=?,version=version+1,updated_at=now() WHERE id=?::uuid AND version=?").bind(parsed.data.name,JSON.stringify(parsed.data),parsed.archived,parsed.id,parsed.version).run();if(!result.changes)throw new SalesError("Customer changed. Reload before saving.",409);await audit(parsed.id,parsed.archived?"customer_archived":"customer_updated",actor)});return NextResponse.json({ok:true},{headers:noStore});
  }
  throw new SalesError("Not found.",404);
}catch(error){return fail(error)}}
