import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
import {campaignSchema,campaignStatus,campaignMatches,popupEligible} from '../lib/campaigns.ts';
import {quoteRequestSchema,quoteWhatsAppMessage} from '../lib/quote-request-schema.ts';
import {validateArtwork,validateCampaignImage} from '../lib/upload-validation.ts';
async function moduleFrom(file,replacements={}){let source=await readFile(new URL(file,import.meta.url),'utf8');for(const [from,to] of Object.entries(replacements))source=source.replaceAll(JSON.stringify(from),JSON.stringify(to));const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))}
test('supplier HTML preserves useful structure and removes executable content',async()=>{
 const {productDescriptionHtml}=await moduleFrom('../lib/product-content.ts',{'sanitize-html':import.meta.resolve('sanitize-html')});
 const html=productDescriptionHtml('<div><p>Soft &amp; durable</p><ul><li>100% cotton</li></ul><script>alert(1)</script><img src=x onerror=alert(1)><svg onload=alert(1)>x</svg><a href="javascript:alert(1)">More</a></div>');
 assert.match(html,/<ul><li>100% cotton<\/li><\/ul>/);assert.match(html,/Soft &amp; durable/);assert.ok(!/script|onerror|javascript|svg|img/.test(html));
});
test('basket persistence retains multiple variants and rejects corrupt storage',async()=>{
 const {parseBasket}=await moduleFrom('../lib/quote-basket.ts',{'zod':import.meta.resolve('zod'),'./quote-request-schema':new URL('../lib/quote-request-schema.ts',import.meta.url).href});
 const a={id:'11111111-1111-4111-8111-111111111111',code:'P',variantCode:'P-BL-L',quantity:null,branded:true,method:'Embroidery',position:'Chest',notes:'Dark thread',name:'Polo',image:'/x.png',colour:'Blue',size:'Large',priceCents:10000};
 const items=[a,{...a,id:'22222222-2222-4222-8222-222222222222',variantCode:'P-RD-M',quantity:100,colour:'Red',size:'Medium'}];assert.deepEqual(parseBasket(JSON.stringify(items)),items);assert.deepEqual(parseBasket('broken'),[]);
});
test('campaign dates, activation and targeting are deterministic',()=>{
 const c=campaignSchema.parse({name:'Example',headline:'Example',types:['popup','hero'],published:true,enabled:true,startsAt:'2030-01-01T00:00:00Z',endsAt:'2030-02-01T00:00:00Z',target:'products',products:['POLO']});
 assert.equal(campaignStatus(c,Date.parse('2029-12-31')),'Scheduled');assert.equal(campaignStatus(c,Date.parse('2030-01-15')),'Active');assert.equal(campaignStatus(c,Date.parse('2030-02-01')),'Expired');assert.equal(campaignStatus({...c,enabled:false}),'Disabled');assert.equal(campaignStatus({...c,published:false}),'Draft');assert.ok(campaignMatches(c,{page:'product',product:'POLO'}));assert.ok(!campaignMatches(c,{page:'product',product:'BAG'}));assert.ok(campaignMatches({...c,target:'categories',categories:['Clothing']},{page:'browse',category:'Clothing'}));assert.throws(()=>campaignSchema.parse({...c,ctaDestination:'//evil.example'}));
});
test('campaign popup frequency is per campaign with session and day boundaries',()=>{
 const c=campaignSchema.parse({name:'C',headline:'C',types:['popup']});assert.ok(popupEligible(c,{}));assert.ok(!popupEligible(c,{sessionSeen:true}));assert.ok(!popupEligible({...c,frequency:'campaign'},{lastSeen:1}));assert.ok(popupEligible({...c,frequency:'campaign'},{}));assert.ok(!popupEligible({...c,frequency:'days',frequencyDays:7},{lastSeen:100},86400100));assert.ok(popupEligible({...c,frequency:'days',frequencyDays:7},{lastSeen:100},8*86400000));
});
test('artwork validates signatures, active content, limits and filename safety',()=>{
 assert.equal(validateArtwork('../../logo.pdf',Buffer.from('%PDF-1.4\n%%EOF')).contentType,'application/pdf');assert.throws(()=>validateArtwork('x.png',Buffer.from('<script>x</script>')));assert.throws(()=>validateArtwork('x.svg',Buffer.from('<svg onload="alert(1)"></svg>')));assert.throws(()=>validateArtwork('x.svg',Buffer.from('<svg><image href="https://example.com"/></svg>')));assert.throws(()=>validateArtwork('x.pdf',Buffer.from('%PDF-1.4 /JavaScript')));assert.throws(()=>validateArtwork('x.pdf',Buffer.alloc(3000001)));assert.throws(()=>validateCampaignImage(Buffer.from('<svg/>'),'image/svg+xml'));
});
test('quote request requires contact details and WhatsApp omits private information',()=>{
 assert.throws(()=>quoteRequestSchema.parse({}));const message=quoteWhatsAppMessage('GTQ-000001',[{name:'Polo',code:'POLO',colour:'Blue',size:'Large',quantity:null,branded:true,method:'Embroidery',position:'Chest',email:'private@example.com',notes:'Sensitive',artwork:'secret'}]);assert.match(message,/Quantity: Not sure yet/);assert.match(message,/GTQ-000001/);assert.ok(!/private|Sensitive|secret/.test(message));
});
