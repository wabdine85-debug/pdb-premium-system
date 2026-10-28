function isoDate(date) {
  return date.toISOString().slice(0, 10);
}

function berlinDate(now) {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Berlin' }).format(now);
}

function easterSunday(year) {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  return new Date(Date.UTC(year, month - 1, (h + l - 7 * m + 114) % 31 + 1));
}

export function firstBankingDay(year, monthIndex) {
  const easter = easterSunday(year);
  const goodFriday = new Date(easter);
  goodFriday.setUTCDate(easter.getUTCDate() - 2);
  const easterMonday = new Date(easter);
  easterMonday.setUTCDate(easter.getUTCDate() + 1);
  const closed = new Set([
    `${year}-01-01`, `${year}-05-01`, `${year}-12-25`, `${year}-12-26`,
    isoDate(goodFriday), isoDate(easterMonday)
  ]);
  const date = new Date(Date.UTC(year, monthIndex, 1));
  while ([0, 6].includes(date.getUTCDay()) || closed.has(isoDate(date))) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return isoDate(date);
}

export function isValidContractStart(value, now = new Date()) {
  if (!/^\d{4}-\d{2}-01$/.test(value)) return false;
  const [year, month] = berlinDate(now).split('-').map(Number);
  const earliest = isoDate(new Date(Date.UTC(year, month, 1)));
  const latest = isoDate(new Date(Date.UTC(year, month + 5, 1)));
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && isoDate(date) === value && value >= earliest && value <= latest;
}

export function contractDebitSchedule(application) {
  const start = application.starts_on instanceof Date
    ? isoDate(application.starts_on)
    : String(application.starts_on).slice(0, 10);
  if (!/^\d{4}-\d{2}-01$/.test(start)) throw new Error('INVALID_CONTRACT_START');
  const [year, month] = start.split('-').map(Number);
  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 + index, 1));
    return {
      date: firstBankingDay(date.getUTCFullYear(), date.getUTCMonth()),
      amountCents: application.monthly_price_cents + (index === 0 ? application.setup_fee_cents : 0)
    };
  });
}

export function hasPrenotificationLeadTime(application, now = new Date()) {
  const firstDebit = contractDebitSchedule(application)[0].date;
  return (Date.parse(`${firstDebit}T00:00:00Z`) - Date.parse(`${berlinDate(now)}T00:00:00Z`)) / 86_400_000 >= 2;
}
