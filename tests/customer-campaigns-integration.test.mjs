import {test} from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const database=process.env.TEST_DATABASE_URL;
test('catalogue request with artwork reaches Sales and campaigns can publish, target, track and disable',{skip:!database},async()=>{
 assert.equal(new URL(database).hostname,'127.0.0.1');const sql=postgres(database,{ssl:false,max:1});
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3112'],{env:{...process.env,DATABASE_URL:database,ADMIN_PASSWORD:'fixture-password',AUTH_SECRET:'fixture-secret-at-least-32-characters'},stdio:'ignore'});const base='http://127.0.0.1:3112';
 try{
  await sql`DELETE FROM public_rate_limits`;
  const raw={brandings:[{positionName:'Front',positionCode:'A',method:[{brandingName:'Screen Print',brandingCode:'SP'}]}]};
  await sql`INSERT INTO products(supplier_code,name,description,category,brand,image_url,public_price_cents,raw_json,curated,created_at,updated_at) VALUES('REQUEST-POLO','Request Polo','<ul><li>Soft &amp; durable</li></ul><script>alert(1)</script>','Clothing','Fixture','/gentwelve-icon.png',10000,${JSON.stringify(raw)},1,'2026-09-19','2026-09-19') ON CONFLICT(supplier_code) DO UPDATE SET name=excluded.name,curated=1`;
  for(const [code,colour,size] of [['REQUEST-POLO-BL-L','Blue','Large'],['REQUEST-POLO-RD-M','Red','Medium']])await sql`INSERT INTO variants(product_code,full_code,colour,size,stock_quantity,public_price_cents,updated_at) VALUES('REQUEST-POLO',${code},${colour},${size},34,10000,'2026-09-19') ON CONFLICT(full_code) DO UPDATE SET active=1,stock_quantity=34`;
  for(let i=0;i<80;i++){try{if((await fetch(base)).ok)break}catch{}await delay(250)}
  const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'fixture-password'})});const headers={cookie:login.headers.get('set-cookie').split(';')[0],'content-type':'application/json',origin:base};
  const call=async(path,method='GET',body,status=200)=>{const r=await fetch(base+path,{method,headers,body:body?JSON.stringify(body):undefined});const d=await r.json();assert.equal(r.status,status,JSON.stringify(d));return d};
  const product=await (await fetch(base+'/api/quote-products?codes=REQUEST-POLO')).json();assert.match(product.products[0].product.descriptionHtml,/<ul>/);assert.ok(!product.products[0].product.descriptionHtml.includes('script'));assert.equal(product.products[0].variants.length,2);assert.equal(product.products[0].product.branding[0].position,'Front');
  assert.equal((await fetch(base+'/api/admin/campaigns')).status,401);
  const campaign={name:'Fixture '+randomUUID(),headline:'Campaign fixture',text:'Explore our range',types:['hero','popup','product'],published:true,enabled:true,ctaLabel:'Browse',ctaDestination:'/product/REQUEST-POLO',target:'products',products:['REQUEST-POLO'],categories:[],frequency:'session',frequencyDays:7,priority:99,startsAt:null,endsAt:null,desktopImage:'',mobileImage:''};
  const c=await call('/api/admin/campaigns','POST',{data:campaign});let listed=await call('/api/admin/campaigns');const saved=listed.items.find(r=>r.id===c.id);assert.ok(saved);
  assert.ok((await (await fetch(base+'/api/campaigns?page=product&product=REQUEST-POLO')).json()).items.some(r=>r.id===c.id));assert.ok(!(await (await fetch(base+'/api/campaigns?page=home')).json()).items.some(r=>r.id===c.id));
  for(const event of ['impression','click','dismiss'])await call('/api/campaign-events','POST',{id:c.id,visitor:randomUUID(),event});
  const selection={code:'REQUEST-POLO',variantCode:'REQUEST-POLO-BL-L',quantity:10,branded:true,method:'Screen Print',position:'Front',notes:'Please use navy ink'};
  const request={requestKey:randomUUID(),name:'Fixture Buyer',company:'Fixture Company',email:'quote-fixture@example.com',mobile:'27820000000',city:'Durban',instructions:'TEST REQUEST',reference:'PO-FIXTURE',items:[selection,{...selection,variantCode:'REQUEST-POLO-RD-M',quantity:null,branded:false,method:'',position:''}],campaignId:c.id};
  const submit=async(data,file=new File(['%PDF-1.4\n%%EOF'],'logo.pdf',{type:'application/pdf'}))=>{const form=new FormData();form.append('data',JSON.stringify(data));form.append('artwork',file);return fetch(base+'/api/quote-requests',{method:'POST',headers:{origin:base},body:form})};
  const bad=await submit({...request,requestKey:randomUUID()},new File(['<script>bad</script>'],'bad.png'));assert.equal(bad.status,400);
  const invalid=await submit({...request,requestKey:randomUUID(),items:[{...selection,method:'Invented'}]});assert.equal(invalid.status,400);
  const response=await submit(request);const result=await response.json();assert.equal(response.status,201,JSON.stringify(result));assert.match(result.reference,/^GTQ-/);assert.ok(!decodeURIComponent(result.whatsappUrl).includes(request.email));assert.ok(!decodeURIComponent(result.whatsappUrl).includes('navy ink'));
  assert.equal((await (await submit(request)).json()).reference,result.reference);
  const [enquiry]=await sql`SELECT id,details FROM sales_enquiries WHERE reference=${result.reference}`;assert.equal(enquiry.details.items.length,2);assert.equal(enquiry.details.items[0].colour,'Blue');assert.equal(enquiry.details.items[1].quantity,null);assert.equal(enquiry.details.items[0].priceCents,10000);
  const adminEnquiry=await call('/api/admin/sales/enquiries?id='+enquiry.id);assert.equal(adminEnquiry.details.company,'Fixture Company');assert.ok(adminEnquiry.details.artwork.id);
  const artworkUrl='/api/admin/artwork/'+adminEnquiry.details.artwork.id;assert.equal((await fetch(base+artworkUrl)).status,401);const art=await fetch(base+artworkUrl,{headers});assert.equal(art.status,200);assert.match(art.headers.get('content-disposition'),/attachment/);assert.equal(await art.text(),'%PDF-1.4\n%%EOF');
  const quote=await call('/api/admin/sales/documents','POST',{newCustomer:{name:request.company,contactPerson:request.name,email:request.email,mobile:request.mobile},enquiryId:enquiry.id,lines:[{productCode:selection.code,variantCode:selection.variantCode,description:'Request Polo',quantity:10,unitPriceCents:10000,brandingMethod:'Screen Print',brandingPosition:'Front',brandingCents:500,setupCents:1000}]});await call('/api/admin/sales/documents/'+quote.id,'POST',{action:'issue'});
  listed=await call('/api/admin/campaigns');const stats=listed.items.find(r=>r.id===c.id);assert.equal(stats.requests,1);assert.equal(stats.impressions,1);assert.equal(stats.clicks,1);assert.equal(stats.dismissals,1);assert.equal(stats.quoteValue,106000);
  await call('/api/admin/campaigns','POST',{id:c.id,version:saved.version,data:{...campaign,enabled:false}});assert.ok(!(await (await fetch(base+'/api/campaigns?page=product&product=REQUEST-POLO')).json()).items.some(r=>r.id===c.id));
  await call('/api/admin/campaigns','POST',{id:c.id,version:saved.version,data:campaign},409);
 }finally{server.kill();await sql.end()}
});
