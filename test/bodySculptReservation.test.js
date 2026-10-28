import test from 'node:test';import assert from 'node:assert/strict';
import {pool} from '../src/config/pool.js';
import {reserveBodySculptSlot} from '../src/services/bodySculptReservation.service.js';
import {BODY_SCULPT_KEY} from '../src/utils/bodySculptRules.js';

test('parallel slot validations share one remaining lymphdrainage; own hold can be changed',async()=>{
 const oldConnect=pool.connect;const holds=new Map();let tail=Promise.resolve();
 pool.connect=async()=>{
  let unlock=null;
  return {release(){assert.equal(unlock,null);},async query(sql,values=[]){
   if(sql.includes('FOR UPDATE OF bt, m')){
    const previous=tail;tail=new Promise(resolve=>{unlock=resolve;});await previous;
    return {rows:[{used_at:null,is_expired:false}]};
   }
   if(sql==='COMMIT'||sql==='ROLLBACK'){if(unlock){unlock();unlock=null;}return {rows:[]};}
   if(sql==='BEGIN')return {rows:[]};
   if(sql.includes('FROM member_monthly_usage_imports'))return {rows:[]};
   if(sql.includes('FROM bookings b')){
    assert.ok(unlock,'availability must be read inside the member lock');
    assert.ok(sql.includes('bt.expires_at > NOW()'),'abandoned holds must expire');
    assert.ok(sql.includes('bt.used_at IS NULL'),'completed holds must not count twice');
    const row=option=>({category_key:'private',treatment_key:BODY_SCULPT_KEY,body_sculpt_option:option});
    return {rows:[row('ems_lymph'),...Array.from(holds.entries())
      .filter(([token,hold])=>token!==values[2]&&hold.month===values[1]).map(([,h])=>row(h.option))]};
   }
   if(sql.includes('UPDATE booking_tokens SET body_sculpt_option')){holds.set(values[0],{option:values[1],month:values[2]});return {rows:[],rowCount:1};}
   throw new Error('Unexpected query: '+sql);
  }};
 };
 try{
  const member={id:7,package_key:'private',status:'active'};
  const results=await Promise.all(['one','two'].map(token=>reserveBodySculptSlot(member,token,'2026-10-01','ems_lymph')));
  assert.equal(results.filter(r=>!r.error).length,1);
  assert.equal(results.filter(r=>r.error==='LYMPHDRAINAGE_LIMIT_REACHED').length,1);
  assert.equal(holds.size,1);
  const token=[...holds.keys()][0];
  assert.equal((await reserveBodySculptSlot(member,token,'2026-10-01','ems_lymph')).error,undefined,'own hold must not consume an additional quota');
  assert.equal((await reserveBodySculptSlot(member,token,'2026-10-01','ems')).error,undefined);
  assert.equal(holds.get(token).option,'ems');
  assert.equal((await reserveBodySculptSlot(member,'third','2026-10-01','ems_lymph')).error,undefined);
 }finally{pool.connect=oldConnect;}
});
