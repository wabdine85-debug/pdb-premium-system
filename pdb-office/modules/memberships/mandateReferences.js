const REFERENCE_PATTERN = /^PDB-M-(\d{4})-(\d{4})$/;

export function formatMandateReference(year, sequence) {
  const normalizedYear = Number(year);
  const normalizedSequence = Number(sequence);
  if (!Number.isInteger(normalizedYear) || normalizedYear < 2000 || normalizedYear > 9999) {
    throw new Error("Ungültiges Jahr für die Mandatsreferenz.");
  }
  if (!Number.isInteger(normalizedSequence) || normalizedSequence < 1 || normalizedSequence > 9999) {
    throw new Error("Ungültige laufende Nummer für die Mandatsreferenz.");
  }
  return `PDB-M-${normalizedYear}-${String(normalizedSequence).padStart(4, "0")}`;
}

export function getNextMandateReference(memberships = [], year = new Date().getFullYear()) {
  const highestSequence = memberships.reduce((highest, membership) => {
    const match = String(membership?.mandateReference || "").trim().match(REFERENCE_PATTERN);
    if (!match || Number(match[1]) !== Number(year)) return highest;
    return Math.max(highest, Number(match[2]));
  }, 0);

  return formatMandateReference(year, highestSequence + 1);
}

export function isSystemMandateReference(value) {
  return REFERENCE_PATTERN.test(String(value || "").trim());
}
