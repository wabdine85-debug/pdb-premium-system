import React, { useMemo, useRef, useState } from "react";
import {
  DIRECT_DEBIT_ADJUSTMENT_TYPES,
  RETURN_CASE_STATUSES,
  RETURN_REASON_LABELS,
  createDirectDebitRun,
  createDirectDebitRunFromSepaXml,
  createReturnCase,
  decodeBankCsv,
  getReturnCaseSummary,
  getDirectDebitChangesSinceRun,
  maskIban,
  parseNaspaReturnCsv,
  parseNaspaMemberPaymentsCsv,
  returnTransactionFingerprint,
  suggestDirectDebitItem,
  updateReturnCase,
} from "../../modules/direct-debits/directDebitUtils.js";
import "./direct-debits.css";

const uid = () => Math.random().toString(36).slice(2, 10);
const isoToday = () => new Date().toISOString().slice(0, 10);
const currentMonth = () => isoToday().slice(0, 7);
const money = value => new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(Number(value) || 0);
const dateLabel = value => value ? new Date(`${value}T12:00:00`).toLocaleDateString("de-DE") : "—";
const monthLabel = value => value ? new Date(`${value}-01T12:00:00`).toLocaleDateString("de-DE", { month: "long", year: "numeric" }) : "—";
const nextMonth = value => {
  const [year, month] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
};
const isClosed = status => ["bezahlt", "storniert"].includes(status);

function StatusPill({ status }) {
  const labels = {
    entwurf: "Entwurf",
    eingefroren: "Eingefroren",
    eingereicht: "Bei Naspa eingereicht",
    gebucht: "Gebucht",
    rueckgaben: "Rückgaben vorhanden",
    abgeschlossen: "Abgeschlossen",
    offen: "Kontakt erforderlich",
    kontaktiert: "Kontaktiert",
    ueberweisung: "Überweisung vereinbart",
    "neuer-einzug": "Neuer Einzug geplant",
    bezahlt: "Bezahlt",
    storniert: "Storniert",
    vorbereitet: "Vorbereitet",
    zurueckgegeben: "Zurückgegeben",
    ausgeglichen: "Ausgeglichen",
    vorgemerkt: "Vorgemerkt",
    geplant: "Geplant",
  };
  return <span className={`ddb-pill ddb-pill--${status}`}>{labels[status] || status}</span>;
}

function EmptyState({ title, text, action }) {
  return (
    <div className="ddb-empty">
      <div className="ddb-empty__mark">PDB</div>
      <h3>{title}</h3>
      <p>{text}</p>
      {action}
    </div>
  );
}

function Metric({ label, value, hint, tone = "neutral" }) {
  return (
    <div className={`ddb-metric ddb-metric--${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{hint}</small>
    </div>
  );
}

export default function DirectDebitWorkspace({ data, save }) {
  const [tab, setTab] = useState("returns");
  const [showRunForm, setShowRunForm] = useState(false);
  const [runForm, setRunForm] = useState(() => ({ month: currentMonth(), dueDate: `${currentMonth()}-05` }));
  const [runError, setRunError] = useState("");
  const [selectedRunId, setSelectedRunId] = useState("");
  const [manualItemId, setManualItemId] = useState("");
  const [returnForm, setReturnForm] = useState({ returnedAt: isoToday(), reasonCode: "AM04", fee: "", note: "" });
  const [selectedCaseId, setSelectedCaseId] = useState("");
  const [caseDraft, setCaseDraft] = useState(null);
  const [caseFilter, setCaseFilter] = useState("offen");
  const [search, setSearch] = useState("");
  const [importRows, setImportRows] = useState(null);
  const [bankImport, setBankImport] = useState(null);
  const [importMessage, setImportMessage] = useState("");
  const [xmlMessage, setXmlMessage] = useState("");
  const fileRef = useRef(null);
  const xmlRef = useRef(null);

  const runs = useMemo(() => [...(data.directDebitRuns || [])].sort((a, b) => (b.month || "").localeCompare(a.month || "")), [data.directDebitRuns]);
  const items = data.directDebitItems || [];
  const adjustments = data.directDebitAdjustments || [];
  const cases = data.returnDebitCases || [];
  const summary = getReturnCaseSummary(cases);
  const selectedRun = runs.find(run => run.id === selectedRunId) || runs[0] || null;
  const selectedRunItems = selectedRun ? items.filter(item => item.runId === selectedRun.id) : [];
  const selectedRunAdjustments = selectedRun ? adjustments.filter(item => item.serviceMonth === selectedRun.month || item.collectionMonth === selectedRun.month) : [];
  const selectedRunChanges = useMemo(() => getDirectDebitChangesSinceRun({ data, run: selectedRun, items }), [data, selectedRun, items]);
  const selectedCase = cases.find(item => item.id === selectedCaseId) || null;
  const eligibleImportItems = items.filter(item => !cases.some(returnCase => returnCase.itemId === item.id));

  const filteredCases = cases
    .filter(item => caseFilter === "alle" || (caseFilter === "offen" ? !isClosed(item.status) : item.status === caseFilter))
    .filter(item => !search.trim() || [item.memberName, item.reason, item.reasonCode, item.note].some(value => String(value || "").toLowerCase().includes(search.trim().toLowerCase())))
    .sort((a, b) => (b.returnedAt || "").localeCompare(a.returnedAt || ""));

  const createRun = event => {
    event.preventDefault();
    setRunError("");
    if (runs.some(run => run.month === runForm.month)) {
      setRunError(`Für ${monthLabel(runForm.month)} existiert bereits ein Lastschriftlauf.`);
      return;
    }
    try {
      const created = createDirectDebitRun({ data, ...runForm, idFactory: uid });
      save(current => ({
        ...current,
        directDebitRuns: [...(current.directDebitRuns || []), created.run],
        directDebitItems: [...(current.directDebitItems || []), ...created.items],
      }));
      setSelectedRunId(created.run.id);
      setShowRunForm(false);
      setTab("runs");
    } catch (error) {
      setRunError(error.message);
    }
  };

  const setRunStatus = (run, status) => {
    const timestamp = new Date().toISOString();
    save(current => ({
      ...current,
      directDebitRuns: (current.directDebitRuns || []).map(item => item.id === run.id ? {
        ...item,
        status,
        frozenAt: status === "eingefroren" ? (item.frozenAt || timestamp) : item.frozenAt,
        submittedAt: status === "eingereicht" ? (item.submittedAt || timestamp) : item.submittedAt,
        updatedAt: timestamp,
      } : item),
      directDebitItems: (current.directDebitItems || []).map(item => item.runId === run.id && ["vorbereitet", "eingefroren"].includes(item.status) && ["eingefroren", "eingereicht"].includes(status)
        ? { ...item, status, updatedAt: timestamp }
        : item),
    }));
  };

  const storeReturnCase = ({ item, run, transaction, fee, note }) => {
    const created = createReturnCase({ item, run, transaction, fee, note, idFactory: uid });
    save(current => ({
      ...current,
      returnDebitCases: [...(current.returnDebitCases || []), created],
      directDebitItems: (current.directDebitItems || []).map(entry => entry.id === item.id
        ? { ...entry, status: created.status === "bezahlt" ? "ausgeglichen" : "zurueckgegeben", returnCaseId: created.id, updatedAt: created.updatedAt }
        : entry),
      directDebitRuns: (current.directDebitRuns || []).map(entry => entry.id === run.id
        ? { ...entry, status: "rueckgaben", updatedAt: created.updatedAt }
        : entry),
      bankTransactions: transaction ? [...(current.bankTransactions || []), {
        id: transaction.id,
        date: transaction.date,
        name: transaction.name,
        amount: -Math.abs(transaction.amount),
        purpose: transaction.purpose,
        type: "return-debit",
        matched: true,
        returnCaseId: created.id,
        sourceFingerprint: transaction.sourceFingerprint || returnTransactionFingerprint(transaction),
      }] : (current.bankTransactions || []),
      members: (current.members || []).map(member => member.id === item.memberId ? {
        ...member,
        timeline: [...(member.timeline || []), {
          id: uid(),
          type: "payment",
          text: `Rücklastschrift ${money(created.amount)} · ${created.reason}`,
          date: created.returnedAt,
          ts: Date.parse(created.createdAt) || Date.now(),
        }],
      } : member),
    }));
    return created;
  };

  const submitManualReturn = event => {
    event.preventDefault();
    const item = items.find(entry => entry.id === manualItemId);
    const run = runs.find(entry => entry.id === item?.runId);
    if (!item || !run) return;
    const transaction = {
      id: uid(),
      date: returnForm.returnedAt,
      amount: item.amount,
      name: item.memberName,
      reasonCode: returnForm.reasonCode,
      reason: RETURN_REASON_LABELS[returnForm.reasonCode] || "Manuell erfasst",
      purpose: "Manuell in PDB Office erfasst",
    };
    const created = storeReturnCase({ item, run, transaction, fee: returnForm.fee, note: returnForm.note });
    setManualItemId("");
    setSelectedCaseId(created.id);
    setCaseDraft(created);
    setTab("returns");
  };

  const openCase = returnCase => {
    setSelectedCaseId(returnCase.id);
    setCaseDraft({ ...returnCase, historyNote: "" });
  };

  const saveCase = event => {
    event.preventDefault();
    if (!selectedCase || !caseDraft) return;
    const updated = updateReturnCase(selectedCase, {
      status: caseDraft.status,
      nextActionAt: caseDraft.nextActionAt,
      fee: Math.max(0, Number(caseDraft.fee) || 0),
      note: caseDraft.note || "",
      historyNote: caseDraft.historyNote || "",
    }, { idFactory: uid });
    save(current => ({
      ...current,
      returnDebitCases: (current.returnDebitCases || []).map(item => item.id === updated.id ? updated : item),
      directDebitItems: (current.directDebitItems || []).map(item => item.id === updated.itemId ? {
        ...item,
        status: updated.status === "bezahlt" ? "ausgeglichen" : updated.status === "storniert" ? "storniert" : "zurueckgegeben",
        updatedAt: updated.updatedAt,
      } : item),
      members: (current.members || []).map(member => member.id === updated.memberId && updated.status !== selectedCase.status ? {
        ...member,
        timeline: [...(member.timeline || []), {
          id: uid(),
          type: "payment",
          text: `Rücklastschrift: ${RETURN_CASE_STATUSES.find(status => status.value === updated.status)?.label || updated.status}`,
          date: updated.updatedAt.slice(0, 10),
          ts: Date.parse(updated.updatedAt),
        }],
      } : member),
    }));
    setSelectedCaseId("");
    setCaseDraft(null);
  };

  const readImport = async file => {
    if (!file) return;
    setImportMessage("");
    try {
      const text = decodeBankCsv(await file.arrayBuffer());
      const knownFingerprints = new Set((data.bankTransactions || []).map(transaction => transaction.sourceFingerprint).filter(Boolean));
      const transactions = parseNaspaReturnCsv(text, { idFactory: uid })
        .filter(transaction => !knownFingerprints.has(transaction.sourceFingerprint));
      const payments = parseNaspaMemberPaymentsCsv(text, { idFactory: uid });
      const newestFinanceMonth = payments.batches.map(batch => batch.financeMonth).sort().at(-1) || "";
      const paymentPreview = {
        sourceFile: file.name,
        batches: payments.batches.filter(batch => !newestFinanceMonth || batch.financeMonth === newestFinanceMonth),
        adjustments: payments.adjustments
          .filter(adjustment => !newestFinanceMonth || adjustment.collectionMonth === newestFinanceMonth)
          .filter(adjustment => !knownFingerprints.has(adjustment.sourceFingerprint)),
      };
      const rows = transactions.map(transaction => {
        const suggestion = suggestDirectDebitItem(transaction, eligibleImportItems);
        return {
          transaction,
          suggestion,
          itemId: suggestion && !suggestion.ambiguous ? suggestion.item.id : "",
          imported: false,
        };
      });
      setImportRows(rows);
      setBankImport(paymentPreview.batches.length || paymentPreview.adjustments.length ? paymentPreview : null);
      const parts = [];
      if (paymentPreview.batches.length) parts.push(`${paymentPreview.batches.length} Sammellauf erkannt`);
      if (paymentPreview.adjustments.length) parts.push(`${paymentPreview.adjustments.length} PDB-Nachträge erkannt`);
      if (rows.length) parts.push(`${rows.length} neue Rücklastschrift${rows.length === 1 ? "" : "en"}`);
      setImportMessage(parts.length ? `${parts.join(" · ")}.` : "Keine neuen PDB-Buchungen erkannt. Bereits importierte Buchungen werden nicht doppelt übernommen.");
    } catch {
      setImportRows([]);
      setBankImport(null);
      setImportMessage("Die Datei konnte nicht gelesen werden. Bitte einen CSV-CAMT-Export der Naspa verwenden.");
    } finally {
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const applyBankImport = () => {
    if (!bankImport) return;
    const batchByRun = new Map();
    bankImport.batches.forEach(batch => {
      const run = runs.find(entry => entry.month === batch.financeMonth);
      if (run) batchByRun.set(run.id, batch);
    });
    if (bankImport.batches.length && !batchByRun.size) {
      setImportMessage("Bitte zuerst die zugehörige SEPA-XML als eingefrorenen Monatslauf importieren.");
      return;
    }
    const timestamp = new Date().toISOString();
    save(current => {
      const known = new Set((current.bankTransactions || []).map(entry => entry.sourceFingerprint).filter(Boolean));
      const existingAdjustments = current.directDebitAdjustments || [];
      const adjustmentMatch = incoming => existingAdjustments.find(existing => (
        existing.sourceFingerprint === incoming.sourceFingerprint
        || (existing.status === "geplant"
          && existing.collectionMonth === incoming.collectionMonth
          && Math.abs(Number(existing.amount) - Number(incoming.amount)) < 0.01
          && ((existing.mandateReference && existing.mandateReference === incoming.mandateReference)
            || existing.memberName === incoming.memberName))
      ));
      const matchedAdjustmentIds = new Map(bankImport.adjustments.map(incoming => [incoming.sourceFingerprint, adjustmentMatch(incoming)?.id]).filter(([, id]) => id));
      const newAdjustments = bankImport.adjustments.filter(entry => !adjustmentMatch(entry));
      const newBankAdjustments = bankImport.adjustments.filter(entry => !known.has(entry.sourceFingerprint));
      const mergedAdjustments = existingAdjustments.map(existing => {
        const incoming = bankImport.adjustments.find(entry => matchedAdjustmentIds.get(entry.sourceFingerprint) === existing.id);
        if (!incoming) return existing;
        return {
          ...existing,
          bookingDate: incoming.bookingDate,
          valueDate: incoming.valueDate,
          status: incoming.status,
          purpose: incoming.purpose,
          sourceFingerprint: incoming.sourceFingerprint,
          updatedAt: timestamp,
        };
      });
      const bankTransactions = [
        ...(current.bankTransactions || []),
        ...bankImport.batches.filter(entry => !known.has(entry.sourceFingerprint)).map(entry => ({
          id: entry.id, date: entry.bookingDate, amount: entry.amount, purpose: entry.purpose,
          type: "member-batch", matched: true, sourceFingerprint: entry.sourceFingerprint,
        })),
        ...newBankAdjustments.map(entry => ({
          id: entry.id, date: entry.bookingDate, name: entry.memberName, amount: entry.amount,
          purpose: entry.purpose, type: "member-adjustment", matched: true, sourceFingerprint: entry.sourceFingerprint,
        })),
      ];
      return {
        ...current,
        bankTransactions,
        directDebitAdjustments: [...mergedAdjustments, ...newAdjustments],
        directDebitRuns: (current.directDebitRuns || []).map(run => {
          const batch = batchByRun.get(run.id);
          if (!batch) return run;
          const monthAdjustments = bankImport.adjustments.filter(entry => entry.serviceMonth === run.month && entry.type !== "setup-fee");
          const reconciledAmount = Math.round((batch.amount + monthAdjustments.reduce((sum, entry) => sum + entry.amount, 0)) * 100) / 100;
          return {
            ...run,
            status: batch.status === "gebucht" ? "gebucht" : "eingereicht",
            submittedAt: run.submittedAt || batch.bookingDate,
            bookedAt: batch.status === "gebucht" ? batch.bookingDate : run.bookedAt,
            bankAmount: batch.amount,
            bankItemCount: batch.itemCount,
            bankReference: batch.reference,
            bankStatus: batch.status,
            bankSourceFile: bankImport.sourceFile,
            reconciledAmount,
            reconciliationStatus: Math.abs(reconciledAmount - Number(run.totalAmount || 0)) < 0.01 ? "stimmt" : "abweichung",
            updatedAt: timestamp,
          };
        }),
      };
    });
    setImportMessage("Naspa-Sammler und PDB-Nachträge wurden übernommen. Vorgemerkte Buchungen bleiben bis zur endgültigen Buchung entsprechend markiert.");
    setBankImport(null);
  };

  const updateBankAdjustment = (index, patch) => {
    setBankImport(current => ({
      ...current,
      adjustments: current.adjustments.map((entry, entryIndex) => entryIndex === index ? { ...entry, ...patch } : entry),
    }));
  };

  const queueChange = (change, collectionMonth) => {
    if (!selectedRun || change.amount <= 0) return;
    const sourceChangeKey = `${selectedRun.id}:${change.key}:${collectionMonth}`;
    if (adjustments.some(entry => entry.sourceChangeKey === sourceChangeKey)) return;
    const timestamp = new Date().toISOString();
    save(current => ({
      ...current,
      directDebitAdjustments: [...(current.directDebitAdjustments || []), {
        id: uid(),
        runId: selectedRun.id,
        membershipId: change.membershipId,
        memberId: change.memberId,
        memberName: change.memberName,
        mandateReference: change.mandateReference,
        amount: change.amount,
        type: change.type,
        status: "geplant",
        serviceMonth: selectedRun.month,
        collectionMonth,
        sourceChangeKey,
        createdAt: timestamp,
        purpose: change.type === "upgrade" ? `Upgrade-Differenz für ${monthLabel(selectedRun.month)}` : `Nachlauf für ${monthLabel(selectedRun.month)}`,
      }],
    }));
  };

  const importSepaXml = async file => {
    if (!file) return;
    setXmlMessage("");
    try {
      const xml = await file.text();
      const created = createDirectDebitRunFromSepaXml({ data, text: xml, sourceFile: file.name, idFactory: uid });
      const existingRun = runs.find(run => run.month === created.run.month);
      if (existingRun && existingRun.status !== "entwurf") {
        throw new Error(`Der Lauf für ${monthLabel(created.run.month)} ist bereits ${existingRun.status} und bleibt unverändert. Neue Änderungen bitte als Nachtrag erfassen.`);
      }
      if (existingRun && cases.some(returnCase => returnCase.runId === existingRun.id)) {
        throw new Error(`Der Lauf für ${monthLabel(created.run.month)} enthält bereits Rücklastschriftfälle und kann nicht ersetzt werden.`);
      }
      const financeResponse = await fetch('/api/office/member-finance/import-sepa', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-PDB-Admin': '1' },
        body: JSON.stringify({ sourceFile: file.name, xml }),
      });
      const financeResult = await financeResponse.json().catch(() => ({}));
      if (!financeResponse.ok || !financeResult.ok) {
        throw new Error('Member Finanzen konnte nicht aktualisiert werden. Der Lastschriftlauf wurde nicht übernommen.');
      }
      save(current => ({
        ...current,
        directDebitRuns: [...(current.directDebitRuns || []).filter(run => run.id !== existingRun?.id), created.run],
        directDebitItems: [...(current.directDebitItems || []).filter(item => item.runId !== existingRun?.id), ...created.items],
      }));
      setSelectedRunId(created.run.id);
      setImportRows(null);
      setTab("runs");
      setXmlMessage(`${created.run.itemCount} Lastschriften über ${money(created.run.totalAmount)} aus ${file.name} eingefroren. Dieser Monatslauf wird durch spätere Vertragsänderungen nicht mehr überschrieben.`);
    } catch (error) {
      setXmlMessage(error.message || "Die SEPA-XML konnte nicht gelesen werden.");
    } finally {
      if (xmlRef.current) xmlRef.current.value = "";
    }
  };

  const importReturn = index => {
    const row = importRows[index];
    const item = items.find(entry => entry.id === row.itemId);
    const run = runs.find(entry => entry.id === item?.runId);
    if (!item || !run) return;
    storeReturnCase({ item, run, transaction: row.transaction, fee: row.transaction.fee, note: "" });
    setImportRows(current => current.map((entry, rowIndex) => rowIndex === index ? { ...entry, imported: true } : entry));
  };

  const importAllClearReturns = () => {
    const selectedRows = (importRows || []).filter(row => !row.imported && row.itemId && row.suggestion && !row.suggestion.ambiguous);
    if (!selectedRows.length) return;
    const createdEntries = selectedRows.map(row => {
      const item = items.find(entry => entry.id === row.itemId);
      const run = runs.find(entry => entry.id === item?.runId);
      if (!item || !run) return null;
      return {
        item,
        run,
        transaction: row.transaction,
        returnCase: createReturnCase({ item, run, transaction: row.transaction, fee: row.transaction.fee, idFactory: uid }),
      };
    }).filter(Boolean);
    if (!createdEntries.length) return;
    const caseByItem = new Map(createdEntries.map(entry => [entry.item.id, entry.returnCase]));
    const affectedRunIds = new Set(createdEntries.map(entry => entry.run.id));
    save(current => ({
      ...current,
      returnDebitCases: [...(current.returnDebitCases || []), ...createdEntries.map(entry => entry.returnCase)],
      directDebitItems: (current.directDebitItems || []).map(item => caseByItem.has(item.id) ? {
        ...item,
        status: caseByItem.get(item.id).status === "bezahlt" ? "ausgeglichen" : "zurueckgegeben",
        returnCaseId: caseByItem.get(item.id).id,
        updatedAt: caseByItem.get(item.id).updatedAt,
      } : item),
      directDebitRuns: (current.directDebitRuns || []).map(run => affectedRunIds.has(run.id) ? {
        ...run,
        status: "rueckgaben",
        updatedAt: new Date().toISOString(),
      } : run),
      bankTransactions: [...(current.bankTransactions || []), ...createdEntries.map(entry => ({
        id: entry.transaction.id,
        date: entry.transaction.date,
        name: entry.transaction.name,
        amount: -Math.abs(entry.transaction.amount),
        purpose: entry.transaction.purpose,
        type: "return-debit",
        matched: true,
        returnCaseId: entry.returnCase.id,
        sourceFingerprint: entry.transaction.sourceFingerprint || returnTransactionFingerprint(entry.transaction),
      }))],
      members: (current.members || []).map(member => {
        const memberReturns = createdEntries.filter(entry => entry.item.memberId === member.id);
        if (!memberReturns.length) return member;
        return {
          ...member,
          timeline: [...(member.timeline || []), ...memberReturns.map(entry => ({
            id: uid(),
            type: "payment",
            text: `Rücklastschrift ${money(entry.returnCase.amount)} · ${entry.returnCase.reason}`,
            date: entry.returnCase.returnedAt,
            ts: Date.parse(entry.returnCase.createdAt) || Date.now(),
          }))],
        };
      }),
    }));
    const importedIds = new Set(createdEntries.map(entry => entry.transaction.id));
    setImportRows(current => current.map(row => importedIds.has(row.transaction.id) ? { ...row, imported: true } : row));
    setTab("returns");
  };

  const clearImportCount = (importRows || []).filter(row => !row.imported && row.itemId && row.suggestion && !row.suggestion.ambiguous).length;

  return (
    <div className="ddb-workspace">
      <header className="ddb-header">
        <div>
          <span className="ddb-eyebrow">Membership-Zahlungsverkehr</span>
          <h2>Lastschriften</h2>
          <p>Monatliche Einzüge dokumentieren, Naspa-Rückgaben zuordnen und offene Fälle bis zum Zahlungseingang verfolgen.</p>
        </div>
        <div className="ddb-header__actions">
          <input ref={fileRef} className="ddb-hidden-input" type="file" accept=".csv,.txt" onChange={event => readImport(event.target.files?.[0])} />
          <input ref={xmlRef} className="ddb-hidden-input" type="file" accept=".xml,text/xml,application/xml" onChange={event => importSepaXml(event.target.files?.[0])} />
          <button className="ddb-button ddb-button--secondary" type="button" onClick={() => fileRef.current?.click()}>Naspa-CSV prüfen</button>
          <button className="ddb-button ddb-button--secondary" type="button" onClick={() => xmlRef.current?.click()}>SEPA-XML importieren</button>
          <button className="ddb-button" type="button" onClick={() => { setShowRunForm(true); setRunError(""); }}>Lastschriftlauf erstellen</button>
        </div>
      </header>

      {xmlMessage && <div className="ddb-import-message" role="status">{xmlMessage}</div>}

      {bankImport && (
        <section className="ddb-import" aria-live="polite">
          <div className="ddb-section-heading">
            <div><span className="ddb-eyebrow">Bankabgleich</span><h3>Naspa-Buchungen übernehmen</h3><p>{importMessage} Leistungsmonat und Buchungsart können vor der Übernahme korrigiert werden.</p></div>
            <div className="ddb-import-actions">
              <button className="ddb-button ddb-button--small" type="button" onClick={applyBankImport}>Bankabgleich übernehmen</button>
              <button className="ddb-text-button" type="button" onClick={() => setBankImport(null)}>Schließen</button>
            </div>
          </div>
          {bankImport.batches.map(batch => (
            <div className="ddb-bank-summary" key={batch.sourceFingerprint}>
              <div><span>Sammler</span><strong>{money(batch.amount)}</strong></div>
              <div><span>Positionen</span><strong>{batch.itemCount || "—"}</strong></div>
              <div><span>Buchung</span><strong>{dateLabel(batch.bookingDate)}</strong></div>
              <div><span>Status</span><StatusPill status={batch.status} /></div>
            </div>
          ))}
          {bankImport.adjustments.length > 0 && <div className="ddb-table-wrap"><table className="ddb-table">
            <thead><tr><th>Member</th><th>Betrag</th><th>Leistungsmonat</th><th>Art</th><th>Status</th></tr></thead>
            <tbody>{bankImport.adjustments.map((entry, index) => (
              <tr key={entry.sourceFingerprint}>
                <td><strong>{entry.memberName}</strong><small>{entry.purpose}</small></td>
                <td><strong>{money(entry.amount)}</strong></td>
                <td><input aria-label={`Leistungsmonat für ${entry.memberName}`} type="month" value={entry.serviceMonth} onChange={event => updateBankAdjustment(index, { serviceMonth: event.target.value })} /></td>
                <td><select aria-label={`Buchungsart für ${entry.memberName}`} value={entry.type} onChange={event => updateBankAdjustment(index, { type: event.target.value })}>{DIRECT_DEBIT_ADJUSTMENT_TYPES.map(type => <option key={type.value} value={type.value}>{type.label}</option>)}</select></td>
                <td><StatusPill status={entry.status} /></td>
              </tr>
            ))}</tbody>
          </table></div>}
        </section>
      )}

      <section className="ddb-metrics" aria-label="Rücklastschrift-Kennzahlen">
        <Metric label="Offene Fälle" value={summary.openCount} hint="benötigen eine Klärung" tone={summary.openCount ? "alert" : "positive"} />
        <Metric label="Offener Gesamtbetrag" value={money(summary.openAmount)} hint="inklusive erfasster Bankkosten" tone={summary.openAmount ? "alert" : "neutral"} />
        <Metric label="Zurückgewonnen" value={money(summary.recoveredAmount)} hint="abgeschlossene Zahlungseingänge" tone="positive" />
        <Metric label="Dokumentierte Läufe" value={runs.length} hint={runs[0] ? `zuletzt ${monthLabel(runs[0].month)}` : "noch kein Lauf angelegt"} />
      </section>

      <nav className="ddb-tabs" aria-label="Lastschriftbereiche">
        <button type="button" className={tab === "returns" ? "is-active" : ""} onClick={() => setTab("returns")}>Rücklastschriften {summary.openCount > 0 && <b>{summary.openCount}</b>}</button>
        <button type="button" className={tab === "runs" ? "is-active" : ""} onClick={() => setTab("runs")}>Lastschriftläufe</button>
      </nav>

      {importRows && importRows.length > 0 && (
        <section className="ddb-import" aria-live="polite">
          <div className="ddb-section-heading">
            <div><span className="ddb-eyebrow">Importvorschau</span><h3>Naspa-Rückgaben abgleichen</h3><p>{importMessage} Bitte jede Zuordnung vor der Übernahme prüfen.</p></div>
            <div className="ddb-import-actions">
              {clearImportCount > 0 && <button className="ddb-button ddb-button--small" type="button" onClick={importAllClearReturns}>{clearImportCount} eindeutige übernehmen</button>}
              <button className="ddb-text-button" type="button" onClick={() => setImportRows(null)}>Vorschau schließen</button>
            </div>
          </div>
          {importRows.length > 0 && <div className="ddb-table-wrap"><table className="ddb-table">
            <thead><tr><th>Bankbuchung</th><th>Grund</th><th>Betrag</th><th>Zuordnung</th><th></th></tr></thead>
            <tbody>{importRows.map((row, index) => (
              <tr key={row.transaction.id}>
                <td><strong>{row.transaction.name}</strong><small>{dateLabel(row.transaction.date)} · {row.transaction.mandateReference || "ohne Mandatsreferenz"}</small></td>
                <td>{row.transaction.reason}{row.transaction.recoveredPayment && <small className="ddb-recovered">✓ Folgezahlung {dateLabel(row.transaction.recoveredPayment.date)} · {money(row.transaction.recoveredPayment.amount)}</small>}</td>
                <td><strong>{money(row.transaction.amount + row.transaction.fee)}</strong>{row.transaction.fee > 0 && <small>{money(row.transaction.amount)} Einzug · {money(row.transaction.fee)} Kosten</small>}</td>
                <td>
                  {row.suggestion && !row.suggestion.ambiguous ? <div className="ddb-auto-match"><strong>{row.suggestion.item.memberName}</strong><small>{money(row.suggestion.item.amount)} · {monthLabel(runs.find(run => run.id === row.suggestion.item.runId)?.month)}</small></div> : <select aria-label={`Zuordnung für ${row.transaction.name}`} disabled={row.imported} value={row.itemId} onChange={event => setImportRows(current => current.map((entry, rowIndex) => rowIndex === index ? { ...entry, itemId: event.target.value } : entry))}>
                    <option value="">Bitte auswählen…</option>
                    {eligibleImportItems.map(item => <option key={item.id} value={item.id}>{item.memberName} · {money(item.amount)} · {monthLabel(runs.find(run => run.id === item.runId)?.month)}</option>)}
                  </select>}
                  {row.suggestion && <small className={`ddb-confidence ddb-confidence--${row.suggestion.confidence}`}>Vorschlag {row.suggestion.confidence}: {row.suggestion.reasons.join(", ")}{row.suggestion.ambiguous ? " · mehrdeutig" : ""}</small>}
                </td>
                <td>{row.imported ? <StatusPill status="bezahlt" /> : <button className="ddb-button ddb-button--small" disabled={!row.itemId} type="button" onClick={() => importReturn(index)}>Übernehmen</button>}</td>
              </tr>
            ))}</tbody>
          </table></div>}
        </section>
      )}

      {tab === "returns" && (
        <section className="ddb-panel">
          <div className="ddb-section-heading ddb-section-heading--filters">
            <div><span className="ddb-eyebrow">Arbeitsliste</span><h3>Rücklastschriften klären</h3><p>Ein Fall verschwindet erst aus dieser Liste, wenn Zahlung oder Storno dokumentiert ist.</p></div>
            <div className="ddb-filters">
              <input aria-label="Rücklastschriften durchsuchen" placeholder="Name oder Rückgabegrund…" value={search} onChange={event => setSearch(event.target.value)} />
              <select aria-label="Rücklastschriften filtern" value={caseFilter} onChange={event => setCaseFilter(event.target.value)}>
                <option value="offen">Alle offenen Fälle</option>
                <option value="alle">Alle Fälle</option>
                {RETURN_CASE_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
              </select>
            </div>
          </div>
          {filteredCases.length === 0 ? (
            <EmptyState title={cases.length ? "Keine Fälle in diesem Filter" : "Keine Rücklastschriften offen"} text={cases.length ? "Passe Suche oder Statusfilter an." : "Importiere einen Naspa-CSV-Export oder erfasse eine Rückgabe in einem Lastschriftlauf."} />
          ) : <div className="ddb-table-wrap"><table className="ddb-table">
            <thead><tr><th>Kunde</th><th>Rückgabe</th><th>Offener Betrag</th><th>Nächste Aktion</th><th>Status</th><th></th></tr></thead>
            <tbody>{filteredCases.map(returnCase => (
              <tr key={returnCase.id}>
                <td><strong>{returnCase.memberName}</strong><small>{monthLabel(runs.find(run => run.id === returnCase.runId)?.month)}</small></td>
                <td>{dateLabel(returnCase.returnedAt)}<small>{returnCase.reasonCode ? `${returnCase.reasonCode} · ` : ""}{returnCase.reason}</small></td>
                <td><strong>{money(Number(returnCase.amount) + Number(returnCase.fee || 0))}</strong>{Number(returnCase.fee) > 0 && <small>inkl. {money(returnCase.fee)} Kosten</small>}</td>
                <td>{isClosed(returnCase.status) ? "—" : dateLabel(returnCase.nextActionAt)}</td>
                <td><StatusPill status={returnCase.status} /></td>
                <td><button className="ddb-text-button" type="button" onClick={() => openCase(returnCase)}>Öffnen</button></td>
              </tr>
            ))}</tbody>
          </table></div>}
        </section>
      )}

      {tab === "runs" && (
        <section className="ddb-runs-layout">
          <aside className="ddb-run-list">
            <div className="ddb-section-heading"><div><span className="ddb-eyebrow">Archiv</span><h3>Monatsläufe</h3></div></div>
            {runs.length === 0 ? <p className="ddb-muted">Noch kein Lauf angelegt.</p> : runs.map(run => (
              <button key={run.id} type="button" className={selectedRun?.id === run.id ? "is-active" : ""} onClick={() => setSelectedRunId(run.id)}>
                <span><strong>{monthLabel(run.month)}</strong><small>{run.itemCount} Einzüge · {money(run.totalAmount)}</small></span>
                <StatusPill status={run.status} />
              </button>
            ))}
          </aside>
          <div className="ddb-panel ddb-run-detail">
            {!selectedRun ? <EmptyState title="Ersten Lastschriftlauf erstellen" text="Der Lauf übernimmt alle im Monat aktiven SEPA-Members als nachvollziehbare Momentaufnahme." action={<button className="ddb-button" type="button" onClick={() => setShowRunForm(true)}>Lastschriftlauf erstellen</button>} /> : <>
              <div className="ddb-section-heading">
                <div><span className="ddb-eyebrow">Fällig {dateLabel(selectedRun.dueDate)}</span><h3>{selectedRun.title}</h3><p>{selectedRun.itemCount} Einzüge · {money(selectedRun.totalAmount)}</p></div>
                <div className="ddb-run-actions">
                  <StatusPill status={selectedRun.status} />
                  {selectedRun.status === "entwurf" && <button className="ddb-button ddb-button--secondary" type="button" onClick={() => setRunStatus(selectedRun, "eingefroren")}>Lauf einfrieren</button>}
                  {selectedRun.status === "eingefroren" && <button className="ddb-button ddb-button--secondary" type="button" onClick={() => setRunStatus(selectedRun, "eingereicht")}>Als eingereicht markieren</button>}
                  {selectedRun.status === "eingereicht" && <button className="ddb-button ddb-button--secondary" type="button" onClick={() => setRunStatus(selectedRun, "gebucht")}>Als gebucht markieren</button>}
                  {["gebucht", "rueckgaben"].includes(selectedRun.status) && <button className="ddb-button ddb-button--secondary" type="button" onClick={() => setRunStatus(selectedRun, "abgeschlossen")}>Lauf abschließen</button>}
                </div>
              </div>
              {(selectedRun.bankAmount != null || selectedRun.frozenAt) && <div className="ddb-bank-summary ddb-bank-summary--detail">
                <div><span>Eingefrorenes Soll</span><strong>{money(selectedRun.totalAmount)}</strong><small>{selectedRun.itemCount} Positionen</small></div>
                <div><span>Naspa-Sammler</span><strong>{selectedRun.bankAmount != null ? money(selectedRun.bankAmount) : "Noch nicht abgeglichen"}</strong><small>{selectedRun.bankItemCount ? `${selectedRun.bankItemCount} Positionen` : "CSV nach Buchung importieren"}</small></div>
                <div><span>Mit Nachträgen</span><strong>{selectedRun.reconciledAmount != null ? money(selectedRun.reconciledAmount) : "—"}</strong><small>{selectedRun.reconciliationStatus === "stimmt" ? "✓ stimmt mit Soll überein" : selectedRun.reconciliationStatus === "abweichung" ? "Abweichung prüfen" : "noch offen"}</small></div>
              </div>}
              <div className="ddb-table-wrap"><table className="ddb-table">
                <thead><tr><th>Member</th><th>Mandat</th><th>IBAN</th><th>Betrag</th><th>Status</th><th></th></tr></thead>
                <tbody>{selectedRunItems.map(item => (
                  <tr key={item.id}>
                    <td><strong>{item.memberName}</strong></td>
                    <td>{item.mandateReference || <span className="ddb-warning">fehlt</span>}</td>
                    <td>{maskIban(item.iban)}</td>
                    <td><strong>{money(item.amount)}</strong></td>
                    <td><StatusPill status={item.status} /></td>
                    <td>{!item.returnCaseId && !["storniert", "ausgeglichen"].includes(item.status) && <button className="ddb-text-button" type="button" onClick={() => { setManualItemId(item.id); setReturnForm({ returnedAt: isoToday(), reasonCode: "AM04", fee: "", note: "" }); }}>Rückgabe erfassen</button>}</td>
                  </tr>
                ))}</tbody>
              </table></div>
              {selectedRunChanges.length > 0 && <div className="ddb-subsection">
                <div className="ddb-section-heading"><div><span className="ddb-eyebrow">Nach dem Einfrieren</span><h3>Neue Änderungen</h3><p>Diese Positionen verändern den eingereichten Lauf nicht. Entscheide, wann sie zusätzlich eingezogen werden.</p></div></div>
                <div className="ddb-table-wrap"><table className="ddb-table">
                  <thead><tr><th>Member</th><th>Änderung</th><th>Betrag</th><th>Einzug planen</th></tr></thead>
                  <tbody>{selectedRunChanges.map(change => {
                    const currentKey = `${selectedRun.id}:${change.key}:${selectedRun.month}`;
                    const nextKey = `${selectedRun.id}:${change.key}:${nextMonth(selectedRun.month)}`;
                    const currentQueued = adjustments.some(entry => entry.sourceChangeKey === currentKey);
                    const nextQueued = adjustments.some(entry => entry.sourceChangeKey === nextKey);
                    return <tr key={change.key}>
                      <td><strong>{change.memberName}</strong></td>
                      <td>{change.type === "upgrade" ? `${money(change.previousAmount)} → ${money(change.currentAmount)}` : "Neuer Vertrag nach Monatsabschluss"}</td>
                      <td><strong>{change.amount > 0 ? "+" : ""}{money(change.amount)}</strong></td>
                      <td><div className="ddb-inline-actions">
                        <button className="ddb-button ddb-button--small ddb-button--secondary" disabled={change.amount <= 0 || currentQueued} type="button" onClick={() => queueChange(change, selectedRun.month)}>{currentQueued ? "Nachlauf geplant" : "Diesen Monat"}</button>
                        <button className="ddb-button ddb-button--small ddb-button--secondary" disabled={change.amount <= 0 || nextQueued} type="button" onClick={() => queueChange(change, nextMonth(selectedRun.month))}>{nextQueued ? "Vorgemerkt" : `${monthLabel(nextMonth(selectedRun.month))}`}</button>
                      </div></td>
                    </tr>;
                  })}</tbody>
                </table></div>
              </div>}
              {selectedRunAdjustments.length > 0 && <div className="ddb-subsection">
                <div className="ddb-section-heading"><div><span className="ddb-eyebrow">Sonderbuchungen</span><h3>Nachträge und Gebühren</h3><p>Leistungsmonat und tatsächlicher Einzugsmonat bleiben getrennt nachvollziehbar.</p></div></div>
                <div className="ddb-table-wrap"><table className="ddb-table">
                  <thead><tr><th>Member</th><th>Art</th><th>Leistungsmonat</th><th>Einzugsmonat</th><th>Betrag</th><th>Status</th></tr></thead>
                  <tbody>{selectedRunAdjustments.map(entry => <tr key={entry.id}>
                    <td><strong>{entry.memberName}</strong></td>
                    <td>{DIRECT_DEBIT_ADJUSTMENT_TYPES.find(type => type.value === entry.type)?.label || entry.type}</td>
                    <td>{monthLabel(entry.serviceMonth)}</td>
                    <td>{monthLabel(entry.collectionMonth)}</td>
                    <td><strong>{money(entry.amount)}</strong></td>
                    <td><StatusPill status={entry.status} /></td>
                  </tr>)}</tbody>
                </table></div>
              </div>}
            </>}
          </div>
        </section>
      )}

      {showRunForm && <div className="ddb-modal-backdrop" role="presentation"><form className="ddb-modal" onSubmit={createRun} role="dialog" aria-modal="true" aria-labelledby="ddb-new-run-title">
        <div className="ddb-modal__heading"><div><span className="ddb-eyebrow">Neue Momentaufnahme</span><h3 id="ddb-new-run-title">Lastschriftlauf erstellen</h3></div><button aria-label="Fenster schließen" type="button" onClick={() => setShowRunForm(false)}>×</button></div>
        <p>Alle in diesem Monat aktiven SEPA-Members werden mit dem aktuellen Beitrag, Mandat und Konto übernommen.</p>
        <label>Abrechnungsmonat<input type="month" required value={runForm.month} onChange={event => setRunForm({ month: event.target.value, dueDate: `${event.target.value}-05` })} /></label>
        <label>Fälligkeitstag<input type="date" required value={runForm.dueDate} onChange={event => setRunForm(current => ({ ...current, dueDate: event.target.value }))} /></label>
        {runError && <div className="ddb-form-error">{runError}</div>}
        <div className="ddb-modal__actions"><button className="ddb-button ddb-button--secondary" type="button" onClick={() => setShowRunForm(false)}>Abbrechen</button><button className="ddb-button" type="submit">Lauf anlegen</button></div>
      </form></div>}

      {manualItemId && <div className="ddb-modal-backdrop" role="presentation"><form className="ddb-modal" onSubmit={submitManualReturn} role="dialog" aria-modal="true" aria-labelledby="ddb-manual-title">
        <div className="ddb-modal__heading"><div><span className="ddb-eyebrow">Manuelle Erfassung</span><h3 id="ddb-manual-title">Rücklastschrift dokumentieren</h3></div><button aria-label="Fenster schließen" type="button" onClick={() => setManualItemId("")}>×</button></div>
        <p><strong>{items.find(item => item.id === manualItemId)?.memberName}</strong> · {money(items.find(item => item.id === manualItemId)?.amount)}</p>
        <label>Rückgabedatum<input type="date" required value={returnForm.returnedAt} onChange={event => setReturnForm(current => ({ ...current, returnedAt: event.target.value }))} /></label>
        <label>Rückgabegrund<select value={returnForm.reasonCode} onChange={event => setReturnForm(current => ({ ...current, reasonCode: event.target.value }))}>{Object.entries(RETURN_REASON_LABELS).map(([code, label]) => <option key={code} value={code}>{code} · {label}</option>)}</select></label>
        <label>Bankkosten<input type="number" min="0" step="0.01" placeholder="0,00" value={returnForm.fee} onChange={event => setReturnForm(current => ({ ...current, fee: event.target.value }))} /></label>
        <label>Notiz<textarea rows="3" value={returnForm.note} onChange={event => setReturnForm(current => ({ ...current, note: event.target.value }))} /></label>
        <div className="ddb-modal__actions"><button className="ddb-button ddb-button--secondary" type="button" onClick={() => setManualItemId("")}>Abbrechen</button><button className="ddb-button" type="submit">Rückgabe erfassen</button></div>
      </form></div>}

      {selectedCase && caseDraft && <div className="ddb-modal-backdrop" role="presentation"><form className="ddb-modal ddb-modal--case" onSubmit={saveCase} role="dialog" aria-modal="true" aria-labelledby="ddb-case-title">
        <div className="ddb-modal__heading"><div><span className="ddb-eyebrow">Rücklastschriftfall</span><h3 id="ddb-case-title">{selectedCase.memberName}</h3></div><button aria-label="Fenster schließen" type="button" onClick={() => { setSelectedCaseId(""); setCaseDraft(null); }}>×</button></div>
        <div className="ddb-case-amount"><span>{caseDraft.status === "bezahlt" ? "Eingegangene Folgezahlung" : "Offener Gesamtbetrag"}</span><strong>{money(caseDraft.status === "bezahlt" && caseDraft.paidAmount ? caseDraft.paidAmount : Number(caseDraft.amount) + Number(caseDraft.fee || 0))}</strong><small>{caseDraft.status === "bezahlt" && caseDraft.paidAt ? `bezahlt am ${dateLabel(caseDraft.paidAt)}` : `${money(caseDraft.amount)} Einzug · ${money(caseDraft.fee)} Kosten`}</small></div>
        <div className="ddb-form-grid">
          <label>Status<select value={caseDraft.status} onChange={event => setCaseDraft(current => ({ ...current, status: event.target.value }))}>{RETURN_CASE_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></label>
          <label>Nächste Aktion<input type="date" disabled={isClosed(caseDraft.status)} value={caseDraft.nextActionAt || ""} onChange={event => setCaseDraft(current => ({ ...current, nextActionAt: event.target.value }))} /></label>
          <label>Bankkosten<input type="number" min="0" step="0.01" value={caseDraft.fee || ""} onChange={event => setCaseDraft(current => ({ ...current, fee: event.target.value }))} /></label>
          <label>Interne Notiz<textarea rows="3" value={caseDraft.note || ""} onChange={event => setCaseDraft(current => ({ ...current, note: event.target.value }))} /></label>
          <label className="ddb-form-grid__wide">Neuer Verlaufseintrag<input placeholder="z. B. telefonisch erreicht, Überweisung bis 15.08. vereinbart" value={caseDraft.historyNote || ""} onChange={event => setCaseDraft(current => ({ ...current, historyNote: event.target.value }))} /></label>
        </div>
        <div className="ddb-history"><h4>Verlauf</h4>{[...(selectedCase.history || [])].reverse().map(entry => <div key={entry.id}><time>{new Date(entry.at).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" })}</time><span>{entry.text}</span></div>)}</div>
        <div className="ddb-modal__actions"><button className="ddb-button ddb-button--secondary" type="button" onClick={() => { setSelectedCaseId(""); setCaseDraft(null); }}>Abbrechen</button><button className="ddb-button" type="submit">Änderungen speichern</button></div>
      </form></div>}
    </div>
  );
}
