import test from "node:test";
import assert from "node:assert/strict";
import { createRevenueEntryRevision, revenueEntryHasChanges, undoRevenueEntry } from "../modules/revenue/revenueHistory.js";

test("stores the previous day entry and restores it once", () => {
  const saved = { id: "revenue-2026-08-03", date: "2026-08-03", cash: 1000, card: 0, shopify: 79, note: "", source: "Import" };
  const draft = { ...saved, cash: 0, card: 150, shopify: 0 };
  const changed = createRevenueEntryRevision(draft, saved, "2026-08-07T19:31:00.000Z");
  assert.equal(changed.undoSnapshot.cash, 1000);
  assert.equal(revenueEntryHasChanges(draft, saved), true);

  const restored = undoRevenueEntry(changed, "2026-08-07T19:32:00.000Z");
  assert.equal(restored.cash, 1000);
  assert.equal(restored.shopify, 79);
  assert.equal(restored.undoSnapshot, undefined);
});
