import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildInvoicePdf, buildOfferPdf, createInvoicePdfDownload, createOfferPdfDownload } from "../modules/invoices/invoicePdf.js";

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

test("embeds the configured PDB logo in a medical invoice PDF", () => {
  const logo = fs.readFileSync(new URL("../public/pdb-logo.png", import.meta.url)).toString("base64");
  const invoice = {
    number: "MED-RE1003",
    memberName: "Anna Beispiel",
    customerAddress: "Rheinstraße 1\n65185 Wiesbaden",
    date: "2026-08-26",
    paymentTerm: "14",
    dueDate: "2026-09-09",
    items: [{ desc: "Behandlung", qty: 1, price: 125.5, treatmentDate: "2026-08-26" }],
    net: 125.5,
    tax: 0,
    total: 125.5,
  };
  const profile = {
    id: "medical-doctor",
    companyName: "Dr. Wafa Ahmed - Ärztliche Praxis - PDB Aesthetic Room",
    companyAddress: "Rheinstraße 59\n65185 Wiesbaden\n0178 - 600 11 03",
    companyEmail: "info@palaisdebeaute.de",
    defaultTaxRate: 0,
    pdfDesignVariant: "medical-clean",
    pdfLogoDataUrl: `data:image/png;base64,${logo}`,
  };

  const pdf = buildInvoicePdf(invoice, profile);
  assert.ok(pdf.getImageProperties(profile.pdfLogoDataUrl).width > 0);
  assert.ok(pdf.output("arraybuffer").byteLength > 20_000);
});

test("creates a valid offer PDF with offer-specific metadata and filename", () => {
  const offer = {
    number: "MED-AN-1001",
    memberName: "Yvonne Beispiel",
    customerAddress: "Rheinstraße 1\n65185 Wiesbaden",
    date: "2026-08-31",
    validUntil: "2026-09-14",
    status: "entwurf",
    items: [{ desc: "Geplante Behandlung", qty: 1, price: 250, treatmentDate: "2026-09-20" }],
    net: 250,
    tax: 0,
    total: 250,
  };
  const profile = { id: "medical-doctor", companyName: "Ärztliche Praxis", defaultTaxRate: 0, pdfDesignVariant: "medical-clean" };
  const pdf = buildOfferPdf(offer, profile);
  const bytes = new Uint8Array(pdf.output("arraybuffer"));
  const pageCommands = pdf.internal.pages.flat().join("\n");
  const download = createOfferPdfDownload(offer, profile);

  assert.equal(new TextDecoder().decode(bytes.slice(0, 4)), "%PDF");
  assert.ok(bytes.length > 1_000);
  assert.match(pageCommands, /ANGEBOT/);
  assert.match(pageCommands, /Angebotsnr\./);
  assert.match(pageCommands, /Gültig bis/);
  assert.doesNotMatch(pageCommands, /Fällig:/);
  assert.equal(download.fileName, "Yvonne-Beispiel_MED-AN-1001.pdf");
});
