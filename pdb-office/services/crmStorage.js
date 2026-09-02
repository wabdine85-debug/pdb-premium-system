import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_INVOICE_PROFILE_ID, defaultInvoiceProfiles } from "../modules/invoices/invoiceProfiles.js";
import revenueSeed from "../data/revenue-seed-default.json";
import { normalizeRevenueEntry } from "../modules/revenue/revenueUtils.js";
import { getStorageRevision } from "./storageRevision.js";
import { rebaseDataChange } from "./storageMerge.js";

const STORAGE_KEY = "crm_data_v1";
const MANUAL_BACKUP_KEY = "crm_manual_backup_v1";
const INVOICE_RECOVERY_KEY = "crm_invoice_recovery_v1";
const FILE_STORAGE_ENDPOINT = "/api/office/crm-data";
const REMOVED_MEMBERSHIP_IDS = new Set(["4znpbozb", "kat3nvr9"]);

const defaultData = {
  members: [],
  invoices: [],
  offers: [],
  memberships: [],
  reminders: [],
  bankTransactions: [],
  directDebitRuns: [],
  directDebitItems: [],
  directDebitAdjustments: [],
  returnDebitCases: [],
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
    revenueEntries: (hasRevenueEntries ? rawData.revenueEntries : revenueSeed.entries).map(normalizeRevenueEntry),
    revenueReceivables: hasRevenueReceivables ? rawData.revenueReceivables : revenueSeed.receivables,
    revenuePremiumFallbacks: { ...revenueSeed.premiumFallbacks, ...(rawData?.revenuePremiumFallbacks || {}) },
    revenueReports: Array.isArray(rawData?.revenueReports) ? rawData.revenueReports : [],
    staffLedger: Array.isArray(rawData?.staffLedger) ? rawData.staffLedger : [],
    staffMembers: Array.isArray(rawData?.staffMembers) ? rawData.staffMembers : [],
    workTimeEntries: Array.isArray(rawData?.workTimeEntries) ? rawData.workTimeEntries : [],
    directDebitRuns: Array.isArray(rawData?.directDebitRuns) ? rawData.directDebitRuns : [],
    directDebitItems: Array.isArray(rawData?.directDebitItems) ? rawData.directDebitItems : [],
    directDebitAdjustments: Array.isArray(rawData?.directDebitAdjustments) ? rawData.directDebitAdjustments : [],
    returnDebitCases: Array.isArray(rawData?.returnDebitCases) ? rawData.returnDebitCases : [],
    invoiceProfiles,
    memberships: (merged.memberships || []).filter(membership => !REMOVED_MEMBERSHIP_IDS.has(membership.id)),
    invoices: (merged.invoices || []).map(invoice => ({
      ...invoice,
      invoiceProfileId: invoice.invoiceProfileId || DEFAULT_INVOICE_PROFILE_ID,
    })),
    offers: (merged.offers || []).map(offer => ({
      ...offer,
      invoiceProfileId: offer.invoiceProfileId || DEFAULT_INVOICE_PROFILE_ID,
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
    || (data.offers || []).length > 0
    || (data.revenueEntries || []).length > 0
    || (data.staffMembers || []).length > 0
    || (data.workTimeEntries || []).length > 0
    || (data.directDebitRuns || []).length > 0
    || (data.returnDebitCases || []).length > 0;
}

function stampData(previous, next) {
  return {
    ...next,
    _storageRevision: Math.max(getStorageRevision(previous), getStorageRevision(next)) + 1,
    _storageUpdatedAt: new Date().toISOString(),
  };
}

function preserveInvoiceRecovery(raw) {
  if (!raw) return;
  try {
    const data = JSON.parse(raw);
    if ((!Array.isArray(data?.invoices) || data.invoices.length === 0)
      && (!Array.isArray(data?.offers) || data.offers.length === 0)) return;
    localStorage.setItem(INVOICE_RECOVERY_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      storageRevision: getStorageRevision(data),
      invoices: data.invoices,
      offers: data.offers || [],
      invoiceProfiles: data.invoiceProfiles || [],
    }));
  } catch {}
}

function persistLocal(data) {
  try {
    const next = JSON.stringify(data);
    const current = localStorage.getItem(STORAGE_KEY);
    if (current && current !== next) preserveInvoiceRecovery(current);
    localStorage.setItem(STORAGE_KEY, next);
    return true;
  } catch {
    return false;
  }
}

function persistManualBackup(data) {
  try {
    localStorage.setItem(MANUAL_BACKUP_KEY, JSON.stringify({
      savedAt: new Date().toISOString(),
      data,
    }));
    return true;
  } catch {
    return false;
  }
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
  const [syncStatus, setSyncStatus] = useState("loading");
  const dataRef = useRef(data);
  const syncQueueRef = useRef(Promise.resolve(true));
  const syncRequestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    const loadBaseline = dataRef.current;
    fetch(FILE_STORAGE_ENDPOINT, { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(raw => {
        if (cancelled) return;
        if (!raw) {
          setSyncStatus("error");
          return;
        }
        const fileData = migrateData(raw);
        if (!hasMeaningfulData(fileData)) {
          setSyncStatus("error");
          return;
        }
        // A save may finish while the initial request is still in flight.
        // Never replace that new local change with the older response.
        if (dataRef.current !== loadBaseline) return;
        // The server is authoritative. A stale browser cache must never upload
        // itself automatically and overwrite changes made on another device.
        persistLocal(fileData);
        dataRef.current = fileData;
        setData(fileData);
        setSyncStatus("saved");
      })
      .catch(() => setSyncStatus("error"));
    return () => { cancelled = true; };
  }, []);

  const persistCurrentToServer = useCallback(async (baseData) => {
    const response = await persistFile(dataRef.current);
    if (response?.ok) return true;
    if (response?.status !== 409) return false;

    try {
      const currentResponse = await fetch(FILE_STORAGE_ENDPOINT, { cache: "no-store" });
      if (!currentResponse.ok) return false;
      const fileData = migrateData(await currentResponse.json());
      const localData = dataRef.current;
      const rebased = stampData(fileData, rebaseDataChange(baseData, localData, fileData));
      dataRef.current = rebased;
      persistLocal(rebased);
      setData(rebased);
      const retryResponse = await persistFile(rebased);
      return Boolean(retryResponse?.ok);
    } catch {
      return false;
    }
  }, []);

  const enqueueServerSync = useCallback((baseData) => {
    const requestId = ++syncRequestRef.current;
    setSyncStatus("saving");
    const operation = syncQueueRef.current
      .catch(() => false)
      .then(() => persistCurrentToServer(baseData));
    syncQueueRef.current = operation;
    operation.then(ok => {
      if (requestId === syncRequestRef.current) setSyncStatus(ok ? "saved" : "error");
    });
    return operation;
  }, [persistCurrentToServer]);

  const save = useCallback((updater) => {
    const previous = dataRef.current;
    const updated = typeof updater === "function" ? updater(previous) : updater;
    const next = stampData(previous, updated);
    dataRef.current = next;
    const locallySaved = persistLocal(next);
    setData(next);
    if (!locallySaved) setSyncStatus("error");
    enqueueServerSync(previous);
  }, [enqueueServerSync]);

  const secureNow = useCallback(async () => {
    const snapshot = dataRef.current;
    const initialBackupSaved = persistManualBackup(snapshot);
    const serverSaved = await enqueueServerSync(snapshot);
    const finalBackupSaved = persistManualBackup(dataRef.current);
    return initialBackupSaved && finalBackupSaved && serverSaved;
  }, [enqueueServerSync]);

  return [data, save, syncStatus, secureNow];
}
