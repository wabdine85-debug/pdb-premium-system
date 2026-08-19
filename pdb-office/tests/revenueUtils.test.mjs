import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import test from "node:test";
import { entryTotals, monthSummary, normalizeRevenueEntry, reportFromMonth, reportToCsv } from "../modules/revenue/revenueUtils.js";

const privateSeedUrl = new URL("../data/revenue-seed-2026.json", import.meta.url);
const hasPrivateSeed = existsSync(privateSeedUrl);
const seed = hasPrivateSeed
  ? JSON.parse(await fs.readFile(privateSeedUrl, "utf8"))
  : { entries: [], premiumFallbacks: {} };

test("daily totals separate business and personal inflows", () => {
  assert.deepEqual(entryTotals({ cash: 100, cashBusiness: 80, card: 200, paypalPrivate: 50, shopify: 20 }), {
    business: 400,
    personal: 50,
    total: 450,
  });
});

test("all historical cash columns merge into one business cash channel", () => {
  const legacyEntry = { cash: 75, cashBusiness: 125, cashPrivate: 10, barPrivat: 5 };
  assert.deepEqual(entryTotals(legacyEntry), {
    business: 215,
    personal: 0,
    total: 215,
  });
  const normalized = normalizeRevenueEntry(legacyEntry);
  assert.equal(normalized.cash, 215);
  assert.equal("cashBusiness" in normalized, false);
  assert.equal("cashPrivate" in normalized, false);
  assert.equal("barPrivat" in normalized, false);
});

test("private PayPal remains separated while cash is revenue", () => {
  assert.deepEqual(entryTotals({ cash: 75, paypalPrivate: 25 }), {
    business: 75,
    personal: 25,
    total: 100,
  });
});

test("January import reconciles with the live member-finance premium", { skip: !hasPrivateSeed }, () => {
  const summary = monthSummary(seed.entries, "2026-01", 7669);
  assert.equal(summary.businessWithoutPremium, 26499.7);
  assert.equal(summary.personal, 1202);
  assert.equal(summary.business, 34168.7);
  assert.equal(summary.total, 35370.7);
  assert.equal(summary.activeDays, 23);
});

test("August total changes when member finance replaces the Excel fallback", { skip: !hasPrivateSeed }, () => {
  assert.equal(monthSummary(seed.entries, "2026-08", seed.premiumFallbacks["2026-08"]).total, 13710);
  assert.equal(monthSummary(seed.entries, "2026-08", 12233).total, 13312);
});

test("monthly report CSV keeps the audit totals", { skip: !hasPrivateSeed }, () => {
  const report = reportFromMonth({ entries: seed.entries, month: "2026-02", premium: 7947, version: 1 });
  const csv = reportToCsv(report);
  assert.match(csv, /Geschäftsumsatz;/);
  assert.match(csv, /Persönliche Zuflüsse;/);
  assert.match(csv, /Gesamtzufluss;44273\.5/);
});
