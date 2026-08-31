import { buildInvoiceNumber, buildOfferNumber } from "./invoiceProfiles.js";

export const OFFER_STATUSES = [
  { value: "entwurf", label: "Entwurf" },
  { value: "versendet", label: "Versendet" },
  { value: "angenommen", label: "Angenommen" },
  { value: "abgelehnt", label: "Abgelehnt" },
];

function addCalendarDays(dateValue, days) {
  const date = new Date(`${dateValue}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getOfferValidityLabel(offer) {
  if (!offer?.validUntil) return "ohne Befristung";
  const date = new Date(`${offer.validUntil}T12:00:00`);
  return Number.isNaN(date.getTime()) ? String(offer.validUntil) : date.toLocaleDateString("de-DE");
}

export function createOfferFromInvoice(invoice, profile, options = {}) {
  const createdAt = options.createdAt || new Date().toISOString();
  const offerDate = options.date || invoice.date || createdAt.slice(0, 10);
  const {
    id: sourceInvoiceId,
    number: sourceInvoiceNumber,
    status: _invoiceStatus,
    dueDate: _dueDate,
    paymentTerm: _paymentTerm,
    paymentMethod: _paymentMethod,
    paidDate: _paidDate,
    invoiceNote,
    createdAt: sourceCreatedAt,
    updatedAt: _updatedAt,
    ...shared
  } = invoice;

  return {
    ...shared,
    id: options.id,
    number: options.number || buildOfferNumber(profile),
    date: offerDate,
    validUntil: options.validUntil || addCalendarDays(offerDate, 14),
    status: "entwurf",
    offerNote: invoiceNote || "",
    sourceInvoiceId,
    sourceInvoiceNumber,
    sourceCreatedAt,
    createdAt,
    updatedAt: createdAt,
  };
}

export function createInvoiceFromOffer(offer, profile, options = {}) {
  const createdAt = options.createdAt || new Date().toISOString();
  const invoiceDate = options.date || createdAt.slice(0, 10);
  const {
    id: sourceOfferId,
    number: sourceOfferNumber,
    status: _offerStatus,
    validUntil: _validUntil,
    createdAt: sourceCreatedAt,
    updatedAt: _updatedAt,
    sourceInvoiceId: _sourceInvoiceId,
    sourceInvoiceNumber: _sourceInvoiceNumber,
    sourceCreatedAt: _sourceCreatedAt,
    offerNote,
    ...shared
  } = offer;

  return {
    ...shared,
    id: options.id,
    number: options.number || buildInvoiceNumber(profile),
    date: invoiceDate,
    dueDate: options.dueDate || addCalendarDays(invoiceDate, 14),
    paymentTerm: "14",
    paymentMethod: "",
    paidDate: "",
    status: "ausstehend",
    invoiceNote: offerNote || "",
    sourceOfferId,
    sourceOfferNumber,
    sourceCreatedAt,
    createdAt,
    updatedAt: createdAt,
  };
}
