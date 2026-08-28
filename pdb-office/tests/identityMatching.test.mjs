import test from "node:test";
import assert from "node:assert/strict";
import { findSafeIdentityMatch } from "../modules/memberships/identityMatching.js";

const members = [
  { id: "maria", name: "Maria Caballero", iban: "DE00 0000 0000 0000 7800" },
  { id: "duplicate", name: "Maria &" },
  { id: "mariana", name: "Mariana Telianidi", iban: "DE00 0000 0000 0000 0012" },
];

test("prefers the existing explicit link over fuzzy name matching", () => {
  assert.equal(findSafeIdentityMatch(members, { name: "Mariana Telianidi", currentMemberId: "maria" })?.id, "maria");
});

test("matches a unique full IBAN before a name", () => {
  assert.equal(findSafeIdentityMatch(members, { name: "Maria Caballero", iban: "DE000000000000000012" })?.id, "mariana");
});

test("never auto-matches an incomplete or ambiguous name", () => {
  assert.equal(findSafeIdentityMatch(members, { name: "Maria &" }), null);
  assert.equal(findSafeIdentityMatch([...members, { id: "maria2", name: "Maria Caballero" }], { name: "Maria Caballero" }), null);
});

test("matches one unique complete name", () => {
  assert.equal(findSafeIdentityMatch(members, { name: "Mariana Telianidi" })?.id, "mariana");
});
