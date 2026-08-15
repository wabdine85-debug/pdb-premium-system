import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_INVOICE_PROFILE_ID, defaultInvoiceProfiles } from "../modules/invoices/invoiceProfiles.js";
import revenueSeed from "../data/revenue-seed-default.json";
import { getStorageRevision } from "./storageRevision.js";

const STORAGE_KEY = "crm_data_v1";
const FILE_STORAGE_ENDPOINT = "/api/office/crm-data";
const REMOVED_MEMBERSHIP_IDS = new Set(["4znpbozb", "kat3nvr9"]);

const defaultData = {
  members: [],
  invoices: [],
  memberships: [],
  reminders: [],
  bankTransactions: [],
  revenueEntries: revenueSeed.entries,
  revenueReceivables: revenueSeed.receivables,
  revenuePremiumFallbacks: revenueSeed.premiumFallbacks,
  revenueReports: [],
  staffLedger: [],
  staffMembers: [],
  workTimeEntries: [],
  invoiceProfiles: defaultInvoiceProfiles,
  settings: {
    companyName: "Mein Unternehmen",
    companyAddress: "Musterstraße 1, 12345 Musterstadt",
    companyEmail: "info@meinunternehmen.de",
    taxNumber: "USt-ID: DE123456789",
    invoicePrefix: "RE",
    nextInvoiceNumber: 1001,
    currency: "EUR",
    taxRate: 19,
  },
};

function legacySettingsToInvoiceProfile(settings = {}) {
  return {
    ...defaultInvoiceProfiles[0],
    companyName: settings.companyName || defaultInvoiceProfiles[0].companyName,
    companyAddress: settings.companyAddress || defaultInvoiceProfiles[0].companyAddress,
    companyEmail: settings.companyEmail || defaultInvoiceProfiles[0].companyEmail,
    taxNumber: settings.taxNumber || defaultInvoiceProfiles[0].taxNumber,
    invoicePrefix: settings.invoicePrefix || defaultInvoiceProfiles[0].invoicePrefix,
    nextInvoiceNumber: Number(settings.nextInvoiceNumber) || defaultInvoiceProfiles[0].nextInvoiceNumber,
    defaultTaxRate: Number.isFinite(Number(settings.taxRate)) ? Number(settings.taxRate) : defaultInvoiceProfiles[0].defaultTaxRate,
  };
}

export function migrateData(rawData) {
  const merged = { ...defaultData, ...(rawData || {}) };
  const hasRevenueEntries = Array.isArray(rawData?.revenueEntries);
  const hasRevenueReceivables = Array.isArray(rawData?.revenueReceivables);
  const incomingProfiles = Array.isArray(merged.invoiceProfiles) ? merged.invoiceProfiles : [];
  const profileMap = new Map(defaultInvoiceProfiles.map(profile => [profile.id, profile]));
  const hasPrimaryProfile = incomingProfiles.some(profile => profile?.id === DEFAULT_INVOICE_PROFILE_ID);

  incomingProfiles.forEach(profile => {
    if (!profile?.id) return;
    profileMap.set(profile.id, { ...(profileMap.get(profile.id) || {}), ...profile });
  });

  profileMap.set(DEFAULT_INVOICE_PROFILE_ID, {
    ...(profileMap.get(DEFAULT_INVOICE_PROFILE_ID) || defaultInvoiceProfiles[0]),
    ...(hasPrimaryProfile ? {} : legacySettingsToInvoiceProfile(merged.settings)),
    id: DEFAULT_INVOICE_PROFILE_ID,
    name: profileMap.get(DEFAULT_INVOICE_PROFILE_ID)?.name || "PDB Aesthetic Room",
  });

  const invoiceProfiles = Array.from(profileMap.values());
  return {
    ...merged,
    revenueEntries: hasRevenueEntries ? rawData.revenueEntries : revenueSeed.entries,
    revenueReceivables: hasRevenueReceivables ? rawData.revenueReceivables : revenueSeed.receivables,
    revenuePremiumFallbacks: { ...revenueSeed.premiumFallbacks, ...(rawData?.revenuePremiumFallbacks || {}) },
    revenueReports: Array.isArray(rawData?.revenueReports) ? rawData.revenueReports : [],
    staffLedger: Array.isArray(rawData?.staffLedger) ? rawData.staffLedger : [],
    staffMembers: Array.isArray(rawData?.staffMembers) ? rawData.staffMembers : [],
    workTimeEntries: Array.isArray(rawData?.workTimeEntries) ? rawData.workTimeEntries : [],
    invoiceProfiles,
    memberships: (merged.memberships || []).filter(membership => !REMOVED_MEMBERSHIP_IDS.has(membership.id)),
    invoices: (merged.invoices || []).map(invoice => ({
      ...invoice,
      invoiceProfileId: invoice.invoiceProfileId || DEFAULT_INVOICE_PROFILE_ID,
    })),
  };
}

function loadData() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return migrateData(JSON.parse(raw));
  } catch {}
  return migrateData(defaultData);
}

function hasMeaningfulData(data) {
  return (data.members || []).length > 0
    || (data.memberships || []).length > 0
    || (data.invoices || []).length > 0
    || (data.revenueEntries || []).length > 0
    || (data.staffMembers || []).length > 0
    || (data.workTimeEntries || []).length > 0;
}

function dataWeight(data) {
  return (data.members || []).length
    + ((data.memberships || []).length * 10)
    + ((data.invoices || []).length * 5)
    + ((data.revenueEntries || []).length * 2)
    + ((data.revenueReports || []).length * 3)
    + ((data.staffMembers || []).length * 2)
    + ((data.workTimeEntries || []).length * 2);
}

function dataTimestamp(data) {
  const explicitTimestamp = Date.parse(data?._storageUpdatedAt || "");
  if (Number.isFinite(explicitTimestamp)) return explicitTimestamp;

  const collections = [
    data?.members,
    data?.memberships,
    data?.invoices,
    data?.reminders,
    data?.bankTransactions,
    data?.revenueEntries,
    data?.revenueReceivables,
    data?.revenueReports,
    data?.staffLedger,
    data?.staffMembers,
    data?.workTimeEntries,
  ];

  return collections.reduce((latest, collection) => (
    (collection || []).reduce((collectionLatest, record) => {
      const recordTimestamp = Math.max(
        Date.parse(record?.updatedAt || "") || 0,
        Date.parse(record?.createdAt || "") || 0,
      );
      return Math.max(collectionLatest, recordTimestamp);
    }, latest)
  ), 0);
}

function compareDataFreshness(left, right) {
  const revisionDelta = getStorageRevision(left) - getStorageRevision(right);
  if (revisionDelta) return revisionDelta;

  const timestampDelta = dataTimestamp(left) - dataTimestamp(right);
  if (timestampDelta) return timestampDelta;

  return dataWeight(left) - dataWeight(right);
}

function stampData(previous, next) {
  return {
    ...next,
    _storageRevision: Math.max(getStorageRevision(previous), getStorageRevision(next)) + 1,
    _storageUpdatedAt: new Date().toISOString(),
  };
}

function persistLocal(data) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); } catch {}
}

async function persistFile(data) {
  if (!hasMeaningfulData(data)) return null;
  return fetch(FILE_STORAGE_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-PDB-Admin": "1" },
    body: JSON.stringify(data),
  }).catch(() => null);
}

export function useStorage() {
  const [data, setData] = useState(loadData);
  const dataRef = useRef(data);

  useEffect(() => {
    let cancelled = false;
    fetch(FILE_STORAGE_ENDPOINT, { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(raw => {
        if (cancelled || !raw) return;
        const fileData = migrateData(raw);
        const localHasEncodingDamage = JSON.stringify(data).includes("�");
        if (!hasMeaningfulData(fileData)) return;
        if (!hasMeaningfulData(data) || localHasEncodingDamage || compareDataFreshness(fileData, data) > 0) {
          persistLocal(fileData);
          dataRef.current = fileData;
          setData(fileData);
          return;
        }
        if (getStorageRevision(fileData) === getStorageRevision(data) && JSON.stringify(data) !== JSON.stringify(fileData)) {
          persistLocal(fileData);
          dataRef.current = fileData;
          setData(fileData);
          return;
        }
        if (compareDataFreshness(data, fileData) >= 0 && JSON.stringify(data) !== JSON.stringify(fileData)) {
          persistFile(data);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const save = useCallback((updater) => {
    const previous = dataRef.current;
    const updated = typeof updater === "function" ? updater(previous) : updater;
    const next = stampData(previous, updated);
    dataRef.current = next;
    persistLocal(next);
    setData(next);
    persistFile(next).then(async response => {
      if (response?.status !== 409) return;
      try {
        const currentResponse = await fetch(FILE_STORAGE_ENDPOINT, { cache: "no-store" });
        if (!currentResponse.ok) return;
        const fileData = migrateData(await currentResponse.json());
        dataRef.current = fileData;
        persistLocal(fileData);
        setData(fileData);
        window.alert("Ein neuerer CRM-Datenstand wurde geladen. Bitte prüfen Sie Ihre letzte Änderung und führen Sie sie bei Bedarf erneut aus.");
      } catch {}
    });
  }, []);

  return [data, save];
}
