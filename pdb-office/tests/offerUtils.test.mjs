import test from "node:test";
import assert from "node:assert/strict";

import { createInvoiceFromOffer, createOfferFromInvoice, getOfferValidityLabel } from "../modules/invoices/offerUtils.js";

const profile = {
  id: "medical-doctor",
  invoicePrefix: "MED-RE",
  nextInvoiceNumber: 1011,
  offerPrefix: "MED-AN-",
  nextOfferNumber: 1003,
};

test("moves an invoice into an offer without carrying payment state", () => {
  const invoice = {
    id: "invoice-yvonne-1",
    number: "MED-RE1010",
    invoiceProfileId: "medical-doctor",
    memberId: "yvonne",
    memberName: "Yvonne Beispiel",
    date: "2026-08-30",
    dueDate: "2026-09-13",
    paymentTerm: "14",
    status: "ausstehend",
    paymentMethod: "",
    paidDate: "",
    invoiceNote: "Bitte beachten",
    items: [{ desc: "Behandlung", qty: 1, price: 180 }],
    total: 180,
    createdAt: "2026-08-30T10:00:00.000Z",
  };

  const offer = createOfferFromInvoice(invoice, profile, {
    id: "offer-yvonne-1",
    createdAt: "2026-08-31T10:00:00.000Z",
  });

  assert.equal(offer.id, "offer-yvonne-1");
  assert.equal(offer.number, "MED-AN-1003");
  assert.equal(offer.status, "entwurf");
  assert.equal(offer.validUntil, "2026-09-13");
  assert.equal(offer.sourceInvoiceNumber, "MED-RE1010");
  assert.equal(offer.offerNote, "Bitte beachten");
  assert.equal(offer.dueDate, undefined);
  assert.equal(offer.paymentTerm, undefined);
  assert.equal(offer.paymentMethod, undefined);
  assert.deepEqual(offer.items, invoice.items);
});

test("creates a fresh invoice number when an offer is accepted", () => {
  const offer = {
    id: "offer-yvonne-1",
    number: "MED-AN-1003",
    invoiceProfileId: "medical-doctor",
    memberId: "yvonne",
    memberName: "Yvonne Beispiel",
    date: "2026-08-31",
    validUntil: "2026-09-14",
    status: "angenommen",
    offerNote: "Bitte beachten",
    items: [{ desc: "Behandlung", qty: 1, price: 180 }],
    total: 180,
    createdAt: "2026-08-31T10:00:00.000Z",
  };

  const invoice = createInvoiceFromOffer(offer, profile, {
    id: "invoice-yvonne-new",
    createdAt: "2026-09-02T09:00:00.000Z",
  });

  assert.equal(invoice.number, "MED-RE1011");
  assert.equal(invoice.date, "2026-09-02");
  assert.equal(invoice.dueDate, "2026-09-16");
  assert.equal(invoice.status, "ausstehend");
  assert.equal(invoice.sourceOfferNumber, "MED-AN-1003");
  assert.equal(invoice.invoiceNote, "Bitte beachten");
  assert.equal(invoice.validUntil, undefined);
});

test("formats the offer validity date for the German UI", () => {
  assert.equal(getOfferValidityLabel({ validUntil: "2026-09-14" }), "14.9.2026");
  assert.equal(getOfferValidityLabel({}), "ohne Befristung");
});
