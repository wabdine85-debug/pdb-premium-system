import test from "node:test";
import assert from "node:assert/strict";
import { getInvoiceBranding, resolveInvoiceLogoUrl } from "../modules/invoices/invoiceBranding.js";

test("uses the deployed Office logo path for existing PDB profile paths", () => {
  assert.equal(resolveInvoiceLogoUrl({ id: "pdb-aesthetic-room", logoUrl: "/pdb-logo.png" }), "/office/pdb-logo.png");
  assert.equal(resolveInvoiceLogoUrl({ id: "medical-doctor", logoUrl: "" }), "/office/pdb-logo.png");
  assert.equal(resolveInvoiceLogoUrl({ id: "medical-doctor", logoUrl: "https://example.test/medical-logo.png" }), "https://example.test/medical-logo.png");
  assert.equal(resolveInvoiceLogoUrl({ id: "custom-profile", logoUrl: "" }), "");
});

test("keeps the sender name and postal address on deliberate separate lines", () => {
  const branding = getInvoiceBranding({
    id: "medical-doctor",
    companyName: "Dr. Wafa Ahmed - Ärztliche Praxis - PDB Aesthetic Room",
    companyAddress: "Rheinstraße 59\n65185 Wiesbaden\n0178 - 600 11 03",
    pdfDesignVariant: "medical-clean",
  });

  assert.equal(branding.headerPrimary, "Dr. Wafa Ahmed - Ärztliche Praxis");
  assert.equal(branding.headerBrand, "PDB Aesthetic Room");
  assert.equal(branding.senderAddress, "Rheinstraße 59, 65185 Wiesbaden");
  assert.doesNotMatch(branding.senderAddress, /0178/);
});
