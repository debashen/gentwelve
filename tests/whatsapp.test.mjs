import { test } from 'node:test';
import assert from 'node:assert/strict';
import { salesContactSchema, enquirySchema, enquiryPath, whatsappUrl } from '../lib/whatsapp.ts';

test('sales contact validates and normalizes international numbers', () => {
  assert.deepEqual(salesContactSchema.parse({contactName:' Alex ',whatsappNumber:'+27 (69) 045-1055'}),{contactName:'Alex',whatsappNumber:'27690451055'});
  for(const input of [{contactName:'',whatsappNumber:'27690451055'},{contactName:'A\nB',whatsappNumber:'27690451055'},{contactName:'Alex',whatsappNumber:'0690451055'},{contactName:'Alex',whatsappNumber:'https://evil.test'},{contactName:'Alex',whatsappNumber:'1234567890123456'},{contactName:'Alex',whatsappNumber:'27690451055',id:'other'}]) assert.equal(salesContactSchema.safeParse(input).success,false);
});
test('quote uses configured contact and exact required message with encoded product URL', () => {
  const product={name:'Alex Varga & Co',code:'AV-123',quantity:'100',branding:'Yes',url:'https://catalogue.example/product/AV-123'};
  const url=new URL(whatsappUrl({contactName:'Jamie',whatsappNumber:'27821234567'},product));
  assert.equal(url.pathname,'/27821234567');
  assert.equal(url.searchParams.get('text'),"Hi Jamie, I'd like a quote on this product.\n\nProduct: Alex Varga & Co\nCode: AV-123\nQuantity: 100\nBranding: Yes\nProduct Link: https://catalogue.example/product/AV-123");
  assert.ok(new URL(whatsappUrl({contactName:'Sam',whatsappNumber:'27821234568'},{...product,colour:'Blue',size:'M'})).searchParams.get('text').endsWith('\nColour: Blue\nSize: M'));
});
test('enquiry preserves all selector values and rejects invalid options',()=>{
  const path=enquiryPath('A/B','500+','No','Blue','M');
  const data=Object.fromEntries(new URL(path,'https://example.com').searchParams);
  assert.deepEqual(enquirySchema.parse(data),{code:'A/B',quantity:'500+',branding:'No',colour:'Blue',size:'M'});
  for(const change of [{quantity:'-1'},{quantity:'0'},{branding:'Maybe'},{colour:'Blue\nInjected'}]) assert.equal(enquirySchema.safeParse({...data,...change}).success,false);
});
