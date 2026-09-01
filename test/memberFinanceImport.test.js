import assert from 'node:assert/strict';
import test from 'node:test';
import { mergeMemberFinanceMonth, parseMemberFinanceSepaXml } from '../src/services/memberFinanceImport.service.js';

const septemberXml = `<?xml version="1.0"?><Document><GrpHdr><CreDtTm>2026-08-31T10:00:00Z</CreDtTm><NbOfTxs>2</NbOfTxs><CtrlSum>348.00</CtrlSum></GrpHdr>
  <PmtInf><ReqdColltnDt>2026-09-01</ReqdColltnDt>
    <DrctDbtTxInf><InstdAmt Ccy="EUR">149.00</InstdAmt><DrctDbtTx><MndtRltdInf><MndtId>PURE-1</MndtId><DtOfSgntr>2026-01-01</DtOfSgntr></MndtRltdInf></DrctDbtTx><Dbtr><Nm>Anna Bestand</Nm></Dbtr><DbtrAcct><Id><IBAN>DE111</IBAN></Id></DbtrAcct><RmtInf><Ustrd>Pure September</Ustrd></RmtInf></DrctDbtTxInf>
  </PmtInf>
  <PmtInf><ReqdColltnDt>2026-09-03</ReqdColltnDt>
    <DrctDbtTxInf><InstdAmt Ccy="EUR">199.00</InstdAmt><DrctDbtTx><MndtRltdInf><MndtId>BEYOND-1</MndtId><DtOfSgntr>2026-08-28</DtOfSgntr></MndtRltdInf></DrctDbtTx><Dbtr><Nm>Julia Neu</Nm></Dbtr><DbtrAcct><Id><IBAN>DE222</IBAN></Id></DbtrAcct><RmtInf><Ustrd>Beyond September</Ustrd></RmtInf></DrctDbtTxInf>
  </PmtInf>
</Document>`;

test('member finance SEPA import includes every payment group in the month', () => {
  const imported = parseMemberFinanceSepaXml(septemberXml, 'September-2026.xml');
  assert.equal(imported.financeMonth, '2026-09');
  assert.equal(imported.collectionDate, '2026-09-01');
  assert.equal(imported.transactions.length, 2);
  assert.equal(imported.summary.actualSum, 348);
  assert.deepEqual(imported.transactions.map(item => item.collectionDate), ['2026-09-01', '2026-09-03']);
  assert.deepEqual(imported.transactions.map(item => item.name), ['Anna Bestand', 'Julia Neu']);
});

test('member finance merge replaces only the imported month', () => {
  const imported = parseMemberFinanceSepaXml(septemberXml, 'September-2026.xml');
  const current = {
    transactions: [
      { id: 'august', financeMonth: '2026-08', name: 'August Member', amount: 149, plan: 'Pure', packageCount: 1, sourceFile: 'August.xml' },
      { id: 'old-september', financeMonth: '2026-09', name: 'Alter Septemberstand', amount: 99, plan: 'Individuell', packageCount: 1, sourceFile: 'Alt.xml' }
    ],
    fileSummaries: [
      { file: 'August.xml', financeMonth: '2026-08', used: true },
      { file: 'Alt.xml', financeMonth: '2026-09', used: true, actualCount: 1, actualSum: 99 }
    ]
  };
  const merged = mergeMemberFinanceMonth(current, imported);
  assert.equal(merged.transactions.filter(item => item.financeMonth === '2026-08').length, 1);
  assert.deepEqual(merged.transactions.filter(item => item.financeMonth === '2026-09').map(item => item.name), ['Anna Bestand', 'Julia Neu']);
  assert.equal(merged.months.find(item => item.month === '2026-09').amount, 348);
  assert.equal(merged.fileSummaries.find(item => item.file === 'Alt.xml').used, false);
});

test('member finance import rejects a file spanning multiple months', () => {
  const xml = `<Document>
    <PmtInf><ReqdColltnDt>2026-09-01</ReqdColltnDt><DrctDbtTxInf><InstdAmt>149.00</InstdAmt></DrctDbtTxInf></PmtInf>
    <PmtInf><ReqdColltnDt>2026-10-01</ReqdColltnDt><DrctDbtTxInf><InstdAmt>149.00</InstdAmt></DrctDbtTxInf></PmtInf>
  </Document>`;
  assert.throws(() => parseMemberFinanceSepaXml(xml), /SEPA_MULTIPLE_FINANCE_MONTHS/);
});
