import test from "node:test";
import assert from "node:assert/strict";

import {
  getEntitlementsForMonth,
  getTreatmentEntitlementsForMonth
} from "../src/services/entitlement.service.js";
import { treatments } from "../src/data/treatments.data.js";
import { getPrivateProtocolSessionLimit } from "../src/utils/privateProtocolRules.js";

function createFakeDb(bookings) {
  return {
    async query(sql) {
      if (sql.includes("member_monthly_usage_imports")) return { rows: [] };
      return {
        rows: bookings.map((booking) =>
          typeof booking === "string"
            ? { category_key: booking }
            : booking
        )
      };
    }
  };
}

test("PRIVATE starts each month with one available protocol", async () => {
  const entitlements = await getEntitlementsForMonth(
    { id: 1, package_key: "private" },
    "2026-08-01",
    createFakeDb([])
  );

  assert.equal(entitlements.remaining.private, 1);
  assert.deepEqual(entitlements.allowedCategories, ["private"]);
});

test("one PRIVATE booking consumes the monthly PRIVATE entitlement", async () => {
  const entitlements = await getEntitlementsForMonth(
    { id: 1, package_key: "private" },
    "2026-08-01",
    createFakeDb(["private"])
  );

  assert.equal(entitlements.usage.private, 1);
  assert.equal(entitlements.remaining.private, 0);
  assert.deepEqual(entitlements.allowedCategories, []);
});

test("Body Sculpt grants six sessions while locking the monthly protocol", async () => {
  const member = { id: 1, package_key: "private" };
  const bodySculpt = {
    category_key: "private",
    treatment_key: "private-body-sculpt-intensive"
  };
  const otherProtocol = {
    category_key: "private",
    treatment_key: "private-hifu-total-face"
  };
  const db = createFakeDb([
    {
      category_key: "private",
      treatment_key: "private-body-sculpt-intensive"
    }
  ]);

  const bodyEntitlements = await getTreatmentEntitlementsForMonth(
    member,
    bodySculpt,
    "2026-08-01",
    db
  );
  const otherEntitlements = await getTreatmentEntitlementsForMonth(
    member,
    otherProtocol,
    "2026-08-01",
    db
  );

  assert.equal(bodyEntitlements.remaining.private, 5);
  assert.equal(bodyEntitlements.privateProtocol.sessionLimit, 6);
  assert.equal(otherEntitlements.remaining.private, 0);
  assert.equal(otherEntitlements.privateProtocol.locked, true);
  for (const used of [5, 6]) {
    const result = await getTreatmentEntitlementsForMonth(member, bodySculpt,
      "2026-08-01", createFakeDb(Array.from({ length: used }, () => bodySculpt)));
    assert.equal(result.remaining.private, 6 - used);
  }

});

test("PRIVATE protocols use their confirmed session limits", () => {
  const privateTreatments = treatments.filter(
    (treatment) => treatment.category_key === "private"
  );

  for (const treatment of privateTreatments) {
    const expected = treatment.treatment_key === "private-body-sculpt-intensive" ? 6 : treatment.treatment_key === "private-cryo-contour-intensive" ? 2 : 1;
    assert.equal(getPrivateProtocolSessionLimit(treatment.treatment_key), expected);
  }
});


test("Cryo Contour permits two visits and locks out other protocols", async () => {
  const member = { id: 1, package_key: "private" };
  const cryo = { category_key: "private", treatment_key: "private-cryo-contour-intensive" };
  const other = { category_key: "private", treatment_key: "private-hifu-total-face" };
  for (const used of [0, 1, 2]) {
    const db = createFakeDb(Array.from({ length: used }, () => cryo));
    const result = await getTreatmentEntitlementsForMonth(member, cryo, "2026-10-01", db);
    assert.equal(result.remaining.private, 2 - used);
    assert.equal(result.privateProtocol.sessionLimit, 2);
    if (used > 0) {
      const locked = await getTreatmentEntitlementsForMonth(member, other, "2026-10-01", db);
      assert.equal(locked.remaining.private, 0);
      assert.equal(locked.privateProtocol.locked, true);
    }
  }
});
