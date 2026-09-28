import test from "node:test";
import assert from "node:assert/strict";
import { createMembershipTimeline, getMembershipNextAction, getMembershipPlannedAmount, isDueWithinNextPlanningMonth, isMembershipIncludedInPlannedRevenue } from "../modules/memberships/membershipPresentation.js";

test("NASPA task has precedence over the paused membership state", () => {
  const action = getMembershipNextAction({ status: "pausiert", scheduledReactivationAt: "2026-09-01", reactivationSepaStatus: "offen", reactivationSepaDueAt: "2026-09-01" }, "2026-08-28");
  assert.deepEqual(action, { tone: "warning", label: "NASPA-SEPA einrichten", date: "2026-09-01" });
});

test("timeline keeps pause, plan and NASPA history", () => {
  const timeline = createMembershipTimeline({
    pauseHistory: [{ id: "p1", startDate: "2026-07-01", endDate: "2026-09-01", days: 62 }],
    planChangeHistory: [{ id: "c1", effectiveDate: "2026-06-01", fromPlan: "Pure", toPlan: "Beyond" }],
    reactivationSepaHistory: [{ id: "s1", date: "2026-08-28", dueDate: "2026-09-01", status: "offen" }],
  });
  assert.equal(timeline.length, 3);
  assert.match(timeline.map(entry => entry.title).join(" "), /Pause/);
  assert.match(timeline.map(entry => entry.title).join(" "), /NASPA/);
});

test("planned revenue includes paused memberships with a scheduled reactivation", () => {
  const memberships = [
    { status: "aktiv", monthlyAmount: 100 },
    { status: "pausiert", scheduledReactivationAt: "2026-10-01", reactivationSepaStatus: "erledigt", monthlyAmount: 129 },
    { status: "pausiert", scheduledReactivationAt: "2026-10-01", reactivationSepaStatus: "erledigt", monthlyAmount: 129 },
    { status: "pausiert", monthlyAmount: 199 },
  ];
  const plannedRevenue = memberships
    .filter(membership => isMembershipIncludedInPlannedRevenue(membership, "2026-09-01"))
    .reduce((sum, membership) => sum + membership.monthlyAmount, 0);

  assert.equal(plannedRevenue, 358);
});

test("planned revenue excludes a pause that ends after the next planning month", () => {
  const membership = { status: "pausiert", startDate: "2025-08-08", scheduledReactivationAt: "2026-12-01", monthlyAmount: 129 };

  assert.equal(isMembershipIncludedInPlannedRevenue(membership, "2026-09-28"), false);
  assert.equal(isMembershipIncludedInPlannedRevenue(membership, "2026-11-01"), true);
});

test("future reactivation SEPA tasks stay out of open tasks until their planning month", () => {
  assert.equal(isDueWithinNextPlanningMonth("2026-12-01", "2026-09-28"), false);
  assert.equal(isDueWithinNextPlanningMonth("2026-12-01", "2026-11-01"), true);
  assert.deepEqual(
    getMembershipNextAction({ status: "pausiert", scheduledReactivationAt: "2026-12-01", reactivationSepaStatus: "offen", reactivationSepaDueAt: "2026-12-01" }, "2026-09-28"),
    { tone: "info", label: "Reaktivierung geplant", date: "2026-12-01" },
  );
});

test("planned amount only applies plan changes due by the end of next month", () => {
  const membership = { monthlyAmount: 149, scheduledPlan: "Define", scheduledMonthlyAmount: 169, scheduledStartDate: "2026-12-01" };
  const planAmounts = { Define: 169 };

  assert.equal(getMembershipPlannedAmount(membership, "2026-09-28", planAmounts), 149);
  assert.equal(getMembershipPlannedAmount(membership, "2026-11-01", planAmounts), 169);
});
