import test from "node:test";
import assert from "node:assert/strict";
import { extendDateByDays, getPauseDays, resumeMembership, scheduleMembershipResume, startMembershipPause } from "../modules/memberships/membershipPauses.js";

test("calculates pause days with date-only arithmetic", () => {
  assert.equal(getPauseDays("2026-07-01", "2026-09-01"), 62);
  assert.equal(getPauseDays("2026-10-01", "2026-09-30"), null);
});

test("stores pause history and extends the contract when resuming", () => {
  const paused = startMembershipPause({ id: "m1", status: "aktiv", endDate: "2026-12-15" }, { id: "p1", startDate: "2026-07-01", note: "SEPA pausieren" });
  const resumed = resumeMembership(paused, { endDate: "2026-09-01" });
  assert.equal(resumed.status, "aktiv");
  assert.equal(resumed.endDate, extendDateByDays("2026-12-15", 62));
  assert.equal(resumed.pauseHistory[0].days, 62);
});

test("schedules a future reactivation without activating early", () => {
  const scheduled = scheduleMembershipResume({ id: "m1", status: "pausiert", endDate: "2026-06-28", notes: "Alter Vermerk" }, { id: "p1", fallbackStartDate: "2026-07-01", endDate: "2026-09-01", note: "Alter Vermerk" });
  assert.equal(scheduled.status, "pausiert");
  assert.equal(scheduled.scheduledReactivationAt, "2026-09-01");
  const resumed = resumeMembership(scheduled, { endDate: scheduled.scheduledReactivationAt });
  assert.equal(resumed.totalPausedDays, 62);
  assert.equal(resumed.endDate, "2026-08-29");
});
