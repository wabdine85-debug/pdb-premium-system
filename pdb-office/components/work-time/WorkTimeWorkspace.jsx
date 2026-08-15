import React, { useMemo, useState } from "react";
import {
  calculateNetMinutes,
  formatMinutes,
  summarizeMonth,
} from "../../modules/work-time/workTimeUtils.js";
import "./work-time.css";

function localDateValue(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function createId() {
  return globalThis.crypto?.randomUUID?.() || Math.random().toString(36).slice(2, 10);
}

function monthTitle(value) {
  if (!/^\d{4}-\d{2}$/.test(value || "")) return "Monat";
  const [year, month] = value.split("-").map(Number);
  return new Intl.DateTimeFormat("de-DE", { month: "long", year: "numeric" }).format(new Date(year, month - 1, 1));
}

function dateLabel(value) {
  if (!value) return "–";
  return new Intl.DateTimeFormat("de-DE", { weekday: "short", day: "2-digit", month: "2-digit", year: "numeric" })
    .format(new Date(`${value}T12:00:00`));
}

function initials(name) {
  return (name || "?")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join("");
}

function Modal({ title, subtitle, onClose, children }) {
  return (
    <div className="work-time__modal-backdrop" role="presentation" onMouseDown={event => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <div className="work-time__modal" role="dialog" aria-modal="true" aria-labelledby="work-time-modal-title">
        <div className="work-time__modal-header">
          <div>
            <h3 id="work-time-modal-title">{title}</h3>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button className="work-time__close" type="button" aria-label="Fenster schließen" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

const emptyEntry = (staffMemberId = "") => ({
  staffMemberId,
  date: localDateValue(),
  startTime: "10:00",
  endTime: "18:00",
  breakMinutes: "0",
  note: "",
});

export default function WorkTimeWorkspace({ data, save }) {
  const staffMembers = data.staffMembers || [];
  const workTimeEntries = data.workTimeEntries || [];
  const [month, setMonth] = useState(localDateValue().slice(0, 7));
  const [staffFilter, setStaffFilter] = useState("all");
  const [entryForm, setEntryForm] = useState(null);
  const [employeeForm, setEmployeeForm] = useState(null);
  const [deleteEntry, setDeleteEntry] = useState(null);
  const [formError, setFormError] = useState("");

  const summary = useMemo(
    () => summarizeMonth(workTimeEntries, staffMembers, month),
    [workTimeEntries, staffMembers, month],
  );

  const staffById = useMemo(
    () => new Map(staffMembers.map(member => [member.id, member])),
    [staffMembers],
  );

  const visibleEntries = useMemo(() => summary.entries
    .filter(entry => staffFilter === "all" || entry.staffMemberId === staffFilter)
    .slice()
    .sort((left, right) => `${right.date}${right.startTime}`.localeCompare(`${left.date}${left.startTime}`)),
  [summary.entries, staffFilter]);

  const workedDays = new Set(summary.entries.map(entry => entry.date)).size;
  const activeStaffCount = staffMembers.filter(member => (summary.totals.get(member.id) || 0) > 0).length;
  const averageMinutes = summary.entries.length ? summary.totalMinutes / summary.entries.length : 0;

  const openNewEntry = () => {
    setFormError("");
    setEntryForm(emptyEntry(staffFilter === "all" ? staffMembers[0]?.id : staffFilter));
  };

  const openEditEntry = entry => {
    setFormError("");
    setEntryForm({ ...entry, breakMinutes: String(entry.breakMinutes || 0) });
  };

  const submitEmployee = event => {
    event.preventDefault();
    const name = employeeForm.name.trim();
    if (!name) {
      setFormError("Bitte den Namen des Mitarbeiters eintragen.");
      return;
    }

    const now = new Date().toISOString();
    save(previous => ({
      ...previous,
      staffMembers: [...(previous.staffMembers || []), {
        id: createId(),
        name,
        role: employeeForm.role.trim(),
        active: true,
        createdAt: now,
        updatedAt: now,
      }],
    }));
    setEmployeeForm(null);
    setFormError("");
  };

  const submitEntry = event => {
    event.preventDefault();
    const normalized = {
      ...entryForm,
      breakMinutes: Math.max(0, Number(entryForm.breakMinutes) || 0),
      note: entryForm.note.trim(),
    };

    if (!normalized.staffMemberId || !normalized.date || !normalized.startTime || !normalized.endTime) {
      setFormError("Bitte Mitarbeiter, Datum, Beginn und Ende vollständig angeben.");
      return;
    }
    if (calculateNetMinutes(normalized) <= 0) {
      setFormError("Die Endzeit muss nach der Startzeit liegen und die Pause kürzer als die Arbeitszeit sein.");
      return;
    }

    const now = new Date().toISOString();
    save(previous => {
      const current = previous.workTimeEntries || [];
      if (entryForm.id) {
        return {
          ...previous,
          workTimeEntries: current.map(entry => entry.id === entryForm.id
            ? { ...entry, ...normalized, updatedAt: now }
            : entry),
        };
      }
      return {
        ...previous,
        workTimeEntries: [...current, { ...normalized, id: createId(), createdAt: now, updatedAt: now }],
      };
    });

    setMonth(normalized.date.slice(0, 7));
    setEntryForm(null);
    setFormError("");
  };

  const confirmDelete = () => {
    save(previous => ({
      ...previous,
      workTimeEntries: (previous.workTimeEntries || []).filter(entry => entry.id !== deleteEntry.id),
    }));
    setDeleteEntry(null);
  };

  return (
    <div className="work-time">
      <header className="work-time__header">
        <div>
          <p className="work-time__eyebrow">Team · Zeiterfassung</p>
          <h2>Arbeitszeiten</h2>
          <p className="work-time__subtitle">Arbeitsstunden erfassen und Monatszeiten zuverlässig überblicken.</p>
        </div>
        <button className="work-time__primary" type="button" onClick={openNewEntry} disabled={!staffMembers.length}>
          + Arbeitszeit erfassen
        </button>
      </header>

      <div className="work-time__toolbar">
        <div className="work-time__filters">
          <label className="work-time__field">
            <span>Monat</span>
            <input type="month" value={month} onChange={event => setMonth(event.target.value)} />
          </label>
          <label className="work-time__field">
            <span>Mitarbeiter</span>
            <select value={staffFilter} onChange={event => setStaffFilter(event.target.value)}>
              <option value="all">Alle Mitarbeiter</option>
              {staffMembers.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
            </select>
          </label>
        </div>
        <div className="work-time__actions">
          <button className="work-time__secondary" type="button" onClick={() => {
            setFormError("");
            setEmployeeForm({ name: "", role: "" });
          }}>+ Mitarbeiter anlegen</button>
        </div>
      </div>

      <section className="work-time__summary" aria-label={`Auswertung für ${monthTitle(month)}`}>
        <div className="work-time__total">
          <span>Gesamtstunden · {monthTitle(month)}</span>
          <strong>{formatMinutes(summary.totalMinutes)}</strong>
          <small>Netto nach Pausen</small>
        </div>
        <div className="work-time__stat">
          <span>Mitarbeitende mit Zeiten</span>
          <strong>{activeStaffCount}</strong>
          <small>von {staffMembers.length} angelegt</small>
        </div>
        <div className="work-time__stat">
          <span>Erfasste Arbeitstage</span>
          <strong>{workedDays}</strong>
          <small>{summary.entries.length} Buchungen</small>
        </div>
        <div className="work-time__stat">
          <span>Ø je Buchung</span>
          <strong>{formatMinutes(averageMinutes)}</strong>
          <small>durchschnittliche Nettozeit</small>
        </div>
      </section>

      <div className="work-time__content">
        <section className="work-time__panel">
          <div className="work-time__section-header">
            <h3>Monatsübersicht</h3>
            <span>{monthTitle(month)}</span>
          </div>
          {staffMembers.length === 0 ? (
            <div className="work-time__empty">Lege zuerst einen Mitarbeiter an. Anschließend kannst du Arbeitszeiten buchen.</div>
          ) : staffMembers.map(member => (
            <div className="work-time__staff-row" key={member.id}>
              <div className="work-time__avatar">{initials(member.name)}</div>
              <div>
                <strong>{member.name}</strong>
                <small>{member.role || "Mitarbeiter/in"}</small>
              </div>
              <div className="work-time__staff-hours">{formatMinutes(summary.totals.get(member.id) || 0)}</div>
            </div>
          ))}
        </section>

        <section className="work-time__panel">
          <div className="work-time__section-header">
            <h3>Zeitbuchungen</h3>
            <span>{visibleEntries.length} Einträge</span>
          </div>
          {visibleEntries.length === 0 ? (
            <div className="work-time__empty">
              Für diese Auswahl sind noch keine Arbeitszeiten erfasst.<br />
              {staffMembers.length > 0 && "Erstelle die erste Buchung über „Arbeitszeit erfassen“."}
            </div>
          ) : (
            <div className="work-time__table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Datum</th>
                    <th>Mitarbeiter</th>
                    <th>Beginn – Ende</th>
                    <th>Pause</th>
                    <th>Netto</th>
                    <th>Notiz</th>
                    <th aria-label="Aktionen" />
                  </tr>
                </thead>
                <tbody>
                  {visibleEntries.map(entry => (
                    <tr key={entry.id}>
                      <td><strong>{dateLabel(entry.date)}</strong></td>
                      <td>{staffById.get(entry.staffMemberId)?.name || "Unbekannt"}</td>
                      <td>{entry.startTime} – {entry.endTime}</td>
                      <td>{entry.breakMinutes || 0} Min.</td>
                      <td className="work-time__duration">{formatMinutes(calculateNetMinutes(entry))}</td>
                      <td>{entry.note || "–"}</td>
                      <td>
                        <div className="work-time__entry-actions">
                          <button className="work-time__icon-button" type="button" aria-label="Buchung bearbeiten" title="Bearbeiten" onClick={() => openEditEntry(entry)}>✎</button>
                          <button className="work-time__icon-button work-time__icon-button--danger" type="button" aria-label="Buchung löschen" title="Löschen" onClick={() => setDeleteEntry(entry)}>×</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {employeeForm && (
        <Modal title="Mitarbeiter anlegen" subtitle="Die Person steht anschließend für Zeitbuchungen zur Auswahl." onClose={() => setEmployeeForm(null)}>
          <form onSubmit={submitEmployee}>
            <div className="work-time__form-grid">
              <label className="work-time__modal-field work-time__modal-field--wide">
                <span>Name *</span>
                <input autoFocus value={employeeForm.name} onChange={event => setEmployeeForm({ ...employeeForm, name: event.target.value })} placeholder="Vor- und Nachname" />
              </label>
              <label className="work-time__modal-field work-time__modal-field--wide">
                <span>Position</span>
                <input value={employeeForm.role} onChange={event => setEmployeeForm({ ...employeeForm, role: event.target.value })} placeholder="z. B. Kosmetikerin" />
              </label>
            </div>
            {formError && <div className="work-time__error">{formError}</div>}
            <div className="work-time__modal-actions">
              <button className="work-time__secondary" type="button" onClick={() => setEmployeeForm(null)}>Abbrechen</button>
              <button className="work-time__primary" type="submit">Mitarbeiter speichern</button>
            </div>
          </form>
        </Modal>
      )}

      {entryForm && (
        <Modal title={entryForm.id ? "Arbeitszeit bearbeiten" : "Arbeitszeit erfassen"} subtitle="Pausen werden automatisch von der Anwesenheitszeit abgezogen." onClose={() => setEntryForm(null)}>
          <form onSubmit={submitEntry}>
            <div className="work-time__form-grid">
              <label className="work-time__modal-field work-time__modal-field--wide">
                <span>Mitarbeiter *</span>
                <select autoFocus value={entryForm.staffMemberId} onChange={event => setEntryForm({ ...entryForm, staffMemberId: event.target.value })}>
                  <option value="">Bitte auswählen</option>
                  {staffMembers.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
                </select>
              </label>
              <label className="work-time__modal-field work-time__modal-field--wide">
                <span>Datum *</span>
                <input type="date" value={entryForm.date} onChange={event => setEntryForm({ ...entryForm, date: event.target.value })} />
              </label>
              <label className="work-time__modal-field">
                <span>Beginn *</span>
                <input type="time" value={entryForm.startTime} onChange={event => setEntryForm({ ...entryForm, startTime: event.target.value })} />
              </label>
              <label className="work-time__modal-field">
                <span>Ende *</span>
                <input type="time" value={entryForm.endTime} onChange={event => setEntryForm({ ...entryForm, endTime: event.target.value })} />
              </label>
              <label className="work-time__modal-field">
                <span>Pause in Minuten</span>
                <input type="number" min="0" step="5" value={entryForm.breakMinutes} onChange={event => setEntryForm({ ...entryForm, breakMinutes: event.target.value })} />
              </label>
              <label className="work-time__modal-field">
                <span>Berechnete Nettozeit</span>
                <input readOnly value={formatMinutes(calculateNetMinutes(entryForm))} aria-label="Berechnete Nettozeit" />
              </label>
              <label className="work-time__modal-field work-time__modal-field--wide">
                <span>Notiz</span>
                <textarea rows="3" value={entryForm.note} onChange={event => setEntryForm({ ...entryForm, note: event.target.value })} placeholder="Optional, z. B. Fortbildung oder Vertretung" />
              </label>
            </div>
            {formError && <div className="work-time__error">{formError}</div>}
            <div className="work-time__modal-actions">
              <button className="work-time__secondary" type="button" onClick={() => setEntryForm(null)}>Abbrechen</button>
              <button className="work-time__primary" type="submit">Arbeitszeit speichern</button>
            </div>
          </form>
        </Modal>
      )}

      {deleteEntry && (
        <Modal title="Zeitbuchung löschen?" subtitle="Die erfassten Stunden werden aus der Monatsauswertung entfernt." onClose={() => setDeleteEntry(null)}>
          <div className="work-time__modal-actions">
            <button className="work-time__secondary" type="button" onClick={() => setDeleteEntry(null)}>Abbrechen</button>
            <button className="work-time__primary" type="button" onClick={confirmDelete}>Buchung löschen</button>
          </div>
        </Modal>
      )}
    </div>
  );
}
