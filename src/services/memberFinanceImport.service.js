import crypto from 'node:crypto';

function decodeXml(value = '') {
  return String(value)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .trim();
}

function xmlValues(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${escaped}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[A-Za-z0-9_-]+:)?${escaped}>`, 'gi');
  return [...String(xml).matchAll(pattern)].map(match => decodeXml(match[1].replace(/<[^>]+>/g, '').trim()));
}

function xmlBlocks(xml, tagName) {
  const escaped = tagName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`<(?:[A-Za-z0-9_-]+:)?${escaped}(?:\\s[^>]*)?>[\\s\\S]*?<\\/(?:[A-Za-z0-9_-]+:)?${escaped}>`, 'gi');
  return String(xml).match(pattern) || [];
}

function classifyPlan(amount, mandate, purpose) {
  const text = `${mandate || ''} ${purpose || ''}`;
  if (/private/i.test(text) || amount === 399) return 'Private';
  if (/beyond/i.test(text) || amount >= 190) return 'Beyond';
  if (/pure/i.test(text) || amount === 149) return 'Pure';
  if (/define/i.test(text)) return 'Define';
  return 'Individuell';
}

function packageCount(amount, mandate, purpose) {
  const text = `${mandate || ''} ${purpose || ''}`;
  const explicitCount = text.match(/(?:^|\D)(\d+)\s*x/i);
  if (explicitCount) return Number(explicitCount[1]) || 1;
  if (/private/i.test(text) && amount && amount % 399 === 0) return Math.max(1, Math.round(amount / 399));
  if (/beyond/i.test(text) && amount && amount % 199 === 0) return Math.max(1, Math.round(amount / 199));
  return 1;
}

function summarizeMonths(transactions) {
  const months = [...new Set(transactions.map(item => item.financeMonth).filter(Boolean))].sort();
  return months.map(month => {
    const rows = transactions.filter(item => item.financeMonth === month);
    const byPlan = rows.reduce((summary, item) => {
      summary[item.plan] ||= { plan: item.plan, count: 0, amount: 0 };
      summary[item.plan].count += item.packageCount || 1;
      summary[item.plan].amount += item.amount || 0;
      return summary;
    }, {});
    return {
      month,
      count: rows.length,
      amount: rows.reduce((sum, item) => sum + (item.amount || 0), 0),
      byPlan: Object.values(byPlan).sort((left, right) => right.amount - left.amount),
      files: [...new Set(rows.map(item => item.sourceFile))]
    };
  });
}

export function parseMemberFinanceSepaXml(xml, sourceFile = 'SEPA-Import.xml') {
  const paymentBlocks = xmlBlocks(xml, 'PmtInf');
  const groups = (paymentBlocks.length ? paymentBlocks : [String(xml || '')]).map(paymentBlock => ({
    collectionDate: xmlValues(paymentBlock, 'ReqdColltnDt')[0] || '',
    blocks: xmlBlocks(paymentBlock, 'DrctDbtTxInf')
  }));
  if (groups.some(group => !/^\d{4}-\d{2}-\d{2}$/.test(group.collectionDate))) {
    throw new Error('SEPA_COLLECTION_DATE_MISSING');
  }
  const financeMonths = [...new Set(groups.map(group => group.collectionDate.slice(0, 7)))];
  if (financeMonths.length !== 1) throw new Error('SEPA_MULTIPLE_FINANCE_MONTHS');
  const entries = groups.flatMap(group => (
    group.blocks.map(block => ({ block, collectionDate: group.collectionDate }))
  ));
  if (!entries.length) throw new Error('SEPA_TRANSACTIONS_MISSING');
  const financeMonth = financeMonths[0];
  const collectionDate = groups.map(group => group.collectionDate).sort()[0];
  const createdAt = xmlValues(xml, 'CreDtTm')[0] || new Date().toISOString();
  const transactions = entries.map(({ block, collectionDate: itemCollectionDate }, index) => {
    const amount = Math.abs(Number(xmlValues(block, 'InstdAmt')[0]) || 0);
    const mandate = xmlValues(block, 'MndtId')[0] || '';
    const purpose = xmlValues(block, 'Ustrd')[0] || '';
    return {
      id: `${financeMonth}-${crypto.createHash('sha256').update(`${sourceFile}:${index}:${mandate}`).digest('hex').slice(0, 16)}`,
      sourceFile,
      collectionDate: itemCollectionDate,
      financeMonth,
      createdAt,
      name: xmlValues(xmlBlocks(block, 'Dbtr')[0] || block, 'Nm')[0] || 'Unbekannter Zahler',
      iban: xmlValues(xmlBlocks(block, 'DbtrAcct')[0] || block, 'IBAN')[0] || '',
      amount,
      packageCount: packageCount(amount, mandate, purpose),
      mandate,
      signatureDate: xmlValues(block, 'DtOfSgntr')[0] || '',
      purpose,
      plan: classifyPlan(amount, mandate, purpose)
    };
  });
  return {
    financeMonth,
    collectionDate,
    createdAt,
    sourceFile,
    transactions,
    summary: {
      file: sourceFile,
      collectionDate,
      financeMonth,
      createdAt,
      ctrlSum: Number(xmlValues(xml, 'CtrlSum')[0]) || 0,
      nbOfTxs: Number(xmlValues(xml, 'NbOfTxs')[0]) || 0,
      actualCount: transactions.length,
      actualSum: transactions.reduce((sum, item) => sum + item.amount, 0),
      used: true
    }
  };
}

export function mergeMemberFinanceMonth(current = {}, imported) {
  const previousSummaries = (current.fileSummaries || []).map(summary => (
    summary.financeMonth === imported.financeMonth ? { ...summary, used: false } : summary
  ));
  const fileSummaries = [
    ...previousSummaries.filter(summary => summary.file !== imported.sourceFile),
    imported.summary
  ];
  const transactions = [
    ...(current.transactions || []).filter(item => item.financeMonth !== imported.financeMonth),
    ...imported.transactions
  ].sort((left, right) => `${left.financeMonth}|${left.name}`.localeCompare(`${right.financeMonth}|${right.name}`, 'de'));
  const ignoredFiles = fileSummaries
    .filter(summary => summary.used === false)
    .map(summary => ({
      file: summary.file,
      financeMonth: summary.financeMonth,
      collectionDate: summary.collectionDate,
      createdAt: summary.createdAt,
      count: summary.actualCount,
      amount: summary.actualSum,
      reason: 'Durch einen neueren Import desselben Monats ersetzt',
      usedFile: imported.sourceFile
    }));
  return {
    ...current,
    generatedAt: new Date().toISOString(),
    sourceLabel: 'Direkt aus den unter „Lastschriften“ importierten SEPA-XML-Dateien',
    sourceFolder: current.sourceFolder || 'PDB Office',
    monthRule: 'Pro Monat gilt der vor der Naspa-Einreichung eingefrorene SEPA-XML-Snapshot. Spätere Änderungen werden getrennt als Nachträge geführt.',
    fileCount: new Set(fileSummaries.map(summary => summary.file)).size,
    usedFileCount: new Set(transactions.map(item => item.financeMonth)).size,
    ignoredFileCount: ignoredFiles.length,
    transactionCount: transactions.length,
    fileSummaries,
    ignoredFiles,
    months: summarizeMonths(transactions),
    transactions
  };
}
