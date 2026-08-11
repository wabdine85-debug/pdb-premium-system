import { pool } from '../config/pool.js';
import { findActiveApplicationForBooking } from '../repositories/contract.repository.js';
import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc.js';
import timezone from 'dayjs/plugin/timezone.js';

dayjs.extend(utc);
dayjs.extend(timezone);

const BUSINESS_TIME_ZONE = 'Europe/Berlin';

export function calculateBookingAccess(application, now = new Date()) {
  if (!application) {
    return { allowed: true, reason: null, available_at: null };
  }

  const startsOn = dayjs.tz(String(application.starts_on), BUSINESS_TIME_ZONE).startOf('day');
  const activatedAt = dayjs(application.activated_at);
  if (!startsOn.isValid() || !activatedAt.isValid()) {
    return { allowed: false, reason: 'BOOKING_ACCESS_UNAVAILABLE', available_at: null };
  }

  const withdrawalEndsAt = application.early_start_requested_at
    ? activatedAt
    : activatedAt.tz(BUSINESS_TIME_ZONE).add(15, 'day').startOf('day');
  const availableAt = startsOn.isAfter(withdrawalEndsAt) ? startsOn : withdrawalEndsAt;
  const allowed = dayjs(now).isAfter(availableAt) || dayjs(now).isSame(availableAt);
  const reason = allowed
    ? null
    : startsOn.isAfter(withdrawalEndsAt)
      ? 'CONTRACT_NOT_STARTED'
      : 'WITHDRAWAL_PERIOD_ACTIVE';

  return { allowed, reason, available_at: availableAt.toISOString() };
}

export async function getMemberBookingAccess(memberId, db = pool, now = new Date()) {
  const application = await findActiveApplicationForBooking(memberId, db);
  return calculateBookingAccess(application, now);
}
