const ACTIVITY_DAYS = 14;

function dateInBerlin(value) {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(value));
  const field = type => parts.find(part => part.type === type)?.value;
  return `${field("year")}-${field("month")}-${field("day")}`;
}

function comparableMembership(membership) {
  const { activityLog, updatedAt, ...fields } = membership;
  return fields;
}

function changeDescription(previous, next) {
  if (!previous) return "Membership angelegt";
  const changes = [];
  if (previous.status !== next.status) changes.push(`Status: ${next.status || "offen"}`);
  if (previous.endDate !== next.endDate) changes.push(`Vertragsende: ${next.endDate || "offen"}`);
  if (previous.plan !== next.plan) changes.push(`Paket: ${next.plan || "offen"}`);
  if (previous.monthlyAmount !== next.monthlyAmount) changes.push(`Monatsbeitrag: ${next.monthlyAmount ?? "offen"} €`);
  return changes.join(" · ") || "Membership-Daten geändert";
}

export function recordMembershipActivity(previousMemberships = [], nextMemberships = [], now = new Date()) {
  const previousById = new Map(previousMemberships.map(membership => [membership.id, membership]));
  const changedAt = now.toISOString();
  const date = dateInBerlin(now);
  return nextMemberships.map(membership => {
    const previous = previousById.get(membership.id);
    if (previous && JSON.stringify(comparableMembership(previous)) === JSON.stringify(comparableMembership(membership))) return membership;
    const event = {
      id: `${membership.id}-${changedAt}-${Math.random().toString(36).slice(2, 8)}`,
      date,
      changedAt,
      text: changeDescription(previous, membership),
    };
    return { ...membership, activityLog: [...(previous?.activityLog || membership.activityLog || []), event] };
  });
}

export function getRecentMembershipActivity(memberships = [], today, days = ACTIVITY_DAYS) {
  const cutoff = new Date(`${today}T12:00:00Z`);
  cutoff.setUTCDate(cutoff.getUTCDate() - days);
  const cutoffDate = cutoff.toISOString().slice(0, 10);
  return memberships.flatMap(membership => {
    const log = membership.activityLog || [];
    const events = log.length ? log : membership.updatedAt
      ? [{ id: `${membership.id}-legacy-${membership.updatedAt}`, date: membership.updatedAt.slice(0, 10), text: membership.status === "abgelaufen" ? "Beendigung erfasst" : "Membership-Daten geändert" }]
      : [];
    const recentEvents = events
      .filter(event => event.date >= cutoffDate && event.date <= today)
      .sort((a, b) => (b.changedAt || b.date).localeCompare(a.changedAt || a.date));
    if (!recentEvents.length) return [];

    // Repeated saves can create the same visible message on one day. Keep the
    // stored log intact, but show each message only once in this overview.
    const seen = new Set();
    const changes = recentEvents.filter(event => {
      const key = `${event.date}:${event.text}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const latest = recentEvents[0];
    const headline = changes.find(event => event.date === latest.date && event.text !== "Membership-Daten geändert") || latest;
    return [{ membership, ...latest, text: headline.text, changes }];
  }).sort((a, b) => (b.changedAt || b.date).localeCompare(a.changedAt || a.date));
}
