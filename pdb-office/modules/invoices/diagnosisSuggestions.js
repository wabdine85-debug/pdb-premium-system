const DIAGNOSIS_TEMPLATES = {
  hws: {
    title: "HWS-Syndrom / Beschwerden der Halswirbelsäule",
    symptoms: ["Nacken- und Schulterverspannungen", "eingeschränkte Beweglichkeit", "Kopfschmerz möglich", "ausstrahlende Beschwerden in Arm/Hand möglich"],
    causes: ["muskuläre Dysbalancen", "Fehlhaltung / Bildschirmarbeit", "Blockierungen im Bereich der Halswirbelsäule", "Stressbedingte Tonuserhöhung"],
    treatments: ["klinische Befundung und Funktionsprüfung", "manuelle bzw. physiotherapeutische Maßnahmen", "Wärme, Mobilisation und Haltungsschulung", "ärztliche Abklärung bei neurologischen Ausfällen, Trauma oder starken Schmerzen"],
  },
  lws: {
    title: "LWS-Beschwerden / Lumbalgie",
    symptoms: ["Schmerzen im unteren Rücken", "Bewegungseinschränkung", "mögliche Ausstrahlung in Gesäß/Bein", "Belastungs- oder Sitzschmerz"],
    causes: ["muskuläre Überlastung", "Fehlbelastung", "Facettengelenk-/ISG-Irritation", "Bandscheibenbezogene Beschwerden möglich"],
    treatments: ["Funktionsprüfung und Schmerzanamnese", "Mobilisation und stabilisierende Übungen", "Wärme und entlastende Lagerung", "ärztliche Abklärung bei Taubheit, Kraftverlust oder Blasen-/Darmstörungen"],
  },
  bws: {
    title: "BWS-Beschwerden / Brustwirbelsäule",
    symptoms: ["Schmerzen zwischen den Schulterblättern", "Druck- oder Engegefühl", "eingeschränkte Rotation", "atemabhängige Beschwerden möglich"],
    causes: ["Haltungsbelastung", "Rippen-/Wirbelgelenk-Irritation", "muskuläre Verspannung", "Stress und flache Atmung"],
    treatments: ["Beweglichkeitsprüfung", "Mobilisation der BWS/Rippenregion", "Atem- und Haltungsschulung", "ärztliche Abklärung bei Brustschmerz, Luftnot oder unklarer Symptomatik"],
  },
};

const DIAGNOSIS_ALIASES = {
  hws: ["hws", "halswirbelsaeule", "halswirbelsaule", "nacken"],
  bws: ["bws", "brustwirbelsaeule", "brustwirbelsaule", "schulterblaetter", "schulterblatter"],
  lws: ["lws", "lumbalgie", "lendenwirbelsaeule", "lendenwirbelsaule", "unterer ruecken", "unterer rucken", "isg"],
};

function normalizeDiagnosisInput(input) {
  return String(input || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function findTemplateKeys(input) {
  const normalized = normalizeDiagnosisInput(input);
  if (!normalized) return [];
  return Object.entries(DIAGNOSIS_ALIASES)
    .filter(([, aliases]) => aliases.some(alias => normalized.includes(alias)))
    .map(([key]) => key);
}

function formatTemplate(template) {
  return [
    `Befund: ${template.title}`,
    "",
    "Symptome:",
    ...template.symptoms.map(item => `- ${item}`),
    "",
    "Mögliche Ursachen:",
    ...template.causes.map(item => `- ${item}`),
    "",
    "Behandlungsmöglichkeiten:",
    ...template.treatments.map(item => `- ${item}`),
  ].join("\n");
}

export function buildDiagnosisSuggestion(input) {
  const keys = findTemplateKeys(input);
  if (keys.length > 0) return keys.map(key => formatTemplate(DIAGNOSIS_TEMPLATES[key])).join("\n\n---\n\n");

  return [
    `Befund: ${String(input || "Bitte Befund ergänzen").trim() || "Bitte Befund ergänzen"}`,
    "",
    "Symptome:",
    "- bitte Symptome stichpunktartig ergänzen",
    "",
    "Mögliche Ursachen:",
    "- bitte Ursache/Anamnese ergänzen",
    "",
    "Behandlungsmöglichkeiten:",
    "- Befundorientierte Beratung und Dokumentation",
    "- Behandlung nach medizinischer Indikation",
    "- ärztliche Abklärung bei unklarer oder akuter Symptomatik",
  ].join("\n");
}
