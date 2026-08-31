const SOURCE_HEADERS = {
  shopify: ["first name", "last name", "total orders", "accepts email marketing", "email marketing status"],
  salonized: ["salonized_id", "first_name", "last_name", "newsletter_optin", "loyalty_points"],
};

const FIELD_HEADERS = {
  firstName: ["first name", "first_name", "firstname", "vorname"],
  lastName: ["last name", "last_name", "lastname", "nachname"],
  email: ["email", "email address", "e-mail"],
  phone: ["phone", "mobile_phone", "mobile phone", "default address phone", "telefon", "handy"],
  city: ["city", "stadt", "ort"],
  tags: ["tags", "customer tags"],
  sourceId: ["salonized_id", "id", "customer id"],
  createdAt: ["created at", "created", "erstellt am"],
  consent: [
    "accepts email marketing",
    "email marketing status",
    "email subscription status",
    "newsletter_optin",
    "newsletter optin",
  ],
};

function normalizeHeader(value) {
  return String(value || "").replace(/^\ufeff/, "").trim().toLowerCase();
}

function countDelimiter(line, delimiter) {
  let count = 0;
  let quoted = false;
  for (let index = 0; index < line.length; index++) {
    if (line[index] === '"') quoted = !quoted;
    else if (line[index] === delimiter && !quoted) count++;
  }
  return count;
}

function detectDelimiter(text) {
  const firstLine = String(text || "").split(/\r?\n/, 1)[0] || "";
  return countDelimiter(firstLine, ";") > countDelimiter(firstLine, ",") ? ";" : ",";
}

export function parseCsv(text) {
  const delimiter = detectDelimiter(text);
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const input = String(text || "").replace(/^\ufeff/, "");

  for (let index = 0; index < input.length; index++) {
    const character = input[index];
    if (character === '"' && quoted && input[index + 1] === '"') {
      cell += '"';
      index++;
    } else if (character === '"') {
      quoted = !quoted;
    } else if (character === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && input[index + 1] === "\n") index++;
      row.push(cell.trim());
      if (row.some(value => value !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.trim());
  if (row.some(value => value !== "")) rows.push(row);
  return { delimiter, headers: rows[0] || [], rows: rows.slice(1) };
}

export function detectCustomerSource(headers = []) {
  const normalized = new Set(headers.map(normalizeHeader));
  const sourceScore = Object.fromEntries(Object.entries(SOURCE_HEADERS).map(([source, candidates]) => [
    source,
    candidates.filter(candidate => normalized.has(candidate)).length,
  ]));
  if (sourceScore.shopify === 0 && sourceScore.salonized === 0) return null;
  return sourceScore.salonized > sourceScore.shopify ? "salonized" : "shopify";
}

function fieldIndex(headers, field) {
  const normalized = headers.map(normalizeHeader);
  return normalized.findIndex(header => FIELD_HEADERS[field].includes(header));
}

function valueAt(row, index) {
  return index >= 0 ? String(row[index] || "").trim() : "";
}

export function normalizeEmail(value) {
  return String(value || "").trim().toLowerCase();
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  if (!email || email.length > 254) return false;

  const atIndex = email.indexOf("@");
  if (atIndex <= 0 || atIndex !== email.lastIndexOf("@")) return false;

  const localPart = email.slice(0, atIndex);
  const domain = email.slice(atIndex + 1);
  if (localPart.length > 64 || domain.length > 253) return false;
  if (!/^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+$/i.test(localPart)) return false;
  if (localPart.startsWith(".") || localPart.endsWith(".") || localPart.includes("..")) return false;

  const domainParts = domain.split(".");
  if (domainParts.length < 2 || domainParts.at(-1).length < 2) return false;
  return domainParts.every(part => (
    part.length > 0
    && part.length <= 63
    && /^[a-z0-9-]+$/i.test(part)
    && !part.startsWith("-")
    && !part.endsWith("-")
  ));
}

function normalizePhone(value) {
  return String(value || "").replace(/\D/g, "").slice(-10);
}

function normalizeName(value) {
  return String(value || "").toLowerCase().normalize("NFKD").replace(/[^a-z0-9]/g, "");
}

export function parseMarketingConsent(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (["yes", "ja", "true", "1", "subscribed", "subscriber", "opted_in", "confirmed"].includes(normalized)) return "yes";
  if (["no", "nein", "false", "0", "not_subscribed", "unsubscribed", "invalid", "redacted", "declined"].includes(normalized)) return "no";
  return "unknown";
}

export function parseCustomerCsv(text, fileName = "") {
  const parsed = parseCsv(text);
  const source = detectCustomerSource(parsed.headers);
  if (!source) throw new Error("Die Datei konnte nicht eindeutig Shopify oder Salonized zugeordnet werden.");

  const indexes = Object.fromEntries(Object.keys(FIELD_HEADERS).map(field => [field, fieldIndex(parsed.headers, field)]));
  const contacts = parsed.rows.map((row, index) => {
    const firstName = valueAt(row, indexes.firstName);
    const lastName = valueAt(row, indexes.lastName);
    const email = valueAt(row, indexes.email);
    const consentRaw = valueAt(row, indexes.consent);
    return {
      id: `${source}-${index + 1}`,
      source,
      sourceId: valueAt(row, indexes.sourceId),
      firstName,
      lastName,
      name: [firstName, lastName].filter(Boolean).join(" ") || email || "Ohne Namen",
      email,
      normalizedEmail: normalizeEmail(email),
      phone: valueAt(row, indexes.phone),
      city: valueAt(row, indexes.city),
      tags: valueAt(row, indexes.tags),
      createdAt: valueAt(row, indexes.createdAt),
      marketingConsent: parseMarketingConsent(consentRaw),
      consentRaw,
    };
  });

  const warnings = [];
  if (indexes.email < 0) warnings.push("E-Mail-Spalte fehlt");
  if (indexes.consent < 0) warnings.push("Newsletter-Einwilligung fehlt");
  return { ...parsed, source, fileName, contacts, warnings };
}

function combinedConsent(records) {
  const values = new Set(records.map(record => record.marketingConsent));
  if (values.has("yes") && values.has("no")) return { status: "review", reason: "Einwilligung widersprüchlich" };
  if (values.has("yes")) return { status: "eligible", reason: "Newsletter-Einwilligung vorhanden" };
  if (values.has("no")) return { status: "excluded", reason: "Keine Newsletter-Einwilligung" };
  return { status: "excluded", reason: "Einwilligung nicht nachweisbar" };
}

function preferredRecord(records) {
  return [...records].sort((left, right) => {
    if (left.source === right.source) return 0;
    return left.source === "shopify" ? -1 : 1;
  })[0];
}

function sourceConsent(records, source) {
  const values = new Set(records.filter(record => record.source === source).map(record => record.marketingConsent));
  if (values.has("yes") && values.has("no")) return "conflict";
  if (values.has("yes")) return "yes";
  if (values.has("no")) return "no";
  return "unknown";
}

export function reconcileEmailContacts(contacts = []) {
  const validGroups = new Map();
  const issues = [];

  contacts.forEach(contact => {
    const email = normalizeEmail(contact.email);
    if (!email) {
      issues.push({ ...contact, status: "missing", reason: "E-Mail fehlt" });
      return;
    }
    if (!isValidEmail(email)) {
      issues.push({ ...contact, normalizedEmail: email, status: "invalid", reason: "E-Mail ungültig" });
      return;
    }
    if (!validGroups.has(email)) validGroups.set(email, []);
    validGroups.get(email).push({ ...contact, normalizedEmail: email });
  });

  const rows = [...validGroups.entries()].map(([email, records]) => {
    const preferred = preferredRecord(records);
    const consent = combinedConsent(records);
    const sources = [...new Set(records.map(record => record.source))];
    return {
      id: email,
      email,
      firstName: preferred.firstName || records.find(record => record.firstName)?.firstName || "",
      lastName: preferred.lastName || records.find(record => record.lastName)?.lastName || "",
      name: preferred.name || records.find(record => record.name)?.name || email,
      phone: preferred.phone || records.find(record => record.phone)?.phone || "",
      city: preferred.city || records.find(record => record.city)?.city || "",
      tags: [...new Set(records.flatMap(record => String(record.tags || "").split(",").map(tag => tag.trim()).filter(Boolean)))],
      sources,
      shopifyConsent: sourceConsent(records, "shopify"),
      salonizedConsent: sourceConsent(records, "salonized"),
      status: consent.status,
      reason: consent.reason,
      records,
      duplicateCount: records.length,
      identityReview: false,
    };
  });

  const identityGroups = new Map();
  rows.forEach(row => {
    const phone = normalizePhone(row.phone);
    const name = normalizeName(row.name);
    if (phone.length < 7 || name.length < 5) return;
    const key = `${name}:${phone}`;
    if (!identityGroups.has(key)) identityGroups.set(key, []);
    identityGroups.get(key).push(row);
  });
  identityGroups.forEach(group => {
    if (group.length < 2) return;
    group.forEach(row => {
      row.identityReview = true;
      row.status = "review";
      row.reason = "Gleiche Person mit mehreren E-Mail-Adressen möglich";
    });
  });

  rows.sort((left, right) => left.email.localeCompare(right.email, "de"));
  return {
    rows,
    issues,
    summary: {
      imported: contacts.length,
      validUnique: rows.length,
      eligible: rows.filter(row => row.status === "eligible").length,
      review: rows.filter(row => row.status === "review").length,
      excluded: rows.filter(row => row.status === "excluded").length,
      missing: issues.filter(row => row.status === "missing").length,
      invalid: issues.filter(row => row.status === "invalid").length,
      duplicatesRemoved: contacts.filter(contact => isValidEmail(contact.email)).length - rows.length,
    },
  };
}

function protectSpreadsheetValue(value) {
  const text = String(value ?? "");
  return /^[=+@]/.test(text) || (/^-/.test(text) && !/^-?\d+(?:[.,]\d+)?$/.test(text)) ? `'${text}` : text;
}

function csvCell(value, delimiter) {
  const text = protectSpreadsheetValue(value);
  return text.includes(delimiter) || /["\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(headers, values, delimiter = ";") {
  return `\ufeff${[headers, ...values].map(row => row.map(value => csvCell(value, delimiter)).join(delimiter)).join("\n")}`;
}

function sourceLabel(row) {
  return row.sources.length > 1 ? "Shopify + Salonized" : row.sources[0] === "shopify" ? "Shopify" : "Salonized";
}

function consentLabel(value) {
  return value === "yes" ? "Ja" : value === "no" ? "Nein" : value === "conflict" ? "Widersprüchlich" : "Unbekannt";
}

export function createAuditCsv(result) {
  const headers = ["E-Mail", "Vorname", "Nachname", "Name", "Telefon", "Ort", "Herkunft", "Shopify Einwilligung", "Salonized Einwilligung", "Ergebnis", "Begründung"];
  const rows = result.rows.map(row => [
    row.email, row.firstName, row.lastName, row.name, row.phone, row.city, sourceLabel(row),
    consentLabel(row.shopifyConsent), consentLabel(row.salonizedConsent), row.status, row.reason,
  ]);
  const issues = result.issues.map(row => [row.email, row.firstName, row.lastName, row.name, row.phone, row.city, row.source, "", "", row.status, row.reason]);
  return toCsv(headers, [...rows, ...issues]);
}

function shopifyTags(row) {
  return [
    "pdb-email-master",
    ...row.sources.map(source => `source-${source}`),
    row.sources.length > 1 ? "source-both" : "",
    row.status === "eligible" ? "pdb-newsletter" : "",
    row.status === "review" ? "pdb-consent-review" : "",
    row.status === "excluded" ? "pdb-no-consent" : "",
  ].filter(Boolean).join(", ");
}

export function createShopifyCsv(rows, { eligibleOnly = false } = {}) {
  const selected = (rows || []).filter(row => !eligibleOnly || row.status === "eligible");
  const headers = ["First Name", "Last Name", "Email", "Accepts Email Marketing", "Tags"];
  return toCsv(headers, selected.map(row => [
    row.firstName,
    row.lastName,
    row.email,
    row.status === "eligible" ? "yes" : "no",
    shopifyTags(row),
  ]), ",");
}

export function selectSalonizedNewsletterAdditions(rows = []) {
  return selectSalonizedAdditions(rows).filter(row => row.status === "eligible");
}

export function selectSalonizedAdditions(rows = []) {
  return rows.filter(row => row.sources.length === 1 && row.sources[0] === "salonized");
}

export function createReviewCsv(result) {
  const headers = ["E-Mail", "Name", "Telefon", "Herkunft", "Shopify Einwilligung", "Salonized Einwilligung", "Prüfgrund"];
  const rows = result.rows.filter(row => row.status === "review").map(row => [
    row.email, row.name, row.phone, sourceLabel(row), consentLabel(row.shopifyConsent), consentLabel(row.salonizedConsent), row.reason,
  ]);
  return toCsv(headers, rows);
}
