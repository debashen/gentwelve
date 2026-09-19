import {notFound} from "next/navigation";
import {DB} from "@/lib/database";
import {getPublicDocument} from "@/lib/sales/documents";
import {amountPaid,paymentMethods} from "@/lib/sales/payments";
import {getBusiness,SalesError} from "@/lib/sales/store";
import {money} from "@/lib/sales/validation";
import CheckoutButtons from "./checkout";
import "@/app/admin/sales/sales.css";
export const dynamic="force-dynamic";
export const metadata={title:"Order payment | Gentwelve",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function PayPage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;let doc;try{doc=await getPublicDocument(token)}catch(e){if(e instanceof SalesError&&e.status===404)notFound();throw e}if(doc.kind!=="order")notFound();
 const paid=await amountPaid(doc.id),due=Math.max(0,doc.total_cents-paid),methods=await paymentMethods(),{data:b}=await getBusiness();
 const invoice=await DB.prepare("SELECT public_token AS token,number FROM sales_documents WHERE order_id=?::uuid AND kind='invoice' AND number IS NOT NULL AND status!='cancelled'").bind(doc.id).first<{token:string;number:string}>();
 return <main className="sales-app"><div className="sales-content" style={{maxWidth:700}}><section className="sales-panel"><img src={b.logoUrl} alt={b.tradingName||"Gentwelve"} width={180}/><h1>Order payment</h1><p>{doc.snapshot.customer.name}</p><h2>{doc.number}</h2><p>Order total: {money(doc.total_cents)}</p><p>Amount received: {money(paid)}</p><p className="sales-total">Amount due: {money(due)}</p><p className="sales-badge">{doc.status==="cancelled"?"CANCELLED":due===0?"PAID":"AWAITING PAYMENT"}</p>
 {doc.status!=="cancelled"&&due>0&&<><h2>Available payment methods</h2><CheckoutButtons token={token} methods={methods}/>{!methods.length&&<p>Please contact sales for payment arrangements.</p>}<p className="sales-muted">Payments are confirmed securely after processing. Returning from checkout does not confirm receipt. Refresh this page to see the latest balance.</p>{methods.includes("eft")&&<section id="eft" className="sales-panel"><h2>Manual EFT</h2><p>Bank: {b.bank}</p><p>Account name: {b.accountName}</p><p>Account number: {b.accountNumber}</p><p>Account type: {b.accountType}</p><p>Branch code: {b.branchCode}</p><strong>Reference: {doc.number}</strong><p>Amount: {money(due)}</p><p>Your order remains awaiting payment until we confirm receipt.</p></section>}</>}
 <div className="sales-actions"><a href={`/api/sales/public/${token}`}>Download sales order</a>{invoice&&<a href={`/api/sales/public/${invoice.token}`}>Download {invoice.number}</a>}<a href={`https://wa.me/${doc.snapshot.salesperson.whatsapp}?text=${encodeURIComponent(`I'd like to discuss payment for ${doc.number}.`)}`} rel="noreferrer">Contact sales</a></div></section></div></main>;
}
