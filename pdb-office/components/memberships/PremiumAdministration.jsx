import React, { useEffect, useMemo, useState } from "react";
import {
  applyBeyondMonthlyUsage,
  getBeyondReconciliation,
  getPremiumMember,
  listPremiumContracts,
  listPremiumMembers,
  recordPremiumManualUsage,
} from "../../services/premiumAdmin.js";
import "./premium-administration.css";

const PACKAGE_LABELS = { pure: "PURE", define: "DEFINE", beyond: "BEYOND", private: "PRIVATE" };
const CATEGORY_LABELS = { pure: "PURE", define: "DEFINE", beyond: "BEYOND", private: "PRIVATE" };
const RECONCILIATION_STATES = {
  linked: { label: "Verbunden", tone: "linked" },
  ready: { label: "Shopify bestätigt", tone: "ready" },
  review: { label: "Zuordnung prüfen", tone: "review" },
  missing_shopify: { label: "Nicht in Shopify gefunden", tone: "missing" },
};

function displayName(member) {
  return [member?.first_name, member?.last_name].filter(Boolean).join(" ") || member?.email || "Name fehlt";
}

function formatDate(value) {
  if (!value) return "—";
  return new Date(`${String(value).slice(0, 10)}T00:00:00`).toLocaleDateString("de-DE");
}

function errorMessage(error) {
  if (error?.code === "PREMIUM_ADMIN_NOT_CONFIGURED") return "Render-Verbindung ist noch nicht eingerichtet.";
  if (error?.code === "PREMIUM_ADMIN_UNAVAILABLE") return "Render ist momentan nicht erreichbar.";
  if (error?.status === 401) return "Der Render-Adminzugang ist nicht gültig.";
  if (error?.status === 404) return "Die neue Member-Verwaltung ist auf Render noch nicht veröffentlicht.";
  return "Die Online-Verwaltung konnte nicht geladen werden.";
}

function QuotaGrid({ months }) {
  return (
    <div className="premium-admin__quota-grid">
      {(months || []).map(month => (
        <div className="premium-admin__quota" key={month.month}>
          <span>{new Date(`${month.month}T00:00:00`).toLocaleDateString("de-DE", { month: "long", year: "numeric" })}</span>
          <div>
            {Object.entries(month.remaining || {})
              .filter(([category, value]) => Number(value) > 0 || Number(month.usage?.[category]) > 0)
              .map(([category, remaining]) => (
                <strong key={category}>{CATEGORY_LABELS[category] || category}: {remaining} frei</strong>
              ))}
            {Object.values(month.remaining || {}).every(value => Number(value) === 0) && <strong>Kontingent verbraucht</strong>}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PremiumAdministration({ crmMemberships = [] }) {
  const [view, setView] = useState("members");
  const [members, setMembers] = useState([]);
  const [contracts, setContracts] = useState([]);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("");
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState("");
  const [usage, setUsage] = useState({ booking_month: "", treatment_key: "", actor: "", reason: "" });
  const [confirmUsage, setConfirmUsage] = useState(false);
  const [reconciliation, setReconciliation] = useState(null);
  const [reconciliationLoading, setReconciliationLoading] = useState(false);
  const [reconciliationError, setReconciliationError] = useState(null);
  const [availableCrmMemberIds, setAvailableCrmMemberIds] = useState([]);
  const [confirmReconciliation, setConfirmReconciliation] = useState(false);
  const [reconciliationSaving, setReconciliationSaving] = useState(false);
  const activeCrmMemberCount = useMemo(() => new Set(
    crmMemberships
      .filter(membership => membership.status === "aktiv")
      .map(membership => membership.memberId),
  ).size, [crmMemberships]);

  const filteredMembers = useMemo(() => members.filter(member => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return [displayName(member), member.email, member.shopify_customer_id]
      .some(value => String(value || "").toLowerCase().includes(needle));
  }), [members, query]);

  const loadOverview = async () => {
    setLoading(true);
    setError(null);
    try {
      const [memberPayload, contractPayload] = await Promise.all([
        listPremiumMembers({ status }),
        listPremiumContracts(),
      ]);
      setMembers(memberPayload.members || []);
      setContracts(contractPayload.applications || []);
    } catch (nextError) {
      setError(nextError);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadOverview(); }, [status]);

  const loadReconciliation = async () => {
    setReconciliationLoading(true);
    setReconciliationError(null);
    try {
      const payload = await getBeyondReconciliation();
      setReconciliation(payload);
      setAvailableCrmMemberIds(payload.rows
        .filter(row => ["linked", "ready"].includes(row.state) && Number(row.current_remaining) > 0)
        .map(row => String(row.crm_member_id)));
    } catch (nextError) {
      setReconciliationError(nextError);
    } finally {
      setReconciliationLoading(false);
    }
  };

  const openReconciliation = () => {
    setView("reconciliation");
    if (!reconciliation && !reconciliationLoading) loadReconciliation();
  };

  const toggleAugustAvailability = crmMemberId => {
    const id = String(crmMemberId);
    setAvailableCrmMemberIds(current => current.includes(id)
      ? current.filter(value => value !== id)
      : [...current, id]);
  };

  const currentAvailableCrmMemberIds = useMemo(() => (reconciliation?.rows || [])
    .filter(row => ["linked", "ready"].includes(row.state) && Number(row.current_remaining) > 0)
    .map(row => String(row.crm_member_id)), [reconciliation]);
  const changedAugustMemberCount = useMemo(() => {
    const current = new Set(currentAvailableCrmMemberIds);
    const selected = new Set(availableCrmMemberIds);
    return new Set([...current, ...selected]).size
      - [...current].filter(id => selected.has(id)).length;
  }, [availableCrmMemberIds, currentAvailableCrmMemberIds]);

  const saveReconciliation = async () => {
    setReconciliationSaving(true);
    setReconciliationError(null);
    setNotice("");
    try {
      const result = await applyBeyondMonthlyUsage(availableCrmMemberIds);
      setNotice(`${result.applied.length} BEYOND-Member übernommen: ${result.available} mit 1 frei, ${result.exhausted} mit 0 frei.`);
      setConfirmReconciliation(false);
      await Promise.all([loadOverview(), loadReconciliation()]);
    } catch (nextError) {
      setReconciliationError(nextError);
      setConfirmReconciliation(false);
    } finally {
      setReconciliationSaving(false);
    }
  };

  const openMember = async memberId => {
    setSelectedId(memberId);
    setDetail(null);
    setError(null);
    try {
      const payload = await getPremiumMember(memberId);
      setDetail(payload);
      setUsage(current => ({
        ...current,
        booking_month: payload.months?.[0]?.month || "",
        treatment_key: payload.treatments?.[0]?.treatment_key || "",
      }));
    } catch (nextError) {
      setError(nextError);
    }
  };

  const saveManualUsage = async () => {
    setConfirmUsage(false);
    setNotice("");
    setError(null);
    try {
      await recordPremiumManualUsage(selectedId, usage);
      setNotice("Termin wurde als verbraucht protokolliert.");
      await openMember(selectedId);
    } catch (nextError) {
      setError(nextError);
    }
  };

  return (
    <section className="premium-admin" aria-label="Online-Verwaltung">
      <div className="premium-admin__header">
        <div>
          <span className="premium-admin__eyebrow">Render · geschützter Zugriff</span>
          <h3>Online-Kontingente & Verträge</h3>
          <p>Hier erscheinen technische Online-Buchungskonten. Sie entstehen automatisch beim Premium-Zugang oder durch die Annahme eines neuen Vertrags. Die vollständige Memberverwaltung bleibt in der CRM-Liste darunter.</p>
        </div>
        <button className="premium-admin__refresh" onClick={view === "reconciliation" ? loadReconciliation : loadOverview} disabled={loading || reconciliationLoading || reconciliationSaving}>Aktualisieren</button>
      </div>

      <div className="premium-admin__tabs">
        <button className={view === "members" ? "is-active" : ""} onClick={() => setView("members")}>Online-Kontingente <span>{members.length}</span></button>
        <button className={view === "reconciliation" ? "is-active" : ""} onClick={openReconciliation}>BEYOND-Abgleich <span>{reconciliation?.summary?.crm_members ?? "–"}</span></button>
        <button className={view === "contracts" ? "is-active" : ""} onClick={() => setView("contracts")}>Verträge <span>{contracts.length}</span></button>
      </div>

      {loading && <div className="premium-admin__state">Online-Verwaltung wird geladen…</div>}
      {error && <div className="premium-admin__state premium-admin__state--error">{errorMessage(error)}</div>}
      {notice && <div className="premium-admin__state premium-admin__state--success">{notice}</div>}

      {!loading && !error && view === "members" && (
        <div className="premium-admin__workspace">
          <div className="premium-admin__list">
            <div className="premium-admin__scope">
              <strong>{members.length} Konten im Online-System</strong>
              <span>{activeCrmMemberCount} aktive Member stehen insgesamt im CRM.</span>
            </div>
            <div className="premium-admin__filters">
              <input value={query} onChange={event => setQuery(event.target.value)} placeholder="Name, E-Mail oder Shopify-ID" />
              <select value={status} onChange={event => setStatus(event.target.value)}>
                <option value="">Alle Status</option>
                <option value="active">Aktiv</option>
                <option value="paused">Pausiert</option>
                <option value="cancelled">Gekündigt</option>
              </select>
            </div>
            <div className="premium-admin__member-list">
              {filteredMembers.map(member => (
                <button key={member.id} className={selectedId === member.id ? "is-selected" : ""} onClick={() => openMember(member.id)}>
                  <strong>{displayName(member)}</strong>
                  <span>{PACKAGE_LABELS[member.package_key] || member.package_key} · {member.status}</span>
                  <small>{member.email || `Shopify ${member.shopify_customer_id}`}</small>
                </button>
              ))}
              {!filteredMembers.length && <div className="premium-admin__empty">Keine Member gefunden.</div>}
            </div>
          </div>

          <div className="premium-admin__detail">
            {!selectedId && <div className="premium-admin__empty">Member auswählen, um Kontingente und Termine zu sehen.</div>}
            {selectedId && !detail && <div className="premium-admin__empty">Memberdetails werden geladen…</div>}
            {detail && (
              <>
                <div className="premium-admin__member-heading">
                  <div><span>{PACKAGE_LABELS[detail.member.package_key]}</span><h4>{displayName(detail.member)}</h4></div>
                  <small>Shopify-ID {detail.member.shopify_customer_id}</small>
                </div>
                <QuotaGrid months={detail.months} />

                <div className="premium-admin__usage">
                  <h5>Termin als verbraucht markieren</h5>
                  <div className="premium-admin__form-grid">
                    <label>Leistungsmonat<select value={usage.booking_month} onChange={event => setUsage(current => ({ ...current, booking_month: event.target.value }))}>{(detail.months || []).map(month => <option key={month.month} value={month.month}>{formatDate(month.month)}</option>)}</select></label>
                    <label>Behandlung<select value={usage.treatment_key} onChange={event => setUsage(current => ({ ...current, treatment_key: event.target.value }))}>{(detail.treatments || []).map(treatment => <option key={treatment.treatment_key} value={treatment.treatment_key}>{treatment.title}</option>)}</select></label>
                    <label>Bearbeitet von<input value={usage.actor} onChange={event => setUsage(current => ({ ...current, actor: event.target.value }))} placeholder="Name" /></label>
                    <label>Grund<input value={usage.reason} onChange={event => setUsage(current => ({ ...current, reason: event.target.value }))} placeholder="z. B. bereits vor Ort wahrgenommen" /></label>
                  </div>
                  <button className="premium-admin__primary" disabled={!usage.booking_month || !usage.treatment_key || usage.actor.trim().length < 2 || usage.reason.trim().length < 3} onClick={() => setConfirmUsage(true)}>Als verbraucht markieren</button>
                </div>

                <div className="premium-admin__bookings">
                  <h5>Verbuchte Termine</h5>
                  {(detail.bookings || []).map(booking => <div key={booking.id}><span>{formatDate(booking.booking_month)} · {booking.treatment_title}</span><strong>{booking.status === "cancelled" ? "storniert" : booking.source === "admin_manual" ? "manuell" : "online"}</strong></div>)}
                  {!detail.bookings?.length && <div className="premium-admin__empty">Noch keine Termine verbucht.</div>}
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {!loading && !error && view === "contracts" && (
        <div className="premium-admin__contracts">
          {contracts.map(contract => (
            <div key={contract.id}>
              <strong>{contract.first_name} {contract.last_name}</strong>
              <span>{PACKAGE_LABELS[contract.package_key] || contract.package_key} · Start {formatDate(contract.starts_on)}</span>
              <small>{contract.status} · {contract.masked_iban || "IBAN geschützt"}</small>
            </div>
          ))}
          {!contracts.length && <div className="premium-admin__empty">Keine Verträge vorhanden.</div>}
        </div>
      )}

      {view === "reconciliation" && (
        <div className="premium-admin__reconciliation">
          <div className="premium-admin__safety-note">
            <strong>Aktueller August-Stand</strong>
            <span>Die Schalter zeigen den tatsächlich gespeicherten Buchungsstand. „1 frei“ bedeutet: Die Person kann noch einen August-Termin buchen. Änderungen werden erst nach der Bestätigung gespeichert.</span>
          </div>

          {reconciliationLoading && <div className="premium-admin__state">BEYOND-Member werden mit Shopify abgeglichen…</div>}
          {reconciliationError && <div className="premium-admin__state premium-admin__state--error">{errorMessage(reconciliationError)}</div>}

          {!reconciliationLoading && reconciliation && (
            <>
              <div className="premium-admin__reconciliation-summary">
                <div><strong>{reconciliation.summary.crm_members}</strong><span>aktive BEYOND-Member</span></div>
                <div><strong>{reconciliation.summary.linked}</strong><span>bereits verbunden</span></div>
                <div><strong>{reconciliation.summary.ready}</strong><span>Shopify bestätigt</span></div>
                <div><strong>{reconciliation.summary.upcoming || 0}</strong><span>BEYOND geplant</span></div>
                <div><strong>{reconciliation.summary.needs_review}</strong><span>manuell prüfen</span></div>
              </div>

              <div className="premium-admin__reconciliation-table-wrap">
                <table className="premium-admin__reconciliation-table">
                  <thead><tr><th>CRM-Member</th><th>Shopify</th><th>Online-System</th><th>August-Kontingent</th></tr></thead>
                  <tbody>
                    {reconciliation.rows.map(row => {
                      const state = RECONCILIATION_STATES[row.state] || RECONCILIATION_STATES.missing_shopify;
                      const eligible = ["linked", "ready"].includes(row.state);
                      const available = availableCrmMemberIds.includes(String(row.crm_member_id));
                      return (
                        <tr key={row.crm_member_id || row.membership_ids.join("-")}>
                          <td><strong>{row.name}</strong><small>{row.email || "E-Mail fehlt"}{row.membership_ids.length > 1 ? ` · ${row.membership_ids.length} Verträge` : ""}</small></td>
                          <td><span className={`premium-admin__match premium-admin__match--${state.tone}`}>{state.label}</span><small>{row.match_method === "name" ? "nur über Namen gefunden" : row.shopify_email || "keine eindeutige Zuordnung"}</small></td>
                          <td><strong>{row.online_member_id ? "Vorhanden" : "Noch nicht angelegt"}</strong></td>
                          <td>{eligible ? (
                            <label className="premium-admin__availability-toggle">
                              <input type="checkbox" checked={available} onChange={() => toggleAugustAvailability(row.crm_member_id)} />
                              <span>{available ? "1 frei – buchbar" : "0 frei – verbraucht"}</span>
                              {row.current_remaining === null
                                ? <small>Noch kein Online-Konto</small>
                                : <small>Aktuell gespeichert: {Number(row.current_remaining) > 0 ? "1 frei" : "0 frei"}</small>}
                            </label>
                          ) : <strong className="premium-admin__august-lock">Zuordnung offen</strong>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="premium-admin__reconciliation-action">
                <div>
                  <strong>{reconciliation.rows.filter(row => ["linked", "ready"].includes(row.state)).length} eindeutig zugeordnete Member</strong>
                  <span>{availableCrmMemberIds.length} buchbar · {reconciliation.rows.filter(row => ["linked", "ready"].includes(row.state)).length - availableCrmMemberIds.length} verbraucht · {changedAugustMemberCount ? `${changedAugustMemberCount} Änderung${changedAugustMemberCount === 1 ? "" : "en"}` : "keine Änderungen"}</span>
                </div>
                <button className="premium-admin__primary" disabled={reconciliationSaving || changedAugustMemberCount === 0} onClick={() => setConfirmReconciliation(true)}>Änderungen speichern</button>
              </div>

              {reconciliation.upcoming?.length > 0 && (
                <div className="premium-admin__safety-note">
                  <strong>{reconciliation.upcoming.length} geplante BEYOND-Upgrades</strong>
                  <span>{reconciliation.upcoming.map(row => `${row.name} ab ${formatDate(row.scheduled_start_date)}`).join(" · ")}. Diese Personen werden nicht als fehlende CRM-Zuordnung gewertet und erhalten für August kein neues Kontingent.</span>
                </div>
              )}

              {reconciliation.shopify_only?.length > 0 && (
                <div className="premium-admin__shopify-only">
                  <strong>{reconciliation.shopify_only.length} Shopify-BEYOND-Konten ohne aktive oder geplante CRM-Zuordnung</strong>
                  <span>Diese werden nicht automatisch übernommen und müssen separat geprüft werden.</span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {confirmUsage && (
        <div className="premium-admin__confirm" role="dialog" aria-modal="true">
          <div>
            <h4>Termin wirklich verbrauchen?</h4>
            <p>Die Änderung reduziert das verfügbare Kontingent und wird mit Bearbeiter und Grund protokolliert.</p>
            <div><button onClick={() => setConfirmUsage(false)}>Abbrechen</button><button className="premium-admin__primary" onClick={saveManualUsage}>Jetzt verbuchen</button></div>
          </div>
        </div>
      )}


      {confirmReconciliation && (
        <div className="premium-admin__confirm" role="dialog" aria-modal="true" aria-labelledby="reconciliation-confirm-heading">
          <div>
            <h4 id="reconciliation-confirm-heading">August-Kontingente wirklich ändern?</h4>
            <p>{changedAugustMemberCount} Kontingent{changedAugustMemberCount === 1 ? " wird" : "e werden"} geändert. Danach können genau {availableCrmMemberIds.length} BEYOND-Member noch einen August-Termin buchen. Offene Zuordnungen bleiben unverändert.</p>
            <div><button onClick={() => setConfirmReconciliation(false)}>Abbrechen</button><button className="premium-admin__primary" disabled={reconciliationSaving} onClick={saveReconciliation}>Jetzt sicher übernehmen</button></div>
          </div>
        </div>
      )}
    </section>
  );
}
