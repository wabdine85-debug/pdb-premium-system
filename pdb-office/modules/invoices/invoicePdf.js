import { jsPDF } from "jspdf";
import { getInvoiceDueLabel, getInvoicePositionDateLabel, isMedicalInvoiceProfile } from "./invoiceProfiles.js";

const PAGE_WIDTH = 210;
const PAGE_HEIGHT = 297;
const MARGIN = 18;
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2;

function safeText(value, fallback = "") {
  return String(value ?? fallback).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").slice(0, 4000);
}

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? safeText(value) : date.toLocaleDateString("de-DE");
}

function formatCurrency(value) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
}

function getAccent(profile) {
  if (profile?.pdfDesignVariant === "medical-clean") return [15, 118, 110];
  if (profile?.pdfDesignVariant === "classic") return [30, 41, 59];
  return [30, 64, 175];
}

function getBrandName(profile) {
  const companyName = safeText(profile?.companyName).trim();
  return companyName || (isMedicalInvoiceProfile(profile) ? "Ärztliche Praxis" : "PDB Aesthetic Room");
}

export function getInvoicePdfFileName(invoice) {
  const customer = safeText(invoice?.memberName, "Kunde")
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-|-$/g, "");
  const number = safeText(invoice?.number, "Rechnung").replace(/[^\p{L}\p{N}-]+/gu, "-");
  return `${customer || "Kunde"}_${number || "Rechnung"}.pdf`;
}

function writePageHeader(doc, invoice, profile, accent) {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(30, 41, 59);
  doc.text(getBrandName(profile), MARGIN, 23);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 116, 139);
  const email = safeText(profile?.companyEmail);
  if (email) doc.text(email, MARGIN, 29);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(21);
  doc.setTextColor(...accent);
  doc.text("RECHNUNG", PAGE_WIDTH - MARGIN, 22, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(71, 85, 105);
  const metadata = [
    `Rechnungsnr.: ${safeText(invoice?.number, "—")}`,
    `Datum: ${formatDate(invoice?.date)}`,
    `Fällig: ${safeText(getInvoiceDueLabel(invoice), "—")}`,
  ];
  if (invoice?.status === "bezahlt") {
    const paymentMethod = safeText(invoice?.paymentMethod).trim();
    metadata.push(`Bezahlt: ${formatDate(invoice.paidDate || invoice.date)}${paymentMethod ? ` · ${paymentMethod}` : ""}`);
  }
  doc.text(metadata, PAGE_WIDTH - MARGIN, 29, { align: "right", lineHeightFactor: 1.45 });

  doc.setDrawColor(226, 232, 240);
  doc.line(MARGIN, 45, PAGE_WIDTH - MARGIN, 45);
}

function writeFooter(doc, profile) {
  const details = [
    profile?.taxNumber ? `Steuernummer: ${safeText(profile.taxNumber)}` : "",
    profile?.vatId ? `USt-ID: ${safeText(profile.vatId)}` : "",
    profile?.bankName ? safeText(profile.bankName) : "",
    profile?.iban ? `IBAN: ${safeText(profile.iban)}` : "",
    profile?.bic ? `BIC: ${safeText(profile.bic)}` : "",
  ].filter(Boolean);
  if (!details.length) return;
  doc.setDrawColor(226, 232, 240);
  doc.line(MARGIN, 275, PAGE_WIDTH - MARGIN, 275);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text(details.join("  ·  "), PAGE_WIDTH - MARGIN, 281, { align: "right", maxWidth: CONTENT_WIDTH });
}

function writeTableHeader(doc, y, invoice, profile, accent) {
  doc.setFillColor(...accent);
  doc.rect(MARGIN, y, CONTENT_WIDTH, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text(getInvoicePositionDateLabel(profile, invoice?.invoiceCategory), MARGIN + 2, y + 5.2);
  doc.text("Beschreibung", 55, y + 5.2);
  doc.text("Menge", 133, y + 5.2, { align: "right" });
  doc.text("Einzelpreis", 164, y + 5.2, { align: "right" });
  doc.text("Gesamt", PAGE_WIDTH - MARGIN - 2, y + 5.2, { align: "right" });
  return y + 8;
}

function addContinuationPage(doc, invoice, profile, accent) {
  writeFooter(doc, profile);
  doc.addPage();
  writePageHeader(doc, invoice, profile, accent);
  return writeTableHeader(doc, 54, invoice, profile, accent);
}

export function buildInvoicePdf(invoice, profile) {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
  const accent = getAccent(profile);
  const taxRate = Number(invoice?.taxRate ?? profile?.defaultTaxRate ?? 0) || 0;
  const items = Array.isArray(invoice?.items) ? invoice.items : [];

  doc.setProperties({
    title: `Rechnung ${safeText(invoice?.number)}`,
    subject: `Rechnung für ${safeText(invoice?.memberName)}`,
    author: getBrandName(profile),
    creator: "PDB Office",
  });
  writePageHeader(doc, invoice, profile, accent);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(148, 163, 184);
  const sender = [getBrandName(profile), safeText(profile?.companyAddress).replace(/\n/g, ", ")].filter(Boolean).join(" · ");
  doc.text(doc.splitTextToSize(sender, 105), MARGIN, 57);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(safeText(invoice?.memberName, "Kunde"), MARGIN, 66);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  const customerAddress = safeText(invoice?.customerAddress);
  if (customerAddress) doc.text(doc.splitTextToSize(customerAddress, 90), MARGIN, 72, { lineHeightFactor: 1.35 });

  let y = 91;
  if (isMedicalInvoiceProfile(profile) && invoice?.diagnosis) {
    const diagnosisLines = doc.splitTextToSize(safeText(invoice.diagnosis), CONTENT_WIDTH - 8);
    const boxHeight = Math.max(14, diagnosisLines.length * 4 + 9);
    doc.setFillColor(250, 250, 250);
    doc.setDrawColor(238, 242, 247);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, boxHeight, 1, 1, "FD");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Befund / Diagnose", MARGIN + 4, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(71, 85, 105);
    doc.text(diagnosisLines, MARGIN + 4, y + 10, { lineHeightFactor: 1.3 });
    y += boxHeight + 8;
  }

  y = writeTableHeader(doc, y, invoice, profile, accent);
  items.forEach(item => {
    const descriptionLines = doc.splitTextToSize(safeText(item?.desc, "Leistung"), 67);
    const rowHeight = Math.max(10, descriptionLines.length * 4 + 4);
    if (y + rowHeight > 262) y = addContinuationPage(doc, invoice, profile, accent);

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text(formatDate(item?.treatmentDate || invoice?.date), MARGIN + 2, y + 6);
    doc.setTextColor(30, 41, 59);
    doc.text(descriptionLines, 55, y + 6, { lineHeightFactor: 1.25 });
    doc.text(safeText(item?.qty, "0"), 133, y + 6, { align: "right" });
    doc.text(formatCurrency(item?.price), 164, y + 6, { align: "right" });
    doc.setFont("helvetica", "bold");
    doc.text(formatCurrency((Number(item?.qty) || 0) * (Number(item?.price) || 0)), PAGE_WIDTH - MARGIN - 2, y + 6, { align: "right" });
    doc.setDrawColor(226, 232, 240);
    doc.line(MARGIN, y + rowHeight, PAGE_WIDTH - MARGIN, y + rowHeight);
    y += rowHeight;
  });

  if (y + 49 > 262) y = addContinuationPage(doc, invoice, profile, accent);
  y += 8;
  const totalsX = 132;
  const amountX = PAGE_WIDTH - MARGIN;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(100, 116, 139);
  doc.text("Netto", totalsX, y);
  doc.text(formatCurrency(invoice?.net), amountX, y, { align: "right" });
  doc.text(`MwSt. ${taxRate}%`, totalsX, y + 6);
  doc.text(formatCurrency(invoice?.tax), amountX, y + 6, { align: "right" });
  doc.setDrawColor(...accent);
  doc.setLineWidth(0.6);
  doc.line(totalsX, y + 10, amountX, y + 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text("Gesamt brutto", totalsX, y + 18);
  doc.text(formatCurrency(invoice?.total), amountX, y + 18, { align: "right" });
  y += 28;

  if (!isMedicalInvoiceProfile(profile) && invoice?.invoiceNote) {
    const noteLines = doc.splitTextToSize(safeText(invoice.invoiceNote), CONTENT_WIDTH - 8);
    const noteHeight = Math.max(13, noteLines.length * 4 + 8);
    if (y + noteHeight > 268) {
      writeFooter(doc, profile);
      doc.addPage();
      writePageHeader(doc, invoice, profile, accent);
      y = 55;
    }
    doc.setFillColor(251, 250, 248);
    doc.setDrawColor(232, 225, 214);
    doc.roundedRect(MARGIN, y, CONTENT_WIDTH, noteHeight, 1, 1, "FD");
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    doc.text(noteLines, MARGIN + 4, y + 6, { lineHeightFactor: 1.35 });
  }

  writeFooter(doc, profile);
  return doc;
}

export function downloadInvoicePdf(invoice, profile) {
  const doc = buildInvoicePdf(invoice, profile);
  doc.save(getInvoicePdfFileName(invoice));
}

export function createInvoicePdfDownload(invoice, profile) {
  const doc = buildInvoicePdf(invoice, profile);
  const dataUri = doc.output("datauristring");
  return {
    fileName: getInvoicePdfFileName(invoice),
    base64: dataUri.slice(dataUri.indexOf(",") + 1),
  };
}
