import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import vm from 'node:vm';
const source=fs.readFileSync(new URL('../shopify-theme-premium-dummy-clean/assets/pdb-premium-body-sculpt.js',import.meta.url),'utf8');
const context={window:{}};vm.runInNewContext(source,context);
const selection=items=>context.window.PDBBodySculpt.getSelection({apntlyBookingModalData:{cartItems:items}});
const slot=(id,duration)=>({timeSlot:{serviceVariant:{variantId:id,durationInMin:duration}}});
test('native Apntly slot maps to the correct entitlement choice and duration',()=>{
 assert.equal(selection([slot(59265461846280,30)]).body_sculpt_option,'ems');
 assert.equal(selection([slot(59265461879048,60)]).body_sculpt_option,'ems_lymph');
 for(const items of [[],[slot(59265461846280,90)],[slot('unknown',30)],
   [slot(59265461846280,30),slot(59265461879048,60)],[{}]]) assert.equal(selection(items),null);
});
