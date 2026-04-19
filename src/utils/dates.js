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