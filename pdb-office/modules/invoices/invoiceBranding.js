import { DEFAULT_INVOICE_PROFILE_ID, isMedicalInvoiceProfile } from "./invoiceProfiles.js";

const PDB_BRAND_NAME = "PDB Aesthetic Room";
const PDB_LOGO_PATH = "/office/pdb-logo.png";

function cleanLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function isPhoneLine(value) {
  const normalized = cleanLine(value).toLowerCase();
  if (["tel", "telefon", "phone", "mobil"].some(token => normalized.includes(token))) return true;
  return normalized.replace(/\D/g, "").length >= 7;
}

export function resolveInvoiceLogoUrl(profile = {}) {
  const configured = cleanLine(profile.logoUrl);
  const isBuiltInProfile = profile.id === DEFAULT_INVOICE_PROFILE_ID || isMedicalInvoiceProfile(profile);
  const usesPdbLogo = configured === "/pdb-logo.png"
    || configured === "pdb-logo.png"
    || (isBuiltInProfile && !configured);
  return usesPdbLogo ? PDB_LOGO_PATH : configured;
}

export function getInvoiceBranding(profile = {}) {
  const rawCompanyName = cleanLine(profile.companyName);
  const brandIndex = rawCompanyName.toLowerCase().indexOf(PDB_BRAND_NAME.toLowerCase());
  const nameWithoutBrand = brandIndex >= 0
    ? rawCompanyName.slice(0, brandIndex).replace(/\s*-\s*$/, "").trim()
    : rawCompanyName;
  const headerPrimary = nameWithoutBrand.toLowerCase() === "pdb"
    ? (isMedicalInvoiceProfile(profile) ? "Ärztliche Praxis" : PDB_BRAND_NAME)
    : (nameWithoutBrand || (isMedicalInvoiceProfile(profile) ? "Ärztliche Praxis" : PDB_BRAND_NAME));
  const headerBrand = headerPrimary === PDB_BRAND_NAME ? "" : PDB_BRAND_NAME;
  const senderName = headerBrand ? `${headerPrimary} - ${headerBrand}` : headerPrimary;
  const addressLines = String(profile.companyAddress || "")
    .split("\n")
    .map(cleanLine)
    .filter(line => line && !isPhoneLine(line));

  return {
    headerPrimary,
    headerBrand,
    senderName,
    senderAddress: addressLines.join(", "),
    logoUrl: resolveInvoiceLogoUrl(profile),
  };
}
