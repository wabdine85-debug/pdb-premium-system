import test from 'node:test';
import assert from 'node:assert/strict';
import { getTreatmentEntitlementsForMonth } from '../src/services/entitlement.service.js';
import { BODY_SCULPT_KEY, BODY_SCULPT_OPTIONS, getBodySculptBookingError, getBodySculptSlotError } from '../src/utils/bodySculptRules.js';
const member = { id: 1, package_key: 'private', status: 'active' };
const treatment = { category_key: 'private', treatment_key: BODY_SCULPT_KEY };
const dbFor = rows => ({ async query(sql) {
  return { rows: sql.includes('FROM member_monthly_usage_imports') ? [] : rows };
} });
const row = option => ({ ...treatment, body_sculpt_option: option });

test('Body Sculpt counts four EMS visits and only two optional lymphdrainages', async () => {
  for (const options of [[], ['ems'], ['ems_lymph'], ['ems', 'ems_lymph', 'ems_lymph'],
    ['ems_lymph', 'ems', 'ems', 'ems_lymph']]) {
    const state = await getTreatmentEntitlementsForMonth(member, treatment, '2026-10-01', dbFor(options.map(row)));
    assert.equal(state.remaining.private, 4-options.length);
    assert.equal(state.privateProtocol.lymphdrainage.remaining, 2-options.filter(o => o==='ems_lymph').length);
    assert.equal(state.privateProtocol.sessionLimit, 4);
    assert.equal(getBodySculptBookingError(BODY_SCULPT_KEY, 'ems', state), null);
    assert.equal(getBodySculptBookingError(BODY_SCULPT_KEY, 'ems_lymph', state),
      state.privateProtocol.lymphdrainage.remaining ? null : 'LYMPHDRAINAGE_LIMIT_REACHED');
  }
});

test('two combinations leave EMS-only available; cancelled rows free both quotas', async () => {
  const exhausted = await getTreatmentEntitlementsForMonth(member,treatment,'2026-10-01',dbFor([row('ems_lymph'),row('ems_lymph')]));
  assert.equal(exhausted.remaining.private,2);
  assert.equal(getBodySculptBookingError(BODY_SCULPT_KEY,'ems_lymph',exhausted),'LYMPHDRAINAGE_LIMIT_REACHED');
  // Entitlement SQL admits only confirmed/reserved bookings; a cancelled booking is absent.
  const cancelled = await getTreatmentEntitlementsForMonth(member,treatment,'2026-10-01',dbFor([row('ems_lymph')]));
  assert.equal(cancelled.remaining.private,3);
  assert.equal(cancelled.privateProtocol.lymphdrainage.remaining,1);
  const nextMonth = await getTreatmentEntitlementsForMonth(member,treatment,'2026-11-01',dbFor([]));
  assert.equal(nextMonth.remaining.private,4);
  assert.equal(nextMonth.privateProtocol.lymphdrainage.remaining,2);
});

test('Body Sculpt rejects omitted, malformed and foreign selections', () => {
  for (const option of [null,undefined,'',false,0,{},['ems'],'other']) {
    assert.equal(getBodySculptBookingError(BODY_SCULPT_KEY, option, {}),'BODY_SCULPT_OPTION_REQUIRED');
  }
  assert.equal(getBodySculptBookingError('private-hifu-total-face','ems',{}),'BODY_SCULPT_OPTION_NOT_ALLOWED');
  assert.equal(getBodySculptBookingError('private-hifu-total-face',null,{}),null);
});

test('Body Sculpt verifies variant identity and its real slot duration', () => {
  for (const [option, expected] of Object.entries(BODY_SCULPT_OPTIONS)) {
    const input = {body_sculpt_option:option,body_sculpt_variant_id:expected.variantId,
      body_sculpt_duration_minutes:expected.durationMinutes};
    assert.equal(getBodySculptSlotError(BODY_SCULPT_KEY,input),null);
    assert.equal(getBodySculptSlotError(BODY_SCULPT_KEY,{...input,body_sculpt_duration_minutes:90}),'BODY_SCULPT_VARIANT_MISMATCH');
    assert.equal(getBodySculptSlotError(BODY_SCULPT_KEY,{...input,body_sculpt_variant_id:'other'}),'BODY_SCULPT_VARIANT_MISMATCH');
  }
});
