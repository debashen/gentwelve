import {randomUUID} from "node:crypto";
import {NextResponse} from "next/server";
import {DB} from "@/lib/database";
import {getProductPageData} from "@/lib/catalogue-product";
import {quoteRequestSchema,quoteWhatsAppMessage} from "@/lib/quote-request-schema";
import {getSalesContact} from "@/lib/sales-contact";
import {sameOrigin,limitPublicRequest,limitedBody} from "@/lib/public-security";
import {validateArtwork} from "@/lib/upload-validation";
import {fail,noStore} from "@/lib/sales/http";
import {audit,SalesError} from "@/lib/sales/store";
export const dynamic="force-dynamic";
export async function POST(request:Request){try{
 sameOrigin(request);await limitPublicRequest(request,"quote",10);
 const bytes=await limitedBody(request,3500000);
 const form=await new Response(new Uint8Array(bytes),{headers:{"content-type":request.headers.get("content-type")||""}}).formData();
 let raw;try{raw=JSON.parse(String(form.get("data")))}catch{throw new SalesError("Invalid quote request.")}
 const data=quoteRequestSchema.parse(raw);
 const files=form.getAll("artwork").filter((f):f is File=>typeof f!=="string"&&f.size>0);if(files.length>1)throw new SalesError("Attach one artwork file, up to 3 MB.");
 let artwork:{filename:string;contentType:string;bytes:Buffer}|null=null;
 if(files[0]){const fileBytes=Buffer.from(await files[0].arrayBuffer());try{artwork={...validateArtwork(files[0].name,fileBytes),bytes:fileBytes}}catch(e){throw new SalesError((e as Error).message)}}
 const contact=await getSalesContact();
 const result=await DB.transaction(async()=>{
  await DB.prepare("SELECT pg_advisory_xact_lock(hashtext(?))").bind(data.requestKey).first();
  const existing=await DB.prepare("SELECT reference,details FROM sales_enquiries WHERE request_key=?::uuid").bind(data.requestKey).first<{reference:string;details:{items:Parameters<typeof quoteWhatsAppMessage>[1]}}>();
  if(existing)return {reference:existing.reference,items:existing.details.items};
  const items=[];
  for(const selection of data.items){
   const d=await getProductPageData(selection.code);if(!d)throw new SalesError(`Product ${selection.code} is no longer available. Remove it or contact sales.`);
   const variant=selection.variantCode?d.variants.find(v=>v.code===selection.variantCode):null;
   if(selection.variantCode&&!variant)throw new SalesError(`Choose an available variant for ${selection.code}.`);
   if(selection.branded&&selection.method&& !d.product.branding.some(b=>b.method===selection.method&&b.position===selection.position))throw new SalesError(`Choose a valid branding option for ${selection.code}.`);
   items.push({...selection,method:selection.branded?selection.method:"",position:selection.branded?selection.position:"",productId:d.product.id,name:d.product.name,image:d.product.image,description:d.product.descriptionHtml,colour:variant?.colour||"",size:variant?.size||"",stock:variant?.stock??d.product.stock,priceCents:variant?.priceCents??d.product.priceCents,capturedAt:new Date().toISOString()});
  }
  let campaignId:string|null=null;if(data.campaignId&&await DB.prepare("SELECT id FROM marketing_campaigns WHERE id=?::uuid").bind(data.campaignId).first())campaignId=data.campaignId;
  const sequence=await DB.prepare("SELECT nextval('sales_enquiry_reference_seq') AS n").first<{n:number}>();const reference=`GTQ-${String(sequence!.n).padStart(6,"0")}`,id=randomUUID();
  const attachment=artwork?{id:randomUUID(),filename:artwork.filename}:null;
  const details={name:data.name,company:data.company,email:data.email,mobile:data.mobile,city:data.city,requiredBy:data.requiredBy,reference:data.reference,notes:data.instructions,items,artwork:attachment,campaignId,requestReference:reference};
  await DB.prepare("INSERT INTO sales_enquiries(id,contact_name,source,details,request_key,reference) VALUES(?::uuid,?,'catalogue',?::text::jsonb,?::uuid,?)").bind(id,data.name,JSON.stringify(details),data.requestKey,reference).run();
  if(artwork&&attachment)await DB.prepare("INSERT INTO sales_artwork(id,enquiry_id,filename,content_type,bytes) VALUES(?::uuid,?::uuid,?,?,?)").bind(attachment.id,id,artwork.filename,artwork.contentType,artwork.bytes).run();
  await audit(id,"catalogue_quote_requested","customer",{reference,itemCount:items.length});return {reference,items};
 });
 const message=quoteWhatsAppMessage(result.reference,result.items);
 return NextResponse.json({reference:result.reference,whatsappUrl:`https://wa.me/${contact.whatsappNumber}?text=${encodeURIComponent(message)}`},{headers:noStore,status:201});
}catch(e){return fail(e)}}
