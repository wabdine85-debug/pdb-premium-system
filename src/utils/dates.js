import dayjs from 'dayjs';

export function getCurrentMonthStart() {
  return dayjs().startOf('month').format('YYYY-MM-DD');
}

export function getCurrentMonthEnd() {
  return dayjs().endOf('month').format('YYYY-MM-DD');
}

export function getBookingMonth() {
  // wichtig: wir speichern immer den 1. des Monats
  return dayjs().startOf('month').format('YYYY-MM-DD');
}

export function getNextBookingMonth() {
  return dayjs().add(1, 'month').startOf('month').format('YYYY-MM-DD');
}

export function getBookingMonthForAppointmentDate(appointmentDate) {
  const value = String(appointmentDate || '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const parsedDate = dayjs(value);

  if (!parsedDate.isValid() || parsedDate.format('YYYY-MM-DD') !== value) {
    return null;
  }

  return parsedDate.startOf('month').format('YYYY-MM-DD');
}

export function isCurrentOrNextBookingMonth(bookingMonth) {
  return bookingMonth === getBookingMonth() || bookingMonth === getNextBookingMonth();
}
