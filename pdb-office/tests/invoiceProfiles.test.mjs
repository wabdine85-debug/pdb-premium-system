import test from "node:test";
import assert from "node:assert/strict";

import {
  calculateInvoiceDueDate,
  getInvoiceCategoryLabel,
  getInvoiceDueLabel,
  getInvoicePositionDateLabel,
} from "../modules/invoices/invoiceProfiles.js";

test("uses a neutral date label for PDB invoices and treatment for medical invoices", () => {
  assert.equal(getInvoicePositionDateLabel({ id: "pdb-aesthetic-room" }), "Leistungs-/Lieferdatum");
  assert.equal(getInvoicePositionDateLabel({ id: "pdb-aesthetic-room" }, "product"), "Lieferdatum");
  assert.equal(getInvoicePositionDateLabel({ id: "pdb-aesthetic-room" }, "training"), "Leistungsdatum");
  assert.equal(getInvoicePositionDateLabel({ id: "medical-doctor" }), "Behandlung");
});

test("keeps a readable invoice category label for old and new PDB invoices", () => {
  assert.equal(getInvoiceCategoryLabel("voucher"), "Gutschein");
  assert.equal(getInvoiceCategoryLabel(""), "Allgemeine Leistung");
});

test("calculates standard payment terms from the invoice date", () => {
  assert.equal(calculateInvoiceDueDate("2026-08-06", "sofort"), "2026-08-06");
  assert.equal(calculateInvoiceDueDate("2026-08-06", "14"), "2026-08-20");
  assert.equal(calculateInvoiceDueDate("2026-08-06", "custom", "2026-09-01"), "2026-09-01");
});

test("prints immediate payment terms as sofort", () => {
  assert.equal(getInvoiceDueLabel({ paymentTerm: "sofort", dueDate: "2026-08-06" }), "sofort");
  assert.equal(getInvoiceDueLabel({ dueDate: "2026-08-20" }), "20.8.2026");
});
