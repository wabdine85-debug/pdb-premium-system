import test from "node:test";
import assert from "node:assert/strict";
import { normalizePriceInput, parseLocalizedNumber, toPriceInput } from "../modules/invoices/invoiceInputs.js";
import { calculateInvoiceTotals } from "../modules/invoices/invoiceProfiles.js";

test("accepts German comma prices and international decimal input", () => {
  assert.equal(parseLocalizedNumber("125,50"), 125.5);
  assert.equal(parseLocalizedNumber("125.50"), 125.5);
  assert.equal(parseLocalizedNumber("1.234,56 €"), 1234.56);
});

test("keeps an editable German price draft", () => {
  assert.equal(normalizePriceInput(""), "");
  assert.equal(normalizePriceInput(",5"), "0,5");
  assert.equal(normalizePriceInput("125.50"), "125,50");
  assert.equal(normalizePriceInput("125,509"), "125,50");
});

test("does not force a zero into an empty new price field", () => {
  assert.equal(toPriceInput(0), "");
  assert.equal(toPriceInput(125.5), "125,5");
});

test("calculates the invoice total from a comma price draft", () => {
  const totals = calculateInvoiceTotals([{ qty: 2, price: "125,50" }], 19);
  assert.equal(totals.total, 251);
});
