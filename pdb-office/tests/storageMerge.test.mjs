import test from "node:test";
import assert from "node:assert/strict";
import { rebaseDataChange } from "../services/storageMerge.js";

test("rebases a new invoice without replacing newer revenue or work time", () => {
  const previous = {
    invoices: [{ id: "old", number: "RE1" }],
    revenueEntries: [{ id: "revenue", amount: 10 }],
    workTimeEntries: [{ id: "time", hours: 4 }],
  };
  const next = {
    ...previous,
    invoices: [...previous.invoices, { id: "new", number: "RE2" }],
  };
  const current = {
    invoices: previous.invoices,
    revenueEntries: [{ id: "revenue", amount: 20 }, { id: "server-revenue", amount: 30 }],
    workTimeEntries: [{ id: "time", hours: 8 }],
  };

  const rebased = rebaseDataChange(previous, next, current);
  assert.deepEqual(rebased.invoices.map(invoice => invoice.id), ["old", "new"]);
  assert.deepEqual(rebased.revenueEntries, current.revenueEntries);
  assert.deepEqual(rebased.workTimeEntries, current.workTimeEntries);
});

test("applies only the locally edited record to the current collection", () => {
  const previous = { invoices: [{ id: "a", status: "offen" }, { id: "b", status: "offen" }] };
  const next = { invoices: [{ id: "a", status: "bezahlt" }, { id: "b", status: "offen" }] };
  const current = { invoices: [{ id: "a", status: "offen" }, { id: "b", status: "gemahnt" }] };

  assert.deepEqual(rebaseDataChange(previous, next, current).invoices, [
    { id: "a", status: "bezahlt" },
    { id: "b", status: "gemahnt" },
  ]);
});
