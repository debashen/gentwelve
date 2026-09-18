import {test} from 'node:test';
import assert from 'node:assert/strict';
import {businessSchema,customerSchema,sequenceSchema} from '../lib/sales/validation.ts';
test('sales defaults do not charge VAT or enable unconfigured payments',()=>{const s=businessSchema.parse({});assert.equal(s.vatRegistered,false);assert.equal(s.vatRateBps,0);assert.ok(Object.values(s.providers).every(v=>!v));assert.equal(s.bank,'');assert.equal(s.defaultSalespersonId,'default')});
test('VAT and EFT require explicit complete configuration',()=>{assert.equal(businessSchema.safeParse({vatRegistered:true}).success,false);assert.equal(businessSchema.safeParse({providers:{eft:true}}).success,false);assert.equal(businessSchema.safeParse({vatRegistered:true,vatNumber:'EXAMPLE',vatRateBps:1500}).success,true)});
test('customer and numbering validation rejects malformed data',()=>{assert.equal(customerSchema.safeParse({name:'',email:'bad'}).success,false);assert.equal(customerSchema.parse({name:' ACME '}).name,'ACME');assert.equal(sequenceSchema.safeParse(Array(4).fill({kind:'quote',prefix:'QT-',nextNumber:1})).success,false)});
