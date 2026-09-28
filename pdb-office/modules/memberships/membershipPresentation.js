export function getMembershipNextAction(membership, today) {
  if (membership.reactivationSepaStatus === "offen" && isDueWithinNextPlanningMonth(
    membership.reactivationSepaDueAt || membership.scheduledReactivationAt,
    today,
  )) {
    return {
      tone: "warning",
      label: "NASPA-SEPA einrichten",
      date: membership.reactivationSepaDueAt || membership.scheduledReactivationAt || "",
    };
  }
  if (membership.status === "pausiert") {
    return membership.scheduledReactivationAt
      ? { tone: "info", label: "Reaktivierung geplant", date: membership.scheduledReactivationAt }
      : { tone: "warning", label: "Reaktivierung planen", date: "" };
  }
  if (membership.setupBankingStatus && !["erledigt", "geprüft"].includes(membership.setupBankingStatus)) {
    return { tone: "warning", label: "SEPA einrichten", date: membership.startDate || "" };
  }
  if (membership.setupFeeStatus === "offen") {
    return { tone: "warning", label: "Einrichtungsgebühr abbuchen", date: membership.startDate || "" };
  }
  if (membership.scheduledPlan) {
    return { tone: "info", label: `Wechsel auf ${membership.scheduledPlan}`, date: membership.scheduledStartDate || "" };
  }
  if (membership.status === "gekündigt") {
    return { tone: "danger", label: "Vertragsende", date: membership.endDate || "" };
  }
  if (membership.status === "vorbereitung") {
    return { tone: "info", label: "Member-Start vorbereiten", date: membership.startDate || "" };
  }
  if (membership.endDate && membership.endDate >= today) {
    return { tone: "neutral", label: "Keine offene Aufgabe", date: "" };
  }
  return { tone: "neutral", label: "Keine offene Aufgabe", date: "" };
}

function getNextPlanningMonthBounds(today) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(today || "")) return null;
  const [year, month] = today.split("-").map(Number);
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));
  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

export function isDueWithinNextPlanningMonth(date, today) {
  const bounds = getNextPlanningMonthBounds(today);
  return Boolean(bounds && /^\d{4}-\d{2}-\d{2}$/.test(date || "") && date <= bounds.end);
}

export function isMembershipIncludedInPlannedRevenue(membership, today) {
  const bounds = getNextPlanningMonthBounds(today);
  if (!bounds) return false;
  const status = membership?.status || "aktiv";
  const hasStartedByMonthEnd = !membership.startDate || membership.startDate <= bounds.end;
  if (!hasStartedByMonthEnd) return false;
  if (["aktiv", "vorbereitung"].includes(status)) return true;
  if (status === "pausiert") {
    return Boolean(membership.scheduledReactivationAt && membership.scheduledReactivationAt <= bounds.end);
  }
  return status === "gekündigt" && Boolean(membership.endDate) && membership.endDate > bounds.start;
}

export function getMembershipPlannedAmount(membership, today, planAmounts = {}) {
  const bounds = getNextPlanningMonthBounds(today);
  const currentAmount = Number(membership?.monthlyAmount) || 0;
  if (!bounds || !membership?.scheduledPlan || !membership.scheduledStartDate || membership.scheduledStartDate > bounds.end) {
    return currentAmount;
  }
  return membership.scheduledPlan === "Individuell"
    ? Number(membership.scheduledMonthlyAmount || membership.monthlyAmount) || 0
    : Number(planAmounts[membership.scheduledPlan]) || 0;
}

export function createMembershipTimeline(membership) {
  const pauses = (membership.pauseHistory || []).map(pause => ({
    id: `pause-${pause.id || pause.startDate}`,
    date: pause.endDate || pause.plannedEndDate || pause.startDate,
    title: pause.endDate ? "Pause abgeschlossen" : "Pause geplant",
    detail: [
      `${pause.startDate || "offen"} – ${pause.endDate || pause.plannedEndDate || "offen"}`,
      pause.days != null ? `${pause.days} Pausentage` : "Laufzeitverlängerung bei Reaktivierung",
      pause.previousContractEndDate && pause.extendedContractEndDate
        ? `Vertragsende ${pause.previousContractEndDate} → ${pause.extendedContractEndDate}`
        : "",
      pause.note || "",
    ].filter(Boolean).join(" · "),
  }));
  const planChanges = (membership.planChangeHistory || []).map(change => ({
    id: `plan-${change.id || change.createdAt || change.effectiveDate}`,
    date: change.effectiveDate || change.createdAt || "",
    title: "Paket geändert",
    detail: `${change.fromPlan || "Offen"} → ${change.toPlan || membership.plan || "Offen"}`,
  }));
  const sepaChanges = (membership.reactivationSepaHistory || []).map(change => ({
    id: `sepa-${change.id || change.date}`,
    date: change.date || change.dueDate || "",
    title: change.status === "erledigt" ? "NASPA-SEPA eingerichtet" : "NASPA-SEPA als Aufgabe angelegt",
    detail: change.dueDate ? `Gültig ab ${change.dueDate}${change.note ? ` · ${change.note}` : ""}` : (change.note || ""),
  }));
  return [...pauses, ...planChanges, ...sepaChanges]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""));
}
