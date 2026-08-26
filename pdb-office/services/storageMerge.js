function isEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function canMergeById(values) {
  return values.every(value => isPlainObject(value) && value.id != null);
}

function rebaseRecordArray(previous = [], next = [], current = []) {
  if (!canMergeById([...previous, ...next, ...current])) return next;

  const previousById = new Map(previous.map(record => [record.id, record]));
  const nextById = new Map(next.map(record => [record.id, record]));
  const resultById = new Map(current.map(record => [record.id, record]));

  previousById.forEach((_, id) => {
    if (!nextById.has(id)) resultById.delete(id);
  });

  nextById.forEach((record, id) => {
    const previousRecord = previousById.get(id);
    if (!previousRecord || !isEqual(previousRecord, record)) resultById.set(id, record);
  });

  return Array.from(resultById.values());
}

function rebaseObject(previous = {}, next = {}, current = {}) {
  const result = { ...current };
  const keys = new Set([...Object.keys(previous), ...Object.keys(next)]);

  keys.forEach(key => {
    if (!(key in next)) {
      delete result[key];
      return;
    }
    if (isEqual(previous[key], next[key])) return;
    result[key] = rebaseValue(previous[key], next[key], current?.[key]);
  });

  return result;
}

function rebaseValue(previous, next, current) {
  if (Array.isArray(previous) && Array.isArray(next) && Array.isArray(current)) {
    return rebaseRecordArray(previous, next, current);
  }
  if (isPlainObject(previous) && isPlainObject(next) && isPlainObject(current)) {
    return rebaseObject(previous, next, current);
  }
  return next;
}

export function rebaseDataChange(previous, next, current) {
  if (!isPlainObject(previous) || !isPlainObject(next) || !isPlainObject(current)) return next;
  return rebaseObject(previous, next, current);
}
