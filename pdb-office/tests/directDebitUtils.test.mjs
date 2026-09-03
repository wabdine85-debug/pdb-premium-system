import test from "node:test";
import assert from "node:assert/strict";
import {
  createDirectDebitRun,
  createDirectDebitRunFromSepaXml,
  createReturnCase,
  decodeBankCsv,
  getDirectDebitChangesSinceRun,
  getReturnCaseSummary,
  isMembershipDueInMonth,
  maskIban,
  parseNaspaReturnCsv,
  parseNaspaMemberPaymentsCsv,
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
  assert.equal(isMembershipDueInMonth({ status: "gekündigt", endDate: "2027-03-01" }, "2027-02"), true);
  assert.equal(isMembershipDueInMonth({ status: "gekündigt", endDate: "2027-03-01" }, "2027-03"), false);
  assert.equal(isMembershipDueInMonth({ status: "pausiert" }, "2026-08"), false);
  assert.equal(isMembershipDueInMonth({ status: "pausiert", scheduledReactivationAt: "2026-10-01" }, "2026-09"), false);
  assert.equal(isMembershipDueInMonth({ status: "pausiert", scheduledReactivationAt: "2026-10-01" }, "2026-10"), true);
  assert.equal(isMembershipDueInMonth({ status: "pausiert", scheduledReactivationAt: "2026-10-01", endDate: "2026-09-15" }, "2026-10"), true);
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

test("SEPA XML creates the exact historical debit run", () => {
  const xml = `<?xml version="1.0"?><Document><PmtInf><ReqdColltnDt>2026-07-01</ReqdColltnDt>
    <DrctDbtTxInf><PmtId><EndToEndId>E2E-1</EndToEndId></PmtId><InstdAmt Ccy="EUR">129.00</InstdAmt><DrctDbtTx><MndtRltdInf><MndtId>PDB-1</MndtId></MndtRltdInf></DrctDbtTx><Dbtr><Nm>Anna Beispiel</Nm></Dbtr><DbtrAcct><Id><IBAN>DE112222</IBAN></Id></DbtrAcct></DrctDbtTxInf>
    <DrctDbtTxInf><InstdAmt Ccy="EUR">199.00</InstdAmt><DrctDbtTx><MndtRltdInf><MndtId>PDB-2</MndtId></MndtRltdInf></DrctDbtTx><Dbtr><Nm>Bea Beispiel</Nm></Dbtr><DbtrAcct><Id><IBAN>DE113333</IBAN></Id></DbtrAcct></DrctDbtTxInf>
  </PmtInf></Document>`;
  const result = createDirectDebitRunFromSepaXml({ data: { memberships: [] }, text: xml, sourceFile: "juli.xml", idFactory: ids() });
  assert.equal(result.run.month, "2026-07");
  assert.equal(result.run.dueDate, "2026-07-01");
  assert.equal(result.run.itemCount, 2);
  assert.equal(result.run.totalAmount, 328);
  assert.equal(result.run.status, "eingefroren");
  assert.equal(result.items[0].status, "eingefroren");
  assert.equal(result.items[0].memberName, "Anna Beispiel");
  assert.equal(result.items[0].mandateReference, "PDB-1");
});

test("SEPA XML includes all payment groups from the same month", () => {
  const xml = `<?xml version="1.0"?><Document>
    <PmtInf><ReqdColltnDt>2026-09-01</ReqdColltnDt>
      <DrctDbtTxInf><InstdAmt Ccy="EUR">149.00</InstdAmt><DrctDbtTx><MndtRltdInf><MndtId>RCUR-1</MndtId></MndtRltdInf></DrctDbtTx><Dbtr><Nm>Bestandsmember</Nm></Dbtr></DrctDbtTxInf>
    </PmtInf>
    <PmtInf><ReqdColltnDt>2026-09-03</ReqdColltnDt>
      <DrctDbtTxInf><InstdAmt Ccy="EUR">199.00</InstdAmt><DrctDbtTx><MndtRltdInf><MndtId>FRST-1</MndtId></MndtRltdInf></DrctDbtTx><Dbtr><Nm>Neuer Member</Nm></Dbtr></DrctDbtTxInf>
    </PmtInf>
  </Document>`;
  const result = createDirectDebitRunFromSepaXml({ data: { memberships: [] }, text: xml, idFactory: ids() });
  assert.equal(result.run.month, "2026-09");
  assert.equal(result.run.dueDate, "2026-09-01");
  assert.equal(result.run.itemCount, 2);
  assert.equal(result.run.totalAmount, 348);
  assert.deepEqual(result.items.map(item => item.dueDate), ["2026-09-01", "2026-09-03"]);
});

test("SEPA XML rejects payment groups from different months", () => {
  const xml = `<Document>
    <PmtInf><ReqdColltnDt>2026-09-01</ReqdColltnDt><DrctDbtTxInf><InstdAmt>149.00</InstdAmt></DrctDbtTxInf></PmtInf>
    <PmtInf><ReqdColltnDt>2026-10-01</ReqdColltnDt><DrctDbtTxInf><InstdAmt>149.00</InstdAmt></DrctDbtTxInf></PmtInf>
  </Document>`;
  assert.throws(
    () => createDirectDebitRunFromSepaXml({ data: { memberships: [] }, text: xml, idFactory: ids() }),
    /mehrere Einzugsmonate/
  );
});

test("SEPA XML does not map a shared mandate reference to the first member", () => {
  const xml = `<?xml version="1.0"?><Document><PmtInf><ReqdColltnDt>2026-07-01</ReqdColltnDt>
    <DrctDbtTxInf><InstdAmt Ccy="EUR">129.00</InstdAmt><DrctDbtTx><MndtRltdInf><MndtId>SHARED</MndtId></MndtRltdInf></DrctDbtTx><Dbtr><Nm>Erste Person</Nm></Dbtr><DbtrAcct><Id><IBAN>DE111</IBAN></Id></DbtrAcct></DrctDbtTxInf>
    <DrctDbtTxInf><InstdAmt Ccy="EUR">149.00</InstdAmt><DrctDbtTx><MndtRltdInf><MndtId>SHARED</MndtId></MndtRltdInf></DrctDbtTx><Dbtr><Nm>Zweite Person</Nm></Dbtr><DbtrAcct><Id><IBAN>DE222</IBAN></Id></DbtrAcct></DrctDbtTxInf>
  </PmtInf></Document>`;
  const result = createDirectDebitRunFromSepaXml({
    data: { memberships: [
      { id: "m1", memberId: "p1", memberName: "Erste Person", mandateReference: "SHARED", sepaIban: "DE111" },
      { id: "m2", memberId: "p2", memberName: "Zweite Person", mandateReference: "SHARED", sepaIban: "DE222" },
    ] },
    text: xml,
    idFactory: ids(),
  });
  assert.deepEqual(result.items.map(item => item.memberName), ["Erste Person", "Zweite Person"]);
  assert.deepEqual(result.items.map(item => item.membershipId), ["m1", "m2"]);
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

test("Naspa CSV separates the booked batch from member adjustments", () => {
  const csv = [
    "Buchungstag;Valutadatum;Buchungstext;Verwendungszweck;Glaeubiger ID;Mandatsreferenz;Sammlerreferenz;Beguenstigter/Zahlungspflichtiger;Kontonummer/IBAN;Betrag;Info",
    "01.09.26;01.09.26;SAMMEL-LS-EINZUG;DATUM 28.08.2026 ANZAHL 80;;;RUN-1;;DE000;13269,00;Umsatz gebucht",
    "01.09.26;01.09.26;EINZELLASTSCHRIFTEINZUG;Premiumbeitrag 129,00 EUR + 70,00 EUR September -Beyond-;DE73ZZZ00002018874;PDB-M-1;EXTRA-1;Mariana Beispiel;DE111;70,00;Umsatz gebucht",
    "01.09.26;02.09.26;EINZELLASTSCHRIFTEINZUG;Einrichtungsgebühr 39,00 EUR einmalig;DE73ZZZ00002018874;PDB-M-2;EXTRA-2;Julia Beispiel;DE222;39,00;Umsatz vorgemerkt",
  ].join("\n");
  const result = parseNaspaMemberPaymentsCsv(csv, { idFactory: ids() });
  assert.equal(result.batches.length, 1);
  assert.equal(result.batches[0].amount, 13269);
  assert.equal(result.batches[0].itemCount, 80);
  assert.equal(result.adjustments.length, 2);
  assert.equal(result.adjustments[0].type, "upgrade");
  assert.equal(result.adjustments[0].serviceMonth, "2026-09");
  assert.equal(result.adjustments[1].type, "setup-fee");
  assert.equal(result.adjustments[1].status, "vorgemerkt");
});

test("frozen run changes identify later members and upgrade differences", () => {
  const run = { id: "run-1", month: "2026-09" };
  const changes = getDirectDebitChangesSinceRun({
    run,
    items: [{ runId: "run-1", membershipId: "m1", amount: 149 }],
    data: {
      members: [{ id: "p1", name: "Anna" }, { id: "p2", name: "Julia" }],
      memberships: [
        { id: "m1", memberId: "p1", status: "aktiv", paymentMethod: "SEPA", monthlyAmount: 199 },
        { id: "m2", memberId: "p2", status: "aktiv", paymentMethod: "SEPA", monthlyAmount: 149 },
      ],
    },
  });
  assert.deepEqual(changes.map(change => ({ type: change.type, amount: change.amount })), [
    { type: "upgrade", amount: 50 },
    { type: "new-membership", amount: 149 },
  ]);
});

test("Naspa CAMT V8 uses original amount, derives fees and ignores invoice receipts", () => {
  const csv = [
    "Auftragskonto;Buchungstag;Buchungstext;Verwendungszweck;Lastschrift Ursprungsbetrag;Auslagenersatz Ruecklastschrift;Beguenstigter/Zahlungspflichtiger;Betrag;Info",
    'DE001;02.07.26;RECHNUNG;Rechnung Ruecklastschrift Nullumsatz z. RE-Erstellung;;;Bank;0,00;Umsatz gebucht',
    'DE001;02.07.26;LS RUECKBELASTUNG;RUECKLASTSCHRIFT Sonstige Gruende Premiumbeitrag;149,00;;Anna Beispiel;-152,57;Umsatz gebucht',
  ].join("\n");
  const result = parseNaspaReturnCsv(csv, { idFactory: ids() });
  assert.equal(result.length, 1);
  assert.equal(result[0].date, "2026-07-02");
  assert.equal(result[0].amount, 149);
  assert.equal(result[0].fee, 3.57);
  assert.equal(result[0].reasonCode, "MS02");
});

test("Naspa CSV detects a later customer payment after the return debit", () => {
  const csv = [
    "Buchungstag;Buchungstext;Verwendungszweck;Lastschrift Ursprungsbetrag;Beguenstigter/Zahlungspflichtiger;Kontonummer/IBAN;Betrag",
    "02.07.26;LS RUECKBELASTUNG;RUECKLASTSCHRIFT Sonstige Gruende;149,00;Anna Beispiel;DE111;-152,57",
    "14.07.26;ECHTZEIT-GUTSCHRIFT;Monat Juli;;Anna Beispiel;DE222;155,00",
  ].join("\n");
  const transaction = parseNaspaReturnCsv(csv, { idFactory: ids() })[0];
  assert.deepEqual(transaction.recoveredPayment, {
    date: "2026-07-14",
    amount: 155,
    bookingText: "ECHTZEIT-GUTSCHRIFT",
    purpose: "Monat Juli",
  });
  const created = createReturnCase({ item: { id: "i", amount: 149 }, run: { id: "r" }, transaction, idFactory: ids() });
  assert.equal(created.status, "bezahlt");
  assert.equal(created.paidAt, "2026-07-14");
  assert.equal(created.paidAmount, 155);
});

test("bank CSV decoding supports Naspa Windows-1252 exports", () => {
  const bytes = Uint8Array.from([0x52, 0xfc, 0x63, 0x6b]);
  assert.equal(decodeBankCsv(bytes), "Rück");
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

test("matching selects the debit item from the return transaction month", () => {
  const suggestion = suggestDirectDebitItem({ name: "Anna Beispiel", amount: 129, date: "2026-08-04" }, [
    { id: "july", memberName: "Anna Beispiel", amount: 129, dueDate: "2026-07-01", status: "gebucht" },
    { id: "august", memberName: "Anna Beispiel", amount: 129, dueDate: "2026-08-03", status: "gebucht" },
  ]);
  assert.equal(suggestion.item.id, "august");
  assert.equal(suggestion.ambiguous, false);
  assert.deepEqual(suggestion.reasons, ["Abrechnungsmonat", "Betrag", "Name"]);
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
