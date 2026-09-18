import {test} from 'node:test';
import assert from 'node:assert/strict';
import postgres from 'postgres';
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
  // Further lifecycle checks are appended in later phases.
 }finally{server.kill();await sql.end()}
});
