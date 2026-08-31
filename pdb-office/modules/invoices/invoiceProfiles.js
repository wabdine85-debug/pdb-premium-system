import { parseLocalizedNumber } from "./invoiceInputs.js";

export const DEFAULT_INVOICE_PROFILE_ID = "pdb-aesthetic-room";

export const INVOICE_PAYMENT_TERMS = [
  { value: "sofort", label: "Sofort fällig", days: 0 },
  { value: "7", label: "7 Tage", days: 7 },
  { value: "14", label: "14 Tage", days: 14 },
  { value: "30", label: "30 Tage", days: 30 },
  { value: "custom", label: "Individuelles Datum", days: null },
];

export const PDB_INVOICE_CATEGORIES = [
  { value: "treatment", label: "Behandlung", dateLabel: "Behandlungsdatum" },
  { value: "product", label: "Produkt", dateLabel: "Lieferdatum" },
  { value: "training", label: "Schulung", dateLabel: "Leistungsdatum" },
  { value: "voucher", label: "Gutschein", dateLabel: "Ausstellungsdatum" },
  { value: "other", label: "Sonstiges", dateLabel: "Leistungs-/Lieferdatum" },
];

export const defaultInvoiceProfiles = [
  {
    id: DEFAULT_INVOICE_PROFILE_ID,
    name: "PDB Aesthetic Room",
    companyName: "PDB Aesthetic Room",
    companyAddress: "Adresse ergänzen",
    companyEmail: "info@pdb-aestheticroom.de",
    taxNumber: "Steuernummer ergänzen",
    vatId: "",
    iban: "",
    bic: "",
    bankName: "",
    logoUrl: "/office/pdb-logo.png",
    logoPlaceholder: "PDB",
    invoicePrefix: "PDB-RE",
    nextInvoiceNumber: 1001,
    offerPrefix: "PDB-AN-",
    nextOfferNumber: 1001,
    defaultTaxRate: 19,
    pdfDesignVariant: "pdb-premium",
  },
  {
    id: "medical-doctor",
    name: "Ärztin / medizinische Rechnung",
    companyName: "Ärztliche Praxis",
    companyAddress: "Praxisadresse ergänzen",
    companyEmail: "praxis@example.de",
    taxNumber: "Steuernummer ergänzen",
    vatId: "",
    iban: "",
    bic: "",
    bankName: "",
    logoUrl: "/office/pdb-logo.png",
    logoPlaceholder: "MED",
    invoicePrefix: "MED-RE",
    nextInvoiceNumber: 1001,
    offerPrefix: "MED-AN-",
    nextOfferNumber: 1001,
    defaultTaxRate: 0,
    pdfDesignVariant: "medical-clean",
  },
];

export function getInvoiceProfile(data, id) {
  return (data.invoiceProfiles || []).find(profile => profile.id === id) || (data.invoiceProfiles || [])[0] || defaultInvoiceProfiles[0];
}

export function buildInvoiceNumber(profile) {
  return `${profile.invoicePrefix || "RE"}${profile.nextInvoiceNumber || 1001}`;
}

export function buildOfferNumber(profile) {
  const fallbackPrefix = isMedicalInvoiceProfile(profile) ? "MED-AN-" : "PDB-AN-";
  return `${profile.offerPrefix || fallbackPrefix}${profile.nextOfferNumber || 1001}`;
}

export function calculateInvoiceTotals(items, taxRate) {
  const total = items.reduce((sum, item) => sum + (Number(item.qty) || 0) * parseLocalizedNumber(item.price), 0);
  const rate = Number(taxRate) || 0;
  const net = rate > 0 ? total / (1 + rate / 100) : total;
  const tax = total - net;
  return { net, tax, total };
}

export function isMedicalInvoiceProfile(profile) {
  return profile?.id === "medical-doctor" || profile?.pdfDesignVariant === "medical-clean";
}

export function getInvoicePositionDateLabel(profile, category = "") {
  if (isMedicalInvoiceProfile(profile)) return "Behandlung";
  return PDB_INVOICE_CATEGORIES.find(option => option.value === category)?.dateLabel || "Leistungs-/Lieferdatum";
}

export function getInvoiceCategoryLabel(category) {
  return PDB_INVOICE_CATEGORIES.find(option => option.value === category)?.label || "Allgemeine Leistung";
}

export function calculateInvoiceDueDate(invoiceDate, paymentTerm, customDueDate = "") {
  if (paymentTerm === "custom") return customDueDate;
  const term = INVOICE_PAYMENT_TERMS.find(option => option.value === paymentTerm) || INVOICE_PAYMENT_TERMS[2];
  const date = new Date(`${invoiceDate || new Date().toISOString().split("T")[0]}T12:00:00`);
  date.setDate(date.getDate() + (term.days || 0));
  return date.toISOString().split("T")[0];
}

export function getInvoiceDueLabel(invoice) {
  if (invoice?.paymentTerm === "sofort") return "sofort";
  return invoice?.dueDate ? new Date(`${invoice.dueDate}T12:00:00`).toLocaleDateString("de-DE") : "—";
}
