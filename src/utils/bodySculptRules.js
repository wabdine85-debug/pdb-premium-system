export const BODY_SCULPT_KEY = 'private-body-sculpt-intensive';
export const BODY_SCULPT_OPTIONS = Object.freeze({
  ems: Object.freeze({ variantId: '59265461846280', durationMinutes: 30, includesLymphdrainage: false }),
  ems_lymph: Object.freeze({ variantId: '59265461879048', durationMinutes: 60, includesLymphdrainage: true })
});

export function getBodySculptLymphdrainage(bookings) {
  const used = bookings.filter(booking =>
    booking.treatment_key === BODY_SCULPT_KEY && booking.body_sculpt_option === 'ems_lymph'
  ).length;
  return { limit: 2, used, remaining: Math.max(0, 2 - used) };
}

export function getBodySculptBookingError(treatmentKey, option, entitlements) {
  if (treatmentKey !== BODY_SCULPT_KEY) {
    return option == null ? null : 'BODY_SCULPT_OPTION_NOT_ALLOWED';
  }
  if (typeof option !== 'string' || !Object.hasOwn(BODY_SCULPT_OPTIONS, option)) return 'BODY_SCULPT_OPTION_REQUIRED';
  if (option === 'ems_lymph' && (entitlements?.privateProtocol?.lymphdrainage?.remaining ?? 0) <= 0) {
    return 'LYMPHDRAINAGE_LIMIT_REACHED';
  }
  return null;
}

export function getBodySculptSlotError(treatmentKey, input) {
  if (treatmentKey !== BODY_SCULPT_KEY) return null;
  const option = input?.body_sculpt_option;
  if (typeof option !== 'string' || !Object.hasOwn(BODY_SCULPT_OPTIONS, option)) {
    return 'BODY_SCULPT_OPTION_REQUIRED';
  }
  const expected = BODY_SCULPT_OPTIONS[option];
  if (String(input.body_sculpt_variant_id) !== expected.variantId ||
      input.body_sculpt_duration_minutes !== expected.durationMinutes) {
    return 'BODY_SCULPT_VARIANT_MISMATCH';
  }
  return null;
}
