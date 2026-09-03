import test from "node:test";
import assert from "node:assert/strict";
import { isMembershipActiveOnDate } from "../modules/memberships/membershipLifecycle.js";

test("cancelled membership remains active until its exit date", () => {
  const membership = { status: "gekündigt", startDate: "2026-03-01", endDate: "2027-03-01" };

  assert.equal(isMembershipActiveOnDate(membership, "2027-02-28"), true);
  assert.equal(isMembershipActiveOnDate(membership, "2027-03-01"), false);
});

test("inactive membership statuses are not counted as active", () => {
  assert.equal(isMembershipActiveOnDate({ status: "pausiert" }, "2026-09-03"), false);
  assert.equal(isMembershipActiveOnDate({ status: "abgelaufen", endDate: "2026-09-01" }, "2026-09-03"), false);
  assert.equal(isMembershipActiveOnDate({ status: "vorbereitung", startDate: "2026-10-01" }, "2026-09-03"), false);
});

test("existing active records keep the previous counting behavior", () => {
  assert.equal(isMembershipActiveOnDate({ status: "aktiv", startDate: "2026-10-01" }, "2026-09-03"), true);
});
