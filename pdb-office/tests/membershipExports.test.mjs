import test from "node:test";
import assert from "node:assert/strict";
import { createMembershipExportRows, membershipRowsToCsv } from "../modules/memberships/membershipExports.js";

test("creates filtered membership export rows with linked customer data", () => {
  const memberships = [{ id: "m1", memberId: "c1", plan: "Private", status: "aktiv", monthlyAmount: 399, startDate: "2026-09-01" }];
  const members = new Map([["c1", { email: "private@example.de", phone: "+49 123" }]]);
  const rows = createMembershipExportRows(memberships, members, () => "Private Kundin");

  assert.deepEqual(rows[0], {
    number: 1,
    name: "Private Kundin",
    plan: "Private",
    status: "aktiv",
    monthlyAmount: 399,
    contractSignedAt: "",
    startDate: "2026-09-01",
    endDate: "",
    debitDay: "",
    mandateReference: "",
    email: "private@example.de",
    phone: "+49 123",
    notes: "",
  });
});

test("creates an Excel-friendly semicolon CSV", () => {
  const csv = membershipRowsToCsv([{ number: 1, name: "Kundin; Test", plan: "Beyond", status: "aktiv", monthlyAmount: 199 }]);

  assert.ok(csv.startsWith("\ufeffNr.;Name;Paket"));
  assert.match(csv, /"Kundin; Test";Beyond;aktiv;199,00/);
});
