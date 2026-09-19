import {randomBytes,randomUUID} from "node:crypto";
import {z} from "zod";
import {DB} from "@/lib/database";
import {audit,createCustomer,getBusiness,getCustomer,SalesError} from "./store";
import {customerSchema,type Business,type Customer} from "./validation";
import {calculate,lineSchema,type Totals} from "./calculations";
export const quoteInput=z.object({customerId:z.string().uuid().optional(),newCustomer:customerSchema.optional(),enquiryId:z.string().uuid().optional(),salespersonId:z.string().max(80).optional(),reference:z.string().max(200).default(""),expiresOn:z.string().date().optional(),lines:z.array(lineSchema).min(1).max(150),deliveryCents:z.number().int().min(0).max(100000000).default(0),notes:z.string().max(5000).default("")}).strict().refine(v=>Boolean(v.customerId)!==Boolean(v.newCustomer),"Choose a customer or create one.");
export type Snapshot={customer:Omit<Customer,"notes">;business:Business;salesperson:{id:string;name:string;whatsapp:string};reference:string;notes:string;terms:string;quoteNumber?:string;orderNumber?:string;deliveredBy?:string;recipientName?:string;deliveryNotes?:string;totals:Totals};
export type SalesDocument={id:string;kind:"quote"|"order"|"invoice"|"delivery";number:string|null;customer_id:string;quote_id:string|null;order_id:string|null;enquiry_id:string|null;salesperson_id:string;status:string;snapshot:Snapshot;total_cents:number;public_token:string;expires_on:string|null;due_on:string|null;issued_at:string|null;accepted_at:string|null;version:number;created_at:string;paid_cents?:number};
export async function getDocument(id:string,lock=false){
 const row=await DB.prepare(`SELECT * FROM sales_documents WHERE id=?::uuid${lock?" FOR UPDATE":""}`).bind(id).first<SalesDocument>();
 if(!row)throw new SalesError("Document not found.",404);return row;
}
export async function getPublicDocument(token:string){
 if(!/^[a-f0-9]{64}$/.test(token))throw new SalesError("Document not found.",404);
 const row=await DB.prepare("SELECT * FROM sales_documents WHERE public_token=? AND number IS NOT NULL").bind(token).first<SalesDocument>();
 if(!row)throw new SalesError("Document not found.",404);return row;
}
export function effectiveStatus(doc:SalesDocument,paid=0){
 if(doc.status==="cancelled")return "cancelled";
 if(doc.kind==="quote"&&["sent","viewed"].includes(doc.status)&&doc.expires_on&&String(doc.expires_on).slice(0,10)<new Date().toISOString().slice(0,10))return "expired";
 if(doc.kind==="invoice"&&doc.number){if(paid>=doc.total_cents)return "paid";if(paid>0)return "partially_paid";if(doc.due_on&&String(doc.due_on).slice(0,10)<new Date().toISOString().slice(0,10))return "overdue";}
 return doc.status;
}
export async function allocateNumber(kind:string){
 const row=await DB.prepare("UPDATE sales_number_sequences SET next_number=next_number+1 WHERE kind=? RETURNING prefix,next_number-1 AS sequence").bind(kind).first<{prefix:string;sequence:number}>();
 if(!row)throw new SalesError("Document numbering is not configured.");
 return {number:`${row.prefix}${String(row.sequence).padStart(6,"0")}`,sequence:row.sequence};
}
async function quoteSnapshot(input:z.infer<typeof quoteInput>,actor:string){
 const customerId=input.customerId||await createCustomer(input.newCustomer!,actor);
 const customer=await getCustomer(customerId);if(customer.archived)throw new SalesError("This customer is archived.");
 const {data:business}=await getBusiness();
 const salespersonId=input.salespersonId||business.defaultSalespersonId;
 const salesperson=await DB.prepare("SELECT id,contact_name AS name,whatsapp_number AS whatsapp FROM sales_contacts WHERE id=?").bind(salespersonId).first<Snapshot["salesperson"]>();
 if(!salesperson)throw new SalesError("Salesperson not found.");
 const {notes:internalNotes,...publicCustomer}=customer.data;void internalNotes;
 let totals:Totals;try{totals=calculate(input.lines,input.deliveryCents,business.vatRegistered,business.vatRateBps)}catch{throw new SalesError("Document value exceeds the supported limit.")}
 const snapshot:Snapshot={customer:publicCustomer,business,salesperson,reference:input.reference,notes:input.notes,terms:business.quoteTerms,totals};
 const expiresOn=input.expiresOn||new Date(Date.now()+business.quoteValidityDays*86400000).toISOString().slice(0,10);
 return {customerId,snapshot,expiresOn,salespersonId};
}
export async function createQuote(raw:unknown,actor:string){const input=quoteInput.parse(raw);return DB.transaction(async()=>{
 const {customerId,snapshot,expiresOn,salespersonId}=await quoteSnapshot(input,actor);const id=randomUUID();
 await DB.prepare("INSERT INTO sales_documents(id,kind,customer_id,enquiry_id,salesperson_id,snapshot,total_cents,public_token,expires_on) VALUES(?::uuid,'quote',?::uuid,?::uuid,?,?::text::jsonb,?,?,?::date)").bind(id,customerId,input.enquiryId||null,salespersonId,JSON.stringify(snapshot),snapshot.totals.totalCents,randomBytes(32).toString("hex"),expiresOn).run();
 if(input.enquiryId)await DB.prepare("UPDATE sales_enquiries SET status='quoted',customer_id=?::uuid WHERE id=?::uuid").bind(customerId,input.enquiryId).run();
 await audit(id,"quotation_created",actor);return {id};
})}
export async function editQuote(id:string,raw:unknown,version:number,actor:string){const input=quoteInput.parse(raw);return DB.transaction(async()=>{
 const doc=await getDocument(id,true);if(doc.kind!=="quote"||doc.status!=="draft"||doc.version!==version)throw new SalesError("Only the latest draft can be edited.",409);
 const {customerId,snapshot,expiresOn,salespersonId}=await quoteSnapshot(input,actor);
 await DB.prepare("UPDATE sales_documents SET customer_id=?::uuid,salesperson_id=?,snapshot=?::text::jsonb,total_cents=?,expires_on=?::date,version=version+1,updated_at=now() WHERE id=?::uuid").bind(customerId,salespersonId,JSON.stringify(snapshot),snapshot.totals.totalCents,expiresOn,id).run();await audit(id,"quotation_updated",actor);return {id};
})}
export async function issueDocument(id:string,actor:string){return DB.transaction(async()=>{
 const doc=await getDocument(id,true);if(doc.number)return {id};if(!["quote","invoice"].includes(doc.kind)||doc.status!=="draft")throw new SalesError("Document cannot be issued.",409);
 if(doc.kind==="quote"&&doc.expires_on&&String(doc.expires_on).slice(0,10)<new Date().toISOString().slice(0,10))throw new SalesError("Set a future quotation expiry date before issuing.");
 const seq=await allocateNumber(doc.kind);
 await DB.prepare("UPDATE sales_documents SET number=?,sequence_number=?,status=?,issued_at=now(),version=version+1,updated_at=now() WHERE id=?::uuid").bind(seq.number,seq.sequence,doc.kind==="quote"?"sent":"issued",id).run();await audit(id,doc.kind==="quote"?"quotation_sent":"invoice_issued",actor,{number:seq.number});return {id};
})}
export async function decideQuote(token:string,decision:"accepted"|"declined",name:string){return DB.transaction(async()=>{
 const found=await getPublicDocument(token);const doc=await getDocument(found.id,true);
 if(doc.kind!=="quote")throw new SalesError("Not a quotation.");
 if(doc.status===decision)return {ok:true};
 if(!["sent","viewed"].includes(effectiveStatus(doc)))throw new SalesError("This quotation is no longer available for a decision.",409);
 await DB.prepare("UPDATE sales_documents SET status=?,accepted_at=CASE WHEN ?='accepted' THEN now() ELSE NULL END,version=version+1,updated_at=now() WHERE id=?::uuid").bind(decision,decision,doc.id).run();await audit(doc.id,`quotation_${decision}`,"customer",{name});return {ok:true};
})}
export async function createRelated(id:string,kind:"order"|"invoice"|"delivery",actor:string,extra:{dueOn?:string;deliveredBy?:string;recipientName?:string;deliveryNotes?:string}={}){return DB.transaction(async()=>{
 const source=await getDocument(id,true);
 if(kind==="order"&&source.kind!=="quote"||kind!=="order"&&source.kind!=="order")throw new SalesError("Invalid source document.");
 if(kind!=="delivery"){const existing=await DB.prepare(`SELECT id FROM sales_documents WHERE kind=? AND ${kind==="order"?"quote_id":"order_id"}=?::uuid`).bind(kind,id).first<{id:string}>();if(existing)return existing}
 if(kind==="order"&&source.status!=="accepted")throw new SalesError("Only an accepted quotation can become an order.",409);
 if(source.status==="cancelled")throw new SalesError("A cancelled order cannot create documents.",409);
 const newId=randomUUID();const snapshot:Snapshot={...source.snapshot,quoteNumber:kind==="order"?source.number!:source.snapshot.quoteNumber,orderNumber:kind!=="order"?source.number!:undefined,...extra,terms:kind==="invoice"?source.snapshot.business.invoiceTerms:kind==="delivery"?source.snapshot.business.deliveryTerms:source.snapshot.business.paymentTerms};
 const seq=kind==="invoice"?null:await allocateNumber(kind);
 await DB.prepare("INSERT INTO sales_documents(id,kind,number,sequence_number,customer_id,quote_id,order_id,salesperson_id,status,snapshot,total_cents,public_token,due_on,issued_at) VALUES(?::uuid,?,?,?,?::uuid,?::uuid,?::uuid,?,?,?::text::jsonb,?,?,?::date,?::timestamptz)").bind(newId,kind,seq?.number||null,seq?.sequence||null,source.customer_id,kind==="order"?source.id:source.quote_id,kind!=="order"?source.id:null,source.salesperson_id,kind==="order"?"pending_payment":kind==="invoice"?"draft":"issued",JSON.stringify(snapshot),source.total_cents,randomBytes(32).toString("hex"),extra.dueOn||null,seq?new Date().toISOString():null).run();
 if(kind==="invoice")await DB.prepare("UPDATE sales_payments SET invoice_id=?::uuid WHERE order_id=?::uuid AND invoice_id IS NULL").bind(newId,id).run();
 if(kind==="order")await DB.prepare("UPDATE sales_documents SET status='converted',version=version+1,updated_at=now() WHERE id=?::uuid").bind(id).run();
 await audit(id,kind==="order"?"quotation_converted":`${kind}_generated`,actor,{relatedId:newId});await audit(newId,`${kind}_created`,actor,{sourceId:id});return {id:newId};
})}
export const operationalStatuses=["artwork_required","artwork_approval","ready_for_production","in_production","ready_for_dispatch","dispatched","completed"] as const;
export async function changeStatus(id:string,status:string,version:number,actor:string){return DB.transaction(async()=>{
 const doc=await getDocument(id,true);if(doc.version!==version)throw new SalesError("Document changed. Reload first.",409);
 if(doc.status==="cancelled")throw new SalesError("Cancelled documents cannot be reopened.");
 if(status!=="cancelled"&&(doc.kind!=="order"||!operationalStatuses.includes(status as typeof operationalStatuses[number])))throw new SalesError("Invalid status change.");
 if(status==="cancelled"&&doc.kind==="quote"&&["accepted","converted"].includes(doc.status))throw new SalesError("Accepted quotations are preserved; cancel the order instead.");
 await DB.prepare("UPDATE sales_documents SET status=?,version=version+1,updated_at=now() WHERE id=?::uuid").bind(status,id).run();await audit(id,"status_changed",actor,{from:doc.status,to:status});return {id};
})}
