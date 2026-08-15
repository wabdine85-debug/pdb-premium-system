export function getStorageRevision(data) {
  return Number(data?._storageRevision) || 0;
}

export function classifyStorageWrite(incoming, current) {
  const incomingRevision = getStorageRevision(incoming);
  const currentRevision = getStorageRevision(current);
  if (incomingRevision > currentRevision) return "newer";
  if (incomingRevision < currentRevision) return "stale";
  return JSON.stringify(incoming) === JSON.stringify(current) ? "duplicate" : "conflict";
}

export function isStaleStorageWrite(incoming, current) {
  return ["stale", "conflict"].includes(classifyStorageWrite(incoming, current));
}
