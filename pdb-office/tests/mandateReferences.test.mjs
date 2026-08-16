import test from "node:test";
import assert from "node:assert/strict";
import {
  formatMandateReference,
  getNextMandateReference,
  isSystemMandateReference,
} from "../modules/memberships/mandateReferences.js";

test("formats a readable sequential mandate reference", () => {
  assert.equal(formatMandateReference(2026, 1), "PDB-M-2026-0001");
  assert.equal(formatMandateReference(2026, 79), "PDB-M-2026-0079");
});

test("continues after the highest sequence for the selected year", () => {
  const memberships = [
    { mandateReference: "PDB-M-2026-0004" },
    { mandateReference: "Mitgliedschaft Premium Beyond" },
    { mandateReference: "PDB-M-2025-0012" },
    { mandateReference: "PDB-M-2026-0009" },
  ];

  assert.equal(getNextMandateReference(memberships, 2026), "PDB-M-2026-0010");
  assert.equal(getNextMandateReference(memberships, 2027), "PDB-M-2027-0001");
});

test("recognizes only the controlled PDB membership format", () => {
  assert.equal(isSystemMandateReference("PDB-M-2026-0001"), true);
  assert.equal(isSystemMandateReference("Mitgliedschaft Premium"), false);
});
