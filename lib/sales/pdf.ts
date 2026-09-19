import PDFDocument from "pdfkit";
import {readFile} from "node:fs/promises";
import path from "node:path";
import type {SalesDocument} from "./documents";

const navy="#061e30",blue="#1ba7e0",muted="#526d7d";
const currency=(cents:number)=>`R ${(cents/100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g," ")}`;
const date=(value:unknown)=>new Date(String(value)).toISOString().slice(0,10);
const clean=(value:unknown)=>String(value??"").replace(/[\u2010-\u2015]/g,"-").replace(/\u00a0/g," ");
export async function renderDocumentPdf(record:SalesDocument,paid=0,payment?:{url?:string;eft:boolean}){
 const s=record.snapshot,b=s.business,c=s.customer,delivery=record.kind==="delivery";
 const title={quote:"QUOTATION",order:"SALES ORDER",invoice:"INVOICE",delivery:"DELIVERY NOTE"}[record.kind];
 const doc=new PDFDocument({size:"A4",margin:38,bufferPages:true,info:{Title:`${title} ${record.number||"DRAFT"}`,Author:b.tradingName||"Gentwelve"}});
 const chunks:Buffer[]=[];const result=new Promise<Buffer>((resolve,reject)=>{doc.on("data",chunk=>chunks.push(chunk));doc.on("end",()=>resolve(Buffer.concat(chunks)));doc.on("error",reject)});
 const left=38,width=519,bottom=770;let y=38;
 const text=(value:unknown,x:number,top:number,w:number,size=9,bold=false,color=navy)=>{doc.font(bold?"Helvetica-Bold":"Helvetica").fontSize(size).fillColor(color).text(clean(value),x,top,{width:w,lineGap:2});return doc.y};
 const height=(value:unknown,w:number,size=9,bold=false)=>{doc.font(bold?"Helvetica-Bold":"Helvetica").fontSize(size);return doc.heightOfString(clean(value),{width:w,lineGap:2})};
 const rule=(top:number)=>doc.moveTo(left,top).lineTo(left+width,top).strokeColor("#cfdee7").lineWidth(.5).stroke();
 const newPage=()=>{doc.addPage();y=38;text(`${b.tradingName||"Gentwelve"}  /  ${title}`,left,y,350,10,true);text(record.number||"DRAFT",430,y,127,10,true);y+=27;rule(y);y+=15};
 const ensure=(h:number)=>{if(y+h>bottom)newPage()};
 const paragraph=(label:string,value:string)=>{if(!value)return;ensure(28);text(label,left,y,width,10,true);y+=15;const paragraphs=clean(value).split("\n");for(const paragraph of paragraphs){const words=paragraph.split(/\s+/);let line="";for(const word of words){const test=line?`${line} ${word}`:word;if(doc.font("Helvetica").fontSize(9).widthOfString(test)>width&&line){ensure(12);text(line,left,y,width,8);y+=12;line=word}else line=test}ensure(12);text(line,left,y,width,8);y+=12}y+=10};
 let logo:Buffer|undefined;try{logo=b.logoUrl.startsWith("data:")?Buffer.from(b.logoUrl.split(",")[1],"base64"):await readFile(path.join(process.cwd(),"public/gentwelve-document-logo.png"));doc.image(logo,left,y,{fit:[180,60]})}catch{text(b.tradingName||"Gentwelve",left,y,190,20,true)}
 text(title,325,y,232,18,true);text(record.number||"DRAFT",325,y+26,232,12,true,blue);
 if(record.status==="cancelled")text("CANCELLED",325,y+46,232,10,true);
 y=100;
 const company=[b.legalName||b.tradingName,b.address,[b.email,b.telephone,b.website].filter(Boolean).join(" | "),[b.registrationNumber?`Reg: ${b.registrationNumber}`:"",b.vatRegistered?`VAT: ${b.vatNumber}`:""].filter(Boolean).join(" | ")].filter(Boolean).join("\n");
 y=text(company,left,y,width,8,false,muted)+16;rule(y);y+=16;
 const columns=[{label:delivery?"DELIVER TO":"BILL TO / DELIVER TO",value:[c.name,c.contactPerson,delivery?c.deliveryAddress:c.billingAddress,c.email,c.mobile||c.telephone,c.registrationNumber?`Reg: ${c.registrationNumber}`:"",b.vatRegistered&&c.vatNumber?`VAT: ${c.vatNumber}`:""].filter(Boolean).join("\n")},{label:delivery?"SALESPERSON":"DELIVER TO / CONTACT",value:[!delivery?c.deliveryAddress:"",s.salesperson.name,s.salesperson.whatsapp].filter(Boolean).join("\n")},{label:"DOCUMENT DETAILS",value:[record.number||"DRAFT",`Date: ${date(record.issued_at||record.created_at)}`,record.expires_on?`Expiry: ${date(record.expires_on)}`:"",record.due_on?`Due: ${date(record.due_on)}`:"",s.reference?`Reference: ${s.reference}`:"",s.quoteNumber?`Quote: ${s.quoteNumber}`:"",s.orderNumber?`Order: ${s.orderNumber}`:""].filter(Boolean).join("\n")}];
 let blockBottom=y;for(let i=0;i<3;i++){const x=left+i*177;doc.rect(x,y,165,19).fill("#e8f5fb");text(columns[i].label,x+7,y+5,151,8,true);blockBottom=Math.max(blockBottom,text(columns[i].value,x+4,y+27,157,9))}y=blockBottom+16;
 const cols=delivery?[{label:"PRODUCT / VARIANT",w:449},{label:"QTY",w:70}]:[{label:"PRODUCT",w:189},{label:"QTY",w:32},{label:"UNIT",w:60},{label:"BRAND / UNIT",w:63},{label:"SETUP",w:55},{label:"DISCOUNT",w:55},{label:"TOTAL",w:65}];
 const tableHead=()=>{ensure(28);doc.rect(left,y,width,24).fill(navy);let x=left;for(const col of cols){text(col.label,x+4,y+8,col.w-8,7,true,"#ffffff");x+=col.w}y+=24};tableHead();
 for(let i=0;i<s.totals.lines.length;i++){
  const line=s.totals.lines[i];
  const description=[line.productCode,line.description,[line.colour,line.size].filter(Boolean).join(" | "),line.brandingMethod?`Branding: ${line.brandingMethod}${line.brandingPosition?` | ${line.brandingPosition}`:""}${(line.brandingPositions||1)>1?` | ${line.brandingPositions} positions`:""}`:"",!delivery&&line.otherCents?`Other: ${currency(line.otherCents)}`:""].filter(Boolean).join("\n");
  const cells=delivery?[description,line.quantity]:[description,line.quantity,currency(line.unitPriceCents),currency(line.brandingCents),currency(line.setupCents),currency(line.discountCents),currency(line.netCents)];
  const h=Math.max(30,...cells.map((cell,j)=>height(cell,cols[j].w-8,8)+12));
  // A line is bounded to 1,500 characters; move it intact to the next page.
  if(y+h>bottom){newPage();tableHead()}
  if(h>bottom-y)throw new Error("Description is too long to fit a product row. Shorten the description.");
  if(i%2===0)doc.rect(left,y,width,h).fill("#f0f7fb");let x=left;for(let j=0;j<cells.length;j++){text(cells[j],x+4,y+6,cols[j].w-8,8);x+=cols[j].w}y+=h;rule(y);
 }
 y+=20;
 if(!delivery){
  const totals=[["Subtotal",s.totals.subtotalCents],...(s.totals.discountCents?[["Discount",-s.totals.discountCents]]:[]),["Delivery",s.totals.deliveryCents],...(b.vatRegistered?[[`VAT (${b.vatRateBps/100}%)`,s.totals.taxCents]]:[]),["Grand total",s.totals.totalCents],...(["order","invoice"].includes(record.kind)?[["Amount paid",paid],["Balance due",Math.max(0,record.total_cents-paid)]]:[])];
  const bank=(payment?.eft??b.providers.eft)&&b.bank?[b.bank,b.accountName,`Account: ${b.accountNumber} (${b.accountType})`,`Branch: ${b.branchCode}`,`Reference: ${s.orderNumber||record.number||"Provided on order"}`].filter(Boolean).join("\n"):"";
  const payUrl=payment?.url&&record.number&&["order","invoice"].includes(record.kind)&&paid<record.total_cents?payment.url:"";
  const shortTerms=b.paymentTerms.length<600?b.paymentTerms:"";
  const leftHeight=(bank?height(bank,235,8)+22:0)+(payUrl?height(payUrl,215,8)+42:0)+(shortTerms?height(shortTerms,235,8)+22:0);
  const rightHeight=totals.reduce((h,[label])=>h+(label==="Grand total"||label==="Balance due"?30:22),0);
  ensure(Math.max(leftHeight,rightHeight)+12);const blockTop=y;
  for(const [label,value] of totals){const bold=label==="Grand total"||label==="Balance due";if(bold)doc.rect(295,y-5,262,24).fill(navy);text(label,305,y,142,10,bold,bold?"#ffffff":navy);text(currency(Number(value)),450,y,107,10,bold,bold?"#ffffff":navy);y+=bold?30:22}
  const totalsBottom=y;let paymentY=blockTop;
  if(bank){text("MANUAL EFT",left,paymentY,235,9,true);paymentY=text(bank,left,paymentY+17,235,8)+12}
  if(payUrl){const h=height(payUrl,215,8)+36;doc.rect(left,paymentY,235,h).fill("#e8f5fb");text("PAY NOW",left+10,paymentY+8,215,11,true);text(payUrl,left+10,paymentY+25,215,8);doc.link(left,paymentY,235,h,payUrl);paymentY+=h+12}
  if(shortTerms){text("PAYMENT TERMS",left,paymentY,235,9,true);paymentY=text(shortTerms,left,paymentY+17,235,8)+12}
  y=Math.max(totalsBottom,paymentY)+16;
  if(b.paymentTerms&&!shortTerms)paragraph("PAYMENT TERMS",b.paymentTerms);

 }else{
  ensure(130);paragraph("DELIVERY CONFIRMATION",`Delivered by: ${s.deliveredBy||"____________________________"}\nReceived by: ${s.recipientName||"____________________________"}\nRecipient name: ____________________________\nSignature: ________________________________\nDate: ____________________________________`);paragraph("DELIVERY NOTES",s.deliveryNotes||"");
 }
 if(!delivery)paragraph("NOTES",s.notes);paragraph("TERMS AND CONDITIONS",s.terms);
 const range=doc.bufferedPageRange();for(let i=0;i<range.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;rule(793);text(`${b.tradingName||"Gentwelve"} | ${record.number||"DRAFT"}`,left,802,360,8,false,muted);text(`Page ${i+1} of ${range.count}`,460,802,97,8,false,muted);doc.rect(left,786,34,2).fill(blue)}
 doc.end();return result;
}
