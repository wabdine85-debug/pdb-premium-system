import test from 'node:test';
import assert from 'node:assert/strict';
import {pool} from '../src/config/pool.js';
import {env} from '../src/config/env.js';
import router from '../src/routes/bookings.js';
import {BODY_SCULPT_KEY,BODY_SCULPT_OPTIONS} from '../src/utils/bodySculptRules.js';

const handler = path => router.stack.find(layer=>layer.route?.path===path).route.stack.at(-1).handle;
const response = () => ({code:200,status(code){this.code=code;return this;},json(body){this.body=body;return this;}});
const now = new Date();
const appointmentDate = `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-28`;
const fields = option => ({body_sculpt_option:option,
  body_sculpt_variant_id:BODY_SCULPT_OPTIONS[option].variantId,
  body_sculpt_duration_minutes:BODY_SCULPT_OPTIONS[option].durationMinutes});

test('booking routes bind the selection, repeat quotas under member lock, and reject stale choices', async () => {
  const original = {query:pool.query,connect:pool.connect,shop:env.shopifyShop};
  env.shopifyShop=''; // Use the verified local active-contract fallback; never call Shopify.
  const member = {id:7,shopify_customer_id:'body-test',package_key:'private',status:'active'};
  let bookings=[], selected=null, writes=0, locked=false;
  const query = async (sql,values=[]) => {
    if (sql.trim()==='BEGIN'||sql.trim()==='ROLLBACK'||sql.trim()==='COMMIT') return {rows:[]};
    if (sql.includes('FROM members WHERE shopify_customer_id')) return {rows:[member]};
    if (sql.includes('FROM membership_applications')) return {rows:[{id:'test-application',status:'active',package_key:'private',starts_on:'2020-01-01',activated_at:'2020-01-01'}]};
    if (sql.includes('SELECT EXISTS')) return {rows:[{active:false}]};
    if (sql.includes('FROM member_monthly_usage_imports')) return {rows:[]};
    if (sql.includes('FROM bookings b')) return {rows:bookings.map(body_sculpt_option=>({category_key:'private',treatment_key:BODY_SCULPT_KEY,body_sculpt_option}))};
    if (sql.includes('SELECT NOW() > expires_at')) return {rows:[{is_expired:false}]};
    if (sql.includes('UPDATE booking_tokens SET body_sculpt_option')) {selected=values[1];return {rows:[],rowCount:1};}
    if (sql.includes('FROM booking_tokens bt')) {
      if (sql.includes('FOR UPDATE OF bt, m')) locked=true;
      return {rows:[{...member,member_id:7,verified_member_id:7,treatment_id:409,treatment_key:BODY_SCULPT_KEY,
        category_key:'private',token:'test-token',body_sculpt_option:selected,reserved_booking_month:selected?appointmentDate.slice(0,7)+'-01':null,used_at:null,is_expired:false}]};
    }
    if (sql.includes('INSERT INTO bookings')) {
      assert.equal(locked,true,'quota consumption must lock the member before inserting');
      bookings.push(values[5]);writes++;return {rows:[]};
    }
    if (sql.includes('UPDATE booking_tokens')) return {rows:[]};
    throw new Error('Unexpected query: '+sql);
  };
  pool.query=query;pool.connect=async()=>({query,release(){}});
  const call = async (path,extra={}) => {
    const res=response();await handler(path)({body:{token:'test-token',shopify_customer_id:'body-test',appointment_date:appointmentDate,...extra}},res);return res;
  };
  try {
    let res=await call('/validate-slot',fields('ems_lymph'));
    assert.equal(res.body.ok,true);assert.equal(selected,'ems_lymph');assert.equal(res.body.duration_minutes,60);
    res=await call('/consume',fields('ems_lymph'));
    assert.equal(res.body.ok,true);assert.equal(bookings.length,1);assert.equal(bookings[0],'ems_lymph');
    assert.equal(res.body.entitlements.privateProtocol.lymphdrainage.remaining,1);
    // Another booking can exhaust the add-on between slot validation and completion.
    bookings=['ems_lymph','ems_lymph'];locked=false;writes=0;
    res=await call('/consume',fields('ems_lymph'));
    assert.equal(res.body.error,'LYMPHDRAINAGE_LIMIT_REACHED');assert.equal(writes,0);
    res=await call('/validate-slot',fields('ems'));
    assert.equal(res.body.ok,true);assert.equal(selected,'ems');
    res=await call('/consume',fields('ems_lymph'));
    assert.equal(res.body.error,'BODY_SCULPT_OPTION_CHANGED');assert.equal(writes,0);
    bookings=[];
    res=await call('/consume',fields('ems_lymph'));
    assert.equal(res.body.error,'BODY_SCULPT_OPTION_CHANGED');
    res=await call('/validate-slot',{...fields('ems'),body_sculpt_duration_minutes:60});
    assert.equal(res.body.error,'BODY_SCULPT_VARIANT_MISMATCH');
    bookings=['ems','ems','ems_lymph','ems_lymph'];
    res=await call('/validate-slot',fields('ems'));assert.equal(res.body.error,'LIMIT_REACHED');
    res=await call('/consume',fields('ems'));assert.equal(res.body.error,'LIMIT_REACHED');assert.equal(writes,0);
  } finally {pool.query=original.query;pool.connect=original.connect;env.shopifyShop=original.shop;}
});
