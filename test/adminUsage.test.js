import assert from 'node:assert/strict';
import test from 'node:test';

import {
  AdminUsageError,
  cancelManualUsage,
  getFollowingAdminBookingMonth,
  normalizeAdminBookingMonth,
  recordManualUsage,
  validateManualUsageInput
} from '../src/services/adminUsage.service.js';

function createUsageDb({ member, treatment, existingBookings = [] }) {
  const bookings = [...existingBookings];
  const events = [];

  return {
    bookings,
    events,
    async query(sql, values) {
      if (sql.includes('FROM members') && sql.includes('FOR UPDATE')) {
        return { rows: member ? [member] : [] };
      }
      if (sql.includes('FROM treatments') && sql.includes('is_active = TRUE')) {
        return {
          rows: treatment && treatment.treatment_key === values[0] ? [treatment] : []
        };
      }
      if (sql.includes('SELECT t.category_key, t.treatment_key')) {
        return {
          rows: bookings
            .filter((booking) => booking.member_id === values[0])
            .filter((booking) => booking.booking_month === values[1])
            .filter((booking) => ['reserved', 'confirmed'].includes(booking.status))
            .map(() => ({
              category_key: treatment.category_key,
              treatment_key: treatment.treatment_key
            }))
        };
      }
      if (sql.includes('FROM member_monthly_usage_imports')) {
        return { rows: [] };
      }
      if (sql.includes('INSERT INTO bookings')) {
        const booking = {
          id: bookings.length + 1,
          member_id: values[0],
          treatment_id: values[1],
          booking_month: values[2],
          status: 'confirmed',
          source: 'admin_manual',
          admin_actor: values[3],
          admin_reason: values[4],
          booked_at: '2026-08-15T12:00:00.000Z',
          cancelled_at: null
        };
        bookings.push(booking);
        return { rows: [booking] };
      }
      if (sql.includes('INSERT INTO booking_admin_events')) {
        events.push({
          booking_id: values[0],
          member_id: values[1],
          actor: values[2],
          reason: values[3],
          metadata: JSON.parse(values[4])
        });
        return { rows: [] };
      }
      throw new Error(`Unexpected query in test: ${sql}`);
    }
  };
}

test('admin month validation accepts only real first-of-month dates', () => {
  assert.equal(normalizeAdminBookingMonth('2026-08-01'), '2026-08-01');
  assert.equal(normalizeAdminBookingMonth('2026-08-15'), null);
  assert.equal(normalizeAdminBookingMonth('2026-13-01'), null);
  assert.equal(getFollowingAdminBookingMonth('2026-12-01'), '2027-01-01');
});

test('manual usage requires an actor and an auditable reason', () => {
  assert.throws(
    () => validateManualUsageInput({
      treatment_key: 'beyond-example',
      booking_month: '2026-08-01',
      actor: '',
      reason: 'Vor Ort wahrgenommen'
    }),
    (error) => error instanceof AdminUsageError && error.code === 'ADMIN_ACTOR_REQUIRED'
  );
});

test('manual usage consumes the entitlement and creates an audit event', async () => {
  const member = { id: 7, package_key: 'beyond', status: 'active' };
  const treatment = {
    id: 12,
    treatment_key: 'beyond-example',
    title: 'BEYOND Beispiel',
    category_key: 'beyond'
  };
  const db = createUsageDb({ member, treatment });

  const result = await recordManualUsage(7, {
    treatment_key: treatment.treatment_key,
    booking_month: '2026-08-01',
    actor: 'Studioleitung',
    reason: 'Termin wurde bereits vor Ort wahrgenommen'
  }, db);

  assert.equal(result.booking.source, 'admin_manual');
  assert.equal(result.entitlements.remaining.beyond, 0);
  assert.equal(db.events.length, 1);
  assert.equal(db.events[0].metadata.bookingMonth, '2026-08-01');
});

test('manual usage cannot overbook an exhausted category', async () => {
  const member = { id: 7, package_key: 'beyond', status: 'active' };
  const treatment = {
    id: 12,
    treatment_key: 'beyond-example',
    title: 'BEYOND Beispiel',
    category_key: 'beyond'
  };
  const db = createUsageDb({
    member,
    treatment,
    existingBookings: [{
      id: 1,
      member_id: 7,
      treatment_id: 12,
      booking_month: '2026-08-01',
      status: 'confirmed'
    }]
  });

  await assert.rejects(
    () => recordManualUsage(7, {
      treatment_key: treatment.treatment_key,
      booking_month: '2026-08-01',
      actor: 'Studioleitung',
      reason: 'Doppelte Erfassung verhindern'
    }, db),
    (error) => error instanceof AdminUsageError && error.code === 'LIMIT_REACHED'
  );

  assert.equal(db.bookings.length, 1);
  assert.equal(db.events.length, 0);
});

test('manual usage rejects treatments outside the member package', async () => {
  const db = createUsageDb({
    member: { id: 9, package_key: 'pure', status: 'active' },
    treatment: {
      id: 15,
      treatment_key: 'define-example',
      title: 'DEFINE Beispiel',
      category_key: 'define'
    }
  });

  await assert.rejects(
    () => recordManualUsage(9, {
      treatment_key: 'define-example',
      booking_month: '2026-08-01',
      actor: 'Studioleitung',
      reason: 'Falsche Kategorie testen'
    }, db),
    (error) => error instanceof AdminUsageError && error.code === 'TREATMENT_NOT_ALLOWED'
  );
});

test('manual cancellation cannot alter an online booking', async () => {
  const db = {
    async query(sql) {
      if (sql.includes('FROM bookings b') && sql.includes('FOR UPDATE')) {
        return {
          rows: [{
            id: 42,
            member_id: 7,
            treatment_id: 12,
            booking_month: '2026-08-01',
            status: 'confirmed',
            source: 'online',
            treatment_key: 'beyond-example',
            category_key: 'beyond',
            package_key: 'beyond'
          }]
        };
      }
      throw new Error(`Unexpected query in test: ${sql}`);
    }
  };

  await assert.rejects(
    () => cancelManualUsage(42, {
      actor: 'Studioleitung',
      reason: 'Korrekturversuch'
    }, db),
    (error) => error instanceof AdminUsageError && error.code === 'BOOKING_NOT_MANUAL'
  );
});
