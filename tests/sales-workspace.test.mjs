import {test} from 'node:test';
import assert from 'node:assert/strict';
import {brandingOptions} from '../lib/sales/branding.ts';
import {gatewayStatus} from '../lib/sales/gateway-status.ts';
import {readFile} from 'node:fs/promises';
import ts from 'typescript';
test('gateway readiness distinguishes all four states',()=>{
 assert.equal(gatewayStatus(false,false),'Disabled');assert.equal(gatewayStatus(true,false),'Not configured');assert.equal(gatewayStatus(true,true,true),'Test mode');assert.equal(gatewayStatus(true,true,false),'Ready');
});
test('branding selects only valid method/position pairs and excludes raw costs',()=>{
 const options=brandingOptions({brandings:[{positionName:'Front ',positionCode:'A',method:[{brandingName:'Laser Engraving',brandingCode:'L',costPrice:3}]}]});
 assert.equal(options[0].position,'Front');assert.equal(options[0].method,'Laser Engraving');assert.ok(!JSON.stringify(options).includes('costPrice'));
});
test('sync diagnostics distinguish parents, duplicates, rejected records and variants',async()=>{
 const source=(await readFile(new URL('../lib/sync-diagnostics.ts',import.meta.url),'utf8')).replace('"./amrod"',JSON.stringify(new URL('../lib/amrod.ts',import.meta.url).href));
 const code=ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.ESNext,target:ts.ScriptTarget.ES2022}}).outputText;
 const {sourceDiagnostics}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const d=sourceDiagnostics([{simpleCode:'P',productName:'P',variants:[{fullCode:'P-BL-L'}]},{simpleCode:'P',productName:'P'},{simpleCode:'NO-NAME'},{productName:'Missing code'},{simpleCode:'OLD',productName:'Old',discontinued:true}],'products');
 assert.equal(d.supplierRecords,5);assert.equal(d.duplicates,1);assert.equal(d.skipped,2);assert.equal(d.missingCode,1);assert.equal(d.missingName,1);assert.equal(d.inactive,1);assert.equal(d.variants,1);
});
