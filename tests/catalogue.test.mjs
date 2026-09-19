import { test } from 'node:test';
import assert from 'node:assert/strict';
import { calculatePublicPriceCents, normaliseStock, extractProductVariants, streamJsonObjects } from '../lib/amrod.ts';
import { resolveSiteUrl } from '../lib/site-url.ts';

test('empty site URL uses a safe Vercel origin; invalid URLs fail clearly', () => {
  assert.equal(resolveSiteUrl({NEXT_PUBLIC_SITE_URL:' ', VERCEL_URL:'gentwelve.vercel.app'}), 'https://gentwelve.vercel.app');
  assert.equal(resolveSiteUrl({}), 'http://localhost:3000');
  assert.throws(()=>resolveSiteUrl({NEXT_PUBLIC_SITE_URL:'invalid'}), /absolute/);
});
test('blank optional pricing settings retain VAT and markup defaults', () => {
  process.env.AMROD_MARKUP_RATE=''; process.env.AMROD_COST_VAT_RATE='';
  assert.equal(calculatePublicPriceCents(100),15525);
});
test('stock uses current sellable type and exact SKU quantities', () => {
  assert.deepEqual(normaliseStock({FullCode:'SHIRT-BL-M',SimpleCode:'SHIRT',Type:2,Quantity:17}), {fullCode:'SHIRT-BL-M',productCode:'SHIRT',stockQuantity:17});
  assert.equal(normaliseStock({FullCode:'SHIRT',Type:1,Quantity:100}),null);
  assert.equal(normaliseStock({FullCode:'SHIRT',Type:2,Quantity:-1}).stockQuantity,0);
});
test('variant colour and size remain attached to their exact SKU', () => {
  const variants=extractProductVariants({SimpleCode:'SHIRT',Variants:[{FullCode:'SHIRT-BL-M',Colour:'Blue',Size:'M'},{FullCode:'SHIRT-RD-L',Colour:'Red',Size:'L'}]});
  assert.deepEqual(variants.map(({fullCode,colour,size})=>({fullCode,colour,size})),[{fullCode:'SHIRT-BL-M',colour:'Blue',size:'M'},{fullCode:'SHIRT-RD-L',colour:'Red',size:'L'}]);
});
test('streaming accepts nested objects and refuses truncated snapshots', async () => {
  const rows=[];for await(const row of streamJsonObjects(new Response('[{"name":"a } b","nested":{"x":1}}]')))rows.push(row);
  assert.equal(rows[0].nested.x,1);
  await assert.rejects(async()=>{for await(const row of streamJsonObjects(new Response('[{"x":1},'))){void row}},/Incomplete/);
  await assert.rejects(async()=>{for await(const row of streamJsonObjects(new Response('{"error":"unavailable"}'))){void row}},/Incomplete/);
});
test('actual Amrod names retain SKU colour and size',()=>{
 const v=extractProductVariants({simpleCode:'P',variants:[{fullCode:'P-BL-L',codeColourName:'Blue',codeSizeName:'Large'}]});
 assert.equal(v[0].colour,'Blue');assert.equal(v[0].size,'Large');
});
test('supplier wrappers cannot silently hide pagination',async()=>{
 await assert.rejects(async()=>{for await(const r of streamJsonObjects(new Response('{"items":[{"code":"P"}],"nextPage":2}'))){void r}},/unsupported/);
});

test('parent fullCode is not an additional SKU when embedded variants exist',()=>{
 const variants=extractProductVariants({simpleCode:'P',fullCode:'P',variants:[{fullCode:'P-BL-L'}]});assert.deepEqual(variants.map(v=>v.fullCode),['P-BL-L']);
});
