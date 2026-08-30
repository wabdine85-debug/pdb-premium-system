import React, { useEffect, useMemo, useState } from "react";
import { fmt, today } from "../../utils/formatters.js";
import {
  REVENUE_CHANNELS,
  STAFF_MEMBERS,
  dateLabel,
  daysInMonth,
  downloadTextFile,
  entryTotals,
  monthEntries,
  monthLabel,
  monthSummary,
  reportFromMonth,
  reportToCsv,
  revenueChannelAmount,
  roundMoney,
} from "../../modules/revenue/revenueUtils.js";
import { createRevenueEntryRevision, revenueEntryHasChanges, undoRevenueEntry } from "../../modules/revenue/revenueHistory.js";
import "./revenue.css";

const makeId = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
const emptyEntry = date => ({
  id: `revenue-${date}`,
  date,
  cash: 0,
  card: 0,
  shopify: 0,
  paypalPrivate: 0,
  paypalBusiness: 0,
  treatwell: 0,
  note: "",
});

function Field({ label, span = 1, children }) {
  const fieldId = React.useId();
  const directControl = React.isValidElement(children) && ["input", "select", "textarea"].includes(children.type);
  const controlId = directControl ? (children.props.id || fieldId) : undefined;
  const control = directControl ? React.cloneElement(children, { id: controlId }) : children;
  return <div className={`revenue-field span-${span}`}><label htmlFor={controlId}>{label}</label>{control}</div>;
}

function Modal({ kicker, title, children, onClose }) {
  return (
    <div className="revenue-modal-backdrop" role="presentation" onMouseDown={event => event.target === event.currentTarget && onClose()}>
      <div className="revenue-modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="revenue-card-head">
          <div><div className="revenue-section-kicker">{kicker}</div><h3>{title}</h3></div>
          <button className="revenue-button secondary small" onClick={onClose}>Schließen</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Money({ value, zero = "—" }) {
  return <>{Number(value) ? fmt(Number(value)) : <span className="revenue-zero">{zero}</span>}</>;
}

function PrintSheet({ report }) {
  if (!report) return null;
  return (
    <div className="revenue-print-sheet">
      <h1>Monatsbericht · {monthLabel(report.month)}</h1>
      <div>Version {report.version} · erstellt am {new Date(report.createdAt).toLocaleString("de-DE")}</div>
      <div className="revenue-print-summary">
        <div><span>Geschäftsumsatz</span><strong>{fmt(report.summary.business)}</strong></div>
        <div><span>Persönliche Zuflüsse</span><strong>{fmt(report.summary.personal)}</strong></div>
        <div><span>Gesamtzufluss</span><strong>{fmt(report.summary.total)}</strong></div>
      </div>
      <table className="revenue-print-table">
        <thead><tr><th>Datum</th>{REVENUE_CHANNELS.map(channel => <th key={channel.key}>{channel.shortLabel}</th>)}<th>Gesamt</th></tr></thead>
        <tbody>
          {(report.entries || []).map(entry => (
            <tr key={entry.date}><td>{entry.date}</td>{REVENUE_CHANNELS.map(channel => <td key={channel.key}>{fmt(revenueChannelAmount(entry, channel.key))}</td>)}<td>{fmt(entryTotals(entry).total)}</td></tr>
          ))}
        </tbody>
      </table>
      <div style={{ marginTop: 18, fontSize: 10 }}>
        Premium aus Member Finanzen: {fmt(report.summary.premium)} · Persönliche Zuflüsse werden getrennt vom Geschäftsumsatz ausgewiesen.
      </div>
    </div>
  );
}

export default function RevenueWorkspace({ data, save }) {
  const currentMonth = today().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState(currentMonth);
  const [selectedDate, setSelectedDate] = useState(today());
  const [draft, setDraft] = useState(() => emptyEntry(today()));
  const [financeMonths, setFinanceMonths] = useState({});
  const [financeReady, setFinanceReady] = useState(false);
  const [modal, setModal] = useState(null);
  const [printReport, setPrintReport] = useState(null);
  const [notice, setNotice] = useState("");

  const entries = data.revenueEntries || [];
  const receivables = data.revenueReceivables || [];
  const staffLedger = data.staffLedger || [];
  const reports = data.revenueReports || [];
  const premiumFallbacks = data.revenuePremiumFallbacks || {};
  const savedDay = entries.find(entry => entry.date === draft.date);
  const hasDraftChanges = revenueEntryHasChanges(draft, savedDay);

  useEffect(() => {
    let alive = true;
    fetch("/api/office/member-finance", { cache: "no-store" })
      .then(response => response.ok ? response.json() : null)
      .then(json => {
        if (!alive) return;
        const mapped = Object.fromEntries((json?.months || []).map(month => [month.month, Number(month.amount) || 0]));
        setFinanceMonths(mapped);
        setFinanceReady(true);
      })
      .catch(() => alive && setFinanceReady(true));
    return () => { alive = false; };
  }, []);

  const premiumForMonth = month => financeMonths[month] ?? premiumFallbacks[month] ?? 0;
  const availableMonths = useMemo(() => {
    const values = new Set([currentMonth, ...entries.map(entry => entry.date?.slice(0, 7)), ...Object.keys(premiumFallbacks), ...Object.keys(financeMonths)]);
    return Array.from(values).filter(Boolean).sort();
  }, [currentMonth, entries, financeMonths, premiumFallbacks]);

  const summary = useMemo(
    () => monthSummary(entries, selectedMonth, premiumForMonth(selectedMonth)),
    [entries, selectedMonth, financeMonths, premiumFallbacks],
  );

  const monthlySummaries = useMemo(
    () => availableMonths.map(month => monthSummary(entries, month, premiumForMonth(month))),
    [availableMonths, entries, financeMonths, premiumFallbacks],
  );

  useEffect(() => {
    if (!financeReady) return;
    const completed = availableMonths.filter(month => month < currentMonth);
    const missing = completed.filter(month => !reports.some(report => report.month === month));
    if (!missing.length) return;
    const automaticReports = missing.map(month => reportFromMonth({
      entries,
      month,
      premium: premiumForMonth(month),
      version: 1,
    }));
    save(previous => ({ ...previous, revenueReports: [...(previous.revenueReports || []), ...automaticReports] }));
  }, [financeReady, availableMonths.join("|"), currentMonth]);

  const selectDate = date => {
    if (!date) return;
    const existing = entries.find(entry => entry.date === date);
    setSelectedMonth(date.slice(0, 7));
    setSelectedDate(date);
    setDraft(existing ? { ...existing } : emptyEntry(date));
  };

  const selectMonth = month => {
    const preferredDate = month === currentMonth ? today() : `${month}-01`;
    setSelectedMonth(month);
    setSelectedDate(preferredDate);
    const existing = entries.find(entry => entry.date === preferredDate);
    setDraft(existing ? { ...existing } : emptyEntry(preferredDate));
  };

  const updateDraft = (key, value) => setDraft(current => ({
    ...current,
    [key]: REVENUE_CHANNELS.some(channel => channel.key === key) ? Math.max(0, Number(value) || 0) : value,
  }));

  const saveDay = () => {
    if (!hasDraftChanges) return;
    const next = createRevenueEntryRevision(draft, savedDay, new Date().toISOString());
    save(previous => {
      const otherEntries = (previous.revenueEntries || []).filter(entry => entry.date !== next.date);
      return { ...previous, revenueEntries: [...otherEntries, next].sort((left, right) => left.date.localeCompare(right.date)) };
    });
    setDraft(next);
    setNotice(`${dateLabel(next.date)} gespeichert`);
    window.setTimeout(() => setNotice(""), 2200);
  };

  const discardDayChanges = () => {
    setDraft(savedDay ? { ...savedDay } : emptyEntry(draft.date));
    setNotice("Nicht gespeicherte Änderungen verworfen");
    window.setTimeout(() => setNotice(""), 2200);
  };

  const undoLastDayChange = () => {
    if (!savedDay?.undoSnapshot) return;
    const restored = undoRevenueEntry(savedDay, new Date().toISOString());
    save(previous => ({
      ...previous,
      revenueEntries: [...(previous.revenueEntries || []).filter(entry => entry.date !== restored.date), restored]
        .sort((left, right) => left.date.localeCompare(right.date)),
    }));
    setDraft(restored);
    setNotice(`${dateLabel(restored.date)} auf den vorherigen Stand zurückgesetzt`);
    window.setTimeout(() => setNotice(""), 2800);
  };

  const dayRows = useMemo(() => {
    const byDate = new Map(monthEntries(entries, selectedMonth).map(entry => [entry.date, entry]));
    return daysInMonth(selectedMonth).map(date => byDate.get(date) || emptyEntry(date));
  }, [entries, selectedMonth]);

  const openReceivables = receivables.filter(item => item.status === "offen");
  const openReceivableTotal = openReceivables.reduce((sum, item) => sum + (Number(item.amount) || 0), 0);

  const addReceivable = form => {
    const record = {
      id: makeId("receivable"),
      customerName: form.customerName.trim(),
      amount: roundMoney(form.amount),
      serviceDate: form.serviceDate,
      dueDate: form.dueDate || "",
      status: "offen",
      note: form.note.trim(),
      createdAt: new Date().toISOString(),
    };
    save(previous => ({ ...previous, revenueReceivables: [...(previous.revenueReceivables || []), record] }));
    setModal(null);
  };

  const settleReceivable = form => {
    const receivable = receivables.find(item => item.id === form.receivableId);
    if (!receivable) return;
    save(previous => {
      const updatedReceivables = (previous.revenueReceivables || []).map(item => item.id === receivable.id ? {
        ...item,
        status: "bezahlt",
        paidAt: form.paidAt,
        paymentMethod: form.paymentMethod,
      } : item);
      const currentEntry = (previous.revenueEntries || []).find(entry => entry.date === form.paidAt) || emptyEntry(form.paidAt);
      const updatedEntry = {
        ...currentEntry,
        [form.paymentMethod]: roundMoney((Number(currentEntry[form.paymentMethod]) || 0) + Number(receivable.amount)),
        note: [currentEntry.note, `Nachzahlung ${receivable.customerName}`].filter(Boolean).join(" · "),
        updatedAt: new Date().toISOString(),
        source: currentEntry.source || "CRM",
      };
      return {
        ...previous,
        revenueReceivables: updatedReceivables,
        revenueEntries: [...(previous.revenueEntries || []).filter(entry => entry.date !== form.paidAt), updatedEntry]
          .sort((left, right) => left.date.localeCompare(right.date)),
      };
    });
    setModal(null);
  };

  const waiveReceivable = id => save(previous => ({
    ...previous,
    revenueReceivables: (previous.revenueReceivables || []).map(item => item.id === id ? { ...item, status: "erlassen", closedAt: new Date().toISOString() } : item),
  }));

  const addStaffEntry = form => {
    const record = {
      id: makeId("staff"),
      employee: form.employee,
      type: form.type,
      amount: roundMoney(form.amount),
      date: form.date,
      note: form.note.trim(),
      createdAt: new Date().toISOString(),
    };
    save(previous => ({ ...previous, staffLedger: [...(previous.staffLedger || []), record] }));
    setModal(null);
  };

  const staffBalances = Object.fromEntries(STAFF_MEMBERS.map(employee => [
    employee,
    roundMoney(staffLedger.filter(item => item.employee === employee).reduce((sum, item) => sum + (item.type === "repayment" ? -Number(item.amount) : Number(item.amount)), 0)),
  ]));

  const createReportVersion = month => {
    const versions = reports.filter(report => report.month === month).map(report => report.version || 1);
    const report = reportFromMonth({ entries, month, premium: premiumForMonth(month), version: Math.max(0, ...versions) + 1 });
    save(previous => ({ ...previous, revenueReports: [...(previous.revenueReports || []), report] }));
    setNotice(`Bericht ${monthLabel(month)} · Version ${report.version} archiviert`);
    window.setTimeout(() => setNotice(""), 2600);
  };

  const currentSnapshot = () => reportFromMonth({
    entries,
    month: selectedMonth,
    premium: premiumForMonth(selectedMonth),
    version: Math.max(1, ...reports.filter(report => report.month === selectedMonth).map(report => report.version || 1)),
  });

  const downloadCsv = report => downloadTextFile(
    reportToCsv(report),
    `PDB-Umsatzbericht-${report.month}-v${report.version}.csv`,
    "text/csv;charset=utf-8",
  );

  const printPdf = report => {
    setPrintReport(report);
    window.setTimeout(() => window.print(), 80);
  };

  const maxMonthlyTotal = Math.max(...monthlySummaries.map(item => item.total), 1);
  const comparedMonthsTotal = monthlySummaries.reduce((sum, item) => sum + item.total, 0);
  const comparedMonthsAverage = monthlySummaries.length ? comparedMonthsTotal / monthlySummaries.length : 0;
  const compositionTotal = Math.max(financeReady ? summary.total : summary.total - summary.premium, 1);
  const sortedReports = [...reports].sort((left, right) => right.month.localeCompare(left.month) || right.version - left.version);

  return (
    <div className="revenue-workspace">
      <section className="revenue-hero">
        <div className="revenue-hero-top">
          <div>
            <div className="revenue-kicker">PDB Tagesjournal</div>
            <h2>{monthLabel(selectedMonth)}</h2>
          </div>
          <div className="revenue-month-switcher" aria-label="Monat auswählen">
            {availableMonths.map(month => (
              <button key={month} className={`revenue-month-button ${month === selectedMonth ? "is-active" : ""}`} onClick={() => selectMonth(month)}>
                {monthLabel(month, { month: "short", year: "2-digit" })}
              </button>
            ))}
          </div>
        </div>
        <div className="revenue-hero-bottom">
          <div>
            <div className="revenue-total-label">Gesamtzufluss inklusive Premium</div>
            <div className={`revenue-total-value ${!financeReady ? "is-loading" : ""}`}>
              {financeReady ? fmt(summary.total) : "Umsatz wird abgeglichen …"}
            </div>
          </div>
          <div className="revenue-total-note">
            Alle Zahlungsarten inklusive Bar fließen in diese Summe ein. Premium wird automatisch aus Member Finanzen aktualisiert.
          </div>
        </div>
      </section>

      {notice && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 999, background: "#e5f2eb", color: "#225f48", display: "inline-block", fontSize: 12, fontWeight: 800 }}>{notice}</div>}

      <div className="revenue-grid metrics">
        {[
          { label: "Geschäftsumsatz", value: summary.business, hint: `${fmt(summary.businessWithoutPremium)} Tagesgeschäft`, waitsForFinance: true },
          { label: "Premium", value: summary.premium, hint: !financeReady ? "Member Finanzen werden geladen" : financeMonths[selectedMonth] != null ? "live aus Member Finanzen" : "Excel-Fallback", waitsForFinance: true },
          { label: "Bar", value: summary.channelTotals.cash, hint: "Alle Barzahlungen dieses Monats" },
          { label: "Private Zuflüsse", value: summary.channelTotals.paypalPrivate, hint: "PayPal Privat" },
          { label: "Offene Zahlungen", value: openReceivableTotal, hint: `${openReceivables.length} offen` },
        ].map(({ label, value, hint, waitsForFinance }) => (
          <div className="revenue-card revenue-metric" key={label}>
            <div className="revenue-metric-label">{label}</div>
            <div className={`revenue-metric-value ${waitsForFinance && !financeReady ? "is-loading" : ""}`}>
              {waitsForFinance && !financeReady ? "Wird abgeglichen …" : fmt(value)}
            </div>
            <div className="revenue-metric-hint">{hint}</div>
          </div>
        ))}
      </div>

      <section className="revenue-section">
        <div className="revenue-section-head">
          <div><div className="revenue-section-kicker">{savedDay ? "Gespeicherten Tag bearbeiten" : "Heute eintragen"}</div><h3>{savedDay ? dateLabel(savedDay.date) : "Tagesabschluss"}</h3><p className="revenue-section-copy">{savedDay ? "Änderungen können verworfen oder nach dem Speichern einmal zurückgesetzt werden." : "Ein Datum, sechs Summen – alles Weitere rechnet sich selbst."}</p></div>
          <div className="revenue-inline-actions">
            <button className="revenue-button secondary" disabled={!financeReady} onClick={() => downloadCsv(currentSnapshot())}>CSV laden</button>
            <button className="revenue-button champagne" disabled={!financeReady} onClick={() => printPdf(currentSnapshot())}>PDF drucken</button>
            {savedDay?.undoSnapshot && <button className="revenue-button secondary" onClick={undoLastDayChange}>↶ Letzte Änderung</button>}
            {hasDraftChanges && savedDay && <button className="revenue-button secondary" onClick={discardDayChanges}>Änderungen verwerfen</button>}
            <button className="revenue-button" disabled={!hasDraftChanges} onClick={saveDay}>{savedDay ? "Änderungen speichern" : "Tag speichern"}</button>
          </div>
        </div>

        <div className="revenue-grid two">
          <div className="revenue-card">
            <div className="revenue-form-grid">
              <Field label="Datum"><input className="revenue-input" type="date" value={draft.date} onChange={event => selectDate(event.target.value)} /></Field>
              {REVENUE_CHANNELS.map(channel => (
                <Field key={channel.key} label={channel.label}>
                  <input className="revenue-input" type="number" min="0" step="0.01" inputMode="decimal" value={revenueChannelAmount(draft, channel.key) || ""} placeholder="0,00" onChange={event => updateDraft(channel.key, event.target.value)} />
                </Field>
              ))}
              <Field label="Notiz" span={3}><input className="revenue-input" value={draft.note || ""} placeholder="Optional – was war heute wichtig?" onChange={event => updateDraft("note", event.target.value)} /></Field>
            </div>
            <div className="revenue-form-total"><span>Tagessumme</span><strong>{fmt(entryTotals(draft).total)}</strong></div>
          </div>

          <div className="revenue-card">
            <div className="revenue-card-head"><div><div className="revenue-section-kicker">Verteilung</div><h3 style={{ margin: "4px 0 0" }}>Monatsmix</h3></div><strong>{summary.activeDays} aktive Tage</strong></div>
            <div className="revenue-composition">
              {REVENUE_CHANNELS.map(channel => <span key={channel.key} style={{ width: `${(summary.channelTotals[channel.key] / compositionTotal) * 100}%`, background: channel.color }} />)}
              {financeReady && <span style={{ width: `${(summary.premium / compositionTotal) * 100}%`, background: "#c8a974" }} />}
            </div>
            <div className="revenue-legend">
              {[...REVENUE_CHANNELS, { key: "premium", shortLabel: "Premium", color: "#c8a974" }].map(channel => (
                <div className="revenue-legend-item" key={channel.key}><span className="revenue-legend-dot" style={{ background: channel.color }} /><span>{channel.shortLabel}</span><strong>{channel.key === "premium" && !financeReady ? "…" : fmt(channel.key === "premium" ? summary.premium : summary.channelTotals[channel.key])}</strong></div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="revenue-section">
        <div className="revenue-section-head"><div><div className="revenue-section-kicker">Monatsjournal</div><h3>Tag für Tag</h3></div></div>
        <div className="revenue-table-wrap" style={{ marginTop: 16, maxHeight: 520 }}>
          <table className="revenue-table">
            <thead><tr><th>Datum</th>{REVENUE_CHANNELS.map(channel => <th key={channel.key}>{channel.shortLabel}</th>)}<th>Gesamt</th><th>Notiz</th><th>Aktion</th></tr></thead>
            <tbody>
              {dayRows.map(entry => {
                const totals = entryTotals(entry);
                return (
                  <tr key={entry.date} className={entry.date === selectedDate ? "is-selected" : ""}>
                    <td><button className="revenue-date-button" onClick={() => selectDate(entry.date)}>{dateLabel(entry.date)}</button></td>
                    {REVENUE_CHANNELS.map(channel => <td key={channel.key}><Money value={revenueChannelAmount(entry, channel.key)} /></td>)}
                    <td><strong><Money value={totals.total} /></strong></td>
                    <td className="revenue-note" title={entry.note || ""}>{entry.note || "—"}</td>
                    <td>{totals.total > 0 || entry.note ? <button className="revenue-button secondary small" onClick={() => selectDate(entry.date)}>Bearbeiten</button> : <span className="revenue-zero">—</span>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <section className="revenue-section">
        <div className="revenue-section-head"><div><div className="revenue-section-kicker">Überblick</div><h3>Monate im Vergleich</h3></div></div>
        <div className="revenue-card" style={{ marginTop: 16 }}>
          {!financeReady ? <div className="revenue-empty">Monatsvergleich wird mit Member Finanzen abgeglichen …</div> : <div className="revenue-month-bars">
            {monthlySummaries.map(item => (
              <button key={item.month} onClick={() => selectMonth(item.month)} style={{ border: 0, background: "transparent", padding: 0, cursor: "pointer", font: "inherit", color: "inherit" }}>
                <div className="revenue-month-bar"><strong>{monthLabel(item.month, { month: "short", year: "2-digit" })}</strong><div className="revenue-month-bar-track"><div className="revenue-month-bar-fill" style={{ width: `${Math.max(1, (item.total / maxMonthlyTotal) * 100)}%` }} /></div><strong style={{ textAlign: "right" }}>{fmt(item.total)}</strong></div>
              </button>
            ))}
            <div className="revenue-month-summary">
              <div><span>Gesamtsumme · {monthlySummaries.length} Monate</span><strong>{fmt(comparedMonthsTotal)}</strong></div>
              <div><span>Ø pro Monat</span><strong>{fmt(comparedMonthsAverage)}</strong></div>
            </div>
          </div>}
        </div>
      </section>

      <div className="revenue-grid equal revenue-section">
        <section className="revenue-card">
          <div className="revenue-card-head"><div><div className="revenue-section-kicker">Kunden</div><h3 style={{ margin: "4px 0 0" }}>Offene Zahlungen</h3></div><button className="revenue-button small" onClick={() => setModal({ type: "receivable" })}>+ Offen hinzufügen</button></div>
          <div className="revenue-ledger-list">
            {receivables.length === 0 && <div className="revenue-empty">Keine offenen Zahlungen. Neue Fälle kannst du hier direkt festhalten.</div>}
            {receivables.slice().sort((left, right) => (left.status === "offen" ? -1 : 1) || right.serviceDate.localeCompare(left.serviceDate)).map(item => (
              <div className="revenue-ledger-row" key={item.id}>
                <div><div className="revenue-ledger-title">{item.customerName}</div><div className="revenue-ledger-meta">{dateLabel(item.serviceDate)}{item.note ? ` · ${item.note}` : ""}</div></div>
                <div style={{ textAlign: "right" }}><div className="revenue-ledger-amount">{fmt(item.amount)}</div><div style={{ marginTop: 5 }}><span className={`revenue-status ${item.status === "bezahlt" ? "paid" : ""}`}>{item.status}</span></div>{item.status === "offen" && <div className="revenue-inline-actions" style={{ marginTop: 8, justifyContent: "flex-end" }}><button className="revenue-button small champagne" onClick={() => setModal({ type: "settle", receivable: item })}>Bezahlt</button><button className="revenue-button small secondary" onClick={() => waiveReceivable(item.id)}>Erlassen</button></div>}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="revenue-card">
          <div className="revenue-card-head"><div><div className="revenue-section-kicker">Team</div><h3 style={{ margin: "4px 0 0" }}>Mitarbeiterkonten</h3></div><button className="revenue-button small" onClick={() => setModal({ type: "staff" })}>+ Bewegung</button></div>
          <div className="revenue-staff-grid">
            {STAFF_MEMBERS.map(employee => <div className="revenue-staff-chip" key={employee}><span>{employee}</span><strong>{fmt(staffBalances[employee])}</strong></div>)}
          </div>
          <div className="revenue-ledger-list">
            {staffLedger.length === 0 && <div className="revenue-empty">Noch keine Vorschüsse erfasst.</div>}
            {staffLedger.slice().sort((left, right) => right.date.localeCompare(left.date)).slice(0, 10).map(item => (
              <div className="revenue-ledger-row" key={item.id}><div><div className="revenue-ledger-title">{item.employee}</div><div className="revenue-ledger-meta">{dateLabel(item.date)}{item.note ? ` · ${item.note}` : ""}</div></div><div className="revenue-ledger-amount" style={{ color: item.type === "repayment" ? "#27674d" : "#171717" }}>{item.type === "repayment" ? "−" : "+"}{fmt(item.amount)}</div></div>
            ))}
          </div>
          <p className="revenue-section-copy" style={{ marginTop: 14 }}>Positive Salden zeigen, was noch bei der Mitarbeiterin offen ist. Keine automatische Lohnverrechnung.</p>
        </section>
      </div>

      <section className="revenue-section revenue-card">
        <div className="revenue-card-head"><div><div className="revenue-section-kicker">Monatsabschluss</div><h3 style={{ margin: "4px 0 0" }}>Berichtsarchiv</h3><p className="revenue-section-copy">Abgeschlossene Monate werden beim nächsten Öffnen automatisch archiviert. Änderungen erzeugen eine neue Version.</p></div><button className="revenue-button" disabled={!financeReady} onClick={() => createReportVersion(selectedMonth)}>Neue Version archivieren</button></div>
        <div style={{ marginTop: 16 }}>
          {sortedReports.length === 0 && <div className="revenue-empty">Das Archiv wird nach dem ersten Monatsabschluss automatisch gefüllt.</div>}
          {sortedReports.map(report => (
            <div className="revenue-report-row" key={report.id}>
              <div><div className="revenue-report-name">{monthLabel(report.month)} · Version {report.version}</div><div className="revenue-report-meta">{new Date(report.createdAt).toLocaleString("de-DE")} · {fmt(report.summary.total)}</div></div>
              <div className="revenue-inline-actions"><button className="revenue-button secondary small" onClick={() => downloadCsv(report)}>CSV</button><button className="revenue-button champagne small" onClick={() => printPdf(report)}>PDF</button></div>
            </div>
          ))}
        </div>
      </section>

      {modal?.type === "receivable" && <ReceivableModal onClose={() => setModal(null)} onSave={addReceivable} />}
      {modal?.type === "settle" && <SettleModal receivable={modal.receivable} onClose={() => setModal(null)} onSave={settleReceivable} />}
      {modal?.type === "staff" && <StaffModal onClose={() => setModal(null)} onSave={addStaffEntry} />}
      <PrintSheet report={printReport} />
    </div>
  );
}

function ReceivableModal({ onClose, onSave }) {
  const [form, setForm] = useState({ customerName: "", amount: "", serviceDate: today(), dueDate: "", note: "" });
  const valid = form.customerName.trim() && Number(form.amount) > 0 && form.serviceDate;
  return (
    <Modal kicker="Neue Forderung" title="Zahlung offen" onClose={onClose}>
      <div className="revenue-form-grid">
        <Field label="Kundenname" span={2}><input autoFocus className="revenue-input" value={form.customerName} onChange={event => setForm(current => ({ ...current, customerName: event.target.value }))} /></Field>
        <Field label="Betrag"><input className="revenue-input" type="number" min="0" step="0.01" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} /></Field>
        <Field label="Leistungsdatum"><input className="revenue-input" type="date" value={form.serviceDate} onChange={event => setForm(current => ({ ...current, serviceDate: event.target.value }))} /></Field>
        <Field label="Fällig bis"><input className="revenue-input" type="date" value={form.dueDate} onChange={event => setForm(current => ({ ...current, dueDate: event.target.value }))} /></Field>
        <Field label="Notiz" span={3}><input className="revenue-input" value={form.note} placeholder="Was wurde vereinbart?" onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></Field>
      </div>
      <div className="revenue-inline-actions" style={{ justifyContent: "flex-end", marginTop: 18 }}><button className="revenue-button secondary" onClick={onClose}>Abbrechen</button><button className="revenue-button" disabled={!valid} onClick={() => valid && onSave(form)}>Offen speichern</button></div>
    </Modal>
  );
}

function SettleModal({ receivable, onClose, onSave }) {
  const [form, setForm] = useState({ receivableId: receivable.id, paidAt: today(), paymentMethod: "card" });
  return (
    <Modal kicker="Zahlungseingang" title={`${receivable.customerName} · ${fmt(receivable.amount)}`} onClose={onClose}>
      <div className="revenue-form-grid">
        <Field label="Bezahlt am"><input className="revenue-input" type="date" value={form.paidAt} onChange={event => setForm(current => ({ ...current, paidAt: event.target.value }))} /></Field>
        <Field label="Zahlungsart" span={2}><select className="revenue-input" value={form.paymentMethod} onChange={event => setForm(current => ({ ...current, paymentMethod: event.target.value }))}>{REVENUE_CHANNELS.filter(channel => channel.group === "business").map(channel => <option key={channel.key} value={channel.key}>{channel.shortLabel}</option>)}</select></Field>
      </div>
      <p className="revenue-section-copy">Der Betrag wird automatisch am Zahlungstag als Geschäftsumsatz in das Tagesjournal übernommen.</p>
      <div className="revenue-inline-actions" style={{ justifyContent: "flex-end", marginTop: 18 }}><button className="revenue-button secondary" onClick={onClose}>Abbrechen</button><button className="revenue-button" onClick={() => onSave(form)}>Als bezahlt buchen</button></div>
    </Modal>
  );
}

function StaffModal({ onClose, onSave }) {
  const [form, setForm] = useState({ employee: STAFF_MEMBERS[0], type: "advance", amount: "", date: today(), note: "" });
  const valid = Number(form.amount) > 0 && form.date;
  return (
    <Modal kicker="Mitarbeiterkonto" title="Bewegung erfassen" onClose={onClose}>
      <div className="revenue-form-grid">
        <Field label="Mitarbeiterin"><select className="revenue-input" value={form.employee} onChange={event => setForm(current => ({ ...current, employee: event.target.value }))}>{STAFF_MEMBERS.map(employee => <option key={employee}>{employee}</option>)}</select></Field>
        <Field label="Art"><select className="revenue-input" value={form.type} onChange={event => setForm(current => ({ ...current, type: event.target.value }))}><option value="advance">Vorschuss</option><option value="repayment">Rückzahlung</option></select></Field>
        <Field label="Betrag"><input className="revenue-input" type="number" min="0" step="0.01" value={form.amount} onChange={event => setForm(current => ({ ...current, amount: event.target.value }))} /></Field>
        <Field label="Datum"><input className="revenue-input" type="date" value={form.date} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></Field>
        <Field label="Notiz" span={2}><input className="revenue-input" value={form.note} placeholder="Optional" onChange={event => setForm(current => ({ ...current, note: event.target.value }))} /></Field>
      </div>
      <div className="revenue-inline-actions" style={{ justifyContent: "flex-end", marginTop: 18 }}><button className="revenue-button secondary" onClick={onClose}>Abbrechen</button><button className="revenue-button" disabled={!valid} onClick={() => valid && onSave(form)}>Bewegung speichern</button></div>
    </Modal>
  );
}
