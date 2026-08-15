import { REVENUE_CHANNELS } from "./revenueUtils.js";

const editableKeys = ["date", ...REVENUE_CHANNELS.map(channel => channel.key), "note"];

export function revenueEntrySnapshot(entry = {}) {
  const { undoSnapshot, updatedAt, restoredAt, ...snapshot } = entry;
  return snapshot;
}

export function revenueEntryHasChanges(draft, saved) {
  if (!saved) {
    return REVENUE_CHANNELS.some(channel => Number(draft?.[channel.key]) > 0) || Boolean(String(draft?.note || "").trim());
  }
  return editableKeys.some(key => String(draft?.[key] ?? "") !== String(saved?.[key] ?? ""));
}

export function createRevenueEntryRevision(draft, saved, updatedAt) {
  const next = {
    ...revenueEntrySnapshot(draft),
    id: draft.id || `revenue-${draft.date}`,
    source: draft.source || saved?.source || "CRM",
    updatedAt,
  };
  if (saved) next.undoSnapshot = revenueEntrySnapshot(saved);
  return next;
}

export function undoRevenueEntry(entry, updatedAt) {
  if (!entry?.undoSnapshot) return entry;
  return {
    ...entry.undoSnapshot,
    updatedAt,
    restoredAt: updatedAt,
  };
}
