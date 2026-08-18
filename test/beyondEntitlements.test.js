import test from "node:test";
import assert from "node:assert/strict";

import {
  getEntitlementsForMonth,
  getTreatmentEntitlementsForMonth
} from "../src/services/entitlement.service.js";
import { getBeyondTreatmentSessionLimit } from "../src/utils/beyondTreatmentRules.js";

function createFakeDb(bookings) {
  return {
    async query() {
      return { rows: bookings };
    }
  };
}

test("BEYOND multi-session treatments use the configured appointment counts", () => {
  assert.equal(getBeyondTreatmentSessionLimit("3x-kryolipolyse"), 3);
  assert.equal(getBeyondTreatmentSessionLimit("3x-ems-sella"), 3);
  assert.equal(getBeyondTreatmentSessionLimit("2x-forma"), 2);
  assert.equal(getBeyondTreatmentSessionLimit("3x-ems-sculpt"), 3);
  assert.equal(getBeyondTreatmentSessionLimit("medical-needling"), 1);
});

test("3x BEYOND treatments grant three sessions and lock the monthly treatment", async () => {
  const member = { id: 1, package_key: "beyond" };
  const emsSculpt = {
    category_key: "beyond",
    treatment_key: "3x-ems-sculpt"
  };
  const forma = {
    category_key: "beyond",
    treatment_key: "2x-forma"
  };
  const db = createFakeDb([{
    category_key: "beyond",
    treatment_key: "3x-ems-sculpt"
  }]);

  const selected = await getTreatmentEntitlementsForMonth(
    member,
    emsSculpt,
    "2026-08-01",
    db
  );
  const locked = await getTreatmentEntitlementsForMonth(
    member,
    forma,
    "2026-08-01",
    db
  );

  assert.equal(selected.remaining.beyond, 2);
  assert.equal(selected.beyondTreatment.sessionLimit, 3);
  assert.equal(selected.beyondTreatment.remainingSessions, 2);
  assert.equal(locked.remaining.beyond, 0);
  assert.equal(locked.beyondTreatment.locked, true);
});

test("2x Forma grants exactly two BEYOND sessions", async () => {
  const entitlements = await getEntitlementsForMonth(
    { id: 1, package_key: "beyond" },
    "2026-08-01",
    createFakeDb([{
      category_key: "beyond",
      treatment_key: "2x-forma"
    }])
  );

  assert.equal(entitlements.remaining.beyond, 1);
  assert.equal(entitlements.beyondTreatment.sessionLimit, 2);
});

test("ordinary BEYOND treatments still consume the single monthly session", async () => {
  const entitlements = await getEntitlementsForMonth(
    { id: 1, package_key: "beyond" },
    "2026-08-01",
    createFakeDb([{
      category_key: "beyond",
      treatment_key: "medical-needling"
    }])
  );

  assert.equal(entitlements.remaining.beyond, 0);
  assert.equal(entitlements.beyondTreatment.sessionLimit, 1);
});

test("a second BEYOND entitlement multiplies a selected treatment's sessions", async () => {
  const entitlements = await getEntitlementsForMonth(
    { id: 1, package_key: "beyond", entitlement_multiplier: 2 },
    "2026-08-01",
    createFakeDb([{
      category_key: "beyond",
      treatment_key: "3x-kryolipolyse"
    }])
  );

  assert.equal(entitlements.remaining.beyond, 5);
  assert.equal(entitlements.beyondTreatment.sessionLimit, 6);
});

test("the BEYOND treatment choice resets in a new calendar month", async () => {
  const member = { id: 1, package_key: "beyond" };
  const cryo = {
    category_key: "beyond",
    treatment_key: "3x-kryolipolyse"
  };

  const entitlements = await getTreatmentEntitlementsForMonth(
    member,
    cryo,
    "2026-09-01",
    createFakeDb([])
  );

  assert.equal(entitlements.remaining.beyond, 3);
  assert.equal(entitlements.beyondTreatment.locked, false);
});
