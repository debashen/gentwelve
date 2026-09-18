import {notFound} from "next/navigation";
import {DB} from "@/lib/database";
import {getPublicDocument,effectiveStatus} from "@/lib/sales/documents";
import {SalesError,audit} from "@/lib/sales/store";
import DocumentView from "@/app/components/sales/document-view";
import Decision from "./decision";
import "@/app/admin/sales/sales.css";
export const dynamic="force-dynamic";
export const metadata={title:"Your quotation | Gentwelve",robots:{index:false,follow:false},referrer:"no-referrer"};
export default async function QuotePage({params}:{params:Promise<{token:string}>}){
 const {token}=await params;let doc;try{doc=await getPublicDocument(token)}catch(e){if(e instanceof SalesError&&e.status===404)notFound();throw e}if(doc.kind!=="quote")notFound();
 if(doc.status==="sent"&&effectiveStatus(doc)!=="expired")await DB.transaction(async()=>{const changed=await DB.prepare("UPDATE sales_documents SET viewed_at=now(),status='viewed',version=version+1 WHERE id=?::uuid AND status='sent'").bind(doc.id).run();if(changed.changes)await audit(doc.id,"quotation_viewed","customer")});
 const status=effectiveStatus(doc);return <main className="sales-app"><div className="sales-content"><div className="sales-actions"><span className="sales-badge">{status}</span><a className="sales-button" href={`/api/sales/public/${token}`}>Download PDF</a><a href={`https://wa.me/${doc.snapshot.salesperson.whatsapp}?text=${encodeURIComponent(`I'd like to discuss quotation ${doc.number}.`)}`} rel="noreferrer">Contact sales</a></div><DocumentView document={doc}/>{["sent","viewed"].includes(status)&&<Decision token={token}/>}</div></main>;
}
