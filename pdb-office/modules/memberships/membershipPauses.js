const DAY_IN_MS = 24 * 60 * 60 * 1000;

function parseDateOnly(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return null;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

export function getPauseDays(startDate, endDate) {
  const start = parseDateOnly(startDate);
  const end = parseDateOnly(endDate);
  if (!start || !end || end < start) return null;
  return Math.round((end.getTime() - start.getTime()) / DAY_IN_MS);
}

export function extendDateByDays(dateValue, days) {
  const date = parseDateOnly(dateValue);
  if (!date || !Number.isInteger(days) || days < 0) return dateValue || "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function startMembershipPause(membership, { id, startDate, plannedEndDate = "", note = "" }) {
  if (!id) throw new Error("Für die Pause fehlt eine ID.");
  if (!parseDateOnly(startDate)) throw new Error("Bitte einen gültigen Pausenbeginn eintragen.");
  if (plannedEndDate && getPauseDays(startDate, plannedEndDate) == null) throw new Error("Das geplante Pausenende darf nicht vor dem Pausenbeginn liegen.");
  if (membership.currentPause || (membership.pauseHistory || []).some(pause => !pause.endDate)) throw new Error("Diese Membership hat bereits eine offene Pause.");
  const pause = { id, startDate, plannedEndDate, endDate: "", days: null, note: note.trim() };
  return { ...membership, status: "pausiert", pausedAt: startDate, currentPause: pause, pauseHistory: [...(membership.pauseHistory || []), pause] };
}

function findOpenPause(membership, fallbackStartDate, id) {
  return membership.currentPause
    || [...(membership.pauseHistory || [])].reverse().find(pause => !pause.endDate)
    || (fallbackStartDate ? { id, startDate: fallbackStartDate, plannedEndDate: "", endDate: "", days: null, note: "" } : null);
}

function replaceOrAppendPause(history, openPause, nextPause) {
  const existingIndex = history.findIndex(pause => pause.id && pause.id === openPause.id);
  return existingIndex >= 0 ? history.map((pause, index) => index === existingIndex ? nextPause : pause) : [...history, nextPause];
}

export function resumeMembership(membership, { endDate, fallbackStartDate = "", note = "", id = "" }) {
  const openPause = findOpenPause(membership, fallbackStartDate, id);
  if (!openPause?.startDate) throw new Error("Bitte den Beginn der bisherigen Pause eintragen.");
  const days = getPauseDays(openPause.startDate, endDate);
  if (days == null) throw new Error("Das Ende der Pause darf nicht vor dem Beginn liegen.");
  const previousEndDate = membership.endDate || "";
  const extendedEndDate = previousEndDate ? extendDateByDays(previousEndDate, days) : "";
  const completedPause = { ...openPause, id: openPause.id || id, endDate, days, note: note.trim() || openPause.note || "", previousContractEndDate: previousEndDate, extendedContractEndDate: extendedEndDate };
  const pauseHistory = replaceOrAppendPause(membership.pauseHistory || [], openPause, completedPause);
  return {
    ...membership,
    status: "aktiv",
    pausedAt: "",
    currentPause: null,
    pauseHistory,
    totalPausedDays: pauseHistory.reduce((sum, pause) => sum + (Number(pause.days) || 0), 0),
    endDate: extendedEndDate || previousEndDate,
    reactivatedAt: endDate,
    scheduledReactivationAt: "",
  };
}

export function scheduleMembershipResume(membership, { endDate, fallbackStartDate = "", note = "", id = "" }) {
  const openPause = findOpenPause(membership, fallbackStartDate, id);
  if (!openPause?.startDate) throw new Error("Bitte den Beginn der bisherigen Pause eintragen.");
  if (getPauseDays(openPause.startDate, endDate) == null) throw new Error("Das geplante Ende der Pause darf nicht vor dem Beginn liegen.");
  const plannedPause = { ...openPause, id: openPause.id || id, plannedEndDate: endDate, note: note.trim() || openPause.note || "" };
  return {
    ...membership,
    status: "pausiert",
    pausedAt: openPause.startDate,
    currentPause: plannedPause,
    pauseHistory: replaceOrAppendPause(membership.pauseHistory || [], openPause, plannedPause),
    scheduledReactivationAt: endDate,
  };
}

export function getLatestPause(membership) {
  return membership.currentPause || (membership.pauseHistory || []).at(-1) || null;
}
