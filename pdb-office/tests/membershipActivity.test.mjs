import test from "node:test";
import assert from "node:assert/strict";
import { getRecentMembershipActivity, recordMembershipActivity } from "../modules/memberships/membershipActivity.js";

test("records each membership change without changing amounts or status", () => {
  const original = { id: "sibel", status: "aktiv", monthlyAmount: 129, endDate: "2026-12-31" };
  const first = recordMembershipActivity([original], [{ ...original, status: "abgelaufen", endDate: "2026-10-01" }], new Date("2026-10-11T12:00:00Z"))[0];
  const second = recordMembershipActivity([first], [{ ...first, notes: "Rückerstattung erfolgt" }], new Date("2026-10-12T12:00:00Z"))[0];

  assert.equal(second.status, "abgelaufen");
  assert.equal(second.monthlyAmount, 129);
  assert.equal(second.activityLog.length, 2);
  assert.match(second.activityLog[0].text, /Status: abgelaufen/);
  assert.match(second.activityLog[0].text, /Vertragsende: 2026-10-01/);
  assert.equal(second.activityLog[1].date, "2026-10-12");
  assert.equal(recordMembershipActivity([second], [second])[0], second);
});

test("shows existing changed memberships for 14 days without treating the exit date as the change date", () => {
  const membership = { id: "jessica", status: "abgelaufen", endDate: "2026-07-01", updatedAt: "2026-10-11" };
  assert.equal(getRecentMembershipActivity([membership], "2026-10-12").length, 1);
  assert.equal(getRecentMembershipActivity([membership], "2026-10-26").length, 0);
});

test("shows one recent row per membership and collapses repeated messages from the same day", () => {
  const memberships = [
    {
      id: "berenice", memberId: "customer-1", status: "vorbereitung",
      activityLog: [
        { id: "created", date: "2026-10-20", changedAt: "2026-10-20T08:00:00Z", text: "Membership angelegt" },
        { id: "first-edit", date: "2026-10-20", changedAt: "2026-10-20T09:00:00Z", text: "Membership-Daten geändert" },
        { id: "second-edit", date: "2026-10-20", changedAt: "2026-10-20T10:00:00Z", text: "Membership-Daten geändert" },
      ],
    },
    {
      id: "another-contract", memberId: "customer-1", status: "aktiv",
      activityLog: [{ id: "plan", date: "2026-10-19", changedAt: "2026-10-19T10:00:00Z", text: "Paket: Beyond" }],
    },
  ];

  const recent = getRecentMembershipActivity(memberships, "2026-10-20");
  assert.equal(recent.length, 2);
  assert.equal(recent[0].membership.id, "berenice");
  assert.equal(recent[0].text, "Membership angelegt");
  assert.deepEqual(recent[0].changes.map(change => change.text), ["Membership-Daten geändert", "Membership angelegt"]);
  assert.equal(recent[1].membership.id, "another-contract");
  assert.equal(memberships[0].activityLog.length, 3);
});
