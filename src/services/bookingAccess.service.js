import { pool } from '../config/pool.js';
import {
  findActiveApplicationForBooking,
  hasActiveBookingTestAccess
} from '../repositories/contract.repository.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const BUSINESS_TIME_ZONE = 'Europe/Berlin';

export function calculateBookingAccess(application, now = new Date()) {
  if (!application) {
    return {
      allowed: true,
      reason: null,
      available_at: null,
      treatment_allowed: true,
      treatment_available_at: null,
      treatment_reason: null
    };
  }

  const startsOn = dayjs.tz(String(application.starts_on), BUSINESS_TIME_ZONE).startOf('day');
  const activatedAt = dayjs(application.activated_at);
  if (!startsOn.isValid() || !activatedAt.isValid()) {
    return {
      allowed: false,
      reason: 'BOOKING_ACCESS_UNAVAILABLE',
      available_at: null,
      treatment_allowed: false,
      treatment_available_at: null,
      treatment_reason: 'TREATMENT_ACCESS_UNAVAILABLE'
    };
  }

  const withdrawalEndsAt = application.early_start_requested_at
    ? activatedAt
    : activatedAt.tz(BUSINESS_TIME_ZONE).add(15, 'day').startOf('day');
  const treatmentAvailableAt = startsOn.isAfter(withdrawalEndsAt) ? startsOn : withdrawalEndsAt;
  const treatmentAllowed = dayjs(now).isAfter(treatmentAvailableAt) || dayjs(now).isSame(treatmentAvailableAt);
  const treatmentReason = treatmentAllowed
    ? null
    : startsOn.isAfter(withdrawalEndsAt)
      ? 'CONTRACT_NOT_STARTED'
      : 'WITHDRAWAL_PERIOD_ACTIVE';

  return {
    // Appointment planning is available as soon as the contract is activated.
    // The selected treatment date is checked separately against treatment_available_at.
    allowed: true,
    reason: null,
    available_at: activatedAt.toISOString(),
    treatment_allowed: treatmentAllowed,
    treatment_available_at: treatmentAvailableAt.toISOString(),
    treatment_reason: treatmentReason
  };
}

export function calculateBookingAccessWithTestOverride(application, testAccessActive, now = new Date()) {
  if (application && testAccessActive) {
    return {
      ...calculateBookingAccess(application, now),
      allowed: true,
      reason: 'ADMIN_TEST_ACCESS',
      available_at: null
    };
  }
  return calculateBookingAccess(application, now);
}

export function isTreatmentDateAllowed(appointmentDate, treatmentAvailableAt) {
  if (!treatmentAvailableAt) return true;
  const appointmentDay = dayjs.tz(String(appointmentDate).slice(0, 10), BUSINESS_TIME_ZONE).startOf('day');
  const availableDay = dayjs(treatmentAvailableAt).tz(BUSINESS_TIME_ZONE).startOf('day');
  if (!appointmentDay.isValid() || !availableDay.isValid()) return false;
  return appointmentDay.isAfter(availableDay) || appointmentDay.isSame(availableDay);
}

export async function getMemberBookingAccess(memberId, db = pool, now = new Date()) {
  const application = await findActiveApplicationForBooking(memberId, db);
  const testAccessActive = application
    ? await hasActiveBookingTestAccess(application.id, db)
    : false;
  return calculateBookingAccessWithTestOverride(application, testAccessActive, now);
}
