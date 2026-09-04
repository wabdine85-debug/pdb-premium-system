const ACTIVE_MEMBERSHIP_STATUSES = new Set(["aktiv", "vorbereitung", "gekündigt", "abgelaufen"]);

export const DIRECT_DEBIT_ADJUSTMENT_TYPES = [
  { value: "upgrade", label: "Upgrade-Differenz" },
  { value: "new-membership", label: "Neuer Vertrag / Nachlauf" },
  { value: "setup-fee", label: "Einrichtungsgebühr" },
  { value: "overpayment", label: "Doppelabbuchung / Guthaben" },
  { value: "refund", label: "Erstattung" },
  { value: "arrears", label: "Nachberechnung Vormonat" },
  { value: "other", label: "Sonstige Korrektur" },
];

export const RETURN_CASE_STATUSES = [
  { value: "offen", label: "Kontakt erforderlich" },
  { value: "kontaktiert", label: "Kunde kontaktiert" },
  { value: "ueberweisung", label: "Überweisung vereinbart" },
  { value: "neuer-einzug", label: "Neuer Einzug geplant" },
  { value: "bezahlt", label: "Zahlung eingegangen" },
  { value: "storniert", label: "Forderung storniert" },
];

export const RETURN_REASON_LABELS = {
  AC01: "IBAN fehlerhaft",
  AC04: "Konto aufgelöst",
  AC06: "Konto gesperrt",
  AG01: "Kontotyp nicht zugelassen",
  AM04: "Keine ausreichende Deckung",
  MD01: "Mandat fehlt oder ist ungültig",
  MD06: "Widerspruch des Zahlers",
  MS02: "Sonstiger Grund des Zahlers",
  SL01: "Lastschriftsperre",
};

export function normalizeIban(value = "") {
  return String(value).replace(/\s+/g, "").toUpperCase();
}

export function maskIban(value = "") {
  const normalized = normalizeIban(value);
  return normalized ? `•••• ${normalized.slice(-4)}` : "—";
}

export function normalizeText(value = "") {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function returnTransactionFingerprint(transaction = {}) {
  return [
    transaction.date || "",
    Number(transaction.amount || 0).toFixed(2),
    normalizeIban(transaction.iban),
    normalizeText(transaction.purpose),
  ].join("|");
}

export function isMembershipDueInMonth(membership, month) {
  if (!membership || !/^\d{4}-\d{2}$/.test(month || "")) return false;
  const start = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const end = new Date(Date.UTC(year, monthNumber, 0)).toISOString().slice(0, 10);
  const scheduledPausedMembership = membership.status === "pausiert" && Boolean(membership.scheduledReactivationAt);
  if (membership.status === "pausiert") {
    if (!membership.scheduledReactivationAt || membership.scheduledReactivationAt > end) return false;
  } else if (!ACTIVE_MEMBERSHIP_STATUSES.has(membership.status || "aktiv")) {
    return false;
  }
  if (membership.startDate && membership.startDate > end) return false;
  // endDate is the first day without membership entitlement or a debit.
  if (membership.endDate && membership.endDate <= start && !scheduledPausedMembership) return false;
  if (["gekündigt", "abgelaufen"].includes(membership.status) && !membership.endDate) return false;
  return true;
}

export function createDirectDebitRun({ data, month, dueDate, idFactory, now = new Date().toISOString() }) {
  if (!/^\d{4}-\d{2}$/.test(month || "")) throw new Error("Bitte einen gültigen Monat auswählen.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate || "") || !dueDate.startsWith(month)) {
    throw new Error("Der Fälligkeitstag muss im ausgewählten Monat liegen.");
  }
  const makeId = typeof idFactory === "function" ? idFactory : () => crypto.randomUUID();
  const members = new Map((data.members || []).map(member => [member.id, member]));
  const memberships = (data.memberships || []).filter(membership => (
    isMembershipDueInMonth(membership, month)
    && String(membership.paymentMethod || "SEPA").toUpperCase() === "SEPA"
  ));
  const runId = makeId();
  const items = memberships.map(membership => {
    const member = members.get(membership.memberId) || {};
    return {
      id: makeId(),
      runId,
      membershipId: membership.id,
      memberId: membership.memberId || member.id || "",
      memberName: membership.memberName || member.name || "Unbekannter Member",
      amount: Number(membership.monthlyAmount) || 0,
      mandateReference: String(membership.mandateReference || "").trim(),
      iban: normalizeIban(membership.sepaIban || member.iban || ""),
      dueDate,
      status: "vorbereitet",
      createdAt: now,
    };
  });
  const label = new Date(`${month}-01T12:00:00`).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  return {
    run: {
      id: runId,
      month,
      title: `Memberships ${label}`,
      dueDate,
      status: "entwurf",
      itemCount: items.length,
      totalAmount: items.reduce((sum, item) => sum + item.amount, 0),
      createdAt: now,
      updatedAt: now,
    },
    items,
  };
}

function decodeXmlEntities(value = "") {
  return String(value)
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function xmlValues(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${escaped}>`, "gi");
  return [...String(xml).matchAll(pattern)].map(match => decodeXmlEntities(match[1].replace(/<[^>]+>/g, "").trim()));
}

function xmlBlocks(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${escaped}(?:\\s[^>]*)?>[\\s\\S]*?<\\/(?:[A-Za-z0-9_-]+:)?${escaped}>`, "gi");
  return String(xml).match(pattern) || [];
}

export function createDirectDebitRunFromSepaXml({ data, text, sourceFile = "", idFactory, now = new Date().toISOString() }) {
  const paymentBlocks = xmlBlocks(text, "PmtInf");
  const groups = (paymentBlocks.length ? paymentBlocks : [text]).map(paymentBlock => ({
    dueDate: xmlValues(paymentBlock, "ReqdColltnDt")[0] || "",
    transactionBlocks: xmlBlocks(paymentBlock, "DrctDbtTxInf"),
  }));
  if (groups.some(group => !/^\d{4}-\d{2}-\d{2}$/.test(group.dueDate))) {
    throw new Error("In der SEPA-XML wurde kein gültiger Einzugstag gefunden.");
  }
  const months = [...new Set(groups.map(group => group.dueDate.slice(0, 7)))];
  if (months.length !== 1) throw new Error("Die SEPA-XML enthält mehrere Einzugsmonate. Bitte jeden Monat separat importieren.");
  const transactionEntries = groups.flatMap(group => (
    group.transactionBlocks.map(block => ({ block, dueDate: group.dueDate }))
  ));
  if (!transactionEntries.length) throw new Error("Die Datei enthält keine SEPA-Lastschriftpositionen.");

  const makeId = typeof idFactory === "function" ? idFactory : () => crypto.randomUUID();
  const memberships = data.memberships || [];
  const members = data.members || [];
  const uniqueMembership = (field, value, normalize) => {
    if (!value) return null;
    const matches = memberships.filter(entry => normalize(entry[field]) === normalize(value));
    return matches.length === 1 ? matches[0] : null;
  };
  const findMembership = ({ mandateReference, iban, memberName }) => (
    uniqueMembership("sepaIban", iban, normalizeIban)
    || uniqueMembership("memberName", memberName, normalizeText)
    || uniqueMembership("mandateReference", mandateReference, normalizeText)
  );
  const runId = makeId();
  const items = transactionEntries.map(({ block, dueDate }) => {
    const amount = Math.abs(parseGermanAmount(xmlValues(block, "InstdAmt")[0]));
    const mandateReference = xmlValues(block, "MndtId")[0] || "";
    const iban = normalizeIban(xmlValues(xmlBlocks(block, "DbtrAcct")[0] || block, "IBAN")[0] || "");
    const memberName = xmlValues(xmlBlocks(block, "Dbtr")[0] || block, "Nm")[0] || "Unbekannter Zahler";
    const membership = findMembership({ mandateReference, iban, memberName });
    const member = members.find(entry => entry.id === membership?.memberId);
    return {
      id: makeId(),
      runId,
      membershipId: membership?.id || "",
      memberId: membership?.memberId || member?.id || "",
      memberName,
      amount,
      mandateReference,
      iban,
      dueDate,
      status: "eingefroren",
      createdAt: now,
    };
  });
  const month = months[0];
  const dueDate = groups.map(group => group.dueDate).sort()[0];
  const label = new Date(`${month}-01T12:00:00`).toLocaleDateString("de-DE", { month: "long", year: "numeric" });
  return {
    run: {
      id: runId,
      month,
      title: `Memberships ${label}`,
      dueDate,
      status: "eingefroren",
      itemCount: items.length,
      totalAmount: Math.round(items.reduce((sum, item) => sum + item.amount, 0) * 100) / 100,
      sourceFile,
      sourceType: "sepa-xml",
      frozenAt: now,
      createdAt: now,
      updatedAt: now,
    },
    items,
  };
}

function detectDelimiter(firstLine = "") {
  const counts = [";", ",", "\t"].map(delimiter => ({
    delimiter,
    count: (firstLine.match(new RegExp(delimiter === "\t" ? "\\t" : `\\${delimiter}`, "g")) || []).length,
  }));
  return counts.sort((left, right) => right.count - left.count)[0]?.delimiter || ";";
}

function parseRows(text, delimiter) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell.trim());
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(cell.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  row.push(cell.trim());
  if (row.some(Boolean)) rows.push(row);
  return rows;
}

function findColumn(headers, candidates) {
  return headers.findIndex(header => candidates.some(candidate => header.includes(candidate)));
}

function parseGermanAmount(value = "") {
  const compact = String(value).replace(/\s|€|EUR/gi, "").trim();
  if (!compact) return 0;
  const normalized = compact.includes(",")
    ? compact.replace(/\./g, "").replace(",", ".")
    : compact;
  return Number.parseFloat(normalized) || 0;
}

function parseDate(value = "") {
  const clean = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;
  const match = clean.match(/^(\d{2})[./](\d{2})[./](\d{2}|\d{4})$/);
  if (!match) return "";
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  return `${year}-${match[2]}-${match[1]}`;
}

function detectReturnReason(purpose = "") {
  const explicitCode = (purpose.match(/\b(AC01|AC04|AC06|AG01|AM04|MD01|MD06|MS02|SL01)\b/i)?.[1] || "").toUpperCase();
  if (explicitCode) return explicitCode;
  const normalized = normalizeText(purpose);
  if (/konto (aufgelost|erloschen)/.test(normalized)) return "AC04";
  if (/nicht gedeckt|deckung|unzureichende mittel/.test(normalized)) return "AM04";
  if (/widerspruch|zahlungspflichtigen/.test(normalized)) return "MD06";
  if (/sonstige grunde/.test(normalized)) return "MS02";
  return "";
}

export function decodeBankCsv(buffer) {
  const bytes = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

function inferAdjustmentType(purpose = "") {
  const normalized = normalizeText(purpose);
  if (normalized.includes("einrichtungsgebuhr")) return "setup-fee";
  if (normalized.includes("upgrade") || /\+\s*\d+[,.]\d{2}/.test(purpose)) return "upgrade";
  if (normalized.includes("nachberechnung") || normalized.includes("vormonat")) return "arrears";
  if (normalized.includes("premiumbeitrag")) return "new-membership";
  return "other";
}

function inferServiceMonth(purpose, bookingDate) {
  const monthNames = {
    januar: "01", februar: "02", marz: "03", april: "04", mai: "05", juni: "06",
    juli: "07", august: "08", september: "09", oktober: "10", november: "11", dezember: "12",
  };
  const normalized = normalizeText(purpose);
  const year = bookingDate?.slice(0, 4) || new Date().getFullYear().toString();
  const namedMonth = Object.entries(monthNames).find(([name]) => normalized.includes(name));
  return namedMonth ? `${year}-${namedMonth[1]}` : bookingDate?.slice(0, 7) || "";
}

export function parseNaspaMemberPaymentsCsv(text, { idFactory } = {}) {
  const cleanText = String(text || "").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(cleanText.split(/\r?\n/, 1)[0]);
  const rows = parseRows(cleanText, delimiter);
  if (rows.length < 2) return { batches: [], adjustments: [] };
  const headers = rows[0].map(normalizeText);
  const dateIndex = findColumn(headers, ["buchungstag", "buchungsdatum", "datum"]);
  const valueDateIndex = findColumn(headers, ["valutadatum", "wertstellung"]);
  const amountIndex = headers.findIndex(header => header === "betrag" || header === "umsatz");
  const bookingTextIndex = headers.findIndex(header => header === "buchungstext" || header === "umsatzart");
  const purposeIndex = headers.findIndex(header => header === "verwendungszweck");
  const nameIndex = findColumn(headers, ["zahlungspflichtiger", "begunstigter", "name gegenkonto", "empfanger"]);
  const ibanIndex = findColumn(headers, ["iban gegenkonto", "gegenkonto iban", "iban"]);
  const mandateIndex = findColumn(headers, ["mandatsreferenz"]);
  const referenceIndex = findColumn(headers, ["sammlerreferenz"]);
  const infoIndex = headers.findIndex(header => header === "info" || header === "status");
  const creditorIndex = findColumn(headers, ["glaubiger id"]);
  const makeId = typeof idFactory === "function" ? idFactory : () => crypto.randomUUID();
  const batches = [];
  const adjustments = [];

  rows.slice(1).forEach(columns => {
    const bookingText = String(columns[bookingTextIndex] || "");
    const purpose = String(columns[purposeIndex] || "");
    const normalizedBooking = normalizeText(bookingText);
    const normalizedPurpose = normalizeText(purpose);
    const amount = Math.abs(parseGermanAmount(columns[amountIndex]));
    const bookingDate = parseDate(columns[dateIndex]);
    const valueDate = parseDate(columns[valueDateIndex]);
    const bankStatus = normalizeText(columns[infoIndex]).includes("vorgemerkt") ? "vorgemerkt" : "gebucht";
    const sourceFingerprint = [bookingDate, amount.toFixed(2), columns[referenceIndex] || "", columns[mandateIndex] || "", normalizedPurpose].join("|");
    if (normalizedBooking === "sammel ls einzug" && amount > 0) {
      batches.push({
        id: makeId(),
        bookingDate,
        valueDate,
        financeMonth: bookingDate.slice(0, 7),
        amount,
        itemCount: Number(purpose.match(/ANZAHL\s+(\d+)/i)?.[1]) || 0,
        reference: String(columns[referenceIndex] || ""),
        status: bankStatus,
        purpose,
        sourceFingerprint,
      });
      return;
    }
    const isPdbPayment = normalizedBooking === "einzellastschrifteinzug"
      && (String(columns[creditorIndex] || "").startsWith("DE73ZZZ")
        || normalizedPurpose.includes("premiumbeitrag")
        || normalizedPurpose.includes("einrichtungsgebuhr"));
    if (!isPdbPayment || !amount) return;
    const adjustmentType = inferAdjustmentType(purpose);
    adjustments.push({
      id: makeId(),
      bookingDate,
      valueDate,
      serviceMonth: inferServiceMonth(purpose, bookingDate),
      collectionMonth: bookingDate.slice(0, 7),
      memberName: String(columns[nameIndex] || "Unbekannter Member"),
      iban: normalizeIban(columns[ibanIndex] || ""),
      mandateReference: String(columns[mandateIndex] || ""),
      amount,
      type: adjustmentType,
      status: bankStatus,
      purpose,
      sourceFingerprint,
    });
  });
  return { batches, adjustments };
}

export function getDirectDebitChangesSinceRun({ data, run, items = [] }) {
  if (!run) return [];
  const runItems = items.filter(item => item.runId === run.id);
  const members = new Map((data.members || []).map(member => [member.id, member]));
  const currentMemberships = (data.memberships || []).filter(membership => (
    isMembershipDueInMonth(membership, run.month)
    && String(membership.paymentMethod || "SEPA").toUpperCase() === "SEPA"
  ));
  const itemByMembership = new Map(runItems.filter(item => item.membershipId).map(item => [item.membershipId, item]));
  return currentMemberships.flatMap(membership => {
    const existing = itemByMembership.get(membership.id);
    const member = members.get(membership.memberId) || {};
    const memberName = membership.memberName || member.name || "Unbekannter Member";
    const currentAmount = Number(membership.monthlyAmount) || 0;
    if (!existing) return [{
      key: `new:${membership.id}`,
      type: "new-membership",
      membershipId: membership.id,
      memberId: membership.memberId || member.id || "",
      memberName,
      amount: currentAmount,
      previousAmount: 0,
      currentAmount,
      mandateReference: membership.mandateReference || "",
    }];
    const delta = Math.round((currentAmount - Number(existing.amount || 0)) * 100) / 100;
    if (!delta) return [];
    return [{
      key: `amount:${membership.id}`,
      type: delta > 0 ? "upgrade" : "other",
      membershipId: membership.id,
      memberId: membership.memberId || member.id || "",
      memberName,
      amount: delta,
      previousAmount: Number(existing.amount || 0),
      currentAmount,
      mandateReference: membership.mandateReference || existing.mandateReference || "",
    }];
  });
}

export function parseNaspaReturnCsv(text, { idFactory } = {}) {
  const cleanText = String(text || "").replace(/^\uFEFF/, "");
  const delimiter = detectDelimiter(cleanText.split(/\r?\n/, 1)[0]);
  const rows = parseRows(cleanText, delimiter);
  if (rows.length < 2) return [];
  const headers = rows[0].map(normalizeText);
  const dateIndex = findColumn(headers, ["buchungstag", "buchungsdatum", "datum", "valutadatum"]);
  const amountIndex = headers.findIndex(header => header === "betrag" || header === "umsatz");
  const originalAmountIndex = findColumn(headers, ["lastschrift ursprungsbetrag"]);
  const feeIndex = findColumn(headers, ["auslagenersatz rucklastschrift"]);
  const bookingTextIndex = headers.findIndex(header => header === "buchungstext" || header === "umsatzart");
  const nameIndex = findColumn(headers, ["zahlungspflichtiger", "begunstigter", "name gegenkonto", "empfanger"]);
  const purposeIndex = headers.findIndex(header => header === "verwendungszweck") >= 0
    ? headers.findIndex(header => header === "verwendungszweck")
    : bookingTextIndex;
  const ibanIndex = findColumn(headers, ["iban gegenkonto", "gegenkonto iban", "iban"]);
  const makeId = typeof idFactory === "function" ? idFactory : () => crypto.randomUUID();

  const bankRows = rows.slice(1).map(columns => ({
    columns,
    date: parseDate(columns[dateIndex]),
    name: columns[nameIndex] || "Unbekannt",
    iban: normalizeIban(columns[ibanIndex] || ""),
    bookingAmount: parseGermanAmount(columns[amountIndex]),
    bookingText: String(columns[bookingTextIndex] || ""),
    purpose: String(columns[purposeIndex] || ""),
  }));

  return bankRows.map(bankRow => {
    const { columns } = bankRow;
    const purpose = [columns[purposeIndex], ...columns].filter(Boolean).join(" ");
    const normalizedPurpose = normalizeText(purpose);
    const returnMatch = /(rucklastschrift|lastschriftruckgabe|retoure|return debit|r transaction)/.test(normalizedPurpose);
    const bookingAmount = Math.abs(parseGermanAmount(columns[amountIndex]));
    const originalAmount = Math.abs(parseGermanAmount(columns[originalAmountIndex]));
    const explicitFee = Math.abs(parseGermanAmount(columns[feeIndex]));
    const isNaspaReturn = normalizeText(columns[bookingTextIndex]).includes("ls ruckbelastung");
    if (!returnMatch || (!isNaspaReturn && originalAmount <= 0 && bookingAmount <= 0)) return null;
    const reasonCode = detectReturnReason(purpose);
    const mandateReference = purpose.match(/(?:MANDAT(?:SREFERENZ|SREF)?|MREF)[:\s]+([A-Z0-9._/-]{4,35})/i)?.[1] || "";
    const amount = originalAmount || bookingAmount;
    const fee = explicitFee || Math.round(Math.max(0, bookingAmount - amount) * 100) / 100;
    const transaction = {
      id: makeId(),
      date: parseDate(columns[dateIndex]),
      name: columns[nameIndex] || "Unbekannt",
      amount,
      fee,
      iban: normalizeIban(columns[ibanIndex] || ""),
      purpose: String(columns[purposeIndex] || purpose).slice(0, 500),
      mandateReference,
      reasonCode,
      reason: RETURN_REASON_LABELS[reasonCode] || "Rückgabegrund nicht erkannt",
    };
    const recoveredPayment = bankRows
      .filter(candidate => candidate.date > transaction.date && candidate.bookingAmount > 0)
      .filter(candidate => (
        (normalizeText(candidate.name) && normalizeText(candidate.name) === normalizeText(transaction.name))
        || (candidate.iban && transaction.iban && candidate.iban === transaction.iban)
      ))
      .filter(candidate => candidate.bookingAmount >= transaction.amount && candidate.bookingAmount <= transaction.amount + 50)
      .sort((left, right) => left.date.localeCompare(right.date))[0];
    return {
      ...transaction,
      recoveredPayment: recoveredPayment ? {
        date: recoveredPayment.date,
        amount: recoveredPayment.bookingAmount,
        bookingText: recoveredPayment.bookingText,
        purpose: recoveredPayment.purpose.slice(0, 500),
      } : null,
      sourceFingerprint: returnTransactionFingerprint(transaction),
    };
  }).filter(Boolean);
}

export function suggestDirectDebitItem(transaction, items = []) {
  const transactionName = normalizeText(transaction.name);
  const transactionIban = normalizeIban(transaction.iban);
  const mandate = normalizeText(transaction.mandateReference);
  const candidates = items
    .filter(item => !["zurueckgegeben", "bezahlt", "storniert"].includes(item.status))
    .map(item => {
      let score = 0;
      const reasons = [];
      if (transaction.date?.slice(0, 7) && item.dueDate?.slice(0, 7) === transaction.date.slice(0, 7)) {
        score += 50;
        reasons.push("Abrechnungsmonat");
      }
      if (mandate && normalizeText(item.mandateReference) === mandate) {
        score += 100;
        reasons.push("Mandatsreferenz");
      }
      if (transactionIban && normalizeIban(item.iban) === transactionIban) {
        score += 70;
        reasons.push("IBAN");
      }
      if (Math.abs(Number(item.amount) - Number(transaction.amount)) < 0.01) {
        score += 25;
        reasons.push("Betrag");
      }
      const itemName = normalizeText(item.memberName);
      if (transactionName && itemName && (transactionName === itemName || transactionName.includes(itemName) || itemName.includes(transactionName))) {
        score += 35;
        reasons.push("Name");
      }
      return { item, score, reasons };
    })
    .filter(candidate => candidate.score >= 25)
    .sort((left, right) => right.score - left.score);
  if (!candidates.length) return null;
  const best = candidates[0];
  return {
    ...best,
    confidence: best.score >= 100 ? "hoch" : best.score >= 60 ? "mittel" : "niedrig",
    ambiguous: Boolean(candidates[1] && candidates[1].score === best.score),
  };
}

export function createReturnCase({ item, run, transaction, fee = 0, note = "", idFactory, now = new Date().toISOString() }) {
  if (!item || !run) throw new Error("Lastschriftposition und Lauf werden benötigt.");
  const makeId = typeof idFactory === "function" ? idFactory : () => crypto.randomUUID();
  const caseId = makeId();
  const returnedAt = transaction?.date || now.slice(0, 10);
  const reasonCode = transaction?.reasonCode || "";
  const reason = transaction?.reason || RETURN_REASON_LABELS[reasonCode] || "Manuell erfasst";
  const recoveredPayment = transaction?.recoveredPayment || null;
  const isRecovered = Boolean(recoveredPayment?.date);
  return {
    id: caseId,
    runId: run.id,
    itemId: item.id,
    membershipId: item.membershipId,
    memberId: item.memberId,
    memberName: item.memberName,
    amount: Number(transaction?.amount) || Number(item.amount) || 0,
    fee: Math.max(0, Number(fee) || 0),
    returnedAt,
    reasonCode,
    reason,
    status: isRecovered ? "bezahlt" : "offen",
    nextActionAt: isRecovered ? "" : returnedAt,
    paidAt: recoveredPayment?.date || "",
    paidAmount: Number(recoveredPayment?.amount) || 0,
    note: String(note || "").trim(),
    sourceTransactionId: transaction?.id || "",
    createdAt: now,
    updatedAt: now,
    closedAt: isRecovered ? now : "",
    history: [{
      id: makeId(),
      at: now,
      type: "created",
      text: transaction ? "Rücklastschrift aus Kontoexport übernommen" : "Rücklastschrift manuell erfasst",
    }, ...(isRecovered ? [{
      id: makeId(),
      at: now,
      type: "payment",
      text: `Folgezahlung vom ${recoveredPayment.date} automatisch erkannt`,
    }] : [])],
  };
}

export function updateReturnCase(returnCase, patch, { idFactory, now = new Date().toISOString() } = {}) {
  const makeId = typeof idFactory === "function" ? idFactory : () => crypto.randomUUID();
  const nextStatus = patch.status || returnCase.status;
  const statusLabel = RETURN_CASE_STATUSES.find(status => status.value === nextStatus)?.label || nextStatus;
  const history = [...(returnCase.history || [])];
  if (nextStatus !== returnCase.status) {
    history.push({ id: makeId(), at: now, type: "status", text: `Status geändert: ${statusLabel}` });
  }
  if (patch.historyNote?.trim()) {
    history.push({ id: makeId(), at: now, type: "note", text: patch.historyNote.trim() });
  }
  const closed = ["bezahlt", "storniert"].includes(nextStatus);
  return {
    ...returnCase,
    ...patch,
    historyNote: undefined,
    status: nextStatus,
    closedAt: closed ? (returnCase.closedAt || now) : "",
    updatedAt: now,
    history,
  };
}

export function getReturnCaseSummary(cases = []) {
  const open = cases.filter(item => !["bezahlt", "storniert"].includes(item.status));
  return {
    openCount: open.length,
    openAmount: open.reduce((sum, item) => sum + Number(item.amount || 0) + Number(item.fee || 0), 0),
    recoveredAmount: cases.filter(item => item.status === "bezahlt").reduce((sum, item) => sum + (Number(item.paidAmount) || Number(item.amount || 0) + Number(item.fee || 0)), 0),
  };
}
