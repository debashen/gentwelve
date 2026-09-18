import { test } from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';

// Use only the isolated fixture database; never point this at production.
const database=process.env.TEST_DATABASE_URL;
test('PostgreSQL production API: filters, exact variants, admin, bulk publication and analytics', {skip:!database}, async()=>{
  assert.ok(new URL(database).hostname==='127.0.0.1','Tests require a loopback database');
  const sql=postgres(database,{ssl:false,max:1});
  const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3107'],{env:{...process.env,DATABASE_URL:database,ADMIN_PASSWORD:'fixture-password',AUTH_SECRET:'fixture-secret-at-least-32-characters'},stdio:'ignore'});
  const base='http://127.0.0.1:3107';
  try{
    await sql`TRUNCATE products,variants,catalogue_events,sync_runs RESTART IDENTITY`;
    for(const [code,name,curated,price] of [['SHIRT','Blue Golf Shirt',1,5000],['ZERO','Zero Stock',1,1000],['DRAFT','Draft Bag',0,8000]]){
      await sql`INSERT INTO products(supplier_code,name,category,image_url,public_price_cents,raw_json,curated,created_at,updated_at) VALUES(${code},${name},'Clothing','https://example.com/image.jpg',${price},'{}',${curated},'2026-09-17','2026-09-17')`;
    }
    for(const [product,code,colour,size,stock,price] of [['SHIRT','SHIRT-BL-M','Blue','M',17,15000],['SHIRT','SHIRT-RD-L','Red','L',4,20000],['ZERO','ZERO-BL-M','Blue','M',0,1000],['DRAFT','DRAFT-BL-M','Blue','M',10,8000]]){
      await sql`INSERT INTO variants(product_code,full_code,colour,size,stock_quantity,public_price_cents,updated_at) VALUES(${product},${code},${colour},${size},${stock},${price},'2026-09-17')`;
    }
    let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base)).ok){ready=true;break}}catch{}await delay(250)}assert.ok(ready,'production server started');
    const get=async(path,options)=>{const response=await fetch(base+path,options);assert.equal(response.status,200,path);return response.json()};
    const publicProducts=await get('/api/products?q=gOlF');assert.equal(publicProducts.total,1);assert.equal(publicProducts.products[0].code,'SHIRT');assert.equal(Number(publicProducts.products[0].stockQuantity),21);
    assert.equal((await get('/api/products?filter=Under%20R100')).total,0,'budget matches in-stock variant price, not stale base price');
    assert.equal((await get('/api/products?filter=Clothing')).total,1);
    const variants=await get('/api/product-variants?code=SHIRT');assert.deepEqual(variants.variants.map(v=>[v.colour,v.size,v.stock]),[['Blue','M',17],['Red','L',4]]);
    assert.deepEqual((await get('/api/product-variants?code=DRAFT')).variants,[]);
    assert.equal((await fetch(base+'/product/ZERO')).status,404);
    assert.equal((await fetch(base+'/product/SHIRT')).status,200);
    assert.equal((await fetch(base+'/api/admin/catalogue')).status,401);
    const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'fixture-password'})});assert.equal(login.status,200);
    const cookie=login.headers.get('set-cookie').split(';')[0];const headers={cookie,'content-type':'application/json'};
    assert.equal((await fetch(base+'/api/admin/sales-contact')).status,401);
    assert.equal((await fetch(base+'/api/admin/sales-contact',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({contactName:'Intruder',whatsappNumber:'27821234567'})})).status,401);
    const savedContact=await get('/api/admin/sales-contact',{headers});
    const quotePath='/api/whatsapp?code=SHIRT&quantity=100&branding=Yes';
    try {
      for (const [contactName,whatsappNumber] of [['Jamie','27821234567'],['Sam','27821234568']]) {
        await get('/api/admin/sales-contact',{method:'PUT',headers,body:JSON.stringify({contactName,whatsappNumber})});
        assert.deepEqual(await get('/api/admin/sales-contact',{headers}),{contactName,whatsappNumber});
        const quote=await fetch(base+quotePath,{redirect:'manual'});
        assert.equal(quote.status,302);assert.match(quote.headers.get('cache-control'),/no-store/);
        const destination=new URL(quote.headers.get('location'));
        assert.equal(destination.pathname,'/'+whatsappNumber);
        assert.equal(destination.searchParams.get('text'),`Hi ${contactName}, I'd like a quote on this product.\n\nProduct: Blue Golf Shirt\nCode: SHIRT\nQuantity: 100\nBranding: Yes\nProduct Link: ${base}/product/SHIRT`);
      }
      assert.equal((await fetch(base+'/api/admin/sales-contact',{method:'PUT',headers,body:JSON.stringify({contactName:'',whatsappNumber:'bad'})})).status,400);
      assert.equal((await fetch(base+'/api/admin/sales-contact',{method:'PUT',headers:{...headers,origin:'https://other.example'},body:JSON.stringify(savedContact)})).status,403);
      assert.equal((await fetch(base+'/api/whatsapp?code=DRAFT&quantity=100&branding=Yes',{redirect:'manual'})).status,404);
      assert.equal((await fetch(base+'/api/whatsapp?code=SHIRT&quantity=0&branding=Yes',{redirect:'manual'})).status,400);
    } finally { await get('/api/admin/sales-contact',{method:'PUT',headers,body:JSON.stringify(savedContact)}); }
    const admin=await get('/api/admin/catalogue?status=all',{headers});assert.equal(admin.total,3);assert.ok(admin.products.some(p=>p.code==='ZERO'));
    const publish=await get('/api/admin/catalogue',{method:'POST',headers,body:JSON.stringify({action:'publish_all_eligible',confirmed:true})});assert.equal(publish.published,1);
    assert.equal((await get('/api/products')).total,2);
    for(const term of ['Bag','bag'])await get('/api/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({eventType:'search',searchQuery:term,sessionId:'fixture'})});
    const analytics=await get('/api/admin/analytics',{headers});assert.equal(analytics.searches[0].term,'bag');assert.equal(Number(analytics.searches[0].count),2);
    assert.equal((await fetch(base+'/sitemap.xml')).status,200);
    const draft=admin.products.find(p=>p.code==='DRAFT');assert.equal(typeof draft.id,'number');
    await get('/api/admin/catalogue',{method:'PATCH',headers,body:JSON.stringify({id:draft.id,featured:true})});
    await sql`UPDATE products SET raw_json=${JSON.stringify({SimpleCode:'SHIRT',Variants:[{FullCode:'SHIRT-BL-M',Colour:'Blue',Size:'M'}]})} WHERE supplier_code='SHIRT'`;
    const start=await fetch(base+'/api/admin/sync?type=variants',{method:'POST',headers});assert.equal(start.status,202);
    const run=await start.json();assert.equal(typeof run.runId,'number');
    const finished=await get(`/api/admin/sync?runId=${run.runId}`,{method:'POST',headers});assert.equal(finished.status,'complete');
    const [retired]=await sql`SELECT active FROM variants WHERE full_code='SHIRT-RD-L'`;assert.equal(retired.active,0);
    const [preserved]=await sql`SELECT stock_quantity FROM variants WHERE full_code='SHIRT-BL-M'`;assert.equal(preserved.stock_quantity,17);
    const failedStart=await fetch(base+'/api/admin/sync?type=products',{method:'POST',headers});const failedRun=await failedStart.json();
    const failed=await fetch(base+`/api/admin/sync?runId=${failedRun.runId}`,{method:'POST',headers});assert.equal(failed.status,503);
    const [progress]=await sql`SELECT products_received FROM sync_runs WHERE id=${failedRun.runId}`;assert.equal(progress.products_received,0);

  }finally{server.kill();await sql.end()}
});
