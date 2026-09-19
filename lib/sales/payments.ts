import {randomUUID} from "node:crypto";
import {z} from "zod";
import {DB} from "@/lib/database";
import {audit,getBusiness,SalesError} from "./store";
import {getDocument,getPublicDocument,type SalesDocument} from "./documents";
import {adapters} from "./providers";
import type {Checkout,OnlineProvider,VerifiedPayment} from "./providers/types";
export type Payment={id:string;order_id:string;invoice_id:string|null;provider:OnlineProvider|"eft";reference:string;provider_reference:string|null;amount_cents:number;currency:string;status:string;test_mode:boolean;paid_at:string|null;detail:{checkout?:Checkout};created_at:string};
export async function amountPaid(orderId:string){const row=await DB.prepare("SELECT COALESCE(SUM(amount_cents),0) AS paid FROM sales_payments WHERE order_id=?::uuid AND status='succeeded' AND test_mode=false").bind(orderId).first<{paid:number}>();return Number(row?.paid||0)}
export async function documentPaid(doc:SalesDocument){return doc.kind==="order"?amountPaid(doc.id):doc.order_id?amountPaid(doc.order_id):0}
export async function paymentMethods(){const {data}=await getBusiness();return Object.entries(data.providers).filter(([key,enabled])=>enabled&&(key==="eft"||adapters[key as OnlineProvider].configured())).map(([key])=>key)}
export async function startPayment(token:string,provider:OnlineProvider,origin:string){
 const doc=await getPublicDocument(token);if(doc.kind!=="order")throw new SalesError("Payment link is not a sales order.");
 const adapter=adapters[provider];const {data:settings}=await getBusiness();if(!settings.providers[provider]||!adapter.configured())throw new SalesError("This payment method is not available.",409);
 if(!doc.snapshot.customer.email&&["paystack","payfast"].includes(provider))throw new SalesError("Please contact sales to add a customer email before using this payment method.");
 const prepared=await DB.transaction(async()=>{
  const order=await getDocument(doc.id,true);if(order.status==="cancelled")throw new SalesError("This order is cancelled.",409);
  const due=order.total_cents-await amountPaid(order.id);if(due<=0)throw new SalesError("This order has no balance due.",409);
  const existing=await DB.prepare("SELECT * FROM sales_payments WHERE order_id=?::uuid AND provider=? AND status='pending' AND amount_cents=? AND test_mode=? AND created_at>now()-interval '30 minutes' ORDER BY created_at DESC LIMIT 1").bind(order.id,provider,due,adapter.testMode()).first<Payment>();
  if(existing){if(existing.detail.checkout)return {payment:existing,checkout:existing.detail.checkout};throw new SalesError("A payment session is being prepared. Please retry shortly.",409)}
  const id=randomUUID(),reference=`GT-${randomUUID().replaceAll("-","")}`;
  const invoice=await DB.prepare("SELECT id FROM sales_documents WHERE order_id=?::uuid AND kind='invoice' AND status!='cancelled'").bind(order.id).first<{id:string}>();
  await DB.prepare("INSERT INTO sales_payments(id,order_id,invoice_id,provider,reference,amount_cents,test_mode) VALUES(?::uuid,?::uuid,?::uuid,?,?,?,?)").bind(id,order.id,invoice?.id||null,provider,reference,due,adapter.testMode()).run();await audit(order.id,"payment_started","customer",{provider,reference,amountCents:due});
  return {payment:{id,reference,amount_cents:due} as Payment,checkout:null};
 });
 if(prepared.checkout)return prepared.checkout;
 try{
  const checkout=await adapter.start({reference:prepared.payment.reference,amountCents:prepared.payment.amount_cents,email:doc.snapshot.customer.email,customerName:doc.snapshot.customer.name,orderNumber:doc.number!,returnUrl:`${origin}/api/payments/return/${token}`,notifyUrl:`${origin}/api/payments/webhooks/${provider}`,testMode:adapter.testMode()});
  await DB.prepare("UPDATE sales_payments SET detail=?::text::jsonb,updated_at=now() WHERE id=?::uuid").bind(JSON.stringify({checkout}),prepared.payment.id).run();return checkout;
 }catch{
  await DB.prepare("UPDATE sales_payments SET status='failed',updated_at=now() WHERE id=?::uuid AND status='pending'").bind(prepared.payment.id).run();throw new SalesError("The payment provider could not start checkout. Please retry or choose another method.",503);
 }
}
export async function receivePayment(provider:OnlineProvider,verified:VerifiedPayment){
 if(!verified.providerReference||!verified.reference||verified.currency!=="ZAR"||!Number.isSafeInteger(verified.amountCents)||verified.amountCents<=0)throw new SalesError("Invalid payment details.");
 const found=await DB.prepare("SELECT * FROM sales_payments WHERE reference=? AND provider=?").bind(verified.reference,provider).first<Payment>();if(!found)throw new SalesError("Payment reference not found.",404);
 await DB.transaction(async()=>{
  const order=await getDocument(found.order_id,true);
  const payment=await DB.prepare("SELECT * FROM sales_payments WHERE id=?::uuid FOR UPDATE").bind(found.id).first<Payment>();if(!payment)throw new SalesError("Payment not found.",404);
  if(payment.amount_cents!==verified.amountCents||payment.currency!==verified.currency||payment.test_mode!==verified.testMode)throw new SalesError("Payment details do not match.",409);
  if(payment.status==="succeeded"){if(payment.provider_reference!==verified.providerReference)throw new SalesError("Payment reference mismatch.",409);return}
  if(verified.status!=="succeeded")return;
  const paidAt=verified.paidAt&&Number.isFinite(Date.parse(verified.paidAt))?new Date(verified.paidAt).toISOString():new Date().toISOString();
  await DB.prepare("UPDATE sales_payments SET status='succeeded',provider_reference=?,paid_at=?::timestamptz,detail='{}'::jsonb,updated_at=now() WHERE id=?::uuid").bind(verified.providerReference,paidAt,payment.id).run();
  await audit(order.id,"payment_received",provider,{paymentId:payment.id,amountCents:verified.amountCents,testMode:verified.testMode});
  const paid=await amountPaid(order.id);
  if(paid>=order.total_cents&&order.status==="pending_payment")await DB.prepare("UPDATE sales_documents SET status='paid',version=version+1,updated_at=now() WHERE id=?::uuid").bind(order.id).run();
  if(order.status==="cancelled"||paid>order.total_cents)await audit(order.id,"payment_review_required",provider,{reason:order.status==="cancelled"?"Payment received for cancelled order":"Overpayment",paidCents:paid});
 });
}
export const manualPaymentSchema=z.object({amountCents:z.number().int().positive().max(100000000000),reference:z.string().trim().min(1).max(100),receivedOn:z.string().date(),confirmed:z.literal(true),requestId:z.string().uuid()}).strict();
export async function confirmEft(orderId:string,raw:unknown,actor:string){const input=manualPaymentSchema.parse(raw);return DB.transaction(async()=>{
 const order=await getDocument(orderId,true);if(order.kind!=="order")throw new SalesError("Choose a sales order.");
 const existing=await DB.prepare("SELECT id,amount_cents,order_id FROM sales_payments WHERE reference=?").bind(`EFT-${input.requestId}`).first<{id:string;amount_cents:number;order_id:string}>();if(existing){if(existing.amount_cents!==input.amountCents||existing.order_id!==orderId)throw new SalesError("Payment request was already used.",409);return {id:existing.id}}
 if(order.status==="cancelled")throw new SalesError("Cannot confirm payment for a cancelled order.",409);
 if(input.receivedOn>new Date().toISOString().slice(0,10))throw new SalesError("Payment date cannot be in the future.");
 const due=order.total_cents-await amountPaid(orderId);if(input.amountCents>due)throw new SalesError("Payment exceeds the balance due.",409);
 const invoice=await DB.prepare("SELECT id FROM sales_documents WHERE order_id=?::uuid AND kind='invoice' AND status!='cancelled'").bind(orderId).first<{id:string}>();
 const id=randomUUID();
 if(await DB.prepare("SELECT id FROM sales_payments WHERE provider='eft' AND provider_reference=?").bind(input.reference).first())throw new SalesError("This EFT receipt reference has already been recorded.",409);
 await DB.prepare("INSERT INTO sales_payments(id,order_id,invoice_id,provider,reference,provider_reference,amount_cents,status,paid_at,detail) VALUES(?::uuid,?::uuid,?::uuid,'eft',?,?,?,'succeeded',?::timestamptz,?::text::jsonb)").bind(id,orderId,invoice?.id||null,`EFT-${input.requestId}`,input.reference,input.amountCents,`${input.receivedOn}T12:00:00Z`,JSON.stringify({confirmedBy:actor})).run();
 await audit(orderId,"payment_manually_confirmed",actor,{paymentId:id,amountCents:input.amountCents,reference:input.reference});
 if(input.amountCents===due&&order.status==="pending_payment")await DB.prepare("UPDATE sales_documents SET status='paid',version=version+1,updated_at=now() WHERE id=?::uuid").bind(orderId).run();return {id};
})}

export async function documentPaymentOptions(doc:SalesDocument){
 const methods=await paymentMethods();const order=doc.kind==="order"?doc:doc.order_id?await getDocument(doc.order_id):null;
 const {siteUrl}=await import("../site-url");
 return {eft:methods.includes("eft")&&Boolean(doc.snapshot.business.providers.eft),url:order&&order.status!=="cancelled"&&methods.some(m=>m!=="eft"&&doc.snapshot.business.providers[m as OnlineProvider])?`${siteUrl}/pay/${order.public_token}`:undefined};
}
