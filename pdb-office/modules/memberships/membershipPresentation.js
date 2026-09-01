export function getMembershipNextAction(membership, today) {
  if (membership.reactivationSepaStatus === "offen") {
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

export function isMembershipIncludedInPlannedRevenue(membership, today) {
  const status = membership?.status || "aktiv";
  return ["aktiv", "vorbereitung"].includes(status)
    || (status === "pausiert" && Boolean(membership.scheduledReactivationAt))
    || (status === "gekündigt" && Boolean(membership.endDate) && membership.endDate >= today);
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
