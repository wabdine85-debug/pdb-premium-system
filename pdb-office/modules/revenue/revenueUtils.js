export const REVENUE_CHANNELS = [
  { key: "cash", label: "BAR", shortLabel: "Bar", group: "business", color: "#171717" },
  { key: "card", label: "KARTE", shortLabel: "Karte", group: "business", color: "#75624a" },
  { key: "shopify", label: "SHOPIFY", shortLabel: "Shopify", group: "business", color: "#6c7f65" },
  { key: "paypalPrivate", label: "PAYPAL PRIVAT", shortLabel: "PayPal Privat", group: "personal", color: "#9a8d7b" },
  { key: "paypalBusiness", label: "PAYPAL BUSINESS", shortLabel: "PayPal Business", group: "business", color: "#596a79" },
  { key: "treatwell", label: "TREATWELL", shortLabel: "Treatwell", group: "business", color: "#9a675a" },
];

// Older imports used a second cash column. Keep those values, but expose and
// persist only one clear "Bar" channel in the current journal.
export const LEGACY_CASH_KEYS = ["cashBusiness", "cashPrivate", "privateCash", "barPrivate", "barPrivat"];

export const STAFF_MEMBERS = ["Wafa", "Nabila", "Shazia", "Raffaela"];

export function roundMoney(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

const NON_REVENUE_ADJUSTMENT_TYPES = new Set(["setup-fee", "overpayment", "refund"]);

export function bookedMembershipAdjustments(adjustments = [], month = "") {
  return roundMoney(adjustments
    .filter(entry => entry.serviceMonth === month)
    .filter(entry => entry.status === "gebucht")
    .filter(entry => !NON_REVENUE_ADJUSTMENT_TYPES.has(entry.type))
    .reduce((sum, entry) => sum + (Number(entry.amount) || 0), 0));
}

export function recognizedMembershipRevenue(baseAmount = 0, adjustments = [], month = "") {
  return roundMoney(Number(baseAmount || 0) + bookedMembershipAdjustments(adjustments, month));
}

export function revenueChannelAmount(entry = {}, channelKey) {
  const currentAmount = Number(entry[channelKey]) || 0;
  if (channelKey !== "cash") return currentAmount;
  return currentAmount + LEGACY_CASH_KEYS.reduce((sum, key) => sum + (Number(entry[key]) || 0), 0);
}

export function normalizeRevenueEntry(entry = {}) {
  const normalized = { ...entry, cash: roundMoney(revenueChannelAmount(entry, "cash")) };
  LEGACY_CASH_KEYS.forEach(key => delete normalized[key]);
  return normalized;
}

export function entryTotals(entry = {}) {
  const business = REVENUE_CHANNELS
    .filter(channel => channel.group === "business")
    .reduce((sum, channel) => sum + revenueChannelAmount(entry, channel.key), 0);
  const personal = REVENUE_CHANNELS
    .filter(channel => channel.group === "personal")
    .reduce((sum, channel) => sum + revenueChannelAmount(entry, channel.key), 0);
  return {
    business: roundMoney(business),
    personal: roundMoney(personal),
    total: roundMoney(business + personal),
  };
}

export function monthEntries(entries = [], month = "") {
  return entries
    .filter(entry => entry.date?.startsWith(month))
    .sort((left, right) => left.date.localeCompare(right.date));
}

export function monthSummary(entries = [], month = "", premium = 0) {
  const rows = monthEntries(entries, month);
  const channelTotals = Object.fromEntries(REVENUE_CHANNELS.map(channel => [channel.key, 0]));
  let businessWithoutPremium = 0;
  let personal = 0;

  rows.forEach(entry => {
    REVENUE_CHANNELS.forEach(channel => {
      channelTotals[channel.key] += revenueChannelAmount(entry, channel.key);
    });
    const totals = entryTotals(entry);
    businessWithoutPremium += totals.business;
    personal += totals.personal;
  });

  const premiumAmount = roundMoney(premium);
  const business = roundMoney(businessWithoutPremium + premiumAmount);
  return {
    month,
    rows,
    channelTotals: Object.fromEntries(Object.entries(channelTotals).map(([key, value]) => [key, roundMoney(value)])),
    businessWithoutPremium: roundMoney(businessWithoutPremium),
    premium: premiumAmount,
    business,
    personal: roundMoney(personal),
    total: roundMoney(business + personal),
    activeDays: rows.filter(entry => entryTotals(entry).total > 0).length,
  };
}

export function monthLabel(month, options = { month: "long", year: "numeric" }) {
  if (!month) return "—";
  return new Date(`${month}-01T12:00:00`).toLocaleDateString("de-DE", options);
}

export function dateLabel(date) {
  if (!date) return "—";
  return new Date(`${date}T12:00:00`).toLocaleDateString("de-DE", {
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
  });
}

export function daysInMonth(month) {
  if (!month) return [];
  const [year, monthNumber] = month.split("-").map(Number);
  const count = new Date(year, monthNumber, 0).getDate();
  return Array.from({ length: count }, (_, index) => `${month}-${String(index + 1).padStart(2, "0")}`);
}

export function reportFromMonth({ entries, month, premium, version = 1 }) {
  const summary = monthSummary(entries, month, premium);
  return {
    id: `revenue-report-${month}-v${version}`,
    month,
    version,
    createdAt: new Date().toISOString(),
    premiumSource: "Member Finanzen",
    entries: summary.rows.map(entry => ({ ...entry })),
    summary: {
      channelTotals: summary.channelTotals,
      businessWithoutPremium: summary.businessWithoutPremium,
      premium: summary.premium,
      business: summary.business,
      personal: summary.personal,
      total: summary.total,
      activeDays: summary.activeDays,
    },
  };
}

function csvValue(value) {
  const text = String(value ?? "");
  return /[;"\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function reportToCsv(report) {
  const lines = [
    ["Datum", ...REVENUE_CHANNELS.map(channel => channel.label), "Tagessumme", "Notiz"],
    ...(report.entries || []).map(entry => [
      entry.date,
      ...REVENUE_CHANNELS.map(channel => roundMoney(revenueChannelAmount(entry, channel.key))),
      entryTotals(entry).total,
      entry.note || "",
    ]),
    [],
    ["Monat", report.month],
    ["Geschäftsumsatz ohne Premium", report.summary.businessWithoutPremium],
    ["Premium", report.summary.premium],
    ["Geschäftsumsatz", report.summary.business],
    ["Persönliche Zuflüsse", report.summary.personal],
    ["Gesamtzufluss", report.summary.total],
  ];
  return `\ufeff${lines.map(row => row.map(csvValue).join(";")).join("\n")}`;
}

export function downloadTextFile(content, fileName, type = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
