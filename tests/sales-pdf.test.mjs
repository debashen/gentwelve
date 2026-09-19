import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import ts from 'typescript';
import {calculate} from '../lib/sales/calculations.ts';
import {defaultBusiness} from '../lib/sales/validation.ts';
test('branded PDFs retain compact terms, enabled payments, VAT rules and price-free delivery',{skip:!process.env.PDFTOTEXT_BIN},async()=>{
 const source=(await readFile(new URL('../lib/sales/pdf.ts',import.meta.url),'utf8')).replace('"pdfkit"',JSON.stringify(import.meta.resolve('pdfkit')));
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {renderDocumentPdf}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const business={...defaultBusiness,legalName:'Gentwelve Printing Co',address:'Durban, South Africa',email:'sales@example.com',telephone:'+27 00 000 0000',bank:'Example Bank',accountName:'Gentwelve Printing Co',accountNumber:'0000000000',branchCode:'000000',accountType:'Business',providers:{paystack:true,payfast:false,ozow:false,eft:true},paymentTerms:'Payment confirms your order. Use the sales order number as your reference.'};
 const lines=[{productCode:'AV-19001',description:'Alex Varga presentation gift set',colour:'Navy',size:'Standard',quantity:50,unitPriceCents:12500,discountBps:500,brandingMethod:'Laser Engraving',brandingPosition:'Front',brandingCents:900,setupCents:25000,otherCents:0,taxable:true},{productCode:'QA-POLO',description:'Premium cotton golf shirt',colour:'Blue',size:'Large',quantity:35,unitPriceCents:10000,discountBps:0,brandingMethod:'Embroidery',brandingPosition:'Left chest',brandingCents:1200,setupCents:18000,otherCents:0,taxable:true}];
 const totals=calculate(lines,15000,false,0);
 const record={number:'QT-000123',kind:'quote',status:'sent',issued_at:'2026-09-19',created_at:'2026-09-19',expires_on:'2026-10-19',due_on:null,total_cents:totals.totalCents,public_token:'a'.repeat(64),snapshot:{business,customer:{name:'Example Trading (Pty) Ltd',contactPerson:'Alex Smith',billingAddress:'12 Example Road\nDurban, 4001',deliveryAddress:'Warehouse 2, Example Road\nDurban, 4001',email:'buyer@example.com',mobile:'+27 00 000 0000',vatNumber:'SHOULD-NOT-PRINT'},salesperson:{name:'Gentwelve Sales',whatsapp:'+27 00 000 0000'},reference:'Campaign September',notes:'Please approve the artwork before production.',terms:'Prices valid until the expiry date. Stock is subject to confirmation when the order is placed. Production begins after payment and artwork approval. Delivery dates will be confirmed with your sales contact.',totals}};
 await mkdir('outputs/sales-qa',{recursive:true});
 for(const kind of ['quote','order','invoice','delivery']){
  const file=`outputs/sales-qa/sample-${kind}.pdf`;await writeFile(file,await renderDocumentPdf({...record,kind,number:`${kind.toUpperCase()}-000123`},0,{url:'https://catalogue.gentwelve.com/pay/'+record.public_token,eft:true}));
  const text=execFileSync(process.env.PDFTOTEXT_BIN,[file,'-'],{encoding:'utf8'});assert.ok(!text.includes('SHOULD-NOT-PRINT'));assert.equal((text.match(/Page \d+ of/g)||[]).length,1,'normal terms and two products fit on one page');
  if(kind==='delivery'){assert.ok(!text.includes('Grand total'));assert.ok(!text.includes('Example Bank'));assert.ok(!text.includes('PAY NOW'));assert.ok(!/\d+\.\d{2}/.test(text))}else{assert.ok(text.includes('Example Bank'));if(kind!=='quote')assert.ok(text.includes('PAY NOW'))}
 }
 const longFile='outputs/sales-qa/sample-multipage.pdf';await writeFile(longFile,await renderDocumentPdf({...record,snapshot:{...record.snapshot,totals:calculate(Array.from({length:25},()=>lines[0]),0,false,0)}}));
 const long=execFileSync(process.env.PDFTOTEXT_BIN,[longFile,'-'],{encoding:'utf8'});assert.ok((long.match(/Page \d+ of/g)||[]).length>1);assert.equal((long.match(/AV-19001/g)||[]).length,25);
});
