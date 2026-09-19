import {test} from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
import {randomUUID} from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
const database=process.env.TEST_DATABASE_URL;
test('sales foundation API protects settings and persists customer data',{skip:!database},async()=>{
 assert.equal(new URL(database).hostname,'127.0.0.1');
 const sql=postgres(database,{ssl:false,max:1});
 const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p','3108'],{env:{...process.env,DATABASE_URL:database,ADMIN_PASSWORD:'fixture-password',AUTH_SECRET:'fixture-secret-at-least-32-characters'},stdio:'ignore'});
 const base='http://127.0.0.1:3108';
 try{
  let ready=false;for(let i=0;i<80;i++){try{if((await fetch(base)).ok){ready=true;break}}catch{}await delay(250)}assert.ok(ready);
  assert.equal((await fetch(base+'/api/admin/sales/settings')).status,401);
  const login=await fetch(base+'/api/admin/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password:'fixture-password'})});
  const headers={cookie:login.headers.get('set-cookie').split(';')[0],'content-type':'application/json'};
  const call=async(path,method='GET',body,status=200)=>{const r=await fetch(base+'/api/admin/sales/'+path,{method,headers,body:body?JSON.stringify(body):undefined});const result=await r.json();assert.equal(r.status,status,JSON.stringify(result));return result};
  const settings=await call('settings');assert.equal(settings.data.vatRegistered,false);
  await call('settings','PUT',{data:settings.data,version:settings.version,sequences:settings.sequences});
  await call('settings','PUT',{data:settings.data,version:settings.version,sequences:settings.sequences},409);
  const customer=await call('customers','POST',{name:'Sales Fixture',email:'fixture@example.com',notes:'Internal only'});
  const saved=await call('customers?id='+customer.id);assert.equal(saved.data.email,'fixture@example.com');
  await call('customers','PUT',{id:customer.id,data:{...saved.data,contactPerson:'Alex'},version:saved.version});
  await call('customers','PUT',{id:customer.id,data:saved.data,version:saved.version},409);
  const result=await call('customers?q=Sales%20Fixture');assert.ok(result.items.some(c=>c.id===customer.id));
  const input={customerId:customer.id,reference:'TEST-REF',lines:[{productCode:'MANUAL-001',description:'Manual item',unitPriceCents:10000,quantity:10,discountBps:1000,brandingCents:500,setupCents:1000,otherCents:200}],deliveryCents:500};
  const quote=await call('documents','POST',input);
  const draft=await call('documents/'+quote.id);assert.equal(draft.document.number,null);assert.equal(draft.document.total_cents,96700);assert.equal(draft.document.snapshot.customer.notes,undefined);
  assert.equal((await fetch(base+'/q/'+draft.document.public_token)).status,404,'draft links are private');
  await Promise.all([call('documents/'+quote.id,'POST',{action:'issue'}),call('documents/'+quote.id,'POST',{action:'issue'})]);
  const issued=await call('documents/'+quote.id);assert.match(issued.document.number,/^QT-\d+$/);
  await call('documents/'+quote.id,'POST',{action:'edit',version:issued.document.version,data:input},409);
  await assert.rejects(sql`UPDATE sales_documents SET total_cents=1 WHERE id=${quote.id}`,'database protects issued amounts');
  const decide=await fetch(base+'/api/sales/public/'+issued.document.public_token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({decision:'accepted',name:'Fixture Buyer',confirmed:true})});assert.equal(decide.status,200);
  const orders=await Promise.all([call('documents/'+quote.id,'POST',{action:'order'}),call('documents/'+quote.id,'POST',{action:'order'})]);assert.equal(orders[0].id,orders[1].id,'conversion is idempotent');
  const order=await call('documents/'+orders[0].id);assert.equal(order.document.total_cents,96700);assert.equal(order.document.snapshot.quoteNumber,issued.document.number);
  const invoice=await call('documents/'+order.document.id,'POST',{action:'invoice',dueOn:'2030-01-01'});await call('documents/'+invoice.id,'POST',{action:'issue'});
  const invoiceDoc=await call('documents/'+invoice.id);assert.equal(invoiceDoc.status,'issued','invoice is not automatically paid');
  const delivery=await call('documents/'+order.document.id,'POST',{action:'delivery',deliveredBy:'Courier',recipientName:'Alex'});
  for(const id of [quote.id,order.document.id,invoice.id,delivery.id]){const pdf=await fetch(base+'/api/admin/sales/documents/'+id+'?format=pdf',{headers});assert.equal(pdf.status,200);assert.equal(Buffer.from(await pdf.arrayBuffer()).subarray(0,5).toString(),'%PDF-')}
  assert.equal((await call('documents/'+quote.id)).document.status,'converted');
  const paymentPage=await fetch(base+'/pay/'+order.document.public_token);assert.equal(paymentPage.status,200);assert.ok((await paymentPage.text()).includes('AWAITING PAYMENT'));
  const disabled=await fetch(base+'/api/payments/'+order.document.public_token,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({provider:'paystack'})});assert.equal(disabled.status,409);
  await fetch(base+'/api/payments/return/'+order.document.public_token,{redirect:'manual'});assert.equal((await call('documents/'+order.document.id)).paid,0,'success URL cannot credit payments');
  const receipt={amountCents:40000,reference:'BANK-'+randomUUID(),receivedOn:new Date().toISOString().slice(0,10),confirmed:true,requestId:randomUUID()};
  await Promise.all([call('documents/'+order.document.id,'POST',{action:'eft',data:receipt}),call('documents/'+order.document.id,'POST',{action:'eft',data:receipt})]);
  assert.equal((await call('documents/'+order.document.id)).paid,40000,'manual double-click does not double-credit');
  assert.equal((await call('documents/'+invoice.id)).status,'partially_paid');
  await call('documents/'+order.document.id,'POST',{action:'eft',data:{...receipt,reference:'OVER-'+randomUUID(),requestId:randomUUID(),amountCents:999999}},409);
  await call('documents/'+order.document.id,'POST',{action:'eft',data:{...receipt,reference:'BANK-'+randomUUID(),requestId:randomUUID(),amountCents:56700}});
  assert.equal((await call('documents/'+invoice.id)).status,'paid');assert.equal((await call('documents/'+order.document.id)).document.status,'paid');
  const [payment]=await sql`SELECT id FROM sales_payments WHERE order_id=${order.document.id} AND status='succeeded' LIMIT 1`;
  await assert.rejects(sql`UPDATE sales_payments SET amount_cents=1 WHERE id=${payment.id}`,'received payments are immutable');
  const [count]=await sql`SELECT COUNT(*)::int AS n FROM sales_payments WHERE order_id=${order.document.id} AND invoice_id=${invoice.id}`;assert.equal(count.n,2);


 }finally{server.kill();await sql.end()}
});
