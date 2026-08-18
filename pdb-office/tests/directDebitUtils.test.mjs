import test from "node:test";
import assert from "node:assert/strict";
import {
  createDirectDebitRun,
  createReturnCase,
  getReturnCaseSummary,
  isMembershipDueInMonth,
  maskIban,
  parseNaspaReturnCsv,
  returnTransactionFingerprint,
  suggestDirectDebitItem,
  updateReturnCase,
} from "../modules/direct-debits/directDebitUtils.js";

function ids() {
  let index = 0;
  return () => `id-${++index}`;
}

test("membership month eligibility respects start and end dates", () => {
  assert.equal(isMembershipDueInMonth({ status: "aktiv", startDate: "2026-08-05" }, "2026-08"), true);
  assert.equal(isMembershipDueInMonth({ status: "aktiv", startDate: "2026-09-01" }, "2026-08"), false);
  assert.equal(isMembershipDueInMonth({ status: "gekündigt", endDate: "2026-07-31" }, "2026-08"), false);
  assert.equal(isMembershipDueInMonth({ status: "pausiert" }, "2026-08"), false);
});

test("run creation freezes member payment data", () => {
  const idFactory = ids();
  const result = createDirectDebitRun({
    month: "2026-08",
    dueDate: "2026-08-05",
    idFactory,
    now: "2026-08-01T10:00:00.000Z",
    data: {
      members: [{ id: "member-1", name: "Anna Beispiel", iban: "DE11 2222 3333 4444 5555 66" }],
      memberships: [{ id: "membership-1", memberId: "member-1", status: "aktiv", monthlyAmount: "149", mandateReference: "PDB-2026-001" }],
    },
  });
  assert.equal(result.run.itemCount, 1);
  assert.equal(result.run.totalAmount, 149);
  assert.equal(result.items[0].memberName, "Anna Beispiel");
  assert.equal(result.items[0].iban, "DE11222233334444555566");
  assert.equal(maskIban(result.items[0].iban), "•••• 5566");
});

test("Naspa style CSV returns only return debit rows", () => {
  const csv = [
    "Buchungstag;Zahlungspflichtiger;IBAN;Verwendungszweck;Betrag",
    '08.08.2026;Anna Beispiel;DE11222233334444555566;Rücklastschrift AM04 MANDATSREFERENZ PDB-2026-001;"-149,00"',
    '08.08.2026;Andere Zahlung;DE009999;Überweisung;"500,00"',
  ].join("\n");
  const result = parseNaspaReturnCsv(csv, { idFactory: ids() });
  assert.equal(result.length, 1);
  assert.equal(result[0].amount, 149);
  assert.equal(result[0].date, "2026-08-08");
  assert.equal(result[0].reasonCode, "AM04");
  assert.equal(result[0].reason, "Keine ausreichende Deckung");
  assert.equal(result[0].mandateReference, "PDB-2026-001");
  assert.equal(result[0].sourceFingerprint, returnTransactionFingerprint(result[0]));
});

test("bank transaction fingerprints stay stable across import ids", () => {
  const left = { id: "a", date: "2026-08-08", amount: 149, iban: "DE11 2222", purpose: "Rücklastschrift AM04" };
  const right = { ...left, id: "b", iban: "de112222", purpose: "RUECKLASTSCHRIFT   AM04" };
  assert.equal(returnTransactionFingerprint(left), returnTransactionFingerprint(right));
});

test("matching prioritizes mandate reference", () => {
  const suggestion = suggestDirectDebitItem({
    name: "Abweichender Kontoinhaber",
    amount: 149,
    mandateReference: "PDB-2026-001",
  }, [
    { id: "a", memberName: "Anna Beispiel", amount: 149, mandateReference: "PDB-2026-001", status: "eingereicht" },
    { id: "b", memberName: "Andere Person", amount: 149, mandateReference: "PDB-2026-002", status: "eingereicht" },
  ]);
  assert.equal(suggestion.item.id, "a");
  assert.equal(suggestion.confidence, "hoch");
  assert.equal(suggestion.ambiguous, false);
});

test("amount-only matches are marked as low confidence and ambiguous", () => {
  const suggestion = suggestDirectDebitItem({ name: "Unbekannt", amount: 149 }, [
    { id: "a", memberName: "Anna", amount: 149, status: "eingereicht" },
    { id: "b", memberName: "Bea", amount: 149, status: "eingereicht" },
  ]);
  assert.equal(suggestion.confidence, "niedrig");
  assert.equal(suggestion.ambiguous, true);
});

test("return case keeps an auditable status history", () => {
  const idFactory = ids();
  const item = { id: "item-1", membershipId: "membership-1", memberId: "member-1", memberName: "Anna", amount: 149 };
  const run = { id: "run-1" };
  const created = createReturnCase({ item, run, fee: 3, idFactory, now: "2026-08-08T10:00:00.000Z" });
  const updated = updateReturnCase(created, { status: "kontaktiert", historyNote: "Telefonisch erreicht" }, { idFactory, now: "2026-08-09T11:00:00.000Z" });
  assert.equal(updated.status, "kontaktiert");
  assert.equal(updated.history.length, 3);
  assert.equal(updated.closedAt, "");
});

test("summary separates open and recovered amounts", () => {
  const summary = getReturnCaseSummary([
    { status: "offen", amount: 149, fee: 3 },
    { status: "kontaktiert", amount: 99, fee: 0 },
    { status: "bezahlt", amount: 199, fee: 3 },
    { status: "storniert", amount: 49, fee: 0 },
  ]);
  assert.deepEqual(summary, { openCount: 2, openAmount: 251, recoveredAmount: 202 });
});
