import fs from "fs";
import path from "path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const privateConfigFile = path.join(root, "scripts", "member-finance-import-config.json");
const privateConfig = fs.existsSync(privateConfigFile)
  ? JSON.parse(fs.readFileSync(privateConfigFile, "utf8"))
  : {};
const kontoDir = fs
  .readdirSync(root, { withFileTypes: true })
  .find(entry => entry.isDirectory() && entry.name.normalize("NFC").toLowerCase().startsWith("kontoausz"));

if (!kontoDir) throw new Error("Ordner kontoauszuege nicht gefunden.");

const folder = path.join(root, kontoDir.name);
const decodeXml = value => (value || "")
  .replace(/&amp;/g, "&")
  .replace(/&lt;/g, "<")
  .replace(/&gt;/g, ">")
  .replace(/&quot;/g, "\"")
  .replace(/&#39;/g, "'")
  .trim();

const readTag = (xml, name) => {
  const match = xml.match(new RegExp(`<[^:>]*${name}[^>]*>([\\s\\S]*?)<\\/[^:>]*${name}>`));
  return decodeXml(match?.[1] || "");
};

const classifyPlan = (amount, mandate, purpose) => {
  const text = `${mandate || ""} ${purpose || ""}`;
  if (/private/i.test(text) || amount === 399) return "Private";
  if (/beyond/i.test(text) || amount >= 190) return "Beyond";
  if (/pure/i.test(text) || amount === 149) return "Pure";
  if (/define/i.test(text)) return "Define";
  return "Individuell";
};

const xmlFiles = fs.readdirSync(folder).filter(file => /\.xml$/i.test(file)).sort();
const transactions = [];

const fileMonthOverrides = privateConfig.fileMonthOverrides || {};
const ignoredFileOverrides = privateConfig.ignoredFileOverrides || {};

const monthFromDate = date => (date || "").slice(0, 7);
const fileDateFromName = file => file.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
const resolveFinanceMonth = (file, collectionDate) => {
  if (fileMonthOverrides[file]) return fileMonthOverrides[file];
  if (ignoredFileOverrides[file]?.month) return ignoredFileOverrides[file].month;
  const collectionMonth = monthFromDate(collectionDate);
  const fileMonth = monthFromDate(fileDateFromName(file));
  if (collectionMonth >= "2026-01") return collectionMonth;
  return fileMonth || collectionMonth;
};

const packageCountFromTransaction = (amount, mandate, purpose) => {
  const text = `${mandate || ""} ${purpose || ""}`;
  const explicitCount = text.match(/(?:^|\D)(\d+)\s*x/i);
  if (explicitCount) return Number(explicitCount[1]) || 1;
  if (/private/i.test(text) && amount && amount % 399 === 0) return Math.max(1, Math.round(amount / 399));
  if (/beyond/i.test(text) && amount && amount % 199 === 0) return Math.max(1, Math.round(amount / 199));
  return 1;
};

const fileSummaries = xmlFiles.map(file => {
  const xml = fs.readFileSync(path.join(folder, file), "utf8");
  const collectionDate = readTag(xml, "ReqdColltnDt") || file.match(/\d{4}-\d{2}-\d{2}/)?.[0] || "";
  const financeMonth = resolveFinanceMonth(file, collectionDate);
  const createdAt = readTag(xml, "CreDtTm");
  const ctrlSum = Number(readTag(xml, "CtrlSum")) || 0;
  const nbOfTxs = Number(readTag(xml, "NbOfTxs")) || 0;
  const blocks = xml.match(/<DrctDbtTxInf>[\s\S]*?<\/DrctDbtTxInf>/g) || [];

  return {
    file,
    fileDate: fileDateFromName(file),
    collectionDate,
    financeMonth,
    createdAt,
    ctrlSum,
    nbOfTxs,
    actualCount: blocks.length,
    actualSum: blocks.reduce((sum, block) => sum + (Number(readTag(block, "InstdAmt")) || 0), 0),
    blocks,
  };
});

const selectedByMonth = new Map();
fileSummaries.forEach(summary => {
  if (!summary.financeMonth || summary.financeMonth < "2026-01") return;
  if (ignoredFileOverrides[summary.file]) return;
  const current = selectedByMonth.get(summary.financeMonth);
  const currentRank = current ? `${current.createdAt || ""}|${current.fileDate || ""}|${current.file}` : "";
  const nextRank = `${summary.createdAt || ""}|${summary.fileDate || ""}|${summary.file}`;
  if (!current || nextRank > currentRank) selectedByMonth.set(summary.financeMonth, summary);
});

const selectedFiles = new Set([...selectedByMonth.values()].map(summary => summary.file));
const ignoredFiles = fileSummaries
  .filter(summary => summary.financeMonth >= "2026-01" && !selectedFiles.has(summary.file))
  .map(summary => ({
    file: summary.file,
    financeMonth: summary.financeMonth,
    collectionDate: summary.collectionDate,
    createdAt: summary.createdAt,
    count: summary.actualCount,
    amount: summary.actualSum,
    reason: ignoredFileOverrides[summary.file]?.reason || "Aeltere Version desselben Monatslaufs",
    usedFile: selectedByMonth.get(summary.financeMonth)?.file || "",
  }));

fileSummaries.filter(summary => selectedFiles.has(summary.file)).forEach(summary => {
  summary.blocks.forEach((block, index) => {
    const amount = Number(readTag(block, "InstdAmt")) || 0;
    const mandate = readTag(block, "MndtId");
    const purpose = readTag(block, "Ustrd");
    const packageCount = packageCountFromTransaction(amount, mandate, purpose);
    transactions.push({
      id: `${summary.file}-${index + 1}`,
      sourceFile: summary.file,
      collectionDate: summary.collectionDate,
      financeMonth: summary.financeMonth,
      createdAt: summary.createdAt,
      fileCtrlSum: summary.ctrlSum,
      fileNbOfTxs: summary.nbOfTxs,
      name: readTag(block, "Nm"),
      iban: readTag(block, "IBAN"),
      amount,
      packageCount,
      mandate,
      signatureDate: readTag(block, "DtOfSgntr"),
      purpose,
      plan: classifyPlan(amount, mandate, purpose),
    });
  });
});

const transactionsFrom2026 = transactions.filter(tx => (tx.financeMonth || "") >= "2026-01");
const months = [...new Set(transactionsFrom2026.map(tx => tx.financeMonth).filter(Boolean))].sort();
const monthly = months.map(month => {
  const rows = transactionsFrom2026.filter(tx => tx.financeMonth === month);
  const byPlan = rows.reduce((acc, tx) => {
    acc[tx.plan] ||= { plan: tx.plan, count: 0, amount: 0 };
    acc[tx.plan].count += tx.packageCount || 1;
    acc[tx.plan].amount += tx.amount || 0;
    return acc;
  }, {});

  return {
    month,
    count: rows.length,
    amount: rows.reduce((sum, tx) => sum + (tx.amount || 0), 0),
    byPlan: Object.values(byPlan).sort((a, b) => b.amount - a.amount),
    files: [...new Set(rows.map(tx => tx.sourceFile))],
  };
});

const output = {
  generatedAt: new Date().toISOString(),
  sourceFolder: kontoDir.name,
  fileCount: xmlFiles.length,
  usedFileCount: selectedFiles.size,
  ignoredFileCount: ignoredFiles.length,
  transactionCount: transactionsFrom2026.length,
  monthRule: "Ab Januar 2026; Monatslauf nach freigegebener Datei-Zuordnung. Doppelte oder nicht freigegebene XML-Versionen werden ignoriert.",
  fileSummaries: fileSummaries.map(({ blocks, ...summary }) => ({
    ...summary,
    used: selectedFiles.has(summary.file),
  })),
  ignoredFiles,
  months: monthly,
  transactions: transactionsFrom2026,
};

fs.writeFileSync(path.join(root, "public", "member-finance-data.json"), JSON.stringify(output, null, 2));
console.log(JSON.stringify({
  folder: kontoDir.name,
  fileCount: xmlFiles.length,
  usedFileCount: selectedFiles.size,
  ignoredFileCount: ignoredFiles.length,
  transactionCount: transactionsFrom2026.length,
  months: monthly.map(month => ({ month: month.month, count: month.count, amount: month.amount })),
  ignoredFiles,
}, null, 2));
