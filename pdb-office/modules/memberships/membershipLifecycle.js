export function isMembershipActiveOnDate(membership, date) {
  if (!membership || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) return false;
  const status = membership.status || "aktiv";
  if (membership.startDate && membership.startDate > date) return false;
  if (status === "aktiv") return true;
  return status === "gekündigt" && Boolean(membership.endDate) && membership.endDate > date;
}
