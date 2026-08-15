import test from "node:test";
import assert from "node:assert/strict";
import { classifyStorageWrite, getStorageRevision, isStaleStorageWrite } from "../services/storageRevision.js";

test("reads missing and numeric storage revisions safely", () => {
  assert.equal(getStorageRevision(null), 0);
  assert.equal(getStorageRevision({ _storageRevision: "55" }), 55);
});

test("accepts duplicate saves but rejects stale or conflicting revisions", () => {
  const current = { _storageRevision: 55, value: "saved" };
  assert.equal(isStaleStorageWrite({ _storageRevision: 28 }, current), true);
  assert.equal(classifyStorageWrite({ ...current }, current), "duplicate");
  assert.equal(isStaleStorageWrite({ _storageRevision: 55, value: "different" }, current), true);
  assert.equal(isStaleStorageWrite({ _storageRevision: 56 }, current), false);
});
