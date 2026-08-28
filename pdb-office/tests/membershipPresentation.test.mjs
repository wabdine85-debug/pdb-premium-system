import test from "node:test";
import assert from "node:assert/strict";
import { createMembershipTimeline, getMembershipNextAction } from "../modules/memberships/membershipPresentation.js";

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
