import React, { useMemo, useRef, useState } from "react";
import InvoicePrintView from "./InvoicePrintView.jsx";
import {
  DEFAULT_INVOICE_PROFILE_ID,
  PDB_INVOICE_CATEGORIES,
  buildInvoiceNumber,
  buildOfferNumber,
  calculateInvoiceTotals,
  defaultInvoiceProfiles,
  getInvoicePositionDateLabel,
  getInvoiceProfile,
  isMedicalInvoiceProfile,
} from "../../modules/invoices/invoiceProfiles.js";
import { buildDiagnosisSuggestion } from "../../modules/invoices/diagnosisSuggestions.js";
import { normalizePriceInput, parseLocalizedNumber, toPriceInput } from "../../modules/invoices/invoiceInputs.js";
import { OFFER_STATUSES, createInvoiceFromOffer, getOfferValidityLabel } from "../../modules/invoices/offerUtils.js";
import { addDays, fmt, fmtDate, today } from "../../utils/formatters.js";

const uid = () => Math.random().toString(36).slice(2, 10);
const inputStyle = { width: "100%", border: "1px solid #ddd6ce", borderRadius: 9, padding: "10px 12px", fontSize: 14, color: "#1e293b", background: "#fff", boxSizing: "border-box", outline: "none" };

function formatCustomerAddress(customer) {
  if (!customer) return "";
  return [customer.address, [customer.zip, customer.city].filter(Boolean).join(" "), customer.country].filter(Boolean).join("\n");
}

function OfferBadge({ status }) {
  const styles = {
    entwurf: { background: "#f1f5f9", color: "#475569" },
    versendet: { background: "#eff6ff", color: "#1d4ed8" },
    angenommen: { background: "#ecfdf5", color: "#047857" },
    abgelehnt: { background: "#fff1f2", color: "#be123c" },
  }[status] || { background: "#f1f5f9", color: "#475569" };
  return <span className="offer-badge" style={styles}>{status || "entwurf"}</span>;
}

function OfferButton({ children, tone = "primary", small = false, ...props }) {
  return <button type="button" className={`offer-button offer-button--${tone}${small ? " offer-button--small" : ""}`} {...props}>{children}</button>;
}

function OfferField({ label, required, children }) {
  return <label className="offer-field"><span>{label}{required && <b aria-hidden="true"> *</b>}</span>{children}</label>;
}

function OfferModal({ title, children, footer, onClose }) {
  const titleId = React.useId();
  return (
    <div className="offer-modal-backdrop">
      <div className="offer-modal" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header><div><small>Angebotsverwaltung</small><h3 id={titleId}>{title}</h3></div><button type="button" aria-label="Fenster schließen" onClick={onClose}>×</button></header>
        <div className="offer-modal__body">{children}</div>
        <footer>{footer}</footer>
      </div>
    </div>
  );
}

export default function OffersWorkspace({ data, save }) {
  const offers = data.offers || [];
  const profiles = data.invoiceProfiles || defaultInvoiceProfiles;
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("alle");
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({});
  const [items, setItems] = useState([]);
  const [memberQuery, setMemberQuery] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [formError, setFormError] = useState("");
  const [printing, setPrinting] = useState(null);
  const [confirmState, setConfirmState] = useState(null);
  const firstInvalidRef = useRef(null);

  const selectedProfile = getInvoiceProfile(data, form.invoiceProfileId);
  const medicalProfile = isMedicalInvoiceProfile(selectedProfile);
  const selectedMember = data.members.find(member => member.id === form.memberId);
  const memberMatches = useMemo(() => {
    const query = memberQuery.trim().toLocaleLowerCase("de-DE");
    return data.members.filter(member => !query || [member.name, member.email, member.phone, member.customerNumber]
      .some(value => String(value || "").toLocaleLowerCase("de-DE").includes(query))).slice(0, 8);
  }, [data.members, memberQuery]);
  const filteredOffers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("de-DE");
    return offers.filter(offer => {
      const matchesSearch = !query || [offer.number, offer.memberName, getInvoiceProfile(data, offer.invoiceProfileId).name]
        .some(value => String(value || "").toLocaleLowerCase("de-DE").includes(query));
      return matchesSearch && (statusFilter === "alle" || offer.status === statusFilter);
    }).sort((left, right) => String(right.date || "").localeCompare(String(left.date || "")));
  }, [data, offers, search, statusFilter]);

  const openNew = () => {
    const profile = getInvoiceProfile(data, DEFAULT_INVOICE_PROFILE_ID);
    setForm({
      invoiceProfileId: profile.id,
      number: buildOfferNumber(profile),
      date: today(),
      validUntil: addDays(today(), 14),
      invoiceCategory: "treatment",
      offerNote: "",
      status: "entwurf",
    });
    setItems([{ treatmentDate: today(), desc: "", qty: 1, price: "" }]);
    setMemberQuery("");
    setPickerOpen(false);
    setFormError("");
    setShowForm(true);
  };

  const openEdit = offer => {
    setForm({ ...offer, invoiceProfileId: offer.invoiceProfileId || DEFAULT_INVOICE_PROFILE_ID, status: offer.status || "entwurf" });
    setItems((offer.items || []).map(item => ({ ...item, price: toPriceInput(item.price) })));
    setMemberQuery(offer.memberName || "");
    setPickerOpen(false);
    setFormError("");
    setPrinting(null);
    setShowForm(true);
  };

  const revealError = element => {
    if (!element) return;
    firstInvalidRef.current = element;
    requestAnimationFrame(() => {
      firstInvalidRef.current?.focus({ preventScroll: true });
      firstInvalidRef.current?.scrollIntoView({ block: "center" });
    });
  };

  const saveOffer = () => {
    if (!form.memberId) {
      setFormError("Bitte zuerst eine Kundin oder einen Kunden auswählen.");
      revealError(document.querySelector("[aria-label='Kunde für Angebot suchen']"));
      return;
    }
    if (!String(form.number || "").trim()) {
      setFormError("Die Angebotsnummer darf nicht leer sein.");
      revealError(document.querySelector("[aria-label='Angebotsnummer']"));
      return;
    }
    const normalizedNumber = String(form.number).trim().toLocaleLowerCase("de-DE");
    if (offers.some(offer => offer.id !== form.id && String(offer.number || "").trim().toLocaleLowerCase("de-DE") === normalizedNumber)) {
      setFormError("Diese Angebotsnummer ist bereits vergeben.");
      revealError(document.querySelector("[aria-label='Angebotsnummer']"));
      return;
    }
    if (!form.date || !form.validUntil || form.validUntil < form.date) {
      setFormError("Das Gültigkeitsdatum muss am oder nach dem Angebotsdatum liegen.");
      revealError(document.querySelectorAll(".offer-modal input[type='date']")[1]);
      return;
    }
    if (items.length === 0) {
      setFormError("Bitte mindestens eine Angebotsposition hinzufügen.");
      return;
    }
    const invalidDescription = items.findIndex(item => !String(item.desc || "").trim());
    if (invalidDescription >= 0) {
      setFormError("Bitte jede Angebotsposition beschreiben.");
      revealError(document.querySelector(`[aria-label='Beschreibung Angebotsposition ${invalidDescription + 1}']`));
      return;
    }
    const invalidPrice = items.findIndex(item => parseLocalizedNumber(item.price) <= 0);
    if (invalidPrice >= 0) {
      setFormError("Bitte für jede Position einen Preis größer als 0,00 € eingeben.");
      revealError(document.querySelector(`[aria-label='Preis Angebotsposition ${invalidPrice + 1}']`));
      return;
    }

    const profile = getInvoiceProfile(data, form.invoiceProfileId);
    const member = data.members.find(candidate => candidate.id === form.memberId);
    const normalizedItems = items.map(item => ({
      treatmentDate: item.treatmentDate || form.date || today(),
      desc: String(item.desc || "").trim(),
      qty: Number(item.qty) || 1,
      price: parseLocalizedNumber(item.price),
    }));
    const totals = calculateInvoiceTotals(normalizedItems, profile.defaultTaxRate);
    const isEditing = Boolean(form.id);
    const offer = {
      ...form,
      memberName: member?.name || form.memberName || "Unbekannt",
      customerAddress: formatCustomerAddress(member) || form.customerAddress || "",
      invoiceCategory: isMedicalInvoiceProfile(profile) ? "" : (form.invoiceCategory || "other"),
      diagnosisCode: isMedicalInvoiceProfile(profile) ? (form.diagnosisCode || "") : "",
      diagnosis: isMedicalInvoiceProfile(profile) ? (form.diagnosis || "") : "",
      offerNote: isMedicalInvoiceProfile(profile) ? "" : String(form.offerNote || "").trim(),
      items: normalizedItems,
      ...totals,
      taxRate: profile.defaultTaxRate,
      id: form.id || uid(),
      createdAt: form.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    save(current => ({
      ...current,
      offers: isEditing ? (current.offers || []).map(existing => existing.id === offer.id ? offer : existing) : [...(current.offers || []), offer],
      invoiceProfiles: isEditing ? (current.invoiceProfiles || defaultInvoiceProfiles) : (current.invoiceProfiles || defaultInvoiceProfiles)
        .map(candidate => candidate.id === profile.id ? { ...candidate, nextOfferNumber: (Number(candidate.nextOfferNumber) || 1001) + 1 } : candidate),
    }));
    setShowForm(false);
  };

  const requestDelete = offer => setConfirmState({
    title: "Angebot löschen?",
    detail: `${offer.number} für ${offer.memberName} wird dauerhaft gelöscht.`,
    actionLabel: "Angebot löschen",
    destructive: true,
    onConfirm: () => save(current => ({ ...current, offers: (current.offers || []).filter(existing => existing.id !== offer.id) })),
  });

  const requestInvoiceConversion = offer => setConfirmState({
    title: "Als Rechnung übernehmen?",
    detail: `${offer.number} wird abgeschlossen und mit einer neuen Rechnungsnummer als offene Rechnung angelegt.`,
    actionLabel: "Rechnung erstellen",
    onConfirm: () => save(current => {
      const profile = getInvoiceProfile(current, offer.invoiceProfileId);
      const invoice = createInvoiceFromOffer(offer, profile, { id: uid(), number: buildInvoiceNumber(profile) });
      return {
        ...current,
        offers: (current.offers || []).filter(existing => existing.id !== offer.id),
        invoices: [...(current.invoices || []), invoice],
        invoiceProfiles: (current.invoiceProfiles || defaultInvoiceProfiles).map(candidate => candidate.id === profile.id
          ? { ...candidate, nextInvoiceNumber: (Number(candidate.nextInvoiceNumber) || 1001) + 1 }
          : candidate),
        settings: profile.id === DEFAULT_INVOICE_PROFILE_ID
          ? { ...current.settings, nextInvoiceNumber: (Number(profile.nextInvoiceNumber) || 1001) + 1 }
          : current.settings,
      };
    }),
  });

  const runConfirm = () => {
    confirmState?.onConfirm();
    setConfirmState(null);
    setPrinting(null);
  };

  return (
    <div className="offers-workspace">
      <header className="offers-page-header">
        <div><span className="offers-eyebrow">Vor der Rechnung</span><h2>Angebote</h2><p>Angebote bleiben vollständig von Umsatz und Mahnwesen getrennt.</p></div>
        <OfferButton onClick={openNew}>+ Neues Angebot</OfferButton>
      </header>

      <section className="offers-summary" aria-label="Angebotsübersicht">
        <div><strong>{offers.length}</strong><span>Gesamt</span></div>
        <div><strong>{offers.filter(offer => offer.status === "versendet").length}</strong><span>Versendet</span></div>
        <div><strong>{offers.filter(offer => offer.status === "angenommen").length}</strong><span>Angenommen</span></div>
      </section>

      <div className="offers-toolbar">
        <input aria-label="Angebote durchsuchen" value={search} onChange={event => setSearch(event.target.value)} placeholder="Nummer, Kunde oder Profil suchen…" />
        <select aria-label="Angebotsstatus filtern" value={statusFilter} onChange={event => setStatusFilter(event.target.value)}>
          <option value="alle">Alle Status</option>
          {OFFER_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}
        </select>
      </div>

      <div className="offers-table-wrap">
        <table className="offers-table">
          <thead><tr>{["Nummer", "Profil", "Kunde", "Datum", "Gültig bis", "Summe", "Status", "Aktionen"].map(label => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>
            {filteredOffers.length === 0 ? <tr><td colSpan="8" className="offers-empty">Noch keine passenden Angebote vorhanden.</td></tr> : filteredOffers.map(offer => (
              <tr key={offer.id} onClick={() => setPrinting(offer)}>
                <td><strong>{offer.number}</strong></td><td>{getInvoiceProfile(data, offer.invoiceProfileId).name}</td><td>{offer.memberName}</td><td>{fmtDate(offer.date)}</td><td>{getOfferValidityLabel(offer)}</td><td><strong>{fmt(offer.total)}</strong></td><td><OfferBadge status={offer.status} /></td>
                <td onClick={event => event.stopPropagation()}><div className="offer-actions"><OfferButton small tone="quiet" onClick={() => openEdit(offer)}>Bearbeiten</OfferButton><OfferButton small tone="success" onClick={() => requestInvoiceConversion(offer)}>Als Rechnung</OfferButton><OfferButton small tone="danger" onClick={() => requestDelete(offer)}>Löschen</OfferButton></div></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="offers-mobile-list">
        {filteredOffers.length === 0 ? <div className="offers-empty">Noch keine passenden Angebote vorhanden.</div> : filteredOffers.map(offer => (
          <article className="offer-card" key={offer.id}>
            <button type="button" className="offer-card__main" onClick={() => setPrinting(offer)}><span>{offer.number}</span><strong>{fmt(offer.total)}</strong><h3>{offer.memberName}</h3><small>{fmtDate(offer.date)} · gültig bis {getOfferValidityLabel(offer)}</small><OfferBadge status={offer.status} /></button>
            <div className="offer-card__actions"><OfferButton small tone="quiet" onClick={() => openEdit(offer)}>Bearbeiten</OfferButton><OfferButton small tone="success" onClick={() => requestInvoiceConversion(offer)}>Als Rechnung</OfferButton><OfferButton small tone="danger" onClick={() => requestDelete(offer)}>Löschen</OfferButton></div>
          </article>
        ))}
      </div>

      {showForm && <OfferModal title={form.id ? `Angebot ${form.number} bearbeiten` : "Neues Angebot"} onClose={() => setShowForm(false)} footer={<><OfferButton tone="quiet" onClick={() => setShowForm(false)}>Abbrechen</OfferButton><OfferButton onClick={saveOffer}>{form.id ? "Änderungen speichern" : "Angebot erstellen"}</OfferButton></>}>
        {formError && <div className="offer-form-error" role="alert"><strong>Eingabe prüfen</strong><span>{formError}</span></div>}
        <section className="offer-form-section"><div className="offer-section-heading"><span>01</span><div><h4>Empfänger und Gültigkeit</h4><p>Das Angebot erhält eine eigene Nummer und wird nicht als Forderung geführt.</p></div></div>
          <div className="offer-form-grid">
            <OfferField label="Profil" required><select style={inputStyle} value={form.invoiceProfileId || ""} onChange={event => { const profile = getInvoiceProfile(data, event.target.value); setForm(current => ({ ...current, invoiceProfileId: profile.id, number: current.id ? current.number : buildOfferNumber(profile) })); }}>{profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}</select></OfferField>
            <OfferField label="Angebotsnummer" required><input aria-label="Angebotsnummer" style={inputStyle} value={form.number || ""} onChange={event => setForm(current => ({ ...current, number: event.target.value }))} /></OfferField>
            {!medicalProfile && <OfferField label="Art"><select style={inputStyle} value={form.invoiceCategory || "treatment"} onChange={event => setForm(current => ({ ...current, invoiceCategory: event.target.value }))}>{PDB_INVOICE_CATEGORIES.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}</select></OfferField>}
            <OfferField label="Kunde suchen" required><input aria-label="Kunde für Angebot suchen" style={inputStyle} value={memberQuery} onFocus={() => setPickerOpen(true)} onChange={event => { setMemberQuery(event.target.value); setForm(current => ({ ...current, memberId: "" })); setPickerOpen(true); }} placeholder="Name, E-Mail oder Telefon…" />
              {selectedMember && !pickerOpen && <div className="offer-selected-customer"><strong>{selectedMember.name}</strong><span>{[selectedMember.email, selectedMember.phone].filter(Boolean).join(" · ")}</span></div>}
              {pickerOpen && <div className="offer-customer-results">{memberMatches.length ? memberMatches.map(member => <button type="button" key={member.id} onClick={() => { setForm(current => ({ ...current, memberId: member.id })); setMemberQuery(member.name || ""); setPickerOpen(false); }}><strong>{member.name}</strong><span>{[member.email, member.phone].filter(Boolean).join(" · ") || "Keine Kontaktdaten"}</span></button>) : <span>Keine Kunden gefunden</span>}</div>}
            </OfferField>
            <OfferField label="Angebotsdatum" required><input style={inputStyle} type="date" required value={form.date || today()} onChange={event => setForm(current => ({ ...current, date: event.target.value }))} /></OfferField>
            <OfferField label="Gültig bis" required><input style={inputStyle} type="date" required value={form.validUntil || ""} onChange={event => setForm(current => ({ ...current, validUntil: event.target.value }))} /></OfferField>
            <OfferField label="Status"><select style={inputStyle} value={form.status || "entwurf"} onChange={event => setForm(current => ({ ...current, status: event.target.value }))}>{OFFER_STATUSES.map(status => <option key={status.value} value={status.value}>{status.label}</option>)}</select></OfferField>
          </div>
        </section>

        {medicalProfile && <section className="offer-form-section"><div className="offer-section-heading"><span>02</span><div><h4>Befund</h4><p>Medizinische Angaben für das MED-Angebot.</p></div></div><div className="offer-diagnosis-row"><input style={inputStyle} value={form.diagnosisCode || ""} onChange={event => setForm(current => ({ ...current, diagnosisCode: event.target.value }))} placeholder="z. B. HWS, ISG oder Nacken" /><OfferButton tone="quiet" onClick={() => setForm(current => ({ ...current, diagnosis: buildDiagnosisSuggestion(current.diagnosisCode) }))}>Smart ausfüllen</OfferButton></div><textarea style={inputStyle} value={form.diagnosis || ""} onChange={event => setForm(current => ({ ...current, diagnosis: event.target.value }))} placeholder="Befund und geplante Behandlung…" /></section>}

        <section className="offer-form-section"><div className="offer-section-heading"><span>{medicalProfile ? "03" : "02"}</span><div><h4>Positionen</h4><p>Leistung und Bruttopreis; Komma oder Punkt sind möglich.</p></div></div>
          <div className="offer-line-head"><span>{getInvoicePositionDateLabel(selectedProfile, form.invoiceCategory)}</span><span>Beschreibung</span><span>Menge</span><span>Preis brutto</span><span /></div>
          {items.map((item, index) => <div className="offer-line" key={index}><div className="offer-line__mobile-title"><span>Position {index + 1}</span><strong>{fmt((Number(item.qty) || 0) * parseLocalizedNumber(item.price))}</strong></div>
            <OfferField label={getInvoicePositionDateLabel(selectedProfile, form.invoiceCategory)}><input style={inputStyle} type="date" value={item.treatmentDate || form.date || today()} onChange={event => setItems(current => current.map((entry, currentIndex) => currentIndex === index ? { ...entry, treatmentDate: event.target.value } : entry))} /></OfferField>
            <OfferField label="Beschreibung"><input aria-label={`Beschreibung Angebotsposition ${index + 1}`} style={inputStyle} value={item.desc || ""} onChange={event => setItems(current => current.map((entry, currentIndex) => currentIndex === index ? { ...entry, desc: event.target.value } : entry))} placeholder="Leistung oder Produkt" /></OfferField>
            <OfferField label="Menge"><input style={inputStyle} type="number" inputMode="decimal" min="0.01" step="0.01" value={item.qty} onFocus={event => event.currentTarget.select()} onChange={event => setItems(current => current.map((entry, currentIndex) => currentIndex === index ? { ...entry, qty: event.target.value } : entry))} /></OfferField>
            <OfferField label="Preis brutto"><div className="offer-price-input"><input aria-label={`Preis Angebotsposition ${index + 1}`} style={inputStyle} type="text" inputMode="decimal" value={item.price} onFocus={event => event.currentTarget.select()} onChange={event => setItems(current => current.map((entry, currentIndex) => currentIndex === index ? { ...entry, price: normalizePriceInput(event.target.value) } : entry))} placeholder="0,00" /><span>€</span></div></OfferField>
            <button type="button" className="offer-line__remove" disabled={items.length === 1} aria-label={`Angebotsposition ${index + 1} entfernen`} onClick={() => setItems(current => current.filter((_, currentIndex) => currentIndex !== index))}>×</button>
          </div>)}
          <OfferButton tone="quiet" small onClick={() => setItems(current => [...current, { treatmentDate: form.date || today(), desc: "", qty: 1, price: "" }])}>+ Position hinzufügen</OfferButton>
        </section>

        {!medicalProfile && <OfferField label="Text auf dem Angebot"><textarea style={{ ...inputStyle, minHeight: 86, resize: "vertical" }} value={form.offerNote || ""} maxLength="400" onChange={event => setForm(current => ({ ...current, offerNote: event.target.value }))} placeholder="Optionale Hinweise zum Leistungsumfang…" /></OfferField>}
        <div className="offer-total"><div><span>Netto</span><strong>{fmt(calculateInvoiceTotals(items, selectedProfile.defaultTaxRate).net)}</strong></div><div><span>MwSt. {selectedProfile.defaultTaxRate}%</span><strong>{fmt(calculateInvoiceTotals(items, selectedProfile.defaultTaxRate).tax)}</strong></div><div><span>Angebotssumme brutto</span><strong>{fmt(calculateInvoiceTotals(items, selectedProfile.defaultTaxRate).total)}</strong></div></div>
      </OfferModal>}

      {printing && <InvoicePrintView inv={{ ...printing, customerAddress: printing.customerAddress || formatCustomerAddress(data.members.find(member => member.id === printing.memberId)) }} profile={getInvoiceProfile(data, printing.invoiceProfileId)} onClose={() => setPrinting(null)} documentType="offer" />}

      {confirmState && <div className="offer-confirm-backdrop"><div className="offer-confirm" role="alertdialog" aria-modal="true"><span className="offers-eyebrow">Bitte bestätigen</span><h3>{confirmState.title}</h3><p>{confirmState.detail}</p><div><OfferButton tone="quiet" onClick={() => setConfirmState(null)}>Abbrechen</OfferButton><OfferButton tone={confirmState.destructive ? "danger" : "success"} onClick={runConfirm}>{confirmState.actionLabel}</OfferButton></div></div></div>}
    </div>
  );
}
