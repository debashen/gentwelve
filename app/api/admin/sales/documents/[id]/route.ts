import {NextResponse} from "next/server";
import {z} from "zod";
import {DB} from "@/lib/database";
import {admin,fail,jsonBody,noStore} from "@/lib/sales/http";
import {getDocument,editQuote,issueDocument,createRelated,changeStatus,effectiveStatus} from "@/lib/sales/documents";
import {SalesError} from "@/lib/sales/store";
import {renderDocumentPdf} from "@/lib/sales/pdf";
import { documentPaymentOptions,documentPaid,confirmEft } from "@/lib/sales/payments";
export const dynamic="force-dynamic";
export const runtime="nodejs";
type Context={params:Promise<{id:string}>};
export async function GET(request:Request,context:Context){try{
 await admin(request);const id=z.string().uuid().parse((await context.params).id);const doc=await getDocument(id);const paid=await documentPaid(doc);
 if(new URL(request.url).searchParams.get("format")==="pdf"){const pdf=await renderDocumentPdf(doc,paid,await documentPaymentOptions(doc));return new NextResponse(new Uint8Array(pdf),{headers:{...noStore,"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${doc.number||"DRAFT"}.pdf"`}})}
 const related=await DB.prepare("SELECT id,kind,number,status FROM sales_documents WHERE id!=?::uuid AND (id=?::uuid OR id=?::uuid OR quote_id=?::uuid OR order_id=?::uuid OR (quote_id IS NOT NULL AND quote_id=?::uuid) OR (order_id IS NOT NULL AND order_id=?::uuid)) ORDER BY created_at").bind(id,doc.quote_id,doc.order_id,id,id,doc.quote_id,doc.order_id).all();
 const payments=(await DB.prepare("SELECT id,provider,reference,provider_reference,amount_cents,currency,status,test_mode,paid_at,created_at FROM sales_payments WHERE order_id=?::uuid ORDER BY created_at DESC").bind(doc.kind==="order"?doc.id:doc.order_id).all()).results;
 const events=await DB.prepare("SELECT event,actor,detail,created_at AS createdAt FROM sales_audit WHERE entity_id=? ORDER BY created_at DESC LIMIT 100").bind(id).all();
 return NextResponse.json({document:doc,status:effectiveStatus(doc,paid),paid,payments,related:related.results,events:events.results},{headers:noStore});
}catch(e){return fail(e)}}
export async function POST(request:Request,context:Context){try{
 const actor=await admin(request);const id=z.string().uuid().parse((await context.params).id);
 const body=z.object({action:z.enum(["issue","order","invoice","delivery","status","edit","eft"]),status:z.string().optional(),version:z.number().int().positive().optional(),data:z.unknown().optional(),dueOn:z.string().date().optional(),deliveredBy:z.string().max(200).optional(),recipientName:z.string().max(200).optional(),deliveryNotes:z.string().max(3000).optional()}).strict().parse(await jsonBody(request));
 let result;
 if(body.action==="eft"){await confirmEft(id,body.data,actor);result={id}}
 else if(body.action==="issue")result=await issueDocument(id,actor);
 else if(["order","invoice","delivery"].includes(body.action)){if(body.action==="invoice"&&!body.dueOn)throw new SalesError("Invoice due date is required.");result=await createRelated(id,body.action as "order"|"invoice"|"delivery",actor,body)}
 else if(body.action==="edit"){if(!body.version)throw new SalesError("Version required.");result=await editQuote(id,body.data,body.version,actor)}
 else {if(!body.version||!body.status)throw new SalesError("Status and version required.");result=await changeStatus(id,body.status,body.version,actor)}
 return NextResponse.json(result,{headers:noStore});
}catch(e){return fail(e)}}
