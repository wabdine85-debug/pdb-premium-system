const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

export function timeToMinutes(value) {
  const match = TIME_PATTERN.exec(value || "");
  if (!match) return null;

  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return (hours * 60) + minutes;
}

export function calculateNetMinutes(entry) {
  const start = timeToMinutes(entry?.startTime);
  const end = timeToMinutes(entry?.endTime);
  const breakMinutes = Math.max(0, Number(entry?.breakMinutes) || 0);

  if (start === null || end === null || end <= start) return 0;
  return Math.max(0, end - start - breakMinutes);
}

export function formatMinutes(totalMinutes) {
  const safeMinutes = Math.max(0, Math.round(Number(totalMinutes) || 0));
  const hours = Math.floor(safeMinutes / 60);
  const minutes = safeMinutes % 60;
  return `${hours}:${String(minutes).padStart(2, "0")} Std.`;
}

export function entriesForMonth(entries, month) {
  return (entries || []).filter(entry => entry.date?.slice(0, 7) === month);
}

export function summarizeMonth(entries, staffMembers, month) {
  const monthlyEntries = entriesForMonth(entries, month);
  const totals = new Map((staffMembers || []).map(member => [member.id, 0]));

  monthlyEntries.forEach(entry => {
    totals.set(entry.staffMemberId, (totals.get(entry.staffMemberId) || 0) + calculateNetMinutes(entry));
  });

  return {
    entries: monthlyEntries,
    totalMinutes: monthlyEntries.reduce((sum, entry) => sum + calculateNetMinutes(entry), 0),
    totals,
  };
}
