import PDFDocument from "pdfkit";
import {readFile} from "node:fs/promises";
import path from "node:path";
import type {SalesDocument} from "./documents";

const navy="#0a2b40",blue="#32ade0",muted="#526d7d";
const currency=(cents:number)=>`R ${(cents/100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g," ")}`;
const clean=(value:unknown)=>String(value??"").replace(/[\u2010-\u2015]/g,"-").replace(/\u00a0/g," ");
export async function renderDocumentPdf(record:SalesDocument,paid=0){
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
 const paragraph=(label:string,value:string)=>{if(!value)return;ensure(42);text(label,left,y,width,10,true);y+=18;const paragraphs=clean(value).split("\n");for(const paragraph of paragraphs){const words=paragraph.split(/\s+/);let line="";for(const word of words){const test=line?`${line} ${word}`:word;if(doc.font("Helvetica").fontSize(9).widthOfString(test)>width&&line){ensure(15);text(line,left,y,width);y+=15;line=word}else line=test}ensure(15);text(line,left,y,width);y+=15}y+=10};
 let logo:Buffer|undefined;try{logo=b.logoUrl.startsWith("data:")?Buffer.from(b.logoUrl.split(",")[1],"base64"):await readFile(path.join(process.cwd(),"public/gentwelve-document-logo.png"));doc.image(logo,left,y,{fit:[180,60]})}catch{text(b.tradingName||"Gentwelve",left,y,190,20,true)}
 const company=[b.legalName||b.tradingName,b.address,[b.email,b.telephone].filter(Boolean).join(" | "),b.website,b.registrationNumber?`Reg: ${b.registrationNumber}`:"",b.vatRegistered?`VAT: ${b.vatNumber}`:""].filter(Boolean).join("\n");
 const companyBottom=text(company,260,y,297,9,false);y=Math.max(110,companyBottom+18);
 doc.rect(left,y,width,32).fill(navy);text(title,left+12,y+8,width-24,15,true,"#ffffff");y+=46;
 const columns=[{label:"CUSTOMER",value:[c.name,c.contactPerson,delivery?c.deliveryAddress:c.billingAddress,c.email,c.mobile||c.telephone,c.registrationNumber?`Reg: ${c.registrationNumber}`:"",c.vatNumber?`VAT: ${c.vatNumber}`:""].filter(Boolean).join("\n")},{label:"SALESPERSON",value:[s.salesperson.name,s.salesperson.whatsapp].join("\n")},{label:"DOCUMENT DETAILS",value:[record.number||"DRAFT",`Date: ${String(record.issued_at||record.created_at).slice(0,10)}`,record.expires_on?`Expiry: ${String(record.expires_on).slice(0,10)}`:"",record.due_on?`Due: ${String(record.due_on).slice(0,10)}`:"",s.reference?`Reference: ${s.reference}`:"",s.quoteNumber?`Quote: ${s.quoteNumber}`:"",s.orderNumber?`Order: ${s.orderNumber}`:""].filter(Boolean).join("\n")}];
 let blockBottom=y;for(let i=0;i<3;i++){const x=left+i*177;doc.rect(x,y,165,19).fill("#e8f5fb");text(columns[i].label,x+7,y+5,151,8,true);blockBottom=Math.max(blockBottom,text(columns[i].value,x+4,y+27,157,9))}y=blockBottom+24;
 const cols=delivery?[{label:"Item code",w:92},{label:"Description",w:267},{label:"Colour",w:60},{label:"Size",w:50},{label:"Qty",w:50}]:[{label:"Item code",w:70},{label:"Description",w:b.vatRegistered?143:180},{label:"Colour",w:40},{label:"Size",w:30},{label:"Unit price",w:62},{label:"Qty",w:35},{label:"Disc %",w:40},...(b.vatRegistered?[{label:"VAT",w:37}]:[]),{label:"Total",w:62}];
 const tableHead=()=>{ensure(28);doc.rect(left,y,width,24).fill(navy);let x=left;for(const col of cols){text(col.label,x+4,y+8,col.w-8,7,true,"#ffffff");x+=col.w}y+=24};tableHead();
 for(let i=0;i<s.totals.lines.length;i++){
  const line=s.totals.lines[i];const description=[line.description,...(!delivery?[line.brandingCents?`Branding/unit: ${currency(line.brandingCents)}`:"",line.setupCents?`Setup: ${currency(line.setupCents)}`:"",line.otherCents?`Other: ${currency(line.otherCents)}`:""]:[])].filter(Boolean).join("\n");
  const cells=delivery?[line.productCode,description,line.colour||"-",line.size||"-",line.quantity]:[line.productCode,description,line.colour||"-",line.size||"-",currency(line.unitPriceCents),line.quantity,`${line.discountBps/100}`, ...(b.vatRegistered?[currency(line.taxCents)]:[]),currency(line.totalCents)];
  const h=Math.max(30,...cells.map((cell,j)=>height(cell,cols[j].w-8,8)+16));
  // A line is bounded to 1,500 characters; move it intact to the next page.
  if(y+h>bottom){newPage();tableHead()}
  if(h>bottom-y)throw new Error("Description is too long to fit a product row. Shorten the description.");
  if(i%2===0)doc.rect(left,y,width,h).fill("#f0f7fb");let x=left;for(let j=0;j<cells.length;j++){text(cells[j],x+4,y+8,cols[j].w-8,8);x+=cols[j].w}y+=h;rule(y);
 }
 y+=20;
 if(!delivery){
  const totals=[["Subtotal",s.totals.subtotalCents],...(s.totals.discountCents?[["Discount",-s.totals.discountCents]]:[]),["Delivery",s.totals.deliveryCents],...(b.vatRegistered?[[`VAT (${b.vatRateBps/100}%)`,s.totals.taxCents]]:[]),["Grand total",s.totals.totalCents],...(["order","invoice"].includes(record.kind)?[["Amount paid",paid],["Balance due",Math.max(0,record.total_cents-paid)]]:[])];
  ensure(totals.length*22+12);for(const [label,value] of totals){const bold=label==="Grand total"||label==="Balance due";text(label,305,y,142,10,bold);text(currency(Number(value)),450,y,107,10,bold);y+=22}y+=15;
  if(b.bank)paragraph("PAYMENT INFORMATION",[b.bank,b.accountName,`Account: ${b.accountNumber} (${b.accountType})`,`Branch code: ${b.branchCode}`,`Reference: ${s.orderNumber||record.number||"Provided on sales order"}`].join("\n"));
  paragraph("PAYMENT TERMS",b.paymentTerms);
 }else{
  ensure(130);paragraph("DELIVERY CONFIRMATION",`Delivered by: ${s.deliveredBy||"____________________________"}\nReceived by: ${s.recipientName||"____________________________"}\nRecipient name: ____________________________\nSignature: ________________________________\nDate: ____________________________________`);paragraph("DELIVERY NOTES",s.deliveryNotes||"");
 }
 if(!delivery)paragraph("NOTES",s.notes);paragraph("TERMS AND CONDITIONS",s.terms);
 const range=doc.bufferedPageRange();for(let i=0;i<range.count;i++){doc.switchToPage(i);doc.page.margins.bottom=0;rule(793);text(`${b.tradingName||"Gentwelve"} | ${record.number||"DRAFT"}`,left,802,360,8,false,muted);text(`Page ${i+1} of ${range.count}`,460,802,97,8,false,muted);doc.rect(left,786,34,2).fill(blue)}
 doc.end();return result;
}
