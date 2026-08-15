import test from "node:test";
import assert from "node:assert/strict";
import { buildInvoicePdf, createInvoicePdfDownload } from "../modules/invoices/invoicePdf.js";

test("buildInvoicePdf creates a valid PDF document", () => {
  const invoice = {
    number: "PDB-RE1002",
    memberName: "Anastasija Mitic",
    customerAddress: "Musterstraße 1\n50667 Köln",
    date: "2026-08-06",
    paymentTerm: "sofort",
    status: "bezahlt",
    paidDate: "2026-08-06",
    paymentMethod: "Bar",
    invoiceCategory: "product",
    taxRate: 19,
    net: 783.85,
    tax: 148.93,
    total: 932.78,
    items: [{ desc: "Pflegeprodukt", qty: 1, price: 932.78, treatmentDate: "2026-08-06" }],
  };
  const profile = {
    id: "pdb-aesthetic-room",
    companyName: "PDB Aesthetic Room",
    companyAddress: "Musterweg 2\n50667 Köln",
    companyEmail: "info@example.de",
    taxNumber: "123/456/789",
    defaultTaxRate: 19,
    pdfDesignVariant: "pdb-premium",
  };

  const bytes = new Uint8Array(buildInvoicePdf(invoice, profile).output("arraybuffer"));
  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF");
  assert.ok(bytes.length > 1_000);
  assert.match(buildInvoicePdf(invoice, profile).internal.pages.flat().join("\n"), /Bar/);
});

test("createInvoicePdfDownload returns a native PDF download target", () => {
  const invoice = {
    number: "PDB-RE1002",
    memberName: "Anastasija Mitic",
    date: "2026-08-06",
    paymentTerm: "sofort",
    items: [{ desc: "Produkt", qty: 1, price: 100 }],
    net: 84.03,
    tax: 15.97,
    total: 100,
  };
  const profile = { id: "pdb-aesthetic-room", companyName: "PDB Aesthetic Room", defaultTaxRate: 19 };
  const download = createInvoicePdfDownload(invoice, profile);
  assert.equal(download.fileName, "Anastasija-Mitic_PDB-RE1002.pdf");
  assert.match(download.base64, /^[A-Za-z0-9+/=]+$/);
  assert.equal(new TextDecoder().decode(Uint8Array.from(Buffer.from(download.base64, "base64")).slice(0, 4)), "%PDF");
});
