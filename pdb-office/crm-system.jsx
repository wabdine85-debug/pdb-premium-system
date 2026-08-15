import React, { useState, useRef, useEffect, useMemo, useDeferredValue } from "react";
import InvoicePrintView from "./components/invoices/InvoicePrintView.jsx";
import RevenueWorkspace from "./components/revenue/RevenueWorkspace.jsx";
import WorkTimeWorkspace from "./components/work-time/WorkTimeWorkspace.jsx";
import PremiumAdministration from "./components/memberships/PremiumAdministration.jsx";
import { createMembershipExportRows, downloadMembershipCsv, downloadMembershipPdf } from "./modules/memberships/membershipExports.js";
import { useStorage, migrateData } from "./services/crmStorage.js";
import { DEFAULT_INVOICE_PROFILE_ID, INVOICE_PAYMENT_TERMS, PDB_INVOICE_CATEGORIES, buildInvoiceNumber, calculateInvoiceDueDate, calculateInvoiceTotals, defaultInvoiceProfiles, getInvoiceCategoryLabel, getInvoiceDueLabel, getInvoicePositionDateLabel, getInvoiceProfile, isMedicalInvoiceProfile } from "./modules/invoices/invoiceProfiles.js";
import { addDays, fmt, fmtDate, today } from "./utils/formatters.js";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => Math.random().toString(36).slice(2, 10);

const DIAGNOSIS_TEMPLATES = {
  hws: {
    title: "HWS-Syndrom / Beschwerden der Halswirbelsäule",
    symptoms: ["Nacken- und Schulterverspannungen", "eingeschränkte Beweglichkeit", "Kopfschmerz möglich", "ausstrahlende Beschwerden in Arm/Hand möglich"],
    causes: ["muskuläre Dysbalancen", "Fehlhaltung / Bildschirmarbeit", "Blockierungen im Bereich der Halswirbelsäule", "Stressbedingte Tonuserhöhung"],
    treatments: ["klinische Befundung und Funktionsprüfung", "manuelle bzw. physiotherapeutische Maßnahmen", "Wärme, Mobilisation und Haltungsschulung", "ärztliche Abklärung bei neurologischen Ausfällen, Trauma oder starken Schmerzen"],
  },
  lws: {
    title: "LWS-Beschwerden / Lumbalgie",
    symptoms: ["Schmerzen im unteren Rücken", "Bewegungseinschränkung", "mögliche Ausstrahlung in Gesäß/Bein", "Belastungs- oder Sitzschmerz"],
    causes: ["muskuläre Überlastung", "Fehlbelastung", "Facettengelenk-/ISG-Irritation", "Bandscheibenbezogene Beschwerden möglich"],
    treatments: ["Funktionsprüfung und Schmerzanamnese", "Mobilisation und stabilisierende Übungen", "Wärme und entlastende Lagerung", "ärztliche Abklärung bei Taubheit, Kraftverlust oder Blasen-/Darmstörungen"],
  },
  bws: {
    title: "BWS-Beschwerden / Brustwirbelsäule",
    symptoms: ["Schmerzen zwischen den Schulterblättern", "Druck- oder Engegefühl", "eingeschränkte Rotation", "atemabhängige Beschwerden möglich"],
    causes: ["Haltungsbelastung", "Rippen-/Wirbelgelenk-Irritation", "muskuläre Verspannung", "Stress und flache Atmung"],
    treatments: ["Beweglichkeitsprüfung", "Mobilisation der BWS/Rippenregion", "Atem- und Haltungsschulung", "ärztliche Abklärung bei Brustschmerz, Luftnot oder unklarer Symptomatik"],
  },
};

function buildDiagnosisSuggestion(input) {
  const key = (input || "").trim().toLowerCase();
  const template = DIAGNOSIS_TEMPLATES[key];
  if (!template) {
    return [
      `Befund: ${input || "Bitte Befund ergänzen"}`,
      "",
      "Symptome:",
      "- bitte Symptome stichpunktartig ergänzen",
      "",
      "Mögliche Ursachen:",
      "- bitte Ursache/Anamnese ergänzen",
      "",
      "Behandlungsmöglichkeiten:",
      "- Befundorientierte Beratung und Dokumentation",
      "- Behandlung nach medizinischer Indikation",
      "- ärztliche Abklärung bei unklarer oder akuter Symptomatik",
    ].join("\n");
  }

  return [
    `Befund: ${template.title}`,
    "",
    "Symptome:",
    ...template.symptoms.map(item => `- ${item}`),
    "",
    "Mögliche Ursachen:",
    ...template.causes.map(item => `- ${item}`),
    "",
    "Behandlungsmöglichkeiten:",
    ...template.treatments.map(item => `- ${item}`),
  ].join("\n");
}

const STATUS_COLORS = {
  aktiv: { bg: "#d1fae5", color: "#065f46" },
  inaktiv: { bg: "#fee2e2", color: "#991b1b" },
  vorbereitung: { bg: "#fef3c7", color: "#92400e" },
  gekündigt: { bg: "#fee2e2", color: "#991b1b" },
  pausiert: { bg: "#e0f2fe", color: "#075985" },
  abgelaufen: { bg: "#f1f5f9", color: "#475569" },
  ausstehend: { bg: "#ede9fe", color: "#5b21b6" },
  erledigt: { bg: "#d1fae5", color: "#065f46" },
  "Einrichtung offen": { bg: "#fef3c7", color: "#92400e" },
  "Banking offen": { bg: "#fef3c7", color: "#92400e" },
  "Banking erledigt": { bg: "#d1fae5", color: "#065f46" },
  bezahlt: { bg: "#d1fae5", color: "#065f46" },
  überfällig: { bg: "#fee2e2", color: "#991b1b" },
  entwurf: { bg: "#f1f5f9", color: "#475569" },
  "1. Mahnung": { bg: "#fef3c7", color: "#92400e" },
  "2. Mahnung": { bg: "#fed7aa", color: "#9a3412" },
  "3. Mahnung": { bg: "#fee2e2", color: "#991b1b" },
};

function Badge({ status }) {
  const s = STATUS_COLORS[status] || { bg: "#f1f5f9", color: "#475569" };
  return (
    <span style={{ background: s.bg, color: s.color, borderRadius: 20, padding: "2px 10px", fontSize: 12, fontWeight: 600, whiteSpace: "nowrap" }}>
      {status}
    </span>
  );
}

function SourceLogo({ source, withText = false, size = 18 }) {
  if (source === "shopify") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
        <svg width={size} height={size} viewBox="0 0 109 124" fill="none" xmlns="http://www.w3.org/2000/svg" aria-label="Shopify">
          <path d="M95.5 22.3c-.1-.7-.7-1.1-1.2-1.1s-10.1-.2-10.1-.2-8-7.8-8.8-8.6c-.8-.8-2.4-.6-3-.4l-4.1 1.3C66.4 9.8 63.1 7 58.5 7h-.4C57 5.3 55.1 4 52.8 4 36.2 4.1 28.3 25 25.8 35.2l-13 4c-4 1.2-4.1 1.3-4.6 5.1L0 115.1l74.7 14L109 122c0 .1-13.4-99.1-13.5-99.7z" fill="#95BF47" />
          <path d="M94.3 21.2c-.5 0-10.1-.2-10.1-.2s-8-7.8-8.8-8.6c-.3-.3-.7-.4-1.1-.5L74.7 129l34.3-7.9S95.5 23 95.4 22.3c-.1-.7-.6-1.1-1.1-1.1z" fill="#5E8E3E" />
          <path d="M58.5 43.5l-4.2 15.6s-4.6-2.1-10.1-1.8c-8.1.5-8.1 5.6-8.1 6.9.4 7 19.1 8.5 20.1 24.9.8 12.9-6.8 21.7-17.7 22.4-13.2.9-20.4-7-20.4-7l2.8-11.8s7.3 5.5 13.1 5.1c3.8-.3 5.2-3.3 5-5.4-.6-9.1-15.8-8.6-16.7-23.6-.8-12.6 7.5-25.5 25.8-26.6 7.2-.3 10.4 1.3 10.4 1.3z" fill="#fff" />
        </svg>
        {withText && <span>Shopify</span>}
      </span>
    );
  }

  if (source === "salonized") {
    return (
      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "#111827", fontWeight: 800 }}>
        <span style={{ width: size, height: size, borderRadius: size / 2, background: "#111827", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: Math.max(10, size * 0.58), fontWeight: 900, lineHeight: 1 }}>S</span>
        {withText && <span>Salonized</span>}
      </span>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <span style={{ width: size, height: size, borderRadius: size / 2, background: "#64748b", display: "inline-flex", alignItems: "center", justifyContent: "center", color: "#fff", fontSize: Math.max(9, size * 0.55), fontWeight: 800 }}>M</span>
      {withText && <span>Manuell</span>}
    </span>
  );
}

function formatCustomerAddress(customer) {
  if (!customer) return "";
  return [customer.address, [customer.zip, customer.city].filter(Boolean).join(" "), customer.country].filter(Boolean).join("\n");
}

function Modal({ title, onClose, children, wide }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: wide ? 720 : 520, maxWidth: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.18)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "20px 24px 0" }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: "#1e293b" }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 22, color: "#94a3b8", lineHeight: 1 }}>×</button>
        </div>
        <div style={{ padding: 24 }}>{children}</div>
      </div>
    </div>
  );
}

function Field({ label, children, required }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 6 }}>
        {label}{required && <span style={{ color: "#ef4444" }}> *</span>}
      </label>
      {children}
    </div>
  );
}

const inp = { width: "100%", border: "1px solid #e2e8f0", borderRadius: 8, padding: "9px 12px", fontSize: 14, color: "#1e293b", background: "#fff", boxSizing: "border-box", outline: "none" };
const sel = { ...inp, cursor: "pointer" };

function Btn({ onClick, children, variant = "primary", small, style: s, disabled }) {
  const base = { border: "none", borderRadius: 8, cursor: disabled ? "not-allowed" : "pointer", fontWeight: 600, fontSize: small ? 13 : 14, padding: small ? "6px 14px" : "9px 18px", transition: "opacity 0.15s", opacity: disabled ? 0.5 : 1, ...s };
  const variants = {
    primary: { background: "#1e40af", color: "#fff" },
    danger: { background: "#dc2626", color: "#fff" },
    ghost: { background: "#f1f5f9", color: "#475569" },
    success: { background: "#059669", color: "#fff" },
    outline: { background: "#fff", color: "#1e40af", border: "1px solid #1e40af" },
  };
  return <button disabled={disabled} onClick={disabled ? undefined : onClick} style={{ ...base, ...variants[variant] }}>{children}</button>;
}

// ─── Confirm Dialog (replaces window.confirm) ────────────────────────────────
function ConfirmDialog({ message, detail, confirmLabel = "Löschen", variant = "danger", onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 2000, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: 420, maxWidth: "100%", padding: 28, boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
        <div style={{ fontSize: 32, marginBottom: 12, textAlign: "center" }}>{variant === "danger" ? "🗑️" : "⚠️"}</div>
        <h3 style={{ margin: "0 0 8px", fontSize: 17, fontWeight: 700, color: "#1e293b", textAlign: "center" }}>{message}</h3>
        {detail && <p style={{ margin: "0 0 24px", fontSize: 13, color: "#64748b", textAlign: "center" }}>{detail}</p>}
        {!detail && <div style={{ marginBottom: 24 }} />}
        <div style={{ display: "flex", gap: 10, justifyContent: "center" }}>
          <Btn variant="ghost" onClick={onCancel}>Abbrechen</Btn>
          <Btn variant={variant} onClick={onConfirm}>{confirmLabel}</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function Dashboard({ data, onNavigate }) {
  const { members, invoices, bankTransactions } = data;
  const memberships = data.memberships || [];
  const memberById = new Map(members.map(member => [member.id, member]));
  const activeMemberIds = new Set(
    memberships.filter(membership => membership.status === "aktiv").map(membership => membership.memberId)
  );
  const aktiv = activeMemberIds.size;
  const offenRechnungen = invoices.filter(i => i.status === "ausstehend" || i.status === "überfällig");
  const offenSumme = offenRechnungen.reduce((s, i) => s + (i.total || 0), 0);
  const monatsUmsatz = invoices.filter(i => i.status === "bezahlt" && i.date?.startsWith(today().slice(0, 7))).reduce((s, i) => s + (i.total || 0), 0);
  const ueberfaellig = invoices.filter(i => i.status === "überfällig").length;

  const cards = [
    { label: "Aktive Member", value: aktiv, icon: "💎", color: "#1e40af", bg: "#eff6ff", action: () => onNavigate("memberships") },
    { label: "Monatsumsatz", value: fmt(monatsUmsatz), icon: "💰", color: "#059669", bg: "#f0fdf4", action: () => onNavigate("invoices") },
    { label: "Offene Rechnungen", value: fmt(offenSumme), icon: "📄", color: "#d97706", bg: "#fffbeb", action: () => onNavigate("invoices") },
    { label: "Überfällig", value: ueberfaellig + " Rechnungen", icon: "⚠️", color: "#dc2626", bg: "#fef2f2", action: () => onNavigate("reminders") },
  ];

  const recentMemberships = [...memberships]
    .sort((a, b) => (b.createdAt || b.startDate || "").localeCompare(a.createdAt || a.startDate || ""))
    .slice(0, 5);
  const overdueInvoices = invoices.filter(i => i.status === "überfällig").slice(0, 5);

  return (
    <div>
      <h2 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 800, color: "#1e293b" }}>Dashboard</h2>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 32 }}>
        {cards.map(c => (
          <div key={c.label} onClick={c.action} style={{ background: c.bg, borderRadius: 14, padding: "20px 22px", cursor: "pointer", border: `1.5px solid ${c.color}22`, transition: "box-shadow 0.15s" }}
            onMouseEnter={e => e.currentTarget.style.boxShadow = "0 4px 20px rgba(0,0,0,0.1)"}
            onMouseLeave={e => e.currentTarget.style.boxShadow = "none"}>
            <div style={{ fontSize: 28 }}>{c.icon}</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: c.color, margin: "8px 0 4px" }}>{c.value}</div>
            <div style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Neue Member</h3>
          {recentMemberships.length === 0 ? <p style={{ color: "#94a3b8", fontSize: 14 }}>Noch keine Member</p> :
            recentMemberships.map(m => {
              const person = memberById.get(m.memberId);
              return (
              <div key={m.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>{person?.name || m.memberName || "Name fehlt"}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{m.plan || "Membership"} · {fmtDate(m.startDate || m.createdAt)}</div>
                </div>
                <Badge status={m.status} />
              </div>
            );})}
        </div>

        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Überfällige Rechnungen</h3>
          {overdueInvoices.length === 0 ? <p style={{ color: "#94a3b8", fontSize: 14 }}>Keine überfälligen Rechnungen 🎉</p> :
            overdueInvoices.map(inv => (
              <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>{inv.memberName}</div>
                  <div style={{ fontSize: 12, color: "#94a3b8" }}>{inv.number} · fällig {getInvoiceDueLabel(inv)}</div>
                </div>
                <span style={{ fontWeight: 700, color: "#dc2626" }}>{fmt(inv.total)}</span>
              </div>
            ))}
        </div>
      </div>

      {bankTransactions.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: 20, marginTop: 20 }}>
          <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Letzte Kontobewegungen</h3>
          {bankTransactions.slice(-5).reverse().map(t => (
            <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderBottom: "1px solid #f1f5f9" }}>
              <div>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>{t.name}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{fmtDate(t.date)} · {t.purpose}</div>
              </div>
              <span style={{ fontWeight: 700, color: t.amount >= 0 ? "#059669" : "#dc2626" }}>{t.amount >= 0 ? "+" : ""}{fmt(t.amount)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Members ──────────────────────────────────────────────────────────────────
function MemberProfile({ member, data, save, onClose, onEdit }) {
  const invoices = data.invoices.filter(i => i.memberId === member.id || i.memberName === member.name);
  const [tab, setTab] = useState("overview");
  const [note, setNote] = useState("");

  const addNote = () => {
    if (!note.trim()) return;
    save(d => ({ ...d, members: d.members.map(m => m.id === member.id ? {
      ...m, timeline: [...(m.timeline || []), { id: uid(), type: "note", text: note, date: today(), ts: Date.now() }]
    } : m) }));
    setNote("");
  };

  const timeline = [
    ...(member.timeline || []),
    ...invoices.map(i => ({ id: i.id, type: "invoice", text: `Rechnung ${i.number} · ${fmt(i.total)}`, date: i.date, status: i.status, ts: new Date(i.date).getTime() })),
    { id: "join", type: "join", text: `Kunde seit ${fmtDate(member.createdAt || member.startDate)}`, date: member.createdAt || member.startDate, ts: new Date(member.createdAt || member.startDate || 0).getTime() },
  ].sort((a, b) => (b.ts || 0) - (a.ts || 0));

  const ICONS = { note: "📝", invoice: "📄", join: "🎉", import: "📥" };
  const sources = member.sources || (member.source ? [member.source] : []);

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 900, display: "flex" }}>
      <div style={{ flex: 1, background: "rgba(0,0,0,0.35)" }} onClick={onClose} />
      <div style={{ width: 520, background: "#fff", boxShadow: "-8px 0 40px rgba(0,0,0,0.15)", display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {/* Header */}
        <div style={{ padding: "24px 24px 0", borderBottom: "1px solid #f1f5f9" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
              <div style={{ width: 48, height: 48, borderRadius: "50%", background: "#1e40af", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20, color: "#fff", fontWeight: 800, flexShrink: 0 }}>
                {(member.name || "?")[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontSize: 18, fontWeight: 800, color: "#1e293b" }}>{member.name}</div>
                <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>{member.email || "Keine E-Mail"}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
                  <Badge status={member.status || "aktiv"} />
                  {sources.map(s => <span key={s} style={{ fontSize: 11, background: "#f1f5f9", color: "#475569", borderRadius: 20, padding: "2px 8px" }}><SourceLogo source={s} withText size={14} /></span>)}
                </div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <Btn small variant="ghost" onClick={() => onEdit?.(member)}>Bearbeiten</Btn>
              <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 22, cursor: "pointer", color: "#94a3b8" }}>×</button>
            </div>
          </div>
          {/* Stats strip */}
          <div style={{ display: "flex", gap: 0, borderTop: "1px solid #f1f5f9", marginLeft: -24, marginRight: -24 }}>
            {[
              { label: "Umsatz", value: fmt(member.totalSpent || 0), color: "#059669" },
              { label: "Termine", value: member.ordersCount || 0, color: "#1e40af" },
              { label: "Treuepunkte", value: member.loyaltyPoints || 0, color: "#7c3aed" },
              { label: "Rechnungen", value: invoices.length, color: "#d97706" },
            ].map((s, i) => (
              <div key={s.label} style={{ flex: 1, padding: "12px 0", textAlign: "center", borderRight: i < 3 ? "1px solid #f1f5f9" : "none" }}>
                <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.value}</div>
                <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{s.label}</div>
              </div>
            ))}
          </div>
          {/* Tabs */}
          <div style={{ display: "flex", gap: 0, marginLeft: -24, marginRight: -24 }}>
            {[["overview","Übersicht"],["timeline","Timeline"],["invoices","Rechnungen"]].map(([t,l]) => (
              <button key={t} onClick={() => setTab(t)} style={{ flex: 1, padding: "10px 0", border: "none", background: "none", cursor: "pointer", fontSize: 13, fontWeight: tab === t ? 700 : 500, color: tab === t ? "#1e40af" : "#64748b", borderBottom: tab === t ? "2px solid #1e40af" : "2px solid transparent" }}>{l}</button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: "auto", padding: 24 }}>
          {tab === "overview" && (
            <div>
              {[
                ["Telefon", member.phone || "—"],
                ["Adresse", [member.address, member.zip, member.city].filter(Boolean).join(", ") || "—"],
                ["Geburtsdatum", member.birthdate ? fmtDate(member.birthdate) : "—"],
                ["Geschlecht", member.gender === "f" ? "Weiblich" : member.gender === "m" ? "Männlich" : "—"],
                ["Plan", member.plan || "—"],
                ["Mitgliedschaft", member.membershipTier || "Keine Mitgliedschaft"],
                ["Betrag", member.amount ? fmt(member.amount) : "—"],
                ["Intervall", member.interval || "—"],
                ["IBAN", member.iban || "—"],
                ["Kunde seit", fmtDate(member.startDate || member.createdAt)],
                ["Tags", member.tags || "—"],
              ].map(([k, v]) => (
                <div key={k} style={{ display: "flex", padding: "9px 0", borderBottom: "1px solid #f8fafc" }}>
                  <span style={{ width: 130, fontSize: 13, color: "#94a3b8", flexShrink: 0 }}>{k}</span>
                  <span style={{ fontSize: 13, color: "#1e293b", fontWeight: 500 }}>{v}</span>
                </div>
              ))}
              {member.notes && (
                <div style={{ marginTop: 16, background: "#fefce8", borderRadius: 8, padding: 12, fontSize: 13, color: "#713f12" }}>
                  <strong>Notiz:</strong> {member.notes}
                </div>
              )}
            </div>
          )}

          {tab === "timeline" && (
            <div>
              <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                <input value={note} onChange={e => setNote(e.target.value)} placeholder="Notiz hinzufügen…" style={{ ...inp, flex: 1, fontSize: 13 }} onKeyDown={e => e.key === "Enter" && addNote()} />
                <Btn small onClick={addNote}>+</Btn>
              </div>
              {timeline.map(ev => (
                <div key={ev.id} style={{ display: "flex", gap: 12, marginBottom: 14 }}>
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "#f1f5f9", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>{ICONS[ev.type] || "•"}</div>
                  <div style={{ flex: 1, paddingTop: 3 }}>
                    <div style={{ fontSize: 13, color: "#1e293b", fontWeight: 500 }}>{ev.text}</div>
                    <div style={{ display: "flex", gap: 8, marginTop: 3, alignItems: "center" }}>
                      <span style={{ fontSize: 11, color: "#94a3b8" }}>{fmtDate(ev.date)}</span>
                      {ev.status && <Badge status={ev.status} />}
                    </div>
                  </div>
                </div>
              ))}
              {timeline.length === 0 && <p style={{ color: "#94a3b8", fontSize: 14 }}>Noch keine Aktivitäten</p>}
            </div>
          )}

          {tab === "invoices" && (
            <div>
              {invoices.length === 0 ? <p style={{ color: "#94a3b8", fontSize: 14 }}>Keine Rechnungen vorhanden</p> :
                invoices.map(inv => (
                  <div key={inv.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "12px 0", borderBottom: "1px solid #f1f5f9" }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 14, color: "#1e40af" }}>{inv.number}</div>
                      <div style={{ fontSize: 12, color: "#94a3b8" }}>{fmtDate(inv.date)} · fällig {getInvoiceDueLabel(inv)}</div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div style={{ fontWeight: 700 }}>{fmt(inv.total)}</div>
                      <Badge status={inv.status} />
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

const MEMBERSHIP_TIERS = ["Keine Mitgliedschaft", "Pure", "Define", "Beyond", "Private"];

function Members({ data, save }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("alle");
  const [filterSource, setFilterSource] = useState("alle");
  const [form, setForm] = useState({});
  const [profile, setProfile] = useState(null);
  const [selected, setSelected] = useState(new Set());
  const [showDupes, setShowDupes] = useState(false);
  const [sortBy, setSortBy] = useState("name");

  const [confirm, setConfirm] = useState(null); // { message, detail, onConfirm }

  const PLANS = ["Pure", "Define", "Beyond", "Private", "Basic", "Standard", "Premium", "VIP", "Jahresabo", "Probeabo", "Salon-Kunde", "Shopify-Kunde"];

  const openNew = () => { setForm({ status: "aktiv", membershipTier: "Keine Mitgliedschaft" }); setEditing(null); setShowForm(true); };
  const openEdit = (m, e) => { e?.stopPropagation(); setForm({ ...m }); setEditing(m.id); setShowForm(true); };

  const saveMember = () => {
    if (!form.name) return;
    save(d => {
      if (editing) return { ...d, members: d.members.map(m => m.id === editing ? { ...form, id: editing } : m) };
      return { ...d, members: [...d.members, { ...form, id: uid(), status: form.status || "aktiv", membershipTier: form.membershipTier || "Keine Mitgliedschaft", createdAt: today() }] };
    });
    setShowForm(false);
  };

  const deleteMember = (id, e) => {
    e?.stopPropagation();
    const m = data.members.find(x => x.id === id);
    setConfirm({
      message: `${m?.name} löschen?`,
      detail: "Dieser Eintrag wird dauerhaft entfernt.",
      onConfirm: () => {
        save(d => ({ ...d, members: d.members.filter(m => m.id !== id) }));
        if (profile?.id === id) setProfile(null);
        setConfirm(null);
      }
    });
  };

  // Duplicate detection
  const normN = s => (s || "").toLowerCase().replace(/\s+/g, " ").trim();
  const normP = s => (s || "").replace(/[\s\-\(\)\+]/g, "").slice(-8);

  const findDupes = () => {
    const dupes = [];
    const members = data.members;
    const seen = new Map();
    members.forEach(m => {
      const email = (m.email || "").toLowerCase().trim();
      const name = normN(m.name);
      const phone = normP(m.phone);
      const keys = [email ? `e:${email}` : null, name.length > 4 ? `n:${name}` : null, phone.length >= 7 ? `p:${phone}` : null].filter(Boolean);
      keys.forEach(k => {
        if (seen.has(k)) {
          const existing = seen.get(k);
          if (!dupes.find(d => d.ids.includes(m.id) && d.ids.includes(existing.id))) {
            dupes.push({ ids: [existing.id, m.id], members: [existing, m], signal: k.startsWith("e:") ? "E-Mail" : k.startsWith("n:") ? "Name" : "Telefon" });
          }
        } else { seen.set(k, m); }
      });
    });
    return dupes;
  };

  const mergeDupe = (keepId, removeId) => {
    const keep = data.members.find(m => m.id === keepId);
    const remove = data.members.find(m => m.id === removeId);
    if (!keep || !remove) return;
    const merged = {
      ...keep,
      email: keep.email || remove.email,
      phone: keep.phone || remove.phone,
      address: keep.address || remove.address,
      city: keep.city || remove.city,
      birthdate: keep.birthdate || remove.birthdate,
      notes: [keep.notes, remove.notes].filter(Boolean).join(" | "),
      totalSpent: Math.max(keep.totalSpent || 0, remove.totalSpent || 0),
      ordersCount: Math.max(keep.ordersCount || 0, remove.ordersCount || 0),
      loyaltyPoints: Math.max(keep.loyaltyPoints || 0, remove.loyaltyPoints || 0),
      sources: [...new Set([...(keep.sources || [keep.source]), ...(remove.sources || [remove.source])].filter(Boolean))],
      timeline: [...(keep.timeline || []), ...(remove.timeline || [])],
    };
    save(d => ({ ...d, members: d.members.filter(m => m.id !== removeId).map(m => m.id === keepId ? merged : m) }));
  };

  // Bulk actions
  const bulkSetStatus = (status) => {
    save(d => ({ ...d, members: d.members.map(m => selected.has(m.id) ? { ...m, status } : m) }));
    setSelected(new Set());
  };
  const bulkDelete = () => {
    setConfirm({
      message: `${selected.size} Kunden löschen?`,
      detail: "Alle ausgewählten Einträge werden dauerhaft entfernt.",
      onConfirm: () => {
        const toDelete = new Set(selected);
        save(d => ({ ...d, members: d.members.filter(m => !toDelete.has(m.id)) }));
        setSelected(new Set());
        setConfirm(null);
      }
    });
  };
  const toggleSelect = (id, e) => { e.stopPropagation(); const s = new Set(selected); s.has(id) ? s.delete(id) : s.add(id); setSelected(s); };
  const toggleAll = () => { if (selected.size === filtered.length) setSelected(new Set()); else setSelected(new Set(filtered.map(m => m.id))); };

  const [showNoContact, setShowNoContact] = useState(false);

  const filtered = data.members.filter(m => {
    const q = search.toLowerCase();
    const match = !q || m.name?.toLowerCase().includes(q) || m.email?.toLowerCase().includes(q) || m.phone?.includes(q) || m.tags?.toLowerCase().includes(q);
    const statusMatch = filterStatus === "alle" || m.status === filterStatus;
    const sourceMatch = filterSource === "alle" || (m.source === filterSource || m.sources?.includes(filterSource));
    return match && statusMatch && sourceMatch;
  }).sort((a, b) => {
    if (sortBy === "name") return (a.name || "").localeCompare(b.name || "");
    if (sortBy === "umsatz") return (b.totalSpent || 0) - (a.totalSpent || 0);
    if (sortBy === "date") return (b.createdAt || "").localeCompare(a.createdAt || "");
    return 0;
  });

  const dupes = findDupes();

  const noContactMembers = data.members.filter(m => !m.email?.trim() && !m.phone?.trim());

  const cleanupEmpty = () => {
    if (noContactMembers.length === 0) return;
    setConfirm({
      message: `${noContactMembers.length} Kunden ohne Kontaktdaten löschen?`,
      detail: "Kunden ohne E-Mail und Telefon werden dauerhaft entfernt.",
      onConfirm: () => {
        const ids = new Set(noContactMembers.map(m => m.id));
        save(d => ({ ...d, members: d.members.filter(m => !ids.has(m.id)) }));
        setShowNoContact(false);
        setConfirm(null);
      }
    });
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#1e293b" }}>Kunden</h2>
          <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 3 }}>{data.members.length.toLocaleString("de-DE")} gesamt · {filtered.length.toLocaleString("de-DE")} gefiltert</div>
        </div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          {dupes.length > 0 && (
            <Btn variant="outline" onClick={() => setShowDupes(true)} style={{ borderColor: "#f59e0b", color: "#92400e", background: "#fef3c7" }}>
              ⚠️ {dupes.length} Duplikate
            </Btn>
          )}
          {noContactMembers.length > 0 && (
            <Btn variant="outline" onClick={() => setShowNoContact(true)} style={{ borderColor: "#dc2626", color: "#dc2626", background: "#fef2f2" }}>
              🗑️ {noContactMembers.length} ohne Kontakt
            </Btn>
          )}
          <Btn onClick={openNew}>+ Neuer Kunde</Btn>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 10, marginBottom: 14, flexWrap: "wrap" }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche Name, E-Mail, Telefon, Tag…" style={{ ...inp, flex: 1, minWidth: 200 }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...sel, width: 150 }}>
          <option value="alle">Alle Status</option>
          <option value="aktiv">Aktiv</option>
          <option value="inaktiv">Inaktiv</option>
          <option value="gekündigt">Gekündigt</option>
          <option value="ausstehend">Ausstehend</option>
        </select>
        <select value={filterSource} onChange={e => setFilterSource(e.target.value)} style={{ ...sel, width: 150 }}>
          <option value="alle">Alle Quellen</option>
          <option value="salonized">Salonized</option>
          <option value="shopify">Shopify</option>
          <option value="manual">✏️ Manuell</option>
        </select>
        <select value={sortBy} onChange={e => setSortBy(e.target.value)} style={{ ...sel, width: 150 }}>
          <option value="name">↑ Name</option>
          <option value="umsatz">↓ Umsatz</option>
          <option value="date">↓ Neueste</option>
        </select>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{ background: "#1e40af", borderRadius: 10, padding: "10px 16px", marginBottom: 14, display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: "#fff", fontWeight: 700, fontSize: 14 }}>{selected.size} ausgewählt</span>
          <div style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <Btn small variant="ghost" style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }} onClick={() => bulkSetStatus("aktiv")}>✓ Aktiv setzen</Btn>
            <Btn small variant="ghost" style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }} onClick={() => bulkSetStatus("inaktiv")}>⏸ Inaktiv</Btn>
            <Btn small variant="danger" onClick={bulkDelete}>🗑️ Löschen</Btn>
            <Btn small variant="ghost" style={{ background: "rgba(255,255,255,0.15)", color: "#fff" }} onClick={() => setSelected(new Set())}>✕</Btn>
          </div>
        </div>
      )}

      {/* Table */}
      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ padding: "12px 14px", width: 36 }}>
                <input type="checkbox" checked={selected.size === filtered.length && filtered.length > 0} onChange={toggleAll} />
              </th>
              {["Name", "E-Mail", "Plan", "Quelle", "Umsatz", "Termine", "Status", ""].map(h => (
                <th key={h} style={{ padding: "12px 12px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.04em" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr><td colSpan={9} style={{ padding: "48px", textAlign: "center", color: "#94a3b8" }}>Keine Kunden gefunden</td></tr>
            ) : filtered.map(m => {
              const sources = m.sources || (m.source ? [m.source] : []);
              return (
                <tr key={m.id} onClick={() => setProfile(m)} style={{ borderTop: "1px solid #f1f5f9", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={e => e.currentTarget.style.background = selected.has(m.id) ? "#eff6ff" : ""}>
                  <td style={{ padding: "12px 14px" }} onClick={e => toggleSelect(m.id, e)}>
                    <input type="checkbox" checked={selected.has(m.id)} onChange={() => {}} />
                  </td>
                  <td style={{ padding: "12px 12px" }}>
                    <div style={{ fontWeight: 600, color: "#1e293b", fontSize: 14 }}>{m.name}</div>
                    {m.phone && <div style={{ fontSize: 11, color: "#94a3b8" }}>{m.phone}</div>}
                  </td>
                  <td style={{ padding: "12px 12px", color: "#64748b", fontSize: 13 }}>{m.email || "—"}</td>
                  <td style={{ padding: "12px 12px", color: "#475569", fontSize: 13 }}>{m.plan || "—"}</td>
                  <td style={{ padding: "12px 12px", fontSize: 12 }}>
                    {sources.map(s => (
                      <span key={s} title={s} style={{ display: "inline-flex", alignItems: "center", marginRight: 6 }}>
                        <SourceLogo source={s} />
                      </span>
                    ))}
                  </td>
                  <td style={{ padding: "12px 12px", fontWeight: 600, color: "#059669", fontSize: 13 }}>{m.totalSpent ? fmt(m.totalSpent) : "—"}</td>
                  <td style={{ padding: "12px 12px", color: "#64748b", fontSize: 13 }}>{m.ordersCount || "—"}</td>
                  <td style={{ padding: "12px 12px" }}><Badge status={m.status || "aktiv"} /></td>
                  <td style={{ padding: "12px 12px" }}>
                    <div style={{ display: "flex", gap: 6 }} onClick={e => e.stopPropagation()}>
                      <Btn small variant="ghost" onClick={e => openEdit(m, e)}>✏️</Btn>
                      <Btn small variant="danger" onClick={e => deleteMember(m.id, e)}>🗑️</Btn>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Duplicate Manager Modal */}
      {showDupes && (
        <Modal title={`⚠️ ${dupes.length} mögliche Duplikate`} onClose={() => setShowDupes(false)} wide>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>Erkannt via E-Mail, Name oder Telefon. Wähle welchen Eintrag du behalten möchtest.</p>
          <div style={{ maxHeight: 480, overflow: "auto" }}>
            {dupes.map((d, i) => (
              <div key={i} style={{ background: "#fef9ec", border: "1px solid #fde68a", borderRadius: 10, padding: 16, marginBottom: 12 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 10 }}>Signal: {d.signal}</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  {d.members.map((m, j) => (
                    <div key={m.id} style={{ background: "#fff", borderRadius: 8, padding: 12, border: "1px solid #e2e8f0" }}>
                      <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", marginBottom: 4 }}>{m.name}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{m.email || "Keine E-Mail"}</div>
                      <div style={{ fontSize: 12, color: "#64748b" }}>{m.phone || "Kein Telefon"}</div>
                      <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                        {(m.sources || [m.source]).filter(Boolean).map(s => <SourceLogo key={s} source={s} withText size={14} />)} · Umsatz: {fmt(m.totalSpent || 0)}
                      </div>
                      <Btn small variant="success" style={{ marginTop: 8, width: "100%" }}
                        onClick={() => { mergeDupe(m.id, d.members[j === 0 ? 1 : 0].id); setShowDupes(false); }}>
                        Diesen behalten & zusammenführen
                      </Btn>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", marginTop: 12 }}>
            <Btn variant="ghost" onClick={() => setShowDupes(false)}>Schließen</Btn>
          </div>
        </Modal>
      )}

      {/* Edit Form */}
      {showForm && (
        <Modal title={editing ? "Kunde bearbeiten" : "Neuer Kunde"} onClose={() => setShowForm(false)}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="Name" required><input style={inp} value={form.name || ""} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></Field>
            <Field label="E-Mail"><input style={inp} type="email" value={form.email || ""} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} /></Field>
            <Field label="Telefon"><input style={inp} value={form.phone || ""} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></Field>
            <Field label="Geburtsdatum"><input style={inp} type="date" value={form.birthdate || ""} onChange={e => setForm(f => ({ ...f, birthdate: e.target.value }))} /></Field>
            {editing && (
              <>
                <Field label="Plan">
                  <select style={sel} value={form.plan || ""} onChange={e => setForm(f => ({ ...f, plan: e.target.value }))}>
                    <option value="">Bitte wählen</option>
                    {PLANS.map(p => <option key={p}>{p}</option>)}
                  </select>
                </Field>
                <Field label="Mitgliedschaft">
                  <select style={sel} value={form.membershipTier || "Keine Mitgliedschaft"} onChange={e => setForm(f => ({ ...f, membershipTier: e.target.value }))}>
                    {MEMBERSHIP_TIERS.map(tier => <option key={tier} value={tier}>{tier}</option>)}
                  </select>
                </Field>
                <Field label="Betrag (€)"><input style={inp} type="number" step="0.01" value={form.amount || ""} onChange={e => setForm(f => ({ ...f, amount: parseFloat(e.target.value) }))} /></Field>
                <Field label="Zahlungsintervall">
                  <select style={sel} value={form.interval || "monatlich"} onChange={e => setForm(f => ({ ...f, interval: e.target.value }))}>
                    <option value="monatlich">Monatlich</option>
                    <option value="quartalsweise">Quartalsweise</option>
                    <option value="jährlich">Jährlich</option>
                    <option value="einmalig">Einmalig</option>
                  </select>
                </Field>
                <Field label="Status">
                  <select style={sel} value={form.status || "aktiv"} onChange={e => setForm(f => ({ ...f, status: e.target.value }))}>
                    <option value="aktiv">Aktiv</option>
                    <option value="inaktiv">Inaktiv</option>
                    <option value="gekündigt">Gekündigt</option>
                    <option value="ausstehend">Ausstehend</option>
                  </select>
                </Field>
                <Field label="Startdatum"><input style={inp} type="date" value={form.startDate || today()} onChange={e => setForm(f => ({ ...f, startDate: e.target.value }))} /></Field>
                <Field label="Ablaufdatum"><input style={inp} type="date" value={form.endDate || ""} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} /></Field>
              </>
            )}
          </div>
          <Field label="Adresse"><input style={inp} value={form.address || ""} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Straße und Hausnummer" /></Field>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: "0 12px" }}>
            <Field label="PLZ"><input style={inp} value={form.zip || ""} onChange={e => setForm(f => ({ ...f, zip: e.target.value }))} /></Field>
            <Field label="Ort"><input style={inp} value={form.city || ""} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} /></Field>
            <Field label="Land"><input style={inp} value={form.country || ""} onChange={e => setForm(f => ({ ...f, country: e.target.value }))} /></Field>
          </div>
          {editing && <Field label="IBAN"><input style={inp} value={form.iban || ""} onChange={e => setForm(f => ({ ...f, iban: e.target.value }))} placeholder="DE…" /></Field>}
          <Field label="Notizen"><textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={form.notes || ""} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} /></Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn variant="ghost" onClick={() => setShowForm(false)}>Abbrechen</Btn>
            <Btn onClick={saveMember}>{editing ? "Speichern" : "Erstellen"}</Btn>
          </div>
        </Modal>
      )}

      {/* No-Contact List Modal */}
      {showNoContact && (
        <Modal title={`${noContactMembers.length} Kunden ohne Kontaktdaten`} onClose={() => setShowNoContact(false)} wide>
          <p style={{ fontSize: 13, color: "#64748b", margin: "0 0 16px" }}>Diese Kunden haben weder E-Mail noch Telefonnummer hinterlegt.</p>
          <div style={{ maxHeight: 380, overflow: "auto", marginBottom: 20 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f8fafc" }}>
                {["Name", "Adresse", "Plan", "Quelle", ""].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#64748b" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {noContactMembers.map(m => (
                  <tr key={m.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 14px", fontWeight: 600, fontSize: 13 }}>{m.name}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{[m.address, m.city].filter(Boolean).join(", ") || "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{m.plan || "—"}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12 }}>{(m.sources || [m.source]).filter(Boolean).map(s => <SourceLogo key={s} source={s} withText size={14} />)}</td>
                    <td style={{ padding: "10px 14px" }}>
                      <Btn small variant="danger" onClick={e => deleteMember(m.id, e)}>Löschen</Btn>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => setShowNoContact(false)}>Schließen</Btn>
            <Btn variant="danger" onClick={cleanupEmpty}>Alle {noContactMembers.length} löschen</Btn>
          </div>
        </Modal>
      )}

      {/* Confirm Dialog */}
      {confirm && <ConfirmDialog message={confirm.message} detail={confirm.detail} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}

      {/* Profile Drawer */}
      {profile && <MemberProfile
        member={data.members.find(m => m.id === profile.id) || profile}
        data={data}
        save={save}
        onClose={() => setProfile(null)}
        onEdit={(m) => {
          setProfile(null);
          openEdit(m);
        }}
      />}
    </div>
  );
}

// ─── Invoices ─────────────────────────────────────────────────────────────────
function Invoices({ data, save }) {
  const [showForm, setShowForm] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [printing, setPrinting] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState("alle");
  const [form, setForm] = useState({});
  const [items, setItems] = useState([{ treatmentDate: today(), desc: "", qty: 1, price: 0 }]);
  const [memberQuery, setMemberQuery] = useState("");
  const [memberPickerOpen, setMemberPickerOpen] = useState(false);
  const invoiceProfiles = data.invoiceProfiles || defaultInvoiceProfiles;
  const selectedProfile = getInvoiceProfile(data, form.invoiceProfileId);
  const isMedicalInvoice = isMedicalInvoiceProfile(selectedProfile);
  const selectedMember = data.members.find(m => m.id === form.memberId);
  const memberMatches = data.members
    .filter(member => {
      const q = memberQuery.trim().toLowerCase();
      if (!q) return true;
      return [member.name, member.email, member.phone, member.customerNumber].some(value => (value || "").toLowerCase().includes(q));
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .slice(0, 8);
  const filtered = data.invoices.filter(inv => {
    const q = search.toLowerCase();
    const matchesSearch = !q || [inv.number, inv.memberName, getInvoiceProfile(data, inv.invoiceProfileId).name].some(value => (value || "").toLowerCase().includes(q));
    const matchesStatus = filterStatus === "alle" || inv.status === filterStatus;
    return matchesSearch && matchesStatus;
  });

  const openNew = () => {
    const profile = getInvoiceProfile(data, DEFAULT_INVOICE_PROFILE_ID);
    setForm({
      invoiceProfileId: profile.id,
      number: buildInvoiceNumber(profile),
      date: today(),
      dueDate: addDays(today(), 14),
      paymentTerm: "14",
      invoiceCategory: "treatment",
      invoiceNote: "",
      status: "ausstehend",
      paymentMethod: "",
      paidDate: "",
    });
    setItems([{ treatmentDate: today(), desc: "", qty: 1, price: 0 }]);
    setMemberQuery("");
    setMemberPickerOpen(false);
    setViewing(null);
    setShowForm(true);
  };

  const openEditInvoice = (invoice) => {
    setForm({
      ...invoice,
      invoiceProfileId: invoice.invoiceProfileId || DEFAULT_INVOICE_PROFILE_ID,
      status: invoice.status || "ausstehend",
      paymentTerm: invoice.paymentTerm || "custom",
      invoiceCategory: invoice.invoiceCategory || "other",
    });
    setItems((invoice.items || []).map(item => ({
      treatmentDate: item.treatmentDate || invoice.treatmentDate || invoice.date || today(),
      desc: item.desc || "",
      qty: item.qty || 1,
      price: item.price || 0,
    })));
    setMemberQuery(invoice.memberName || "");
    setMemberPickerOpen(false);
    setViewing(null);
    setPrinting(null);
    setShowForm(true);
  };

  const saveInvoice = () => {
    if (!form.memberId || !form.invoiceProfileId) return;
    const member = data.members.find(m => m.id === form.memberId);
    const profile = getInvoiceProfile(data, form.invoiceProfileId);
    const normalizedItems = items.map(item => ({
      treatmentDate: item.treatmentDate || form.date || today(),
      desc: item.desc || "",
      qty: Number(item.qty) || 1,
      price: Number(item.price) || 0,
    }));
    const { net, tax, total } = calculateInvoiceTotals(normalizedItems, profile.defaultTaxRate);
    const isEditing = Boolean(form.id);
    const medicalProfile = isMedicalInvoiceProfile(profile);
    const invoice = {
      ...form,
      invoiceCategory: medicalProfile ? "" : (form.invoiceCategory || "other"),
      invoiceNote: medicalProfile ? "" : (form.invoiceNote || "").trim(),
      diagnosisCode: medicalProfile ? (form.diagnosisCode || "") : "",
      diagnosis: medicalProfile ? (form.diagnosis || "") : "",
      status: form.status === "bezahlt" ? "bezahlt" : (form.status || "ausstehend"),
      paymentMethod: form.status === "bezahlt" ? (form.paymentMethod || "Bar") : "",
      paidDate: form.status === "bezahlt" ? (form.paidDate || today()) : "",
      memberName: member?.name || form.memberName || "Unbekannt",
      customerAddress: formatCustomerAddress(member) || form.customerAddress || "",
      items: normalizedItems,
      net,
      tax,
      total,
      taxRate: profile.defaultTaxRate,
      id: form.id || uid(),
    };
    save(d => ({
      ...d,
      invoices: isEditing ? d.invoices.map(i => i.id === invoice.id ? invoice : i) : [...d.invoices, invoice],
      invoiceProfiles: isEditing ? (d.invoiceProfiles || defaultInvoiceProfiles) : (d.invoiceProfiles || defaultInvoiceProfiles).map(p => p.id === profile.id ? { ...p, nextInvoiceNumber: (Number(p.nextInvoiceNumber) || 0) + 1 } : p),
      settings: !isEditing && profile.id === DEFAULT_INVOICE_PROFILE_ID ? { ...d.settings, nextInvoiceNumber: (Number(profile.nextInvoiceNumber) || 0) + 1 } : d.settings,
    }));
    setShowForm(false);
  };

  const updateStatus = (id, status) => save(d => ({
    ...d,
    invoices: d.invoices.map(i => i.id === id ? {
      ...i,
      status,
      paidDate: status === "bezahlt" ? (i.paidDate || today()) : "",
      paymentMethod: status === "bezahlt" ? (i.paymentMethod || "Nicht angegeben") : "",
    } : i)
  }));

  const deleteInvoice = (id) => {
    setConfirm({
      message: "Rechnung löschen?",
      detail: "Diese Rechnung wird dauerhaft entfernt.",
      onConfirm: () => {
        save(d => ({ ...d, invoices: d.invoices.filter(i => i.id !== id) }));
        setViewing(null);
        setConfirm(null);
      }
    });
  };

  const appendInvoiceNote = (text) => setForm(current => ({
    ...current,
    invoiceNote: [current.invoiceNote?.trim(), text].filter(Boolean).join("\n").slice(0, 400),
  }));

  const InvoiceView = ({ inv }) => {
    const profile = getInvoiceProfile(data, inv.invoiceProfileId);
    const taxRate = inv.taxRate ?? profile.defaultTaxRate ?? 0;
    return (
    <Modal title={`Rechnung ${inv.number}`} onClose={() => setViewing(null)} wide>
      <div style={{ fontFamily: "Georgia, serif" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 32 }}>
          <div style={{ display: "flex", gap: 14 }}>
            <div style={{ width: 72, height: 54, display: "flex", alignItems: "center", justifyContent: "flex-start", fontWeight: 800, color: "#1e293b", overflow: "hidden" }}>
              {profile.logoUrl ? <img src={profile.logoUrl} alt={profile.companyName || "Logo"} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : (profile.logoPlaceholder || "PDB")}
            </div>
            <div>
              <div style={{ fontSize: 22, fontWeight: 800, color: "#1e293b" }}>{profile.companyName}</div>
              <div style={{ fontSize: 13, color: "#64748b", marginTop: 4, whiteSpace: "pre-line" }}>{profile.companyAddress}</div>
              <div style={{ fontSize: 13, color: "#64748b" }}>{profile.companyEmail}</div>
            </div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#1e40af" }}>RECHNUNG</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginTop: 8 }}>{inv.number}</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>Datum: {fmtDate(inv.date)}</div>
            <div style={{ fontSize: 13, color: "#64748b" }}>Fällig: {getInvoiceDueLabel(inv)}</div>
            {inv.status === "bezahlt" && <div style={{ fontSize: 13, color: "#059669" }}>Bezahlt: {fmtDate(inv.paidDate || inv.date)}{inv.paymentMethod ? ` · ${inv.paymentMethod}` : ""}</div>}
            <div style={{ marginTop: 8 }}><Badge status={inv.status} /></div>
          </div>
        </div>
        <div style={{ margin: "-16px 0 20px", fontSize: 12, fontWeight: 700, color: "#64748b", letterSpacing: 0 }}>
          Profil: {profile.name} · Design: {profile.pdfDesignVariant}{!isMedicalInvoiceProfile(profile) && ` · Art: ${getInvoiceCategoryLabel(inv.invoiceCategory)}`}
        </div>
        {isMedicalInvoiceProfile(profile) && inv.diagnosis && (
          <div style={{ background: "#f8fafc", borderRadius: 10, padding: "10px 14px", marginBottom: 18 }}>
            <div style={{ fontWeight: 700, color: "#1e293b", marginBottom: 6 }}>Befund / Diagnose</div>
            <div style={{ fontSize: 12, color: "#475569", whiteSpace: "pre-line", lineHeight: 1.35 }}>{inv.diagnosis}</div>
          </div>
        )}
        <div style={{ background: "#f8fafc", borderRadius: 10, padding: "12px 16px", marginBottom: 24 }}>
          <div style={{ fontWeight: 700, color: "#1e293b" }}>Rechnungsempfänger:</div>
          <div style={{ fontSize: 15, color: "#1e293b", marginTop: 4 }}>{inv.memberName}</div>
          {(inv.customerAddress || formatCustomerAddress(data.members.find(m => m.id === inv.memberId))) && (
            <div style={{ fontSize: 13, color: "#64748b", marginTop: 4, whiteSpace: "pre-line" }}>{inv.customerAddress || formatCustomerAddress(data.members.find(m => m.id === inv.memberId))}</div>
          )}
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 24 }}>
          <thead>
            <tr style={{ background: "#1e40af" }}>
              {[getInvoicePositionDateLabel(profile, inv.invoiceCategory), "Beschreibung", "Menge", "Einzelpreis", "Gesamt"].map(h => (
                <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#fff", fontSize: 13 }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {inv.items?.map((item, i) => (
              <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                <td style={{ padding: "10px 14px", fontSize: 13, color: "#64748b" }}>{fmtDate(item.treatmentDate || inv.date)}</td>
                <td style={{ padding: "10px 14px" }}>{item.desc}</td>
                <td style={{ padding: "10px 14px" }}>{item.qty}</td>
                <td style={{ padding: "10px 14px" }}>{fmt(item.price)}</td>
                <td style={{ padding: "10px 14px", fontWeight: 600 }}>{fmt(item.qty * item.price)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <div style={{ width: 260 }}>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", color: "#64748b" }}>
              <span>Netto</span><span>{fmt(inv.net)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", color: "#64748b" }}>
              <span>MwSt. {taxRate}%</span><span>{fmt(inv.tax)}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", fontWeight: 800, fontSize: 18, color: "#1e293b", borderTop: "2px solid #1e40af", marginTop: 4 }}>
              <span>Gesamt brutto</span><span>{fmt(inv.total)}</span>
            </div>
          </div>
        </div>
        {!isMedicalInvoiceProfile(profile) && inv.invoiceNote && (
          <div style={{ marginTop: 20, padding: "12px 14px", borderRadius: 8, background: "#fbfaf8", border: "1px solid #e8e1d6", color: "#475569", fontSize: 12, lineHeight: 1.55, whiteSpace: "pre-line" }}>{inv.invoiceNote}</div>
        )}
        <div style={{ display: "flex", gap: 10, marginTop: 24 }}>
          {inv.status !== "bezahlt" && <Btn variant="success" onClick={() => { updateStatus(inv.id, "bezahlt"); setViewing(v => ({ ...v, status: "bezahlt" })); }}>✓ Als bezahlt markieren</Btn>}
          <Btn variant="ghost" onClick={() => openEditInvoice(inv)}>Bearbeiten</Btn>
          <Btn variant="ghost" onClick={() => { setPrinting(inv); setViewing(null); }}>🖨️ Drucken / PDF</Btn>
          <Btn variant="danger" onClick={() => deleteInvoice(inv.id)}>🗑️ Löschen</Btn>
        </div>
        <div style={{ marginTop: 24, paddingTop: 14, borderTop: "1px solid #e2e8f0", fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
          {[profile.taxNumber && `Steuernummer: ${profile.taxNumber}`, profile.vatId && `USt-ID: ${profile.vatId}`, profile.bankName, profile.iban && `IBAN: ${profile.iban}`, profile.bic && `BIC: ${profile.bic}`].filter(Boolean).map(line => <div key={line}>{line}</div>)}
        </div>
      </div>
    </Modal>
  ); };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#1e293b" }}>Rechnungen</h2>
        <Btn onClick={openNew}>+ Neue Rechnung</Btn>
      </div>

      <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Suche…" style={{ ...inp, flex: 1 }} />
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...sel, width: 180 }}>
          <option value="alle">Alle Status</option>
          <option value="ausstehend">Ausstehend</option>
          <option value="bezahlt">Bezahlt</option>
          <option value="überfällig">Überfällig</option>
          <option value="entwurf">Entwurf</option>
        </select>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Nummer", "Profil", "Kunde", "Datum", "Fällig", "Betrag", "Status", ""].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? <tr><td colSpan={8} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Keine Rechnungen</td></tr> :
              filtered.map(inv => (
                <tr key={inv.id} style={{ borderTop: "1px solid #f1f5f9", cursor: "pointer" }}
                  onMouseEnter={e => e.currentTarget.style.background = "#f8fafc"}
                  onMouseLeave={e => e.currentTarget.style.background = ""}
                  onClick={() => setPrinting(inv)}>
                  <td style={{ padding: "14px 16px", fontWeight: 600, color: "#1e40af" }}>{inv.number}</td>
                  <td style={{ padding: "14px 16px", color: "#64748b", fontSize: 13 }}>{getInvoiceProfile(data, inv.invoiceProfileId).name}</td>
                  <td style={{ padding: "14px 16px", color: "#1e293b" }}>{inv.memberName}</td>
                  <td style={{ padding: "14px 16px", color: "#64748b", fontSize: 13 }}>{fmtDate(inv.date)}</td>
                  <td style={{ padding: "14px 16px", color: inv.status === "überfällig" ? "#dc2626" : "#64748b", fontSize: 13 }}>{getInvoiceDueLabel(inv)}</td>
                  <td style={{ padding: "14px 16px", fontWeight: 700 }}>{fmt(inv.total)}</td>
                  <td style={{ padding: "14px 16px" }}><Badge status={inv.status} /></td>
                  <td style={{ padding: "14px 16px" }} onClick={e => e.stopPropagation()}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn small variant="ghost" onClick={() => openEditInvoice(inv)}>Bearbeiten</Btn>
                      {inv.status !== "bezahlt" && <Btn small variant="success" onClick={() => updateStatus(inv.id, "bezahlt")}>✓</Btn>}
                      <Btn small variant="danger" onClick={() => deleteInvoice(inv.id)}>🗑️</Btn>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>

      {viewing && <InvoiceView inv={viewing} />}
      {printing && <InvoicePrintView
        inv={{ ...printing, customerAddress: printing.customerAddress || formatCustomerAddress(data.members.find(m => m.id === printing.memberId)) }}
        profile={getInvoiceProfile(data, printing.invoiceProfileId)}
        onClose={() => setPrinting(null)}
        Button={Btn}
      />}
      {confirm && <ConfirmDialog message={confirm.message} detail={confirm.detail} onConfirm={confirm.onConfirm} onCancel={() => setConfirm(null)} />}

      {showForm && (
        <Modal title={form.id ? `Rechnung ${form.number} bearbeiten` : "Neue Rechnung"} onClose={() => setShowForm(false)} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="Rechnungsprofil" required>
              <select
                aria-label="Rechnungsprofil"
                style={sel}
                value={form.invoiceProfileId || ""}
                onChange={e => {
                  const profile = getInvoiceProfile(data, e.target.value);
                  setForm(f => ({ ...f, invoiceProfileId: profile.id, number: f.id ? f.number : buildInvoiceNumber(profile) }));
                }}
              >
                {invoiceProfiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
              </select>
            </Field>
            <Field label="Rechnungsnummer"><input style={inp} value={form.number || ""} onChange={e => setForm(f => ({ ...f, number: e.target.value }))} /></Field>
            {!isMedicalInvoice && (
              <Field label="Rechnungsart">
                <select aria-label="Rechnungsart" style={sel} value={form.invoiceCategory || "treatment"} onChange={e => setForm(f => ({ ...f, invoiceCategory: e.target.value }))}>
                  {PDB_INVOICE_CATEGORIES.map(category => <option key={category.value} value={category.value}>{category.label}</option>)}
                </select>
              </Field>
            )}
            <Field label="Kunde suchen" required>
              <input
                style={inp}
                value={memberQuery}
                placeholder="Name, E-Mail oder Telefon eingeben…"
                onFocus={() => setMemberPickerOpen(true)}
                onChange={e => {
                  setMemberQuery(e.target.value);
                  setForm(f => ({ ...f, memberId: "" }));
                  setMemberPickerOpen(true);
                }}
              />
              {selectedMember && !memberPickerOpen && (
                <div style={{ marginTop: 8, padding: "10px 12px", background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: 10 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{selectedMember.name}</div>
                  <div style={{ fontSize: 12, color: "#64748b" }}>{[selectedMember.email, selectedMember.phone].filter(Boolean).join(" · ") || "Keine Kontaktdaten"}</div>
                </div>
              )}
              {memberPickerOpen && (
                <div style={{ marginTop: 8, border: "1px solid #e2e8f0", borderRadius: 10, maxHeight: 220, overflow: "auto", background: "#fff" }}>
                  {memberMatches.length === 0 ? (
                    <div style={{ padding: "12px", fontSize: 13, color: "#94a3b8" }}>Keine Kunden gefunden</div>
                  ) : memberMatches.map(member => (
                    <button
                      key={member.id}
                      type="button"
                      onClick={() => {
                        setForm(f => ({ ...f, memberId: member.id }));
                        setMemberQuery(member.name || "");
                        setMemberPickerOpen(false);
                      }}
                      style={{
                        display: "block",
                        width: "100%",
                        padding: "10px 12px",
                        textAlign: "left",
                        border: "none",
                        borderBottom: "1px solid #f1f5f9",
                        background: form.memberId === member.id ? "#eff6ff" : "#fff",
                        cursor: "pointer",
                      }}
                    >
                      <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{member.name || "Unbenannter Kunde"}</div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{[member.email, member.phone].filter(Boolean).join(" · ") || "Keine Kontaktdaten"}</div>
                    </button>
                  ))}
                </div>
              )}
            </Field>
            <Field label="Rechnungsdatum"><input style={inp} type="date" value={form.date || today()} onChange={e => setForm(f => ({
              ...f,
              date: e.target.value,
              dueDate: calculateInvoiceDueDate(e.target.value, f.paymentTerm || "14", f.dueDate),
            }))} /></Field>
            <Field label="Zahlungsziel">
              <div style={{ display: "grid", gridTemplateColumns: form.paymentTerm === "custom" ? "1fr 1fr" : "1fr", gap: 8 }}>
                <select aria-label="Zahlungsziel" style={sel} value={form.paymentTerm || "14"} onChange={e => setForm(f => ({
                  ...f,
                  paymentTerm: e.target.value,
                  dueDate: calculateInvoiceDueDate(f.date || today(), e.target.value, f.dueDate),
                }))}>
                  {INVOICE_PAYMENT_TERMS.map(term => <option key={term.value} value={term.value}>{term.label}</option>)}
                </select>
                {form.paymentTerm === "custom" && <input style={inp} type="date" value={form.dueDate || ""} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} />}
              </div>
              {form.paymentTerm !== "custom" && <div style={{ marginTop: 6, fontSize: 11, color: "#64748b" }}>Fällig: {form.paymentTerm === "sofort" ? "sofort" : fmtDate(form.dueDate)}</div>}
            </Field>
            <Field label="Zahlungsstatus">
              <select style={sel} value={form.status || "ausstehend"} onChange={e => setForm(f => ({
                ...f,
                status: e.target.value,
                paidDate: e.target.value === "bezahlt" ? (f.paidDate || today()) : "",
                paymentMethod: e.target.value === "bezahlt" ? (f.paymentMethod || "Bar") : "",
              }))}>
                <option value="ausstehend">Noch offen</option>
                <option value="bezahlt">Bereits bezahlt</option>
              </select>
            </Field>
            {form.status === "bezahlt" && (
              <Field label="Zahlungsart / Datum">
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <select style={sel} value={form.paymentMethod || "Bar"} onChange={e => setForm(f => ({ ...f, paymentMethod: e.target.value }))}>
                    <option value="Bar">Bar</option>
                    <option value="EC">EC</option>
                    <option value="Kreditkarte">Kreditkarte</option>
                    <option value="Überweisung">Überweisung</option>
                    <option value="PayPal">PayPal</option>
                    <option value="Shopify Payments">Shopify Payments</option>
                  </select>
                  <input style={inp} type="date" value={form.paidDate || today()} onChange={e => setForm(f => ({ ...f, paidDate: e.target.value }))} />
                </div>
              </Field>
            )}
          </div>

          {isMedicalInvoice && <Field label="Befund / Diagnose">
            <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 8, marginBottom: 8 }}>
              <input style={inp} value={form.diagnosisCode || ""} placeholder="z.B. HWS, BWS, LWS" onChange={e => setForm(f => ({ ...f, diagnosisCode: e.target.value }))} />
              <Btn variant="outline" onClick={() => setForm(f => ({ ...f, diagnosis: buildDiagnosisSuggestion(f.diagnosisCode) }))}>Smart ausfüllen</Btn>
            </div>
            <textarea
              style={{ ...inp, minHeight: 96, resize: "vertical", lineHeight: 1.35, fontSize: 13 }}
              value={form.diagnosis || ""}
              placeholder="Befund, Symptome, Ursache und Behandlungsmöglichkeiten dokumentieren…"
              onChange={e => setForm(f => ({ ...f, diagnosis: e.target.value }))}
            />
          </Field>}

          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", fontSize: 13, fontWeight: 600, color: "#475569", marginBottom: 8 }}>Positionen</label>
            <div style={{ display: "grid", gridTemplateColumns: "140px 1fr 80px 120px 40px", gap: 8, marginBottom: 6, fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase" }}>
              <span>{getInvoicePositionDateLabel(selectedProfile, form.invoiceCategory)}</span>
              <span>Beschreibung</span>
              <span>Menge</span>
              <span>Preis</span>
              <span></span>
            </div>
            {items.map((item, i) => (
              <div key={i} style={{ display: "grid", gridTemplateColumns: "140px 1fr 80px 120px 40px", gap: 8, marginBottom: 8 }}>
                <input style={inp} type="date" title={getInvoicePositionDateLabel(selectedProfile, form.invoiceCategory)} value={item.treatmentDate || form.date || today()} onChange={e => setItems(items.map((it, j) => j === i ? { ...it, treatmentDate: e.target.value } : it))} />
                <input style={inp} placeholder="Beschreibung" value={item.desc} onChange={e => setItems(items.map((it, j) => j === i ? { ...it, desc: e.target.value } : it))} />
                <input style={inp} type="number" min="1" placeholder="Menge" value={item.qty} onChange={e => setItems(items.map((it, j) => j === i ? { ...it, qty: parseFloat(e.target.value) || 1 } : it))} />
                <input style={inp} type="number" step="0.01" placeholder="Preis €" value={item.price} onChange={e => setItems(items.map((it, j) => j === i ? { ...it, price: parseFloat(e.target.value) || 0 } : it))} />
                <button onClick={() => setItems(items.filter((_, j) => j !== i))} style={{ background: "#fee2e2", border: "none", borderRadius: 8, cursor: "pointer", color: "#dc2626", fontWeight: 700 }}>×</button>
              </div>
            ))}
            <Btn small variant="ghost" onClick={() => setItems([...items, { treatmentDate: form.date || today(), desc: "", qty: 1, price: 0 }])}>+ Position hinzufügen</Btn>
          </div>

          {!isMedicalInvoice && (
            <Field label="Text auf der Rechnung">
              <div style={{ background: "#fbfaf8", border: "1px solid #e8e1d6", borderRadius: 10, padding: 12 }}>
                <textarea
                  aria-label="Text auf der Rechnung"
                  style={{ ...inp, minHeight: 70, resize: "vertical", lineHeight: 1.45, fontSize: 13, background: "#fff" }}
                  value={form.invoiceNote || ""}
                  maxLength={400}
                  placeholder="Optionaler Dankes- oder Zahlungshinweis für die PDF…"
                  onChange={e => setForm(f => ({ ...f, invoiceNote: e.target.value }))}
                />
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginTop: 8 }}>
                  <span style={{ fontSize: 11, color: "#8a7965", fontWeight: 700 }}>Textbausteine</span>
                  <Btn small variant="ghost" onClick={() => appendInvoiceNote("Vielen Dank für Ihr Vertrauen in PDB Aesthetic Room.")}>Dank ergänzen</Btn>
                  <Btn small variant="ghost" disabled={form.paymentTerm === "custom" && !form.dueDate} onClick={() => appendInvoiceNote(form.paymentTerm === "sofort"
                    ? "Der Rechnungsbetrag ist sofort ohne Abzug fällig."
                    : `Bitte begleichen Sie den Rechnungsbetrag bis zum ${fmtDate(form.dueDate)}.`)}>Zahlungshinweis ergänzen</Btn>
                  <span style={{ marginLeft: "auto", fontSize: 10, color: "#a59480" }}>{(form.invoiceNote || "").length}/400</span>
                </div>
              </div>
            </Field>
          )}

          <div style={{ background: "#f8fafc", borderRadius: 10, padding: 16, marginBottom: 16 }}>
            {(() => {
              const { net, tax } = calculateInvoiceTotals(items, selectedProfile.defaultTaxRate);
              return (
                <>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", marginBottom: 4 }}><span>Netto</span><span>{fmt(net)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", color: "#64748b", marginBottom: 4 }}><span>MwSt. {selectedProfile.defaultTaxRate}%</span><span>{fmt(tax)}</span></div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 800, fontSize: 16, color: "#1e293b", borderTop: "1px solid #e2e8f0", paddingTop: 8 }}><span>Gesamt brutto</span><span>{fmt(net + tax)}</span></div>
                </>
              );
            })()}
          </div>

          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <Btn variant="ghost" onClick={() => setShowForm(false)}>Abbrechen</Btn>
            <Btn onClick={saveInvoice}>{form.id ? "Änderungen speichern" : "Rechnung erstellen"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ─── Reminders / Mahnwesen ────────────────────────────────────────────────────
function Reminders({ data, save }) {
  const overdueInvoices = data.invoices.filter(i => i.status === "überfällig" || i.status?.includes("Mahnung"));

  const sendReminder = (inv) => {
    const levels = ["1. Mahnung", "2. Mahnung", "3. Mahnung"];
    const current = levels.indexOf(inv.status);
    const nextStatus = current === -1 ? "1. Mahnung" : current < 2 ? levels[current + 1] : "3. Mahnung";
    const fee = current === -1 ? 0 : current === 0 ? 5 : current === 1 ? 15 : 40;

    save(d => ({
      ...d,
      invoices: d.invoices.map(i => i.id === inv.id ? { ...i, status: nextStatus, reminderFee: (i.reminderFee || 0) + fee, lastReminder: today() } : i),
    }));
    alert(`${nextStatus} für ${inv.memberName} wurde ausgestellt.\nMahngebühr: ${fmt(fee)}`);
  };

  const markPaid = (id) => save(d => ({ ...d, invoices: d.invoices.map(i => i.id === id ? { ...i, status: "bezahlt" } : i) }));

  const daysSince = (d) => d ? Math.floor((Date.now() - new Date(d)) / 86400000) : "—";

  return (
    <div>
      <h2 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 800, color: "#1e293b" }}>Mahnwesen</h2>
      <p style={{ margin: "0 0 24px", color: "#64748b", fontSize: 14 }}>{overdueInvoices.length} ausstehende / gemahnte Rechnungen</p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16, marginBottom: 28 }}>
        {[["1. Mahnung", "#fef3c7", "#92400e", 5], ["2. Mahnung", "#fed7aa", "#9a3412", 15], ["3. Mahnung", "#fee2e2", "#991b1b", 40]].map(([level, bg, color, fee]) => {
          const count = data.invoices.filter(i => i.status === level).length;
          return (
            <div key={level} style={{ background: bg, borderRadius: 14, padding: "18px 20px" }}>
              <div style={{ fontSize: 22, fontWeight: 800, color }}>{count}</div>
              <div style={{ fontSize: 14, fontWeight: 600, color, marginTop: 4 }}>{level}</div>
              <div style={{ fontSize: 12, color, opacity: 0.8, marginTop: 2 }}>Mahngebühr: {fmt(fee)}</div>
            </div>
          );
        })}
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              {["Kunde", "Rechnung", "Betrag", "Fällig seit", "Status", "Letzte Mahnung", ""].map(h => (
                <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {overdueInvoices.length === 0 ? <tr><td colSpan={7} style={{ padding: 40, textAlign: "center", color: "#94a3b8" }}>Keine überfälligen Rechnungen 🎉</td></tr> :
              overdueInvoices.map(inv => (
                <tr key={inv.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "14px 16px", fontWeight: 600, color: "#1e293b" }}>{inv.memberName}</td>
                  <td style={{ padding: "14px 16px", color: "#1e40af", fontSize: 13 }}>{inv.number}</td>
                  <td style={{ padding: "14px 16px", fontWeight: 700 }}>{fmt(inv.total + (inv.reminderFee || 0))}</td>
                  <td style={{ padding: "14px 16px", color: "#dc2626", fontSize: 13 }}>{daysSince(inv.dueDate)} Tage</td>
                  <td style={{ padding: "14px 16px" }}><Badge status={inv.status} /></td>
                  <td style={{ padding: "14px 16px", color: "#64748b", fontSize: 13 }}>{fmtDate(inv.lastReminder)}</td>
                  <td style={{ padding: "14px 16px" }}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <Btn small variant="outline" onClick={() => sendReminder(inv)}>📨 Mahnen</Btn>
                      <Btn small variant="success" onClick={() => markPaid(inv.id)}>✓ Bezahlt</Btn>
                    </div>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Bank Upload ──────────────────────────────────────────────────────────────
function BankUpload({ data, save }) {
  const [dragging, setDragging] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [preview, setPreview] = useState(null);
  const fileRef = useRef();

  const parseCSV = (text) => {
    const lines = text.split("\n").filter(l => l.trim());
    const transactions = [];
    for (const line of lines) {
      const cols = line.split(/[;,]/).map(c => c.replace(/^["']|["']$/g, "").trim());
      if (cols.length < 3) continue;
      const amount = parseFloat(cols.find(c => /^-?\d+[.,]\d{2}$/.test(c.replace(",", ".")))?.replace(",", ".") || "0");
      if (!amount) continue;
      const dateStr = cols.find(c => /\d{2}[./]\d{2}[./]\d{4}|\d{4}-\d{2}-\d{2}/.test(c));
      const date = dateStr ? (dateStr.includes("-") ? dateStr : dateStr.split(/[./]/).reverse().join("-")) : today();
      const nameCol = cols.find(c => c.length > 3 && !/\d{2}[./]/.test(c) && !/^-?\d/.test(c));
      transactions.push({ id: uid(), date, name: nameCol || "Unbekannt", amount, purpose: cols.slice(-1)[0] || "", matched: false });
    }
    return transactions;
  };

  const handleFile = async (file) => {
    if (!file) return;
    setParsing(true);
    const text = await file.text();
    let transactions = [];
    if (file.name.endsWith(".csv") || file.name.endsWith(".txt")) {
      transactions = parseCSV(text);
    } else {
      alert("Bitte eine CSV- oder TXT-Datei hochladen (Bankexport).");
      setParsing(false);
      return;
    }
    setPreview(transactions);
    setParsing(false);
  };

  const importTransactions = () => {
    if (!preview) return;
    save(d => ({ ...d, bankTransactions: [...(d.bankTransactions || []), ...preview] }));
    setPreview(null);
    alert(`${preview.length} Transaktionen importiert!`);
  };

  const matchTransaction = (txId, invoiceId) => {
    save(d => ({
      ...d,
      bankTransactions: d.bankTransactions.map(t => t.id === txId ? { ...t, matched: true, invoiceId } : t),
      invoices: invoiceId ? d.invoices.map(i => i.id === invoiceId ? { ...i, status: "bezahlt" } : i) : d.invoices,
    }));
  };

  const unmatchedInvoices = data.invoices.filter(i => i.status === "ausstehend" || i.status === "überfällig");

  return (
    <div>
      <h2 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 800, color: "#1e293b" }}>Kontoauszüge</h2>
      <p style={{ margin: "0 0 24px", color: "#64748b", fontSize: 14 }}>CSV-Exporte deiner Bank hochladen und mit Rechnungen abgleichen.</p>

      <div
        onDragOver={e => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]); }}
        onClick={() => fileRef.current?.click()}
        style={{
          border: `2px dashed ${dragging ? "#1e40af" : "#cbd5e1"}`,
          borderRadius: 16, padding: "48px 32px", textAlign: "center", cursor: "pointer",
          background: dragging ? "#eff6ff" : "#f8fafc", marginBottom: 28, transition: "all 0.2s",
        }}>
        <input ref={fileRef} type="file" accept=".csv,.txt" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
        <div style={{ fontSize: 40, marginBottom: 12 }}>📂</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: "#1e293b" }}>CSV-Datei hier ablegen</div>
        <div style={{ fontSize: 13, color: "#94a3b8", marginTop: 6 }}>oder klicken zum Auswählen · Sparkasse, DKB, Commerzbank, ING-Format</div>
        {parsing && <div style={{ marginTop: 12, color: "#1e40af", fontWeight: 600 }}>Wird verarbeitet…</div>}
      </div>

      {preview && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: 20, marginBottom: 24 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Vorschau: {preview.length} Transaktionen</h3>
            <div style={{ display: "flex", gap: 10 }}>
              <Btn variant="ghost" onClick={() => setPreview(null)}>Verwerfen</Btn>
              <Btn variant="success" onClick={importTransactions}>✓ Importieren</Btn>
            </div>
          </div>
          <div style={{ maxHeight: 300, overflow: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ background: "#f8fafc" }}>
                {["Datum", "Name", "Betrag", "Verwendungszweck"].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#64748b" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {preview.map(t => (
                  <tr key={t.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "10px 14px", fontSize: 13 }}>{fmtDate(t.date)}</td>
                    <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 500 }}>{t.name}</td>
                    <td style={{ padding: "10px 14px", fontWeight: 700, color: t.amount >= 0 ? "#059669" : "#dc2626" }}>{fmt(t.amount)}</td>
                    <td style={{ padding: "10px 14px", fontSize: 12, color: "#94a3b8" }}>{t.purpose}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {data.bankTransactions.length > 0 && (
        <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Importierte Transaktionen</h3>
            <span style={{ fontSize: 13, color: "#94a3b8" }}>{data.bankTransactions.length} gesamt</span>
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f8fafc" }}>
              {["Datum", "Name", "Betrag", "Verwendungszweck", "Zuordnung", ""].map(h => <th key={h} style={{ padding: "12px 16px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {[...data.bankTransactions].reverse().map(t => (
                <tr key={t.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 16px", fontSize: 13 }}>{fmtDate(t.date)}</td>
                  <td style={{ padding: "12px 16px", fontWeight: 500 }}>{t.name}</td>
                  <td style={{ padding: "12px 16px", fontWeight: 700, color: t.amount >= 0 ? "#059669" : "#dc2626" }}>{fmt(t.amount)}</td>
                  <td style={{ padding: "12px 16px", fontSize: 12, color: "#94a3b8", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis" }}>{t.purpose}</td>
                  <td style={{ padding: "12px 16px" }}>
                    {t.matched ? <Badge status="bezahlt" /> :
                      <select style={{ ...sel, width: 160, fontSize: 12, padding: "5px 8px" }}
                        onChange={e => e.target.value && matchTransaction(t.id, e.target.value)}>
                        <option value="">Rechnung zuordnen…</option>
                        {unmatchedInvoices.map(i => <option key={i.id} value={i.id}>{i.number} – {i.memberName} ({fmt(i.total)})</option>)}
                      </select>}
                  </td>
                  <td style={{ padding: "12px 16px" }}>
                    {!t.matched && <span style={{ fontSize: 12, color: "#f59e0b", fontWeight: 600 }}>○ offen</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ─── Settings ─────────────────────────────────────────────────────────────────
function Settings({ data, save }) {
  const [profiles, setProfiles] = useState(data.invoiceProfiles || defaultInvoiceProfiles);

  const saveSettings = () => {
    const primaryProfile = profiles.find(profile => profile.id === DEFAULT_INVOICE_PROFILE_ID) || profiles[0];
    save(d => ({
      ...d,
      invoiceProfiles: profiles,
      settings: {
        ...d.settings,
        companyName: primaryProfile.companyName,
        companyAddress: primaryProfile.companyAddress,
        companyEmail: primaryProfile.companyEmail,
        taxNumber: primaryProfile.taxNumber,
        invoicePrefix: primaryProfile.invoicePrefix,
        nextInvoiceNumber: primaryProfile.nextInvoiceNumber,
        taxRate: primaryProfile.defaultTaxRate,
      },
    }));
    alert("Einstellungen gespeichert!");
  };

  const updateProfile = (id, patch) => {
    setProfiles(current => current.map(profile => profile.id === id ? { ...profile, ...patch } : profile));
  };

  const addProfile = () => {
    const id = `profile-${uid()}`;
    setProfiles(current => [
      ...current,
      {
        ...defaultInvoiceProfiles[0],
        id,
        name: "Neues Rechnungsprofil",
        companyName: "",
        companyAddress: "",
        companyEmail: "",
        taxNumber: "",
        vatId: "",
        iban: "",
        bic: "",
        bankName: "",
        logoUrl: "",
        logoPlaceholder: "LOGO",
        invoicePrefix: "RE",
        nextInvoiceNumber: 1001,
      },
    ]);
  };

  const exportData = () => {
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `crm-backup-${today()}.json`; a.click();
  };

  const importData = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        save(() => migrateData(imported));
        alert("Daten erfolgreich importiert!");
      } catch { alert("Ungültige Datei."); }
    };
    reader.readAsText(file);
  };

  return (
    <div>
      <h2 style={{ margin: "0 0 24px", fontSize: 26, fontWeight: 800, color: "#1e293b" }}>Einstellungen</h2>

      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: 24, marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
          <div>
            <h3 style={{ margin: "0 0 4px", fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Rechnungsprofile</h3>
            <p style={{ margin: 0, fontSize: 13, color: "#64748b" }}>Jede Rechnung verwendet künftig ein eigenes Profil mit Nummernkreis, Bankdaten und PDF-Design.</p>
          </div>
          <Btn variant="outline" onClick={addProfile}>+ Profil</Btn>
        </div>

        {profiles.map(profile => (
          <div key={profile.id} style={{ border: "1px solid #e2e8f0", borderRadius: 12, padding: 18, marginBottom: 16, background: "#fcfcfb" }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#1e293b" }}>{profile.name || "Unbenanntes Profil"}</div>
                <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>ID: {profile.id}</div>
              </div>
              <Badge status={profile.pdfDesignVariant || "pdb-premium"} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
              <Field label="Profilname"><input style={inp} value={profile.name || ""} onChange={e => updateProfile(profile.id, { name: e.target.value })} /></Field>
              <Field label="Firmen-/Praxisname"><input style={inp} value={profile.companyName || ""} onChange={e => updateProfile(profile.id, { companyName: e.target.value })} /></Field>
              <Field label="E-Mail"><input style={inp} value={profile.companyEmail || ""} onChange={e => updateProfile(profile.id, { companyEmail: e.target.value })} /></Field>
              <Field label="Logo-Platzhalter"><input style={inp} value={profile.logoPlaceholder || ""} onChange={e => updateProfile(profile.id, { logoPlaceholder: e.target.value })} /></Field>
              <Field label="Logo URL/Pfad"><input style={inp} value={profile.logoUrl || ""} placeholder="/pdb-logo.png oder https://…" onChange={e => updateProfile(profile.id, { logoUrl: e.target.value })} /></Field>
              <Field label="Steuernummer"><input style={inp} value={profile.taxNumber || ""} onChange={e => updateProfile(profile.id, { taxNumber: e.target.value })} /></Field>
              <Field label="USt-ID"><input style={inp} value={profile.vatId || ""} onChange={e => updateProfile(profile.id, { vatId: e.target.value })} /></Field>
              <Field label="Bankname"><input style={inp} value={profile.bankName || ""} onChange={e => updateProfile(profile.id, { bankName: e.target.value })} /></Field>
              <Field label="IBAN"><input style={inp} value={profile.iban || ""} onChange={e => updateProfile(profile.id, { iban: e.target.value })} /></Field>
              <Field label="BIC"><input style={inp} value={profile.bic || ""} onChange={e => updateProfile(profile.id, { bic: e.target.value })} /></Field>
              <Field label="Rechnungspräfix"><input style={inp} value={profile.invoicePrefix || ""} onChange={e => updateProfile(profile.id, { invoicePrefix: e.target.value })} /></Field>
              <Field label="Nächste Rechnungsnummer"><input style={inp} type="number" value={profile.nextInvoiceNumber || 1001} onChange={e => updateProfile(profile.id, { nextInvoiceNumber: parseInt(e.target.value) || 1001 })} /></Field>
              <Field label="Standard-MwSt. (%)"><input style={inp} type="number" value={profile.defaultTaxRate ?? 0} onChange={e => updateProfile(profile.id, { defaultTaxRate: parseFloat(e.target.value) || 0 })} /></Field>
              <Field label="PDF-Design">
                <select style={sel} value={profile.pdfDesignVariant || "pdb-premium"} onChange={e => updateProfile(profile.id, { pdfDesignVariant: e.target.value })}>
                  <option value="pdb-premium">PDB Premium</option>
                  <option value="medical-clean">Medical Clean</option>
                  <option value="classic">Classic</option>
                </select>
              </Field>
            </div>
            <Field label="Adresse"><textarea style={{ ...inp, minHeight: 58, resize: "vertical" }} value={profile.companyAddress || ""} onChange={e => updateProfile(profile.id, { companyAddress: e.target.value })} /></Field>
          </div>
        ))}
        <Btn onClick={saveSettings}>Speichern</Btn>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", padding: 24 }}>
        <h3 style={{ margin: "0 0 16px", fontSize: 16, fontWeight: 700, color: "#1e293b" }}>Daten-Backup</h3>
        <div style={{ display: "flex", gap: 12 }}>
          <Btn variant="outline" onClick={exportData}>📥 Daten exportieren (JSON)</Btn>
          <label style={{ cursor: "pointer" }}>
            <input type="file" accept=".json" style={{ display: "none" }} onChange={importData} />
            <span style={{ display: "inline-block", background: "#f1f5f9", color: "#475569", borderRadius: 8, padding: "9px 18px", fontWeight: 600, fontSize: 14, cursor: "pointer" }}>📤 Daten importieren</span>
          </label>
        </div>
        <p style={{ margin: "12px 0 0", fontSize: 12, color: "#94a3b8" }}>Alle Daten werden lokal in deinem Browser gespeichert. Regelmäßige Backups empfohlen.</p>
      </div>
    </div>
  );
}

// ─── Unified Import (Shopify + Salonized) ────────────────────────────────────
function ShopifyImport({ data, save, onNavigate }) {
  const [dragging, setDragging] = useState(false);
  const [step, setStep] = useState("upload");
  const [source, setSource] = useState(null); // "shopify" | "salonized"
  const [rawRows, setRawRows] = useState([]);
  const [headers, setHeaders] = useState([]);
  const [mapping, setMapping] = useState({});
  const [preview, setPreview] = useState([]);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState(null);
  const [duplicateMode, setDuplicateMode] = useState("merge");
  const fileRef = useRef();

  const CRM_FIELDS = [
    { key: "name",         label: "Name",                required: true },
    { key: "email",        label: "E-Mail",              required: false },
    { key: "phone",        label: "Telefon",             required: false },
    { key: "address",      label: "Adresse",             required: false },
    { key: "city",         label: "Stadt",               required: false },
    { key: "zip",          label: "PLZ",                 required: false },
    { key: "country",      label: "Land",                required: false },
    { key: "tags",         label: "Tags / Plan",         required: false },
    { key: "totalSpent",   label: "Gesamtumsatz (€)",    required: false },
    { key: "ordersCount",  label: "Bestellungen/Termine",required: false },
    { key: "createdAt",    label: "Erstellt am",         required: false },
    { key: "birthdate",    label: "Geburtsdatum",        required: false },
    { key: "gender",       label: "Geschlecht",          required: false },
    { key: "loyaltyPoints",label: "Treuepunkte",         required: false },
    { key: "notes",        label: "Notizen / Alerts",    required: false },
  ];

  // ── Salonized exact column map ──────────────────────────────────────────────
  const SALONIZED_MAP = {
    "salonized_id":      "_ignore",
    "first_name":        "_firstName",
    "last_name":         "_lastName",
    "email":             "email",
    "gender":            "gender",
    "address":           "address",
    "zipcode":           "zip",
    "city":              "city",
    "phone":             "phone",
    "mobile_phone":      "_mobile",
    "alert_notes":       "notes",
    "newsletter_optin":  "_ignore",
    "date_of_birth":     "birthdate",
    "loyalty_points":    "loyaltyPoints",
    "no_show_count":     "_ignore",
    "total_spent":       "totalSpent",
    "total_due":         "_ignore",
    "appointment_count": "ordersCount",
    "created":           "createdAt",
  };

  // ── Shopify exact column map ─────────────────────────────────────────────────
  const SHOPIFY_MAP = {
    "First Name":               "_firstName",
    "Last Name":                "_lastName",
    "Email":                    "email",
    "Phone":                    "phone",
    "Address1":                 "address",
    "Address2":                 "_addr2",
    "City":                     "city",
    "Province":                 "_ignore",
    "Country":                  "country",
    "Zip":                      "zip",
    "Tags":                     "tags",
    "Total Spent":              "totalSpent",
    "Total Orders":             "ordersCount",
    "Note":                     "notes",
    "Created at":               "createdAt",
    "Accepts Email Marketing":  "_ignore",
    "Accepts SMS Marketing":    "_ignore",
    "Tax Exempt":               "_ignore",
    "Company":                  "_ignore",
    "Province Code":            "_ignore",
    "Country Code":             "_ignore",
  };

  const detectSource = (hdrs) => {
    if (hdrs.includes("salonized_id") || hdrs.includes("mobile_phone") || hdrs.includes("loyalty_points")) return "salonized";
    if (hdrs.includes("First Name") || hdrs.includes("Total Orders")) return "shopify";
    return null;
  };

  const autoMap = (hdrs, src) => {
    const refMap = src === "salonized" ? SALONIZED_MAP : SHOPIFY_MAP;
    const m = {};
    hdrs.forEach((h, i) => {
      const mapped = refMap[h];
      if (mapped && mapped !== "_ignore") m[i] = mapped;
      else if (!mapped) {
        const hl = h.toLowerCase();
        if (hl.includes("first")) m[i] = "_firstName";
        else if (hl.includes("last")) m[i] = "_lastName";
        else if (hl.includes("email")) m[i] = "email";
        else if (hl.includes("mobile") || hl.includes("handy")) m[i] = "_mobile";
        else if (hl.includes("phone") || hl.includes("tel")) m[i] = "phone";
        else if (hl.includes("city") || hl.includes("ort") || hl.includes("stadt")) m[i] = "city";
        else if (hl.includes("zip") || hl.includes("plz") || hl.includes("postal")) m[i] = "zip";
        else if (hl.includes("country") || hl.includes("land")) m[i] = "country";
        else if (hl.includes("birth") || hl.includes("geburt")) m[i] = "birthdate";
        else if (hl.includes("loyalty") || hl.includes("punkte")) m[i] = "loyaltyPoints";
        else if (hl.includes("tag")) m[i] = "tags";
        else if (hl.includes("spent") || hl.includes("umsatz")) m[i] = "totalSpent";
        else if (hl.includes("order") || hl.includes("appoint") || hl.includes("bestell")) m[i] = "ordersCount";
        else if (hl.includes("note") || hl.includes("alert") || hl.includes("notiz")) m[i] = "notes";
        else if (hl.includes("created") || hl.includes("erstellt")) m[i] = "createdAt";
        else if (hl.includes("addr") || hl.includes("straße") || hl.includes("adresse")) m[i] = "address";
        else if (hl.includes("gender") || hl.includes("geschlecht")) m[i] = "gender";
      }
    });
    return m;
  };

  const parseCSV = (text) => {
    const lines = text.split(/\r?\n/);
    if (lines.length < 2) return { headers: [], rows: [] };
    const parseRow = (line) => {
      const cols = []; let cur = "", inQ = false;
      for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') { inQ = !inQ; }
        else if (c === "," && !inQ) { cols.push(cur.trim()); cur = ""; }
        else { cur += c; }
      }
      cols.push(cur.trim());
      return cols;
    };
    const hdrs = parseRow(lines[0]);
    const rows = lines.slice(1).filter(l => l.trim()).map(parseRow);
    return { headers: hdrs, rows };
  };

  const cleanPhone = (val) => {
    if (!val || val === "NaN") return "";
    // Remove scientific notation floats like 1.511891e+10
    const n = parseFloat(val);
    if (!isNaN(n) && Math.abs(n) > 1000000) return "+" + Math.round(n).toString();
    return val.toString().replace(/\.0$/, "");
  };

  const buildMember = (row, hdrs, map, src) => {
    const obj = {};
    hdrs.forEach((_, i) => { if (map[i]) obj[map[i]] = row[i] || ""; });
    const first = obj._firstName || "";
    const last = obj._lastName || "";
    const fullName = [first, last].filter(Boolean).join(" ") || obj.name || "Unbekannt";
    const phone = cleanPhone(obj.phone || obj._mobile || "");
    const addrParts = [obj.address, obj.zip, obj.city, obj.country].filter(Boolean);
    const address = obj.address || addrParts.join(", ");
    let createdAt = obj.createdAt || "";
    if (createdAt) { try { createdAt = new Date(createdAt).toISOString().split("T")[0]; } catch { createdAt = today(); } }
    let birthdate = obj.birthdate || "";
    if (birthdate) { try { birthdate = new Date(birthdate).toISOString().split("T")[0]; } catch { birthdate = ""; } }
    const totalSpent = parseFloat((obj.totalSpent || "0").toString().replace(/[^0-9.,-]/g, "").replace(",", ".")) || 0;
    const plan = src === "salonized" ? "Salon-Kunde" : ((obj.tags || "").split(",")[0]?.trim() || "Shopify-Kunde");
    return {
      id: uid(), name: fullName, email: obj.email || "", phone,
      address, city: obj.city || "", zip: obj.zip || "",
      tags: obj.tags || "", plan, notes: obj.notes || "",
      gender: obj.gender || "", birthdate, loyaltyPoints: parseInt(obj.loyaltyPoints) || 0,
      totalSpent, ordersCount: parseInt(obj.ordersCount) || 0,
      createdAt: createdAt || today(), startDate: createdAt || today(),
      status: "aktiv", source: src,
    };
  };

  const handleFile = async (file) => {
    if (!file || !file.name.endsWith(".csv")) { alert("Bitte eine CSV-Datei hochladen."); return; }
    const text = await file.text();
    const { headers: hdrs, rows } = parseCSV(text);
    if (!hdrs.length) { alert("Datei konnte nicht gelesen werden."); return; }
    const detected = detectSource(hdrs);
    const autoMapped = autoMap(hdrs, detected);
    setSource(detected);
    setHeaders(hdrs);
    setRawRows(rows);
    setMapping(autoMapped);
    setPreview(rows.slice(0, 5).map(r => buildMember(r, hdrs, autoMapped, detected)));
    setStep("mapping");
  };

  const updateMapping = (colIdx, crmKey) => {
    const newMap = { ...mapping, [colIdx]: crmKey || undefined };
    if (!crmKey) delete newMap[colIdx];
    setMapping(newMap);
    setPreview(rawRows.slice(0, 5).map(r => buildMember(r, headers, newMap, source)));
  };

  // ── Smart duplicate detection ────────────────────────────────────────────────
  const normName = (s) => (s || "").toLowerCase().replace(/[^a-züöäß]/g, "").trim();
  const normPhone = (s) => (s || "").replace(/[\s\-\(\)\+]/g, "").replace(/^0049/, "0").replace(/^49/, "0").slice(-9);
  const normEmail = (s) => (s || "").toLowerCase().trim();

  const findDuplicate = (member, existingList) => {
    const email = normEmail(member.email);
    const name = normName(member.name);
    const phone = normPhone(member.phone);
    for (const ex of existingList) {
      // Signal 1: exact email match (strongest)
      if (email && normEmail(ex.email) === email) return { match: ex, signal: "E-Mail", confidence: "hoch" };
      // Signal 2: exact name + same city
      if (name.length > 4 && normName(ex.name) === name && ex.city && member.city && ex.city.toLowerCase() === member.city.toLowerCase())
        return { match: ex, signal: "Name + Stadt", confidence: "hoch" };
      // Signal 3: phone match (last 9 digits)
      if (phone.length >= 7 && normPhone(ex.phone) === phone)
        return { match: ex, signal: "Telefon", confidence: "mittel" };
      // Signal 4: name only (lower confidence)
      if (name.length > 6 && normName(ex.name) === name)
        return { match: ex, signal: "Name", confidence: "niedrig" };
    }
    return null;
  };

  const mergeMember = (existing, incoming) => ({
    ...existing,
    // Fill in missing fields from incoming
    email:        existing.email     || incoming.email,
    phone:        existing.phone     || incoming.phone,
    address:      existing.address   || incoming.address,
    city:         existing.city      || incoming.city,
    zip:          existing.zip       || incoming.zip,
    birthdate:    existing.birthdate || incoming.birthdate,
    gender:       existing.gender    || incoming.gender,
    notes:        [existing.notes, incoming.notes].filter(Boolean).join(" | ") || "",
    tags:         [...new Set([...(existing.tags||"").split(","), ...(incoming.tags||"").split(",")].filter(Boolean))].join(", "),
    totalSpent:   Math.max(existing.totalSpent || 0, incoming.totalSpent || 0),
    ordersCount:  Math.max(existing.ordersCount || 0, incoming.ordersCount || 0),
    loyaltyPoints:Math.max(existing.loyaltyPoints || 0, incoming.loyaltyPoints || 0),
    sources:      [...new Set([...(existing.sources || [existing.source]), incoming.source].filter(Boolean))],
    _mergedFrom:  [...(existing._mergedFrom || []), incoming.source],
  });

  const runImport = async () => {
    setImporting(true);
    await new Promise(r => setTimeout(r, 80));

    const builtMembers = rawRows
      .map(row => buildMember(row, headers, mapping, source))
      .filter(m => m.name && m.name !== "Unbekannt");

    // First: deduplicate WITHIN the CSV itself
    const deduped = [];
    const seenInCSV = [];
    let internalDupes = 0;
    for (const m of builtMembers) {
      const dup = findDuplicate(m, seenInCSV);
      if (dup) { internalDupes++; }
      else { deduped.push(m); seenInCSV.push(m); }
    }

    // Then: match against existing CRM members
    const toImport = []; const toMerge = []; const toSkip = [];
    const existingSnapshot = [...data.members];

    for (const m of deduped) {
      const dup = findDuplicate(m, existingSnapshot);
      if (!dup) {
        toImport.push(m);
        existingSnapshot.push(m); // prevent later rows matching same new entry
      } else if (duplicateMode === "merge") {
        toMerge.push({ incoming: m, existingId: dup.match.id, signal: dup.signal, confidence: dup.confidence });
      } else if (duplicateMode === "overwrite") {
        toMerge.push({ incoming: m, existingId: dup.match.id, signal: dup.signal, confidence: dup.confidence, overwrite: true });
      } else {
        toSkip.push({ name: m.name, signal: dup.signal });
      }
    }

    save(d => {
      let members = [...d.members];
      // Apply merges
      for (const { incoming, existingId, overwrite } of toMerge) {
        members = members.map(ex =>
          ex.id === existingId
            ? (overwrite ? { ...incoming, id: existingId } : mergeMember(ex, incoming))
            : ex
        );
      }
      // Add new
      return { ...d, members: [...members, ...toImport] };
    });

    setResult({
      imported: toImport.length,
      merged: toMerge.length,
      skipped: toSkip.length,
      internalDupes,
      total: builtMembers.length,
      source,
      skipDetails: toSkip.slice(0, 5),
    });
    setStep("done");
    setImporting(false);
  };

  const reset = () => { setStep("upload"); setSource(null); setRawRows([]); setHeaders([]); setMapping({}); setPreview([]); setResult(null); };

  const SOURCE_INFO = {
    shopify:  { color: "#059669", bg: "#f0fdf4", border: "#bbf7d0", label: "Shopify" },
    salonized:{ color: "#111827", bg: "#f8fafc", border: "#d1d5db", label: "Salonized" },
  };

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#1e293b" }}>📥 Kunden importieren</h2>
      </div>
      <p style={{ margin: "0 0 28px", color: "#64748b", fontSize: 14 }}>Importiere Kunden aus Shopify oder Salonized — das Format wird automatisch erkannt.</p>

      {/* Step indicator */}
      <div style={{ display: "flex", alignItems: "center", marginBottom: 32 }}>
        {[["1","CSV hochladen","upload"],["2","Felder prüfen","mapping"],["3","Fertig","done"]].map(([num,label,s],i,arr) => {
          const active = step === s;
          const done = (step==="mapping"&&s==="upload")||(step==="done"&&s!=="done");
          return (
            <div key={s} style={{ display:"flex", alignItems:"center" }}>
              <div style={{ display:"flex", alignItems:"center", gap:8 }}>
                <div style={{ width:28,height:28,borderRadius:"50%",background:done?"#059669":active?"#1e40af":"#e2e8f0",color:(done||active)?"#fff":"#94a3b8",display:"flex",alignItems:"center",justifyContent:"center",fontSize:13,fontWeight:700 }}>{done?"✓":num}</div>
                <span style={{ fontSize:14,fontWeight:active?700:400,color:active?"#1e293b":"#94a3b8" }}>{label}</span>
              </div>
              {i<arr.length-1&&<div style={{ width:40,height:2,background:done?"#059669":"#e2e8f0",margin:"0 12px" }}/>}
            </div>
          );
        })}
      </div>

      {/* ── Upload ── */}
      {step === "upload" && (
        <>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16, marginBottom:24 }}>
            {[
              { src:"shopify", title:"Shopify", desc:"Kunden → Exportieren → CSV für Excel", cols:["First Name","Last Name","Email","Phone","Tags","Total Spent"] },
              { src:"salonized", title:"Salonized", desc:"Kunden → Exportieren → CSV", cols:["first_name","last_name","email","mobile_phone","loyalty_points","total_spent"] },
            ].map(s => (
              <div key={s.src} style={{ background: SOURCE_INFO[s.src].bg, border:`1.5px solid ${SOURCE_INFO[s.src].border}`, borderRadius:12, padding:"16px 18px" }}>
                <div style={{ fontWeight:700, color:SOURCE_INFO[s.src].color, marginBottom:8, fontSize:15 }}><SourceLogo source={s.src} withText size={18} /> Export</div>
                <div style={{ fontSize:13, color:"#64748b", marginBottom:10 }}>{s.desc}</div>
                <div style={{ display:"flex", flexWrap:"wrap", gap:6 }}>
                  {s.cols.map(c=><span key={c} style={{ background:"#fff", color:"#475569", borderRadius:6, padding:"2px 8px", fontSize:11, border:"1px solid #e2e8f0" }}>{c}</span>)}
                </div>
              </div>
            ))}
          </div>

          <div
            onDragOver={e=>{e.preventDefault();setDragging(true);}}
            onDragLeave={()=>setDragging(false)}
            onDrop={e=>{e.preventDefault();setDragging(false);handleFile(e.dataTransfer.files[0]);}}
            onClick={()=>fileRef.current?.click()}
            style={{ border:`2px dashed ${dragging?"#1e40af":"#cbd5e1"}`,borderRadius:16,padding:"56px 32px",textAlign:"center",cursor:"pointer",background:dragging?"#eff6ff":"#f8fafc",transition:"all 0.2s" }}>
            <input ref={fileRef} type="file" accept=".csv" style={{display:"none"}} onChange={e=>handleFile(e.target.files[0])} />
            <div style={{ fontSize:48, marginBottom:14 }}>📂</div>
            <div style={{ fontSize:18, fontWeight:800, color:"#1e293b" }}>CSV hier ablegen oder klicken</div>
            <div style={{ fontSize:13, color:"#94a3b8", marginTop:6 }}>Shopify & Salonized werden automatisch erkannt</div>
          </div>
        </>
      )}

      {/* ── Mapping ── */}
      {step === "mapping" && (
        <>
          <div style={{ display:"flex", gap:14, marginBottom:22, alignItems:"stretch", flexWrap:"wrap" }}>
            {source && (
              <div style={{ background:SOURCE_INFO[source].bg, border:`1px solid ${SOURCE_INFO[source].border}`, borderRadius:10, padding:"12px 18px", display:"flex", alignItems:"center", gap:10 }}>
                <SourceLogo source={source} size={22} />
                <div>
                  <div style={{ fontWeight:700, color:SOURCE_INFO[source].color, fontSize:14 }}>{SOURCE_INFO[source].label} erkannt</div>
                  <div style={{ fontSize:12, color:"#64748b" }}>Felder automatisch zugeordnet</div>
                </div>
              </div>
            )}
            <div style={{ background:"#f0fdf4", border:"1px solid #bbf7d0", borderRadius:10, padding:"12px 18px" }}>
              <div style={{ fontWeight:700, color:"#059669", fontSize:14 }}>{rawRows.length.toLocaleString("de-DE")} Kunden</div>
              <div style={{ fontSize:12, color:"#64748b" }}>{headers.length} Spalten · {Object.keys(mapping).length} gemappt</div>
            </div>
            <div style={{ background:"#fff", border:"1px solid #e2e8f0", borderRadius:10, padding:"12px 16px", marginLeft:"auto" }}>
              <div style={{ fontSize:12, fontWeight:600, color:"#1e293b", marginBottom:5 }}>Duplikate (gleiche Email / Name / Tel.)</div>
              <select style={{...sel,width:210,fontSize:13}} value={duplicateMode} onChange={e=>setDuplicateMode(e.target.value)}>
                <option value="merge">Zusammenführen ✨ (empfohlen)</option>
                <option value="skip">Überspringen</option>
                <option value="overwrite">Überschreiben</option>
              </select>
            </div>
          </div>

          <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e2e8f0", overflow:"hidden", marginBottom:20 }}>
            <div style={{ padding:"12px 18px", background:"#f8fafc", borderBottom:"1px solid #e2e8f0", display:"grid", gridTemplateColumns:"1fr 32px 1fr", gap:12, fontSize:12, fontWeight:700, color:"#64748b", textTransform:"uppercase" }}>
              <span>Spalte in CSV</span><span></span><span>CRM-Feld</span>
            </div>
            <div style={{ maxHeight:380, overflow:"auto" }}>
              {headers.map((h,i)=>(
                <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr 32px 1fr", gap:12, padding:"9px 18px", borderBottom:"1px solid #f1f5f9", alignItems:"center" }}>
                  <div>
                    <div style={{ fontSize:13, color:"#1e293b", fontWeight:500 }}>{h}</div>
                    {rawRows[0]?.[i] && rawRows[0][i] !== "NaN" && <div style={{ fontSize:11, color:"#94a3b8", marginTop:1 }}>z.B. „{rawRows[0][i]}"</div>}
                  </div>
                  <div style={{ textAlign:"center", color:"#cbd5e1" }}>→</div>
                  <select style={{...sel,fontSize:13,background:mapping[i]?"#f0fdf4":"#fff",borderColor:mapping[i]?"#86efac":"#e2e8f0"}}
                    value={mapping[i]||""} onChange={e=>updateMapping(i,e.target.value)}>
                    <option value="">— ignorieren —</option>
                    {CRM_FIELDS.map(f=><option key={f.key} value={f.key}>{f.label}{f.required?" *":""}</option>)}
                    <option value="_firstName">Vorname (intern)</option>
                    <option value="_lastName">Nachname (intern)</option>
                    <option value="_mobile">Mobil → Telefon (intern)</option>
                  </select>
                </div>
              ))}
            </div>
          </div>

          {preview.length > 0 && (
            <div style={{ background:"#fff", borderRadius:14, border:"1px solid #e2e8f0", overflow:"hidden", marginBottom:20 }}>
              <div style={{ padding:"12px 18px", borderBottom:"1px solid #e2e8f0", fontWeight:700, color:"#1e293b", fontSize:14 }}>Vorschau (erste 5)</div>
              <div style={{ overflowX:"auto" }}>
                <table style={{ width:"100%", borderCollapse:"collapse", minWidth:600 }}>
                  <thead><tr style={{background:"#f8fafc"}}>
                    {["Name","E-Mail","Telefon","Stadt","Geburtsdatum","Umsatz","Termine"].map(h=>(
                      <th key={h} style={{padding:"9px 14px",textAlign:"left",fontSize:12,fontWeight:700,color:"#64748b"}}>{h}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {preview.map((m,i)=>(
                      <tr key={i} style={{borderTop:"1px solid #f1f5f9"}}>
                        <td style={{padding:"9px 14px",fontWeight:600,fontSize:13}}>{m.name}</td>
                        <td style={{padding:"9px 14px",fontSize:12,color:"#64748b"}}>{m.email||"—"}</td>
                        <td style={{padding:"9px 14px",fontSize:12,color:"#64748b"}}>{m.phone||"—"}</td>
                        <td style={{padding:"9px 14px",fontSize:12,color:"#64748b"}}>{m.city||"—"}</td>
                        <td style={{padding:"9px 14px",fontSize:12,color:"#64748b"}}>{m.birthdate?fmtDate(m.birthdate):"—"}</td>
                        <td style={{padding:"9px 14px",fontSize:12,fontWeight:600,color:"#059669"}}>{m.totalSpent?fmt(m.totalSpent):"—"}</td>
                        <td style={{padding:"9px 14px",fontSize:12,color:"#7c3aed"}}>{m.ordersCount||"—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          <div style={{display:"flex",gap:12,justifyContent:"flex-end"}}>
            <Btn variant="ghost" onClick={reset}>← Zurück</Btn>
            <Btn disabled={importing} onClick={runImport} style={{minWidth:220}}>
              {importing ? "⏳ Importiere…" : `🚀 ${rawRows.length.toLocaleString("de-DE")} Kunden importieren`}
            </Btn>
          </div>
        </>
      )}

      {/* ── Done ── */}
      {step === "done" && result && (
        <div style={{textAlign:"center",padding:"48px 32px"}}>
          <div style={{ marginBottom:16, display:"flex", justifyContent:"center" }}><SourceLogo source={result.source} size={48} /></div>
          <h3 style={{fontSize:26,fontWeight:800,color:"#1e293b",margin:"0 0 8px"}}>Import abgeschlossen!</h3>
          <p style={{color:"#64748b",fontSize:14,margin:"0 0 28px"}}>{SOURCE_INFO[result.source]?.label || "CSV"} · {result.total.toLocaleString("de-DE")} Zeilen verarbeitet</p>
          <div style={{display:"flex",gap:12,justifyContent:"center",marginBottom:result.internalDupes > 0 ? 16 : 36,flexWrap:"wrap"}}>
            {[
              {label:"Neu importiert",  value:result.imported,      bg:"#f0fdf4",color:"#059669"},
              {label:"Zusammengeführt", value:result.merged || 0,   bg:"#f5f3ff",color:"#7c3aed"},
              {label:"Übersprungen",    value:result.skipped,        bg:"#fef3c7",color:"#92400e"},
            ].map(c=>(
              <div key={c.label} style={{background:c.bg,borderRadius:14,padding:"18px 28px",minWidth:120}}>
                <div style={{fontSize:32,fontWeight:800,color:c.color}}>{c.value.toLocaleString("de-DE")}</div>
                <div style={{fontSize:13,color:"#64748b",marginTop:4}}>{c.label}</div>
              </div>
            ))}
          </div>
          {result.internalDupes > 0 && (
            <div style={{background:"#fef3c7",borderRadius:10,padding:"10px 20px",marginBottom:28,display:"inline-block",fontSize:13,color:"#92400e"}}>
              + {result.internalDupes} interne Duplikate innerhalb der CSV bereinigt
            </div>
          )}
          {result.merged > 0 && (
            <div style={{background:"#f5f3ff",border:"1px solid #ddd6fe",borderRadius:12,padding:"12px 20px",marginBottom:28,fontSize:13,color:"#5b21b6",textAlign:"left",maxWidth:440,margin:"0 auto 28px"}}>
              <div style={{fontWeight:700,marginBottom:6}}>✨ Zusammengeführt bedeutet:</div>
              Fehlende Felder wurden ergänzt (z.B. fehlende Email aus Shopify ergänzt Salonized-Eintrag), Umsätze & Termine wurden auf den höheren Wert gesetzt, Tags aus beiden Quellen kombiniert.
            </div>
          )}
          {result.skipDetails?.length > 0 && (
            <div style={{fontSize:12,color:"#94a3b8",marginBottom:20}}>
              Übersprungen z.B.: {result.skipDetails.map(s=>`${s.name} (${s.signal})`).join(", ")}
            </div>
          )}
          <div style={{display:"flex",gap:12,justifyContent:"center"}}>
            <Btn onClick={()=>onNavigate("members")} style={{minWidth:180}}>👥 Kunden ansehen</Btn>
            <Btn variant="ghost" onClick={reset}>Weiteren Import starten</Btn>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Memberships ─────────────────────────────────────────────────────────────
const MEMBERSHIP_PLANS = {
  Pure: { amount: 149 },
  Define: { amount: 169 },
  Beyond: { amount: 199 },
  Private: { amount: 399 },
  Individuell: { amount: "" },
};

function fixedMemberNameForIban() {
  return "";
}

function addOneYear(date) {
  const d = new Date(date || today());
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
}

function firstDayOfNextMonth(date) {
  const d = new Date(`${date || today()}T12:00:00`);
  d.setMonth(d.getMonth() + 1, 1);
  return d.toISOString().split("T")[0];
}

function isTaskDone(status) {
  return status === "erledigt" || status === "geprüft" || status === "entfällt";
}

function normalizeMemberName(name = "") {
  return name
    .toLowerCase()
    .replace(/ae/g, "a")
    .replace(/oe/g, "o")
    .replace(/ue/g, "u")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\b\d{1,2}\/\d{2,4}\b/g, "")
    .replace(/[<>]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function cleanSepaName(name = "") {
  return name.replace(/[<>]/g, "").replace(/\s+\d{1,2}\/\d{2,4}\s*$/g, "").replace(/\s+/g, " ").trim();
}

function isIncompleteName(name = "") {
  const clean = cleanSepaName(name);
  return !clean || clean.length < 6 || clean.split(/\s+/).length < 2 || /^m(\.|ember)?$/i.test(clean);
}

function inferMembershipPlan(amount, mandate = "") {
  const value = Math.round(Number(amount) || 0);
  const text = mandate.toLowerCase();
  if (text.includes("private") || value === 399) return "Private";
  if (text.includes("beyond") || value === 199) return "Beyond";
  if (text.includes("define") || value === 169) return "Define";
  if (text.includes("pure") || value === 149) return "Pure";
  return "Individuell";
}

function parseSepaMembershipXml(xmlText) {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (doc.querySelector("parsererror")) throw new Error("XML konnte nicht gelesen werden.");
  const get = (node, tag) => node.getElementsByTagNameNS("*", tag)[0]?.textContent?.trim() || "";
  const collectionDate = get(doc, "ReqdColltnDt") || today();
  return Array.from(doc.getElementsByTagNameNS("*", "DrctDbtTxInf")).map((tx, index) => {
    const debtor = tx.getElementsByTagNameNS("*", "Dbtr")[0];
    const rawName = get(debtor || tx, "Nm");
    const amount = Number(get(tx, "InstdAmt")) || 0;
    const mandateReference = get(tx, "MndtId");
    return {
      importId: `${normalizeMemberName(rawName)}-${amount}-${index}`,
      rawName,
      name: cleanSepaName(rawName),
      iban: get(tx, "IBAN"),
      amount,
      mandateReference,
      signatureDate: get(tx, "DtOfSgntr"),
      purpose: get(tx, "Ustrd"),
      collectionDate,
      plan: inferMembershipPlan(amount, mandateReference),
    };
  });
}

function Memberships({ data, save }) {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState("");
  const [importRows, setImportRows] = useState([]);
  const [importOverrides, setImportOverrides] = useState({});
  const [importError, setImportError] = useState("");
  const [mailStatus, setMailStatus] = useState(null);
  const [maintenanceStatus, setMaintenanceStatus] = useState(null);
  const [emailPreview, setEmailPreview] = useState(null);
  const [customerEdit, setCustomerEdit] = useState(null);
  const [customerEditMembershipId, setCustomerEditMembershipId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [membershipSort, setMembershipSort] = useState("recent-desc");
  const [membershipSearch, setMembershipSearch] = useState("");
  const [membershipPlanFilter, setMembershipPlanFilter] = useState("alle");
  const [membershipStatusFilter, setMembershipStatusFilter] = useState("alle");
  const [newPerson, setNewPerson] = useState(null);
  const [showPremiumAdministration, setShowPremiumAdministration] = useState(false);
  const [form, setForm] = useState({
    plan: "Pure",
    contractSignedAt: today(),
    startDate: today(),
    endDate: addOneYear(today()),
    monthlyAmount: MEMBERSHIP_PLANS.Pure.amount,
    status: "aktiv",
    debitDay: "1",
    paymentMethod: "SEPA",
    mandateReference: "",
    notes: "",
    setupBankingStatus: "offen",
    setupBankingDoneAt: "",
    setupBankingNote: "",
    setupFeeAmount: 39,
    setupFeeStatus: "offen",
    setupFeeDoneAt: "",
  });

  const memberships = data.memberships || [];
  const deferredMembershipSearch = useDeferredValue(membershipSearch);
  const memberById = useMemo(() => new Map(data.members.map(member => [member.id, member])), [data.members]);
  const getMemberDisplayName = (membership) => {
    const linkedCustomer = memberById.get(membership.memberId);
    return fixedMemberNameForIban(membership.sepaIban)
      || (!isIncompleteName(linkedCustomer?.name) ? linkedCustomer.name : "")
      || cleanSepaName(membership.memberName)
      || "Name fehlt";
  };
  const findCustomerForMembership = (membership) => {
    const displayName = getMemberDisplayName(membership);
    const candidates = data.members.filter(member => {
      const memberName = normalizeMemberName(member.name);
      const membershipName = normalizeMemberName(displayName || membership.memberName);
      if (!memberName || !membershipName) return false;
      const memberTokens = memberName.split(" ").filter(Boolean);
      const membershipTokens = membershipName.split(" ").filter(Boolean);
      const tokenHits = membershipTokens.filter(token => memberTokens.includes(token)).length;
      return member.id === membership.memberId
        || memberName === membershipName
        || memberName.includes(membershipName)
        || membershipName.includes(memberName)
        || (membershipTokens.length >= 2 && tokenHits >= 2);
    });
    return candidates.find(member => member.email) || candidates[0] || data.members.find(member => member.id === membership.memberId);
  };
  const getScheduledAmount = (membership) => {
    if (!membership.scheduledPlan) return Number(membership.monthlyAmount) || 0;
    return membership.scheduledPlan === "Individuell"
      ? Number(membership.scheduledMonthlyAmount || membership.monthlyAmount) || 0
      : MEMBERSHIP_PLANS[membership.scheduledPlan]?.amount || 0;
  };
  const getMembershipActivityDate = (membership) => membership.updatedAt || membership.newMemberNoticeAt || membership.createdAt || membership.startDate || "";
  const sortedMemberships = [...memberships]
  .filter(membership => {
    const q = deferredMembershipSearch.trim().toLowerCase();
    const customer = memberById.get(membership.memberId);
    const values = [
      getMemberDisplayName(membership),
      membership.memberName,
      membership.memberEmail,
      membership.memberPhone,
      customer?.email,
      customer?.phone,
      membership.plan,
      membership.scheduledPlan,
      membership.notes,
      membership.sepaIban,
      membership.mandateReference,
    ];
    const searchMatches = !q || values.some(value => (value || "").toLowerCase().includes(q));
    const planMatches = membershipPlanFilter === "alle" || membership.plan === membershipPlanFilter;
    const statusMatches = membershipStatusFilter === "alle" || (membership.status || "aktiv") === membershipStatusFilter;
    return searchMatches && planMatches && statusMatches;
  })
  .sort((a, b) => {
    if (membershipSort === "recent-desc") return getMembershipActivityDate(b).localeCompare(getMembershipActivityDate(a)) || getMemberDisplayName(a).localeCompare(getMemberDisplayName(b));
    if (membershipSort === "name-desc") return getMemberDisplayName(b).localeCompare(getMemberDisplayName(a));
    if (membershipSort === "start-asc") return (a.startDate || "").localeCompare(b.startDate || "");
    if (membershipSort === "start-desc") return (b.startDate || "").localeCompare(a.startDate || "");
    if (membershipSort === "amount-asc") return (Number(a.monthlyAmount) || 0) - (Number(b.monthlyAmount) || 0);
    if (membershipSort === "amount-desc") return (Number(b.monthlyAmount) || 0) - (Number(a.monthlyAmount) || 0);
    return getMemberDisplayName(a).localeCompare(getMemberDisplayName(b));
  });
  const exportRows = createMembershipExportRows(sortedMemberships, memberById, getMemberDisplayName);
  const exportFilterLabel = [
    membershipPlanFilter === "alle" ? "Alle Pakete" : `Paket ${membershipPlanFilter}`,
    membershipStatusFilter === "alle" ? "Alle Status" : `Status ${membershipStatusFilter}`,
    membershipSearch.trim() ? `Suche „${membershipSearch.trim()}“` : "",
  ].filter(Boolean).join(" · ");
  const exportFileSuffix = [
    membershipPlanFilter === "alle" ? "Alle-Pakete" : membershipPlanFilter,
    membershipStatusFilter === "alle" ? "Alle-Status" : membershipStatusFilter,
  ].join("-");
  const activeMemberships = memberships.filter(m => m.status === "aktiv");
  const activeMemberCount = new Set(activeMemberships.map(membership => membership.memberId)).size;
  const currentRevenueMemberships = memberships.filter(m => (
    m.status === "aktiv"
    || (m.status === "gekündigt" && m.endDate && m.endDate >= today())
  ));
  const plannedRevenueMemberships = memberships.filter(m => (
    ["aktiv", "vorbereitung"].includes(m.status || "aktiv")
    || (m.status === "gekündigt" && m.endDate && m.endDate >= today())
  ));
  const monthlyRevenue = currentRevenueMemberships.reduce((sum, m) => sum + (Number(m.monthlyAmount) || 0), 0);
  const plannedMonthlyRevenue = plannedRevenueMemberships.reduce((sum, m) => sum + getScheduledAmount(m), 0);
  const plannedRevenueDelta = plannedMonthlyRevenue - monthlyRevenue;
  const scheduledChanges = memberships.filter(m => (
    m.scheduledPlan
    || m.status === "vorbereitung"
    || (m.status === "gekündigt" && m.endDate && m.endDate >= today())
  )).length;
  useEffect(() => {
    const dueChanges = (data.memberships || []).filter(m => m.scheduledPlan && m.scheduledStartDate && m.scheduledStartDate <= today());
    const dueStartingMemberships = (data.memberships || []).filter(m => m.status === "vorbereitung" && m.startDate && m.startDate <= today());
    const expiredCancellations = (data.memberships || []).filter(m => m.status === "gekündigt" && m.endDate && m.endDate < today());
    if (!dueChanges.length && !dueStartingMemberships.length && !expiredCancellations.length) return;
    const dueIds = new Set(dueChanges.map(m => m.id));
    const startingIds = new Set(dueStartingMemberships.map(m => m.id));
    const expiredCancellationIds = new Set(expiredCancellations.map(m => m.id));
    save(d => {
      const applied = new Map();
      const activated = new Set();
      const nextMemberships = (d.memberships || []).map(m => {
        if (expiredCancellationIds.has(m.id)) {
          return { ...m, status: "abgelaufen", expiredAt: today(), updatedAt: today() };
        }
        if (startingIds.has(m.id)) {
          activated.add(m.memberId);
          return { ...m, status: "aktiv", activatedAt: today(), updatedAt: today() };
        }
        if (!dueIds.has(m.id) || !m.scheduledPlan) return m;
        const nextAmount = m.scheduledPlan === "Individuell"
          ? Number(m.scheduledMonthlyAmount || m.monthlyAmount) || 0
          : MEMBERSHIP_PLANS[m.scheduledPlan]?.amount || 0;
        const scheduledDoneAt = m.alertDone?.["scheduled-plan"] || "";
        const scheduledWorkflowCompleted = Boolean(scheduledDoneAt) && isTaskDone(m.scheduledBankingStatus || "");
        const wasRetroactiveWhenScheduled = Boolean(
          m.scheduledStartDate
          && m.updatedAt
          && m.scheduledStartDate < m.updatedAt
        );
        applied.set(m.memberId, m.scheduledPlan);
        return {
          ...m,
          plan: m.scheduledPlan,
          monthlyAmount: nextAmount,
          planChangedAt: m.scheduledStartDate || today(),
          planChangeHistory: [
            ...(m.planChangeHistory || []),
          {
            id: uid(),
            fromPlan: m.plan,
            toPlan: m.scheduledPlan,
            fromAmount: Number(m.monthlyAmount) || 0,
            toAmount: nextAmount,
            effectiveDate: m.scheduledStartDate || today(),
            contractEndDate: m.scheduledContractEndDate || addOneYear(m.scheduledStartDate || today()),
            signedAt: m.scheduledContractSignedAt || today(),
            createdAt: today(),
            bankingStatus: m.scheduledBankingStatus || "offen",
            bankingDoneAt: m.scheduledBankingDoneAt || "",
            bankingNote: m.scheduledBankingNote || "",
            ...(nextAmount > (Number(m.monthlyAmount) || 0) ? {
              setupFeeAmount: 39,
              setupFeeStatus: scheduledWorkflowCompleted ? "erledigt" : "offen",
              setupFeeDoneAt: scheduledWorkflowCompleted ? scheduledDoneAt : "",
              ...(wasRetroactiveWhenScheduled ? {
                immediateChargeAmount: nextAmount,
                immediateChargeStatus: "offen",
                immediateChargeDoneAt: "",
                recurringSepaStartDate: firstDayOfNextMonth(m.scheduledStartDate || today()),
                recurringSepaStatus: "offen",
                recurringSepaDoneAt: "",
              } : {}),
            } : {}),
          },
        ],
        startDate: m.scheduledStartDate || today(),
        endDate: m.scheduledContractEndDate || addOneYear(m.scheduledStartDate || today()),
        contractSignedAt: m.scheduledContractSignedAt || today(),
        scheduledPlan: "",
        scheduledStartDate: "",
        scheduledMonthlyAmount: "",
        scheduledContractSignedAt: "",
        scheduledContractEndDate: "",
        scheduledBankingStatus: "",
        scheduledBankingDoneAt: "",
        scheduledBankingNote: "",
        };
      });
      const getMemberTierAfterActivation = (memberId) => {
        const activeForMember = nextMemberships.filter(m => m.memberId === memberId && m.status === "aktiv");
        if (activeForMember.length > 1) return "Mehrere Pakete";
        return activeForMember[0]?.plan || "Keine Mitgliedschaft";
      };
      return {
        ...d,
        memberships: nextMemberships,
        members: d.members.map(member => {
          if (activated.has(member.id)) return { ...member, status: "aktiv", membershipTier: getMemberTierAfterActivation(member.id) };
          if (applied.has(member.id)) return { ...member, membershipTier: applied.get(member.id) };
          return member;
        }),
      };
    });
    const messages = [];
    if (dueStartingMemberships.length) messages.push(`${dueStartingMemberships.length} vorbereitete Member aktiviert`);
    if (dueChanges.length) messages.push(`${dueChanges.length} geplante Membership-Änderung${dueChanges.length === 1 ? "" : "en"} übernommen`);
    if (expiredCancellations.length) messages.push(`${expiredCancellations.length} Kündigung${expiredCancellations.length === 1 ? "" : "en"} auf abgelaufen gesetzt`);
    setMaintenanceStatus({ type: "success", message: `${messages.join(", ")}.` });
  }, [data.memberships, save]);
  useEffect(() => {
    const christinaMembership = (data.memberships || []).find(m => {
      const customer = memberById.get(m.memberId);
      const name = normalizeMemberName([m.memberName, customer?.name].filter(Boolean).join(" "));
      return name.includes("christina helberg") && !m.newMemberNoticeAt && !m.newMemberNoticeDismissedAt;
    });
    if (!christinaMembership) return;
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => m.id === christinaMembership.id ? {
        ...m,
        newMemberNoticeAt: today(),
        newMemberNoticeBackfilledAt: today(),
      } : m),
    }));
  }, [data.memberships, memberById, save]);
  useEffect(() => {
    const moniraMembership = (data.memberships || []).find(m => {
      const customer = memberById.get(m.memberId);
      const name = normalizeMemberName([m.memberName, customer?.name].filter(Boolean).join(" "));
      return name.includes("monira garabet") && !m.newMemberNoticeAt && !m.newMemberNoticeDismissedAt;
    });
    if (!moniraMembership) return;
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => m.id === moniraMembership.id ? {
        ...m,
        newMemberNoticeAt: today(),
        newMemberNoticeBackfilledAt: today(),
      } : m),
    }));
  }, [data.memberships, memberById, save]);
  useEffect(() => {
    if (data.systemFlags?.christinaHelbergSecondBeyondAdded) return;
    const christinaMemberships = (data.memberships || []).filter(m => {
      const customer = memberById.get(m.memberId);
      const name = normalizeMemberName([m.memberName, customer?.name].filter(Boolean).join(" "));
      return name.includes("christina helberg");
    });
    const baseMembership = christinaMemberships[0];
    if (!baseMembership) return;
    const hasSecondBeyond = christinaMemberships.some(m => m.packageRole === "second-package" && m.plan === "Beyond");
    if (hasSecondBeyond) {
      save(d => ({ ...d, systemFlags: { ...(d.systemFlags || {}), christinaHelbergSecondBeyondAdded: true } }));
      return;
    }
    const customer = memberById.get(baseMembership.memberId);
    const secondMembership = {
      ...baseMembership,
      id: uid(),
      plan: "Beyond",
      monthlyAmount: MEMBERSHIP_PLANS.Beyond.amount,
      status: "vorbereitung",
      startDate: today(),
      endDate: addOneYear(today()),
      notes: "Zweites aktives Member-Paket",
      createdAt: today(),
      newMemberNoticeAt: today(),
      packageRole: "second-package",
      packageLabel: "2. Paket",
      memberName: customer?.name || baseMembership.memberName,
      memberEmail: customer?.email || baseMembership.memberEmail || "",
      memberPhone: customer?.phone || baseMembership.memberPhone || "",
      scheduledPlan: "",
      scheduledStartDate: "",
      scheduledMonthlyAmount: "",
      planChangeHistory: [],
    };
    save(d => ({
      ...d,
      memberships: [...(d.memberships || []), secondMembership],
      members: d.members.map(member => member.id === baseMembership.memberId ? { ...member, membershipTier: "Mehrere Pakete" } : member),
      systemFlags: { ...(d.systemFlags || {}), christinaHelbergSecondBeyondAdded: true },
    }));
    setMaintenanceStatus({ type: "success", message: "Christina Helberg wurde ein zweites Paket Beyond hinzugefügt." });
  }, [data.systemFlags, data.memberships, memberById, save]);
  useEffect(() => {
    const christinaMemberships = (data.memberships || []).filter(m => {
      const customer = memberById.get(m.memberId);
      const name = normalizeMemberName([m.memberName, customer?.name].filter(Boolean).join(" "));
      return name.includes("christina helberg");
    });
    if (christinaMemberships.length <= 2) return;
    const primary = christinaMemberships.find(m => m.packageRole !== "second-package") || christinaMemberships[0];
    const second = christinaMemberships.find(m => m.id !== primary.id && m.packageRole === "second-package" && m.plan === "Beyond")
      || christinaMemberships.find(m => m.id !== primary.id && m.plan === "Beyond")
      || christinaMemberships.find(m => m.id !== primary.id);
    const keepIds = new Set([primary.id, second?.id].filter(Boolean));
    save(d => ({
      ...d,
      memberships: (d.memberships || [])
        .filter(m => !christinaMemberships.some(christina => christina.id === m.id) || keepIds.has(m.id))
        .map(m => {
          if (!keepIds.has(m.id)) return m;
          const isSecond = second?.id === m.id;
          return {
            ...m,
            ...(isSecond ? {
              plan: "Beyond",
              monthlyAmount: MEMBERSHIP_PLANS.Beyond.amount,
              packageRole: "second-package",
              packageLabel: "2. Paket",
              notes: m.notes || "Zweites aktives Member-Paket",
            } : {}),
            startDate: "2026-06-01",
            status: "vorbereitung",
          };
        }),
      systemFlags: {
        ...(d.systemFlags || {}),
        christinaHelbergSecondBeyondAdded: true,
        christinaHelbergStartDatesSet20260601: true,
        christinaHelbergPreparationStatusSet: true,
      },
    }));
    setMaintenanceStatus({ type: "success", message: "Christina Helberg wurde auf genau zwei Pakete bereinigt." });
  }, [data.memberships, memberById, save]);
  useEffect(() => {
    if (data.systemFlags?.christinaHelbergPackageLabelsSet) return;
    const christinaMemberships = (data.memberships || []).filter(m => {
      const customer = memberById.get(m.memberId);
      const name = normalizeMemberName([m.memberName, customer?.name].filter(Boolean).join(" "));
      return name.includes("christina helberg");
    });
    if (christinaMemberships.length < 2) return;
    const primary = christinaMemberships.find(m => m.packageRole !== "second-package") || christinaMemberships[0];
    const second = christinaMemberships.find(m => m.id !== primary.id && m.packageRole === "second-package")
      || christinaMemberships.find(m => m.id !== primary.id);
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => {
        if (m.id === primary.id) return { ...m, packageLabel: "1. Paket", startDate: "2026-06-01", status: "vorbereitung" };
        if (second && m.id === second.id) return { ...m, packageLabel: "2. Paket", packageRole: "second-package", startDate: "2026-06-01", status: "vorbereitung" };
        return m;
      }),
      systemFlags: { ...(d.systemFlags || {}), christinaHelbergPackageLabelsSet: true },
    }));
  }, [data.systemFlags, data.memberships, memberById, save]);
  useEffect(() => {
    if (data.systemFlags?.christinaHelbergStartDatesSet20260601) return;
    const christinaIds = new Set((data.memberships || [])
      .filter(m => {
        const customer = memberById.get(m.memberId);
        const name = normalizeMemberName([m.memberName, customer?.name].filter(Boolean).join(" "));
        return name.includes("christina helberg");
      })
      .map(m => m.id));
    if (!christinaIds.size) return;
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => christinaIds.has(m.id) ? { ...m, startDate: "2026-06-01" } : m),
      systemFlags: { ...(d.systemFlags || {}), christinaHelbergStartDatesSet20260601: true },
    }));
    setMaintenanceStatus({ type: "success", message: "Christina Helbergs Eintrittsdatum wurde bei beiden Paketen auf den 01.06.2026 gesetzt." });
  }, [data.systemFlags, data.memberships, memberById, save]);
  useEffect(() => {
    if (data.systemFlags?.christinaHelbergPreparationStatusSet) return;
    const christinaIds = new Set((data.memberships || [])
      .filter(m => {
        const customer = memberById.get(m.memberId);
        const name = normalizeMemberName([m.memberName, customer?.name].filter(Boolean).join(" "));
        return name.includes("christina helberg");
      })
      .map(m => m.id));
    if (!christinaIds.size) return;
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => christinaIds.has(m.id) ? { ...m, status: "vorbereitung" } : m),
      systemFlags: { ...(d.systemFlags || {}), christinaHelbergPreparationStatusSet: true },
    }));
    setMaintenanceStatus({ type: "success", message: "Christina Helberg steht bei beiden Paketen auf Vorbereitung bis zum Start am 01.06.2026." });
  }, [data.systemFlags, data.memberships, memberById, save]);
  const soon = memberships.filter(m => m.status === "aktiv" && m.endDate && new Date(m.endDate) <= new Date(addDays(today(), 45))).length;
  const sortByRecentActivity = (a, b) => (b.sortDate || b.date).localeCompare(a.sortDate || a.date) || b.date.localeCompare(a.date);
  const cancellationAlerts = memberships
    .filter(m => m.status === "gekündigt" && (!m.endDate || m.endDate >= today()))
    .map(membership => ({ type: "cancellation", date: membership.endDate || "9999-12-31", sortDate: getMembershipActivityDate(membership), membership }));
  const pausedAlerts = memberships
    .filter(m => m.status === "pausiert")
    .map(membership => ({ type: "paused", date: membership.updatedAt || membership.startDate || today(), sortDate: getMembershipActivityDate(membership), membership }));
  const preparationAlerts = memberships
    .filter(m => m.status === "vorbereitung")
    .map(membership => ({ type: "preparation", date: membership.startDate || today(), sortDate: getMembershipActivityDate(membership), membership }));
  const setupWorkflowAlerts = memberships
    .filter(m => m.status !== "vorbereitung" && m.setupBankingStatus)
    .map(membership => {
      const bankingDone = isTaskDone(membership.setupBankingStatus);
      const feeDone = !membership.setupFeeStatus || isTaskDone(membership.setupFeeStatus);
      const completed = bankingDone && feeDone;
      const completionDate = [membership.setupBankingDoneAt, membership.setupFeeDoneAt].filter(Boolean).sort().pop() || "";
      const planned = !completed && !bankingDone && feeDone && membership.startDate && membership.startDate > today();
      return {
        type: "setup-banking",
        date: membership.startDate || membership.updatedAt || today(),
        sortDate: getMembershipActivityDate(membership),
        membership,
        completed,
        completionDate,
        planned,
      };
    });
  const openSetupAlerts = setupWorkflowAlerts.filter(alert => !alert.completed && !alert.planned);
  const plannedSetupAlerts = setupWorkflowAlerts.filter(alert => alert.planned);
  const completedSetupAlerts = setupWorkflowAlerts.filter(alert => alert.completed && alert.completionDate >= addDays(today(), -14));
  const setupFeeAlerts = memberships
    .filter(m => !m.setupBankingStatus && m.setupFeeStatus && !isTaskDone(m.setupFeeStatus) && !m.alertDone?.["setup-fee"])
    .map(membership => ({ type: "setup-fee", date: membership.createdAt || membership.startDate || today(), sortDate: getMembershipActivityDate(membership), membership }));
  const scheduledPlanAlerts = memberships
    .filter(m => m.scheduledPlan)
    .map(membership => ({ type: "scheduled-plan", date: membership.scheduledStartDate || "9999-12-31", sortDate: getMembershipActivityDate(membership), membership }));
  const appliedPlanWorkflowAlerts = memberships
    .map(membership => {
      const history = membership.planChangeHistory || [];
      const planChange = history[history.length - 1];
      if (membership.status !== "aktiv" || !planChange) return null;
      const hasDetailedWorkflow = Boolean(planChange.immediateChargeStatus || planChange.recurringSepaStatus);
      const immediateChargeDone = !planChange.immediateChargeStatus || isTaskDone(planChange.immediateChargeStatus);
      const recurringSepaDone = !planChange.recurringSepaStatus || isTaskDone(planChange.recurringSepaStatus);
      const legacyBankingDone = !planChange.bankingStatus || isTaskDone(planChange.bankingStatus);
      const setupFeeDone = !planChange.setupFeeStatus || isTaskDone(planChange.setupFeeStatus);
      const completed = hasDetailedWorkflow
        ? immediateChargeDone && recurringSepaDone && setupFeeDone
        : legacyBankingDone && setupFeeDone;
      const completionDate = [
        planChange.immediateChargeDoneAt,
        planChange.recurringSepaDoneAt,
        planChange.bankingDoneAt,
        planChange.setupFeeDoneAt,
      ].filter(Boolean).sort().pop() || "";
      const planned = !completed
        && hasDetailedWorkflow
        && immediateChargeDone
        && setupFeeDone
        && !recurringSepaDone
        && planChange.recurringSepaStartDate
        && planChange.recurringSepaStartDate > today();
      return {
        type: "applied-plan",
        date: planChange.effectiveDate || planChange.createdAt || membership.updatedAt || today(),
        sortDate: planChange.createdAt || planChange.effectiveDate || getMembershipActivityDate(membership),
        membership,
        planChange,
        completed,
        completionDate,
        planned,
      };
    })
    .filter(Boolean);
  const openAppliedPlanAlerts = appliedPlanWorkflowAlerts.filter(alert => !alert.completed && !alert.planned);
  const plannedAppliedPlanAlerts = appliedPlanWorkflowAlerts.filter(alert => alert.planned);
  const completedAppliedPlanAlerts = appliedPlanWorkflowAlerts.filter(alert => alert.completed && alert.completionDate >= addDays(today(), -14));
  const newMemberAlerts = memberships
    .filter(m => m.status !== "vorbereitung" && !m.setupBankingStatus && m.newMemberNoticeAt && m.newMemberNoticeAt >= addDays(today(), -14))
    .map(membership => ({ type: "new-member", date: membership.newMemberNoticeAt || membership.createdAt || today(), sortDate: getMembershipActivityDate(membership), membership }));
  const openTaskAlerts = [
    ...openSetupAlerts,
    ...setupFeeAlerts,
    ...preparationAlerts.filter(alert => !alert.membership.alertDone?.[alert.type]),
    ...scheduledPlanAlerts.filter(alert => !alert.membership.alertDone?.[alert.type]),
    ...openAppliedPlanAlerts,
  ].sort(sortByRecentActivity);
  const plannedAlerts = [
    ...newMemberAlerts.filter(alert => !alert.membership.alertDone?.[alert.type]),
    ...preparationAlerts.filter(alert => alert.membership.alertDone?.[alert.type]),
    ...scheduledPlanAlerts.filter(alert => alert.membership.alertDone?.[alert.type]),
    ...plannedSetupAlerts,
    ...plannedAppliedPlanAlerts,
  ].sort(sortByRecentActivity);
  const recentlyCompletedAlerts = [
    ...completedSetupAlerts,
    ...completedAppliedPlanAlerts,
  ].sort(sortByRecentActivity);
  const membershipAlertGroups = [
    { key: "tasks", label: "Offene Aufgaben", alerts: openTaskAlerts.slice(0, 15) },
    { key: "planned", label: "Geplant / startet bald", alerts: plannedAlerts.slice(0, 15) },
    { key: "completed", label: "Kürzlich erledigt", alerts: recentlyCompletedAlerts.slice(0, 15) },
    { key: "cancellations", label: "Kündigungen / läuft aus", alerts: cancellationAlerts.sort((a, b) => a.date.localeCompare(b.date)) },
    { key: "paused", label: "Pausiert", alerts: pausedAlerts.sort(sortByRecentActivity) },
  ].filter(group => group.alerts.length > 0);
  const membershipAlerts = membershipAlertGroups.flatMap(group => group.alerts);
  const selectedCustomer = data.members.find(m => m.id === selectedId);
  const findCustomerMatch = (name) => {
    const normalized = normalizeMemberName(name);
    if (!normalized) return null;
    const nameTokens = normalized.split(" ").filter(Boolean);
    return data.members.find(member => normalizeMemberName(member.name) === normalized)
      || data.members.find(member => {
        const memberName = normalizeMemberName(member.name);
        const memberTokens = memberName.split(" ").filter(Boolean);
        if (isIncompleteName(member.name) || nameTokens.length < 2 || memberTokens.length < 2) return false;
        return memberName && (memberName.includes(normalized) || normalized.includes(memberName));
      })
      || data.members.find(member => {
        const memberTokens = normalizeMemberName(member.name).split(" ").filter(Boolean);
        if (nameTokens.length < 2 || memberTokens.length < 2) return false;
        const hits = nameTokens.filter(token => memberTokens.includes(token)).length;
        return hits >= Math.min(2, nameTokens.length);
      })
      || null;
  };
  const importedPreview = importRows.map(row => ({
    ...row,
    matchedCustomer: findCustomerMatch(row.name),
    existingMembership: memberships.find(m => (row.iban && m.sepaIban === row.iban) || normalizeMemberName(m.memberName) === normalizeMemberName(row.name)),
    alreadyMember: memberships.some(m => (row.iban && m.sepaIban === row.iban) || normalizeMemberName(m.memberName) === normalizeMemberName(row.name)),
  }));
  const importablePreview = importedPreview.filter(row => !row.alreadyMember);
  const matches = data.members
    .filter(member => {
      const q = query.trim().toLowerCase();
      if (!q) return true;
      return [member.name, member.email, member.phone, member.customerNumber].some(value => (value || "").toLowerCase().includes(q));
    })
    .sort((a, b) => (a.name || "").localeCompare(b.name || ""))
    .slice(0, 10);

  const setPlan = (plan) => setForm(f => ({ ...f, plan, monthlyAmount: plan === "Individuell" ? "" : MEMBERSHIP_PLANS[plan]?.amount }));
  const setStartDate = (startDate) => setForm(f => ({ ...f, startDate, endDate: addOneYear(startDate) }));

  const startNewMember = () => {
    setSelectedId("");
    setQuery("");
    setNewPerson({ name: "", email: "", phone: "", address: "", zip: "", city: "" });
    window.requestAnimationFrame(() => document.getElementById("member-create")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  };

  const addMembership = () => {
    const creatingPerson = Boolean(newPerson);
    const cleanName = (newPerson?.name || "").trim();
    const cleanEmail = (newPerson?.email || "").trim().toLowerCase();
    const cleanPhone = (newPerson?.phone || "").trim();

    if (creatingPerson && !cleanName) {
      setMaintenanceStatus({ type: "error", message: "Bitte Vor- und Nachname des neuen Members eintragen." });
      return;
    }
    if (creatingPerson && !cleanEmail && !cleanPhone) {
      setMaintenanceStatus({ type: "error", message: "Bitte mindestens eine E-Mail-Adresse oder Telefonnummer eintragen." });
      return;
    }

    const duplicate = creatingPerson && data.members.find(member => (
      (cleanEmail && (member.email || "").trim().toLowerCase() === cleanEmail)
      || (cleanPhone && (member.phone || "").trim() === cleanPhone)
    ));
    if (duplicate) {
      setNewPerson(null);
      setSelectedId(duplicate.id);
      setQuery(duplicate.name || "");
      setMaintenanceStatus({ type: "error", message: `${duplicate.name || "Diese Person"} ist bereits vorhanden. Der bestehende Datensatz wurde ausgewählt.` });
      return;
    }

    if (!creatingPerson && !selectedCustomer) return;
    const targetCustomer = creatingPerson ? {
      id: uid(),
      name: cleanName,
      email: cleanEmail,
      phone: cleanPhone,
      address: (newPerson.address || "").trim(),
      zip: (newPerson.zip || "").trim(),
      city: (newPerson.city || "").trim(),
      status: "aktiv",
      source: "manual",
      sources: ["manual"],
      membershipTier: form.status === "aktiv" ? form.plan : "Keine Mitgliedschaft",
      createdAt: today(),
    } : selectedCustomer;
    const activePackageCount = memberships.filter(m => m.memberId === targetCustomer.id && m.status === "aktiv").length;
    const startDate = form.startDate || today();
    const status = form.status || "aktiv";
    const needsSetupBanking = Boolean(form.setupBankingStatus) || status === "vorbereitung" || startDate > today();
    const membership = {
      id: uid(),
      memberId: targetCustomer.id,
      memberName: targetCustomer.name,
      memberEmail: targetCustomer.email || "",
      memberPhone: targetCustomer.phone || "",
      plan: form.plan,
      contractSignedAt: form.contractSignedAt || "",
      startDate,
      endDate: form.endDate || addOneYear(startDate),
      monthlyAmount: Number(form.monthlyAmount) || 0,
      status,
      paymentMethod: "SEPA",
      sepaIban: "",
      debitDay: form.debitDay || "1",
      mandateReference: form.mandateReference || "",
      notes: form.notes || "",
      setupBankingStatus: needsSetupBanking ? (form.setupBankingStatus || "offen") : "",
      setupBankingDoneAt: needsSetupBanking ? (form.setupBankingDoneAt || "") : "",
      setupBankingNote: needsSetupBanking ? (form.setupBankingNote || "") : "",
      setupFeeAmount: Number(form.setupFeeAmount) || 39,
      setupFeeStatus: form.setupFeeStatus || "offen",
      setupFeeDoneAt: isTaskDone(form.setupFeeStatus) ? (form.setupFeeDoneAt || today()) : "",
      createdAt: today(),
      updatedAt: today(),
      newMemberNoticeAt: today(),
      packageLabel: activePackageCount ? `${activePackageCount + 1}. Paket` : "1. Paket",
    };
    save(d => ({
      ...d,
      memberships: [...(d.memberships || []), membership],
      members: (creatingPerson ? [...d.members, targetCustomer] : d.members).map(m => {
        if (m.id !== targetCustomer.id) return m;
        if (status !== "aktiv") return { ...m, membershipTier: m.membershipTier || "Keine Mitgliedschaft" };
        return { ...m, membershipTier: activePackageCount ? "Mehrere Pakete" : form.plan };
      }),
    }));
    setMaintenanceStatus({ type: "success", message: `${targetCustomer.name} wurde als Member angelegt.` });
    setQuery("");
    setSelectedId("");
    setNewPerson(null);
    setForm(f => ({ ...f, mandateReference: "", notes: "", setupBankingStatus: "offen", setupBankingDoneAt: "", setupBankingNote: "", setupFeeAmount: 39, setupFeeStatus: "offen", setupFeeDoneAt: "" }));
  };

  const updateMembership = (id, patch) => save(d => ({
    ...d,
    memberships: (d.memberships || []).map(m => m.id === id ? { ...m, ...patch, updatedAt: today() } : m),
    members: patch.plan ? d.members.map(member => {
      const membership = (d.memberships || []).find(m => m.id === id);
      return membership?.memberId === member.id ? { ...member, membershipTier: patch.plan } : member;
    }) : d.members,
  }));

  const updateScheduledBanking = (membership, status) => {
    const nextStatus = status === "geprüft" ? "erledigt" : status;
    const doneAt = isTaskDone(nextStatus)
      ? (membership.scheduledBankingDoneAt || today())
      : "";
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => m.id === membership.id ? {
        ...m,
        scheduledBankingStatus: nextStatus,
        scheduledBankingDoneAt: doneAt,
        scheduledBankingHistory: [
          ...(m.scheduledBankingHistory || []),
          {
            id: uid(),
            status: nextStatus,
            date: today(),
            note: m.scheduledBankingNote || "",
          },
        ],
        updatedAt: today(),
      } : m),
    }));
    setMaintenanceStatus({ type: "success", message: `${getMemberDisplayName(membership)}: Onlinebanking wurde als ${nextStatus} markiert.` });
  };

  const updateSetupBanking = (membership, status) => {
    const nextStatus = status === "geprüft" ? "erledigt" : status;
    const doneAt = isTaskDone(nextStatus)
      ? (membership.setupBankingDoneAt || today())
      : "";
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => m.id === membership.id ? {
        ...m,
        setupBankingStatus: nextStatus,
        setupBankingDoneAt: doneAt,
        setupBankingHistory: [
          ...(m.setupBankingHistory || []),
          {
            id: uid(),
            status: nextStatus,
            date: today(),
            note: m.setupBankingNote || "",
          },
        ],
        updatedAt: today(),
      } : m),
    }));
    setMaintenanceStatus({ type: "success", message: `${getMemberDisplayName(membership)}: Onlinebanking wurde als ${nextStatus} markiert.` });
  };

  const updateSetupFee = (membership, status) => {
    const nextStatus = status === "geprüft" ? "erledigt" : status;
    const doneAt = nextStatus === "erledigt"
      ? (membership.setupFeeDoneAt || today())
      : "";
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => m.id === membership.id ? {
        ...m,
        setupFeeStatus: nextStatus,
        setupFeeDoneAt: doneAt,
        setupFeeHistory: [
          ...(m.setupFeeHistory || []),
          {
            id: uid(),
            status: nextStatus,
            date: today(),
            amount: Number(m.setupFeeAmount) || 39,
          },
        ],
        updatedAt: today(),
      } : m),
    }));
    setMaintenanceStatus({ type: "success", message: `${getMemberDisplayName(membership)}: Einrichtungsgebühr wurde als ${nextStatus} markiert.` });
  };

  const updateAppliedPlanBanking = (membership, planChange, status) => {
    const nextStatus = status === "geprüft" ? "erledigt" : status;
    const doneAt = nextStatus === "erledigt"
      ? (planChange.bankingDoneAt || today())
      : "";
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => m.id === membership.id ? {
        ...m,
        planChangeHistory: (m.planChangeHistory || []).map(change => change.id === planChange.id ? {
          ...change,
          bankingStatus: nextStatus,
          bankingDoneAt: doneAt,
        } : change),
        updatedAt: today(),
      } : m),
    }));
    setMaintenanceStatus({ type: "success", message: `${getMemberDisplayName(membership)}: Onlinebanking für das Upgrade wurde als ${nextStatus} markiert.` });
  };

  const updateAppliedImmediateCharge = (membership, planChange, status) => {
    const nextStatus = status === "geprüft" ? "erledigt" : status;
    const doneAt = nextStatus === "erledigt" ? (planChange.immediateChargeDoneAt || today()) : "";
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => m.id === membership.id ? {
        ...m,
        planChangeHistory: (m.planChangeHistory || []).map(change => change.id === planChange.id ? {
          ...change,
          immediateChargeStatus: nextStatus,
          immediateChargeDoneAt: doneAt,
        } : change),
        updatedAt: today(),
      } : m),
    }));
    setMaintenanceStatus({ type: "success", message: `${getMemberDisplayName(membership)}: Einmalige Abbuchung wurde als ${nextStatus} markiert.` });
  };

  const updateAppliedRecurringSepa = (membership, planChange, status) => {
    const nextStatus = status === "geprüft" ? "erledigt" : status;
    const doneAt = nextStatus === "erledigt" ? (planChange.recurringSepaDoneAt || today()) : "";
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => m.id === membership.id ? {
        ...m,
        planChangeHistory: (m.planChangeHistory || []).map(change => change.id === planChange.id ? {
          ...change,
          recurringSepaStatus: nextStatus,
          recurringSepaDoneAt: doneAt,
        } : change),
        updatedAt: today(),
      } : m),
    }));
    setMaintenanceStatus({ type: "success", message: `${getMemberDisplayName(membership)}: Laufende SEPA wurde als ${nextStatus} markiert.` });
  };

  const updateAppliedPlanFee = (membership, planChange, status) => {
    const nextStatus = status === "geprüft" ? "erledigt" : status;
    const doneAt = nextStatus === "erledigt"
      ? (planChange.setupFeeDoneAt || today())
      : "";
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => m.id === membership.id ? {
        ...m,
        planChangeHistory: (m.planChangeHistory || []).map(change => change.id === planChange.id ? {
          ...change,
          setupFeeStatus: nextStatus,
          setupFeeDoneAt: doneAt,
        } : change),
        updatedAt: today(),
      } : m),
    }));
    setMaintenanceStatus({ type: "success", message: `${getMemberDisplayName(membership)}: Einrichtungsgebühr für das Upgrade wurde als ${nextStatus} markiert.` });
  };

  const markAppliedPlanDone = (membership, planChange) => {
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => m.id === membership.id ? {
        ...m,
        planChangeHistory: (m.planChangeHistory || []).map(change => change.id === planChange.id ? {
          ...change,
          bankingStatus: "erledigt",
          bankingDoneAt: change.bankingDoneAt || today(),
          ...(change.immediateChargeStatus ? {
            immediateChargeStatus: "erledigt",
            immediateChargeDoneAt: change.immediateChargeDoneAt || today(),
          } : {}),
          ...(change.recurringSepaStatus ? {
            recurringSepaStatus: "erledigt",
            recurringSepaDoneAt: change.recurringSepaDoneAt || today(),
          } : {}),
          ...(change.setupFeeStatus ? {
            setupFeeStatus: change.setupFeeStatus === "entfällt" ? "entfällt" : "erledigt",
            setupFeeDoneAt: change.setupFeeDoneAt || today(),
          } : {}),
        } : change),
        updatedAt: today(),
      } : m),
    }));
    setMaintenanceStatus({ type: "success", message: `${getMemberDisplayName(membership)}: Banking und Einrichtungsgebühr für das Upgrade wurden als erledigt markiert.` });
  };

  const markAlertDone = (membership, type) => {
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => {
        if (m.id !== membership.id) return m;
        const setupPatch = ["preparation", "setup-banking", "new-member"].includes(type) && m.setupBankingStatus
          ? { setupBankingStatus: "erledigt", setupBankingDoneAt: m.setupBankingDoneAt || today() }
          : {};
        const scheduledPatch = type === "scheduled-plan" && m.scheduledBankingStatus
          ? { scheduledBankingStatus: "erledigt", scheduledBankingDoneAt: m.scheduledBankingDoneAt || today() }
          : {};
        const setupFeePatch = type === "setup-fee" && m.setupFeeStatus
          ? { setupFeeStatus: m.setupFeeStatus === "entfällt" ? "entfällt" : "erledigt", setupFeeDoneAt: m.setupFeeDoneAt || today() }
          : type === "setup-banking" && m.setupFeeStatus
          ? { setupFeeStatus: m.setupFeeStatus === "entfällt" ? "entfällt" : "erledigt", setupFeeDoneAt: m.setupFeeDoneAt || today() }
          : {};
        return {
          ...m,
          ...setupPatch,
          ...scheduledPatch,
          ...setupFeePatch,
          alertDone: {
            ...(m.alertDone || {}),
            [type]: today(),
          },
          updatedAt: today(),
        };
      }),
    }));
    setMaintenanceStatus({ type: "success", message: `${getMemberDisplayName(membership)}: Hinweis wurde als komplett erledigt markiert.` });
  };

  const reopenAlert = (membership, type) => {
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => {
        if (m.id !== membership.id) return m;
        const nextDone = { ...(m.alertDone || {}) };
        delete nextDone[type];
        return { ...m, alertDone: nextDone, updatedAt: today() };
      }),
    }));
    setMaintenanceStatus({ type: "success", message: `${getMemberDisplayName(membership)}: Hinweis ist wieder offen.` });
  };

  const removeMembership = (id) => save(d => ({
    ...d,
    memberships: (d.memberships || []).filter(m => m.id !== id),
  }));

  const applyScheduledPlan = (membership) => {
    if (!membership.scheduledPlan) return;
    const nextAmount = membership.scheduledPlan === "Individuell"
      ? Number(membership.scheduledMonthlyAmount || membership.monthlyAmount) || 0
      : MEMBERSHIP_PLANS[membership.scheduledPlan]?.amount || 0;
    save(d => ({
      ...d,
      memberships: (d.memberships || []).map(m => m.id === membership.id ? {
        ...m,
        plan: membership.scheduledPlan,
        monthlyAmount: nextAmount,
        planChangedAt: membership.scheduledStartDate || today(),
        planChangeHistory: [
          ...(m.planChangeHistory || []),
          {
            id: uid(),
            fromPlan: m.plan,
            toPlan: membership.scheduledPlan,
            fromAmount: Number(m.monthlyAmount) || 0,
            toAmount: nextAmount,
            effectiveDate: membership.scheduledStartDate || today(),
            contractEndDate: m.scheduledContractEndDate || addOneYear(m.scheduledStartDate || today()),
            signedAt: m.scheduledContractSignedAt || today(),
            createdAt: today(),
            bankingStatus: m.scheduledBankingStatus || "offen",
            bankingDoneAt: m.scheduledBankingDoneAt || "",
            bankingNote: m.scheduledBankingNote || "",
            ...(nextAmount > (Number(m.monthlyAmount) || 0) ? {
              setupFeeAmount: 39,
              setupFeeStatus: "offen",
              setupFeeDoneAt: "",
              ...((membership.scheduledStartDate || today()) < today() ? {
                immediateChargeAmount: nextAmount,
                immediateChargeStatus: "offen",
                immediateChargeDoneAt: "",
                recurringSepaStartDate: firstDayOfNextMonth(membership.scheduledStartDate || today()),
                recurringSepaStatus: "offen",
                recurringSepaDoneAt: "",
              } : {}),
            } : {}),
          },
        ],
        startDate: membership.scheduledStartDate || today(),
        endDate: m.scheduledContractEndDate || addOneYear(membership.scheduledStartDate || today()),
        contractSignedAt: m.scheduledContractSignedAt || today(),
        scheduledPlan: "",
        scheduledStartDate: "",
        scheduledMonthlyAmount: "",
        scheduledContractSignedAt: "",
        scheduledContractEndDate: "",
        scheduledBankingStatus: "",
        scheduledBankingDoneAt: "",
        scheduledBankingNote: "",
      } : m),
      members: d.members.map(member => member.id === membership.memberId ? { ...member, membershipTier: membership.scheduledPlan } : member),
    }));
    setMaintenanceStatus({ type: "success", message: `${getMemberDisplayName(membership)} wurde auf ${membership.scheduledPlan} umgestellt.` });
  };

  const requestRemoveMembership = (membership) => {
    const name = getMemberDisplayName(membership);
    setConfirm({
      message: "Member wirklich löschen?",
      detail: `${name} wird aus der Member-Liste entfernt. Die Personendaten bleiben für Rechnungen und Verlauf erhalten.`,
      onConfirm: () => {
        removeMembership(membership.id);
        setConfirm(null);
        setMaintenanceStatus({ type: "success", message: `${name} wurde aus der Member-Liste entfernt.` });
      },
    });
  };

  const buildCancellationPreview = (membership) => {
    const customer = findCustomerForMembership(membership);
    const email = customer?.email || membership.memberEmail || "";
    const memberName = getMemberDisplayName(membership);
    return {
      membership,
      email,
      memberName,
      subject: "Bestätigung deiner Kündigung – PDB Aesthetic Room",
      body: [
        `Hallo ${memberName},`,
        "",
        `hiermit bestätigen wir deine Kündigung deiner PDB Membership zum ${fmtDate(membership.endDate)}.`,
        "",
        "Ab diesem Datum endet dein Membership-Status. Bis dahin bleibt deine Membership wie vereinbart aktiv.",
        membership.notes ? `\nHinweis: ${membership.notes}` : "",
        "",
        "Vielen Dank für dein Vertrauen.",
        "",
        "Liebe Grüße",
        "PDB Aesthetic Room",
      ].filter(Boolean).join("\n"),
    };
  };

  const openCancellationPreview = (membership) => {
    setEmailPreview(buildCancellationPreview(membership));
  };

  const openCustomerEditFromMembership = (membership) => {
    const customer = findCustomerForMembership(membership);
    if (!customer) {
      setMaintenanceStatus({ type: "error", message: `${getMemberDisplayName(membership)} ist noch nicht sauber mit Personendaten verknüpft. Bitte zuerst „Fehlende Personendaten reparieren“ ausführen.` });
      return;
    }
    setCustomerEdit({ ...customer });
    setCustomerEditMembershipId(membership.id);
  };

  const saveCustomerFromMembership = () => {
    const trimmedName = (customerEdit?.name || "").trim();
    if (!customerEdit || !trimmedName) {
      setMaintenanceStatus({ type: "error", message: "Bitte einen Namen für den Member eintragen." });
      return;
    }
    save(d => ({
      ...d,
      members: d.members.map(member => member.id === customerEdit.id ? { ...member, ...customerEdit, name: trimmedName } : member),
      memberships: (d.memberships || []).map(membership => membership.id === customerEditMembershipId ? {
        ...membership,
        memberId: customerEdit.id,
        memberName: trimmedName,
        memberEmail: customerEdit.email || "",
        memberPhone: customerEdit.phone || "",
      } : membership),
    }));
    setMaintenanceStatus({ type: "success", message: `${trimmedName}: Personendaten wurden aktualisiert.` });
    setCustomerEdit(null);
    setCustomerEditMembershipId(null);
  };

  const sendCancellationEmail = async (membership) => {
    const customer = findCustomerForMembership(membership);
    const email = customer?.email || membership.memberEmail || "";
    const memberName = getMemberDisplayName(membership);
    if (!email) {
      setMailStatus({ type: "error", message: `Für ${memberName} fehlt eine E-Mail-Adresse.` });
      return;
    }
    if (!membership.endDate) {
      setMailStatus({ type: "error", message: `Für ${memberName} fehlt das Austrittsdatum.` });
      return;
    }

    setMailStatus({ type: "pending", message: `Sende Kündigungsbestätigung an ${email}…` });
    try {
      const res = await fetch("/api/send-cancellation-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          memberName,
          endDate: membership.endDate,
          note: membership.notes || "",
        }),
      });
      const result = await res.json();
      if (!res.ok || !result.ok) throw new Error(result.error || "E-Mail konnte nicht gesendet werden.");
      setMailStatus({ type: "success", message: `Kündigungsbestätigung an ${email} wurde gesendet.` });
      setEmailPreview(null);
      updateMembership(membership.id, { cancellationEmailSentAt: result.sentAt || new Date().toISOString() });
    } catch (error) {
      setMailStatus({
        type: "error",
        message: `${error.message} Läuft der Mail-Server? Starte im Terminal: npm run mail`,
      });
    }
  };

  const clearImportedSepaNotes = () => save(d => ({
    ...d,
    memberships: (d.memberships || []).map(m => ({
      ...m,
      notes: /^premiumbeitrag/i.test(m.notes || "") ? "" : (m.notes || ""),
    })),
  }));

  const runClearImportedSepaNotes = () => {
    const count = memberships.filter(m => /^premiumbeitrag/i.test(m.notes || "")).length;
    clearImportedSepaNotes();
    setMaintenanceStatus({ type: "success", message: `${count} Import-Notizen wurden geleert.` });
  };

  const syncMemberEmailsFromCustomers = () => save(d => {
    let synced = 0;
    let relinked = 0;
    const findCustomer = (membership) => {
      const fixedName = fixedMemberNameForIban(membership.sepaIban);
      const membershipName = normalizeMemberName(fixedName || membership.memberName);
      const candidates = d.members.filter(member => {
        const memberName = normalizeMemberName(member.name);
        if (!memberName || !membershipName) return false;
        const memberTokens = memberName.split(" ").filter(Boolean);
        const membershipTokens = membershipName.split(" ").filter(Boolean);
        const tokenHits = membershipTokens.filter(token => memberTokens.includes(token)).length;
        return member.id === membership.memberId
          || memberName === membershipName
          || memberName.includes(membershipName)
          || membershipName.includes(memberName)
          || (membershipTokens.length >= 2 && tokenHits >= 2);
      });
      return candidates.find(member => member.email) || candidates[0] || d.members.find(member => member.id === membership.memberId);
    };
    const next = {
      ...d,
      memberships: (d.memberships || []).map(membership => {
        const customer = findCustomer(membership);
        const fixedName = fixedMemberNameForIban(membership.sepaIban);
        if (!customer) return membership;
        if ((customer.email || "") && customer.email !== membership.memberEmail) synced++;
        if (customer.id !== membership.memberId) relinked++;
        return {
          ...membership,
          memberId: customer.id,
          memberName: fixedName || customer.name || membership.memberName,
          memberEmail: customer.email || membership.memberEmail || "",
          memberPhone: customer.phone || membership.memberPhone || "",
        };
      }),
    };
    setMaintenanceStatus({ type: "success", message: `Synchronisierung abgeschlossen: ${synced} E-Mails übernommen, ${relinked} Member neu verknüpft.` });
    return next;
  });

  const repairMissingMemberCustomers = () => save(d => {
    const members = [...d.members];
    let created = 0;
    let updated = 0;
    const memberships = (d.memberships || []).map(membership => {
      let customer = members.find(member => member.id === membership.memberId)
        || members.find(member => normalizeMemberName(member.name) === normalizeMemberName(membership.memberName));
      const cleanName = fixedMemberNameForIban(membership.sepaIban) || cleanSepaName(membership.memberName);
      if (!customer && cleanName && !isIncompleteName(cleanName)) {
        customer = {
          id: uid(),
          name: cleanName,
          email: membership.memberEmail || "",
          phone: membership.memberPhone || "",
          source: "sepa",
          status: "aktiv",
          membershipTier: membership.plan || "Individuell",
          createdAt: today(),
          timeline: [{ id: uid(), type: "note", text: "Personendaten aus bestehendem Member-Vertrag ergänzt", date: today(), ts: Date.now() }],
        };
        members.push(customer);
        created++;
      }
      if (customer) {
        if (cleanName && !isIncompleteName(cleanName) && (isIncompleteName(customer.name) || fixedMemberNameForIban(membership.sepaIban))) {
          customer.name = cleanName;
          updated++;
        }
        customer.membershipTier = membership.plan || customer.membershipTier;
        return { ...membership, memberId: customer.id, memberName: cleanName || customer.name };
      }
      return { ...membership, memberName: cleanName || membership.memberName };
    });
    setMaintenanceStatus({ type: "success", message: `Reparatur abgeschlossen: ${created} Personendatensätze ergänzt, ${updated} Namen aktualisiert.` });
    return { ...d, members, memberships };
  });

  const handleSepaFile = async (file) => {
    if (!file) return;
    setImportError("");
    try {
      const rows = parseSepaMembershipXml(await file.text());
      setImportRows(rows);
      setImportOverrides(Object.fromEntries(rows.map(row => [
        row.importId,
        { startDate: row.signatureDate || row.collectionDate || today() },
      ])));
    } catch (error) {
      setImportRows([]);
      setImportOverrides({});
      setImportError(error.message || "XML konnte nicht gelesen werden.");
    }
  };

  const importSepaMembers = () => {
    if (!importedPreview.length) return;
    save(d => {
      const existingMembers = [...d.members];
      const existingMemberships = [...(d.memberships || [])];
      importedPreview.forEach(row => {
        const existingMembershipIndex = existingMemberships.findIndex(m => (row.iban && m.sepaIban === row.iban) || normalizeMemberName(m.memberName) === normalizeMemberName(row.name));
        if (existingMembershipIndex >= 0) return;

        const xmlName = fixedMemberNameForIban(row.iban) || cleanSepaName(row.name || row.rawName);
        let customer = existingMembers.find(member => member.id === row.matchedCustomer?.id)
          || existingMembers.find(member => normalizeMemberName(member.name) === normalizeMemberName(row.name));
        if (!customer) {
          customer = {
            id: uid(),
            name: xmlName || "Unbekannter Member",
            email: "",
            phone: "",
            source: "sepa",
            status: "aktiv",
            membershipTier: row.plan,
            createdAt: today(),
            timeline: [{ id: uid(), type: "note", text: `Aus SEPA-XML importiert (${fmt(row.amount)} monatlich)`, date: today(), ts: Date.now() }],
          };
          existingMembers.push(customer);
        } else {
          customer.membershipTier = row.plan;
          if (xmlName && (isIncompleteName(customer.name) || fixedMemberNameForIban(row.iban))) customer.name = xmlName;
        }
        const startDate = importOverrides[row.importId]?.startDate || row.signatureDate || row.collectionDate || today();
        existingMemberships.push({
          id: uid(),
          memberId: customer.id,
          memberName: customer.name,
          memberEmail: customer.email || "",
          memberPhone: customer.phone || "",
          plan: row.plan,
          startDate,
          endDate: addOneYear(startDate),
          monthlyAmount: row.amount,
          status: "aktiv",
          paymentMethod: "SEPA",
          debitDay: String(new Date(row.collectionDate || today()).getDate() || 1),
          mandateReference: row.mandateReference || "",
          sepaIban: row.iban || "",
          notes: "",
          createdAt: today(),
          updatedAt: today(),
          newMemberNoticeAt: today(),
        });
      });
      return { ...d, members: existingMembers, memberships: existingMemberships };
    });
    setImportRows([]);
    setImportOverrides({});
  };

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 20, marginBottom: 24 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: "#1e293b" }}>Member</h2>
          <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 14 }}>Übersicht und Verwaltung aller Memberships, Verträge und offenen Aufgaben.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
          <Btn variant="outline" onClick={() => setShowPremiumAdministration(current => !current)}>{showPremiumAdministration ? "Online-Verwaltung schließen" : "Online-Verwaltung"}</Btn>
          <Btn onClick={startNewMember}>Neuen Member anlegen</Btn>
        </div>
      </div>

      {showPremiumAdministration && <PremiumAdministration />}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 22 }}>
        {[
          ["Aktive Member", activeMemberCount, "#1e40af", "#eff6ff"],
          ["CRM aktuell", fmt(monthlyRevenue), "#059669", "#f0fdf4", "Vertragssumme im CRM"],
          ["CRM nach Planung", fmt(plannedMonthlyRevenue), plannedRevenueDelta >= 0 ? "#047857" : "#b91c1c", plannedRevenueDelta >= 0 ? "#ecfdf5" : "#fef2f2", plannedRevenueDelta ? `${plannedRevenueDelta > 0 ? "+" : ""}${fmt(plannedRevenueDelta)} aus ${scheduledChanges} Änderung${scheduledChanges === 1 ? "" : "en"}` : "Keine Änderung geplant"],
          ["Laufen bald aus", soon, "#d97706", "#fffbeb"],
        ].map(([label, value, color, bg, hint]) => (
          <div key={label} style={{ background: bg, borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color }}>{value}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>{label}</div>
            {hint && <div style={{ fontSize: 11, color, marginTop: 6, fontWeight: 700 }}>{hint}</div>}
          </div>
        ))}
      </div>

      {membershipAlerts.length > 0 && (
        <div style={{ background: "#fff7ed", border: "1px solid #fed7aa", borderRadius: 14, padding: 16, marginBottom: 22 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: "#9a3412" }}>Member-Hinweise</h3>
            <span style={{ fontSize: 12, color: "#9a3412", fontWeight: 700 }}>{membershipAlerts.length} wichtig</span>
          </div>
          <div style={{ display: "grid", gap: 12 }}>
            {membershipAlertGroups.map(group => (
              <div key={group.key} style={{ display: "grid", gap: 8 }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "0 2px" }}>
                  <div style={{ fontSize: 12, fontWeight: 900, color: group.key === "paused" ? "#075985" : group.key === "cancellations" ? "#991b1b" : "#9a3412", textTransform: "uppercase", letterSpacing: 0 }}>
                    {group.label}
                  </div>
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 800 }}>{group.alerts.length}</div>
                </div>
                {group.alerts.map(alert => {
              const m = alert.membership;
              const name = getMemberDisplayName(m);
              const scheduledAmount = getScheduledAmount(m);
              const scheduledDelta = m.scheduledPlan ? scheduledAmount - (Number(m.monthlyAmount) || 0) : 0;
              const bankingStatus = m.scheduledBankingStatus === "geprüft" ? "erledigt" : (m.scheduledBankingStatus || "offen");
              const setupBankingStatus = m.setupBankingStatus === "geprüft" ? "erledigt" : (m.setupBankingStatus || "offen");
              const setupFeeStatus = m.setupFeeStatus === "geprüft" ? "erledigt" : (m.setupFeeStatus || "offen");
              const appliedPlanChange = alert.planChange;
              const appliedBankingStatus = appliedPlanChange?.bankingStatus === "geprüft" ? "erledigt" : (appliedPlanChange?.bankingStatus || "offen");
              const appliedSetupFeeStatus = appliedPlanChange?.setupFeeStatus === "geprüft" ? "erledigt" : (appliedPlanChange?.setupFeeStatus || "");
              const appliedImmediateChargeStatus = appliedPlanChange?.immediateChargeStatus === "geprüft" ? "erledigt" : (appliedPlanChange?.immediateChargeStatus || "");
              const appliedRecurringSepaStatus = appliedPlanChange?.recurringSepaStatus === "geprüft" ? "erledigt" : (appliedPlanChange?.recurringSepaStatus || "");
              const hasDetailedAppliedWorkflow = Boolean(appliedPlanChange?.immediateChargeStatus || appliedPlanChange?.recurringSepaStatus);
              const planLine = `Paket ${m.plan || "offen"} · Beitrag ${fmt(m.monthlyAmount)} · Start ${fmtDate(m.startDate)}`;
              const signedLine = m.contractSignedAt ? `Unterschrift ${fmtDate(m.contractSignedAt)}` : "Unterschrift offen";
              const isCancellation = alert.type === "cancellation";
              const isNewMember = alert.type === "new-member";
              const isPaused = alert.type === "paused";
              const isPreparation = alert.type === "preparation";
              const isSetupBanking = alert.type === "setup-banking";
              const isSetupFee = alert.type === "setup-fee";
              const isAppliedPlan = alert.type === "applied-plan";
              const doneAt = alert.completed ? alert.completionDate : m.alertDone?.[alert.type];
              const text = isCancellation
                ? `${name} ist gekündigt zum ${fmtDate(m.endDate)}`
                : isNewMember
                  ? `${name} ist neu als Member angelegt`
                : isPreparation
                  ? `${name}: Member-Start vorbereiten`
                : isSetupBanking
                  ? `${name}: Member-Einrichtung offen`
                : isSetupFee
                  ? `${name}: Einrichtungsgebühr ${fmt(Number(m.setupFeeAmount) || 39)} abbuchen`
                : isAppliedPlan
                  ? `${name}: Änderung auf ${appliedPlanChange.toPlan} seit ${fmtDate(appliedPlanChange.effectiveDate)}`
                : isPaused
                  ? `${name} ist pausiert`
                : `${name}: Änderung auf ${m.scheduledPlan} ab ${fmtDate(m.scheduledStartDate)}`;
              return (
                <div key={`${alert.type}-${m.id}`} style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", background: "#fff", borderRadius: 10, padding: "10px 12px", border: "1px solid #ffedd5" }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{text}</div>
                    {isCancellation && m.notes && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{m.notes}</div>}
                    {isNewMember && (
                      <>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          {m.plan} / {fmt(m.monthlyAmount)} · Eintritt {fmtDate(m.startDate)}
                        </div>
                        {m.notes && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{m.notes}</div>}
                      </>
                    )}
                    {isPaused && (
                      <>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          {m.plan} / {fmt(m.monthlyAmount)} · seit {fmtDate(m.updatedAt || m.startDate)}
                        </div>
                        {m.notes && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{m.notes}</div>}
                      </>
                    )}
                    {(isPreparation || isSetupBanking) && (
                      <>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          {planLine} · Ende {fmtDate(m.endDate)} · {signedLine}
                        </div>
                        <div style={{ fontSize: 12, color: setupBankingStatus === "offen" ? "#b45309" : "#047857", marginTop: 2, fontWeight: 700 }}>
                          SEPA-Sammellastschrift ab {fmtDate(m.startDate)}: {setupBankingStatus}{m.setupBankingDoneAt ? ` am ${fmtDate(m.setupBankingDoneAt)}` : ""}
                        </div>
                        {m.setupFeeStatus && (
                          <div style={{ fontSize: 12, color: setupFeeStatus === "offen" ? "#b45309" : "#047857", marginTop: 2, fontWeight: 700 }}>
                            {setupFeeStatus === "entfällt" ? "Einrichtungsgebühr: entfällt" : `Einrichtungsgebühr: ${fmt(Number(m.setupFeeAmount) || 39)} · ${setupFeeStatus}${m.setupFeeDoneAt ? ` am ${fmtDate(m.setupFeeDoneAt)}` : ""}`}
                          </div>
                        )}
                        {m.setupBankingNote && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{m.setupBankingNote}</div>}
                        {m.notes && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{m.notes}</div>}
                      </>
                    )}
                    {isSetupFee && (
                      <>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          {planLine} · {signedLine}
                        </div>
                        <div style={{ fontSize: 12, color: setupFeeStatus === "offen" ? "#b45309" : "#047857", marginTop: 2, fontWeight: 700 }}>
                          {setupFeeStatus === "entfällt" ? "Einrichtungsgebühr: entfällt" : `Einrichtungsgebühr: ${fmt(Number(m.setupFeeAmount) || 39)} · ${setupFeeStatus}${m.setupFeeDoneAt ? ` am ${fmtDate(m.setupFeeDoneAt)}` : ""}`}
                        </div>
                      </>
                    )}
                    {isAppliedPlan && (
                      <>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          {appliedPlanChange.fromPlan} / {fmt(appliedPlanChange.fromAmount)} → {appliedPlanChange.toPlan} / {fmt(appliedPlanChange.toAmount)}
                        </div>
                        <div style={{ fontSize: 12, color: "#047857", marginTop: 2, fontWeight: 700 }}>CRM: Upgrade übernommen</div>
                        {hasDetailedAppliedWorkflow && appliedPlanChange.immediateChargeStatus && (
                          <div style={{ fontSize: 12, color: appliedImmediateChargeStatus === "offen" ? "#b45309" : "#047857", marginTop: 2, fontWeight: 700 }}>
                            Einmalige Abbuchung {appliedPlanChange.immediateChargePeriod || ""}: {fmt(Number(appliedPlanChange.immediateChargeAmount) || appliedPlanChange.toAmount)} · {appliedImmediateChargeStatus}{appliedPlanChange.immediateChargeDoneAt ? ` am ${fmtDate(appliedPlanChange.immediateChargeDoneAt)}` : ""}
                          </div>
                        )}
                        {!hasDetailedAppliedWorkflow && (
                          <div style={{ fontSize: 12, color: appliedBankingStatus === "offen" ? "#b45309" : "#047857", marginTop: 2, fontWeight: 700 }}>
                            Onlinebanking: {appliedBankingStatus}{appliedPlanChange.bankingDoneAt ? ` am ${fmtDate(appliedPlanChange.bankingDoneAt)}` : ""}
                          </div>
                        )}
                        {appliedPlanChange.setupFeeStatus && (
                          <div style={{ fontSize: 12, color: appliedSetupFeeStatus === "offen" ? "#b45309" : "#047857", marginTop: 2, fontWeight: 700 }}>
                            {appliedSetupFeeStatus === "entfällt" ? "Einrichtungsgebühr: entfällt" : `Einrichtungsgebühr: ${fmt(Number(appliedPlanChange.setupFeeAmount) || 39)} · ${appliedSetupFeeStatus}${appliedPlanChange.setupFeeDoneAt ? ` am ${fmtDate(appliedPlanChange.setupFeeDoneAt)}` : ""}`}
                          </div>
                        )}
                        {hasDetailedAppliedWorkflow && appliedPlanChange.recurringSepaStatus && (
                          <div style={{ fontSize: 12, color: appliedRecurringSepaStatus === "offen" ? "#b45309" : "#047857", marginTop: 2, fontWeight: 700 }}>
                            SEPA-Sammellastschrift ab {fmtDate(appliedPlanChange.recurringSepaStartDate)}: {appliedRecurringSepaStatus}{appliedPlanChange.recurringSepaDoneAt ? ` am ${fmtDate(appliedPlanChange.recurringSepaDoneAt)}` : ""}
                          </div>
                        )}
                        {appliedPlanChange.bankingNote && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{appliedPlanChange.bankingNote}</div>}
                      </>
                    )}
                    {!isCancellation && !isNewMember && !isPaused && !isPreparation && !isSetupBanking && !isSetupFee && !isAppliedPlan && (
                      <>
                        <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                          Aktuell {m.plan} / {fmt(m.monthlyAmount)} → {m.scheduledPlan} / {fmt(scheduledAmount)}
                          {scheduledDelta ? ` (${scheduledDelta > 0 ? "+" : ""}${fmt(scheduledDelta)})` : ""}
                        </div>
                        {(m.scheduledContractSignedAt || m.scheduledContractEndDate) && (
                          <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                            Vertrag {m.scheduledContractSignedAt ? `unterschrieben am ${fmtDate(m.scheduledContractSignedAt)}` : "Unterschrift offen"} · Laufzeit bis {m.scheduledContractEndDate ? fmtDate(m.scheduledContractEndDate) : "offen"}
                          </div>
                        )}
                        <div style={{ fontSize: 12, color: bankingStatus === "offen" ? "#b45309" : "#047857", marginTop: 2, fontWeight: 700 }}>
                          CRM: geplant · Onlinebanking: {bankingStatus}{m.scheduledBankingDoneAt ? ` am ${fmtDate(m.scheduledBankingDoneAt)}` : ""}
                        </div>
                        {m.scheduledBankingNote && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{m.scheduledBankingNote}</div>}
                        {m.notes && <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{m.notes}</div>}
                      </>
                    )}
                    {doneAt && <div style={{ fontSize: 12, color: "#047857", marginTop: 4, fontWeight: 800 }}>Alles erledigt am {fmtDate(doneAt)}</div>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", flexWrap: "wrap", gap: 8, flexShrink: 0 }}>
                    <Badge status={doneAt ? "erledigt" : isCancellation || isPaused ? (m.status || alert.type) : isNewMember ? "erledigt" : isSetupFee ? "Gebühr offen" : isSetupBanking ? (alert.planned ? "SEPA geplant" : "Einrichtung offen") : isAppliedPlan ? (hasDetailedAppliedWorkflow ? (appliedImmediateChargeStatus === "offen" ? "Abbuchung offen" : appliedSetupFeeStatus === "offen" ? "Gebühr offen" : "SEPA offen") : appliedBankingStatus !== "erledigt" ? `Banking ${appliedBankingStatus}` : "Gebühr offen") : isPreparation ? `Banking ${setupBankingStatus}` : `Banking ${bankingStatus}`} />
                    {isNewMember
                      ? doneAt ? <Btn small variant="ghost" onClick={() => reopenAlert(m, alert.type)}>Wieder öffnen</Btn> : <Btn small variant="outline" onClick={() => markAlertDone(m, alert.type)}>Alles erledigt</Btn>
                      : isCancellation
                      ? <>
                          <Btn small variant="outline" onClick={() => openCancellationPreview(m)}>{m.cancellationEmailSentAt ? "Erneut prüfen" : "E-Mail prüfen"}</Btn>
                          {doneAt ? <Btn small variant="ghost" onClick={() => reopenAlert(m, alert.type)}>Wieder öffnen</Btn> : <Btn small variant="outline" onClick={() => markAlertDone(m, alert.type)}>Alles erledigt</Btn>}
                        </>
                      : isPaused
                      ? <>
                          <Btn small variant="outline" disabled>Pausiert</Btn>
                          {doneAt ? <Btn small variant="ghost" onClick={() => reopenAlert(m, alert.type)}>Wieder öffnen</Btn> : <Btn small variant="outline" onClick={() => markAlertDone(m, alert.type)}>Alles erledigt</Btn>}
                        </>
                      : isPreparation || isSetupBanking
                      ? <>
                          <select
                            aria-label="Laufende SEPA Status"
                            style={{ ...sel, width: 128, fontSize: 12, padding: "6px 8px" }}
                            value={setupBankingStatus}
                            onChange={e => updateSetupBanking(m, e.target.value)}
                          >
                            <option value="offen">SEPA offen</option>
                            <option value="erledigt">SEPA erledigt</option>
                          </select>
                          {m.setupFeeStatus && (
                            <select
                              aria-label="Einrichtungsgebühr Status"
                              style={{ ...sel, width: 132, fontSize: 12, padding: "6px 8px" }}
                              value={setupFeeStatus}
                              onChange={e => updateSetupFee(m, e.target.value)}
                            >
                              <option value="offen">Gebühr offen</option>
                              <option value="erledigt">Gebühr erledigt</option>
                              <option value="entfällt">Gebühr entfällt</option>
                            </select>
                          )}
                          {alert.completed ? <Btn small variant="outline" disabled>Erledigt</Btn> : <Btn small variant="outline" onClick={() => markAlertDone(m, alert.type)}>Alles erledigt</Btn>}
                          {isPreparation && <Btn small variant="outline" disabled>{m.startDate && m.startDate <= today() ? "Wird aktiviert" : "Wartet auf Eintritt"}</Btn>}
                        </>
                      : isSetupFee
                      ? <>
                          <select
                            aria-label="Einrichtungsgebühr Status"
                            style={{ ...sel, width: 132, fontSize: 12, padding: "6px 8px" }}
                            value={m.setupFeeStatus || "offen"}
                            onChange={e => updateSetupFee(m, e.target.value)}
                          >
                            <option value="offen">Gebühr offen</option>
                            <option value="erledigt">Gebühr erledigt</option>
                            <option value="entfällt">Gebühr entfällt</option>
                          </select>
                          {doneAt ? <Btn small variant="ghost" onClick={() => reopenAlert(m, alert.type)}>Wieder öffnen</Btn> : <Btn small variant="outline" onClick={() => markAlertDone(m, alert.type)}>Alles erledigt</Btn>}
                        </>
                      : isAppliedPlan
                      ? <>
                          {hasDetailedAppliedWorkflow && appliedPlanChange.immediateChargeStatus ? (
                            <select
                              aria-label="Einmalige Abbuchung Status"
                              style={{ ...sel, width: 150, fontSize: 12, padding: "6px 8px" }}
                              value={appliedImmediateChargeStatus}
                              onChange={e => updateAppliedImmediateCharge(m, appliedPlanChange, e.target.value)}
                            >
                              <option value="offen">Abbuchung offen</option>
                              <option value="erledigt">Abbuchung erledigt</option>
                            </select>
                          ) : !hasDetailedAppliedWorkflow && (
                            <select
                              aria-label="Onlinebanking Status"
                              style={{ ...sel, width: 128, fontSize: 12, padding: "6px 8px" }}
                              value={appliedBankingStatus}
                              onChange={e => updateAppliedPlanBanking(m, appliedPlanChange, e.target.value)}
                            >
                              <option value="offen">Banking offen</option>
                              <option value="erledigt">Banking erledigt</option>
                            </select>
                          )}
                          {appliedPlanChange.setupFeeStatus && (
                            <select
                              aria-label="Einrichtungsgebühr Status"
                              style={{ ...sel, width: 132, fontSize: 12, padding: "6px 8px" }}
                              value={appliedSetupFeeStatus}
                              onChange={e => updateAppliedPlanFee(m, appliedPlanChange, e.target.value)}
                            >
                              <option value="offen">Gebühr offen</option>
                              <option value="erledigt">Gebühr erledigt</option>
                              <option value="entfällt">Gebühr entfällt</option>
                            </select>
                          )}
                          {hasDetailedAppliedWorkflow && appliedPlanChange.recurringSepaStatus && (
                            <select
                              aria-label="Laufende SEPA Status"
                              style={{ ...sel, width: 128, fontSize: 12, padding: "6px 8px" }}
                              value={appliedRecurringSepaStatus}
                              onChange={e => updateAppliedRecurringSepa(m, appliedPlanChange, e.target.value)}
                            >
                              <option value="offen">SEPA offen</option>
                              <option value="erledigt">SEPA erledigt</option>
                            </select>
                          )}
                          {alert.completed ? <Btn small variant="outline" disabled>Erledigt</Btn> : <Btn small variant="outline" onClick={() => markAppliedPlanDone(m, appliedPlanChange)}>Alles erledigt</Btn>}
                        </>
                      : <>
                          <select
                            aria-label="Onlinebanking Status"
                            style={{ ...sel, width: 128, fontSize: 12, padding: "6px 8px" }}
                            value={bankingStatus}
                            onChange={e => updateScheduledBanking(m, e.target.value)}
                          >
                            <option value="offen">Banking offen</option>
                            <option value="erledigt">Banking erledigt</option>
                          </select>
                          {doneAt ? <Btn small variant="ghost" onClick={() => reopenAlert(m, alert.type)}>Wieder öffnen</Btn> : <Btn small variant="outline" onClick={() => markAlertDone(m, alert.type)}>Alles erledigt</Btn>}
                          <Btn small variant="outline" disabled={!(m.scheduledStartDate && m.scheduledStartDate <= today())} onClick={() => applyScheduledPlan(m)}>{m.scheduledStartDate && m.scheduledStartDate <= today() ? "Übernehmen" : "Vorgemerkt"}</Btn>
                        </>}
                  </div>
                </div>
              );
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {mailStatus && (
        <div style={{
          background: mailStatus.type === "success" ? "#f0fdf4" : mailStatus.type === "pending" ? "#eff6ff" : "#fef2f2",
          border: `1px solid ${mailStatus.type === "success" ? "#bbf7d0" : mailStatus.type === "pending" ? "#bfdbfe" : "#fecaca"}`,
          color: mailStatus.type === "success" ? "#065f46" : mailStatus.type === "pending" ? "#1e40af" : "#991b1b",
          borderRadius: 12,
          padding: "10px 14px",
          marginBottom: 18,
          fontSize: 13,
          fontWeight: 700,
        }}>
          {mailStatus.message}
        </div>
      )}

      {maintenanceStatus && (
        <div style={{
          background: maintenanceStatus.type === "error" ? "#fef2f2" : "#f0fdf4",
          border: `1px solid ${maintenanceStatus.type === "error" ? "#fecaca" : "#bbf7d0"}`,
          color: maintenanceStatus.type === "error" ? "#991b1b" : "#065f46",
          borderRadius: 12,
          padding: "10px 14px",
          marginBottom: 18,
          fontSize: 13,
          fontWeight: 700,
        }}>
          {maintenanceStatus.message}
        </div>
      )}

      {emailPreview && (
        <Modal title="Kündigungsbestätigung prüfen" onClose={() => setEmailPreview(null)} wide>
          <Field label="Empfänger">
            <input style={inp} value={emailPreview.email || "Keine E-Mail-Adresse hinterlegt"} readOnly />
          </Field>
          <Field label="Betreff">
            <input style={inp} value={emailPreview.subject} readOnly />
          </Field>
          <Field label="E-Mail Text">
            <textarea style={{ ...inp, minHeight: 260, lineHeight: 1.45, resize: "vertical" }} value={emailPreview.body} readOnly />
          </Field>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
            <Btn variant="ghost" onClick={() => setEmailPreview(null)}>Abbrechen</Btn>
            <Btn onClick={() => sendCancellationEmail(emailPreview.membership)} disabled={!emailPreview.email || !emailPreview.membership.endDate}>Jetzt senden</Btn>
          </div>
        </Modal>
      )}

      {customerEdit && (
        <Modal title={`Memberdaten – ${customerEdit.name || "Member"}`} onClose={() => { setCustomerEdit(null); setCustomerEditMembershipId(null); }} wide>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 16px" }}>
            <Field label="Name" required>
              <input style={inp} value={customerEdit.name || ""} onChange={e => setCustomerEdit(c => ({ ...c, name: e.target.value }))} />
            </Field>
            <Field label="E-Mail">
              <input style={inp} type="email" value={customerEdit.email || ""} onChange={e => setCustomerEdit(c => ({ ...c, email: e.target.value }))} />
            </Field>
            <Field label="Telefon">
              <input style={inp} value={customerEdit.phone || ""} onChange={e => setCustomerEdit(c => ({ ...c, phone: e.target.value }))} />
            </Field>
            <Field label="Geburtsdatum">
              <input style={inp} type="date" value={customerEdit.birthdate || ""} onChange={e => setCustomerEdit(c => ({ ...c, birthdate: e.target.value }))} />
            </Field>
            <Field label="Mitgliedschaft">
              <select style={sel} value={customerEdit.membershipTier || "Keine Mitgliedschaft"} onChange={e => setCustomerEdit(c => ({ ...c, membershipTier: e.target.value }))}>
                {MEMBERSHIP_TIERS.map(tier => <option key={tier} value={tier}>{tier}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select style={sel} value={customerEdit.status || "aktiv"} onChange={e => setCustomerEdit(c => ({ ...c, status: e.target.value }))}>
                <option value="aktiv">Aktiv</option>
                <option value="inaktiv">Inaktiv</option>
                <option value="gekündigt">Gekündigt</option>
                <option value="ausstehend">Ausstehend</option>
              </select>
            </Field>
          </div>
          <Field label="Adresse">
            <input style={inp} value={customerEdit.address || ""} onChange={e => setCustomerEdit(c => ({ ...c, address: e.target.value }))} placeholder="Straße und Hausnummer" />
          </Field>
          <div style={{ display: "grid", gridTemplateColumns: "120px 1fr 1fr", gap: "0 12px" }}>
            <Field label="PLZ">
              <input style={inp} value={customerEdit.zip || ""} onChange={e => setCustomerEdit(c => ({ ...c, zip: e.target.value }))} />
            </Field>
            <Field label="Ort">
              <input style={inp} value={customerEdit.city || ""} onChange={e => setCustomerEdit(c => ({ ...c, city: e.target.value }))} />
            </Field>
            <Field label="Land">
              <input style={inp} value={customerEdit.country || ""} onChange={e => setCustomerEdit(c => ({ ...c, country: e.target.value }))} />
            </Field>
          </div>
          <Field label="IBAN">
            <input style={inp} value={customerEdit.iban || ""} onChange={e => setCustomerEdit(c => ({ ...c, iban: e.target.value }))} placeholder="DE…" />
          </Field>
          <Field label="Member-Notiz">
            <textarea style={{ ...inp, minHeight: 70, resize: "vertical" }} value={customerEdit.notes || ""} onChange={e => setCustomerEdit(c => ({ ...c, notes: e.target.value }))} />
          </Field>
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end", marginTop: 8 }}>
            <Btn variant="ghost" onClick={() => { setCustomerEdit(null); setCustomerEditMembershipId(null); }}>Abbrechen</Btn>
            <Btn onClick={saveCustomerFromMembership}>Memberdaten speichern</Btn>
          </div>
        </Modal>
      )}

      {confirm && (
        <ConfirmDialog
          message={confirm.message}
          detail={confirm.detail}
          confirmLabel="Member löschen"
          onConfirm={confirm.onConfirm}
          onCancel={() => setConfirm(null)}
        />
      )}

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18, marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "center", marginBottom: 14 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 16 }}>SEPA-XML importieren</h3>
            <p style={{ margin: "4px 0 0", color: "#64748b", fontSize: 13 }}>Liest pain.008-Lastschriftdateien aus dem Online-Banking und erstellt daraus Member-Kandidaten.</p>
          </div>
          <input type="file" accept=".xml,text/xml,application/xml" onChange={e => handleSepaFile(e.target.files?.[0])} style={{ ...inp, width: 260 }} />
        </div>
        {importError && <div style={{ background: "#fee2e2", color: "#991b1b", borderRadius: 10, padding: 12, fontSize: 13, marginBottom: 12 }}>{importError}</div>}
        {importRows.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 12, fontSize: 13, color: "#64748b" }}>
              <strong style={{ color: "#1e293b" }}>{importRows.length} SEPA-Positionen gefunden</strong>
              <span>{importablePreview.filter(r => r.matchedCustomer).length} vorhandene Personen verknüpft</span>
              <span>{importablePreview.filter(r => !r.matchedCustomer).length} neue Personen</span>
              <span>{importedPreview.filter(r => r.alreadyMember).length} werden übersprungen</span>
            </div>
            <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "auto", maxHeight: 300, marginBottom: 12 }}>
              <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 900 }}>
                <thead><tr style={{ background: "#f8fafc" }}>
                  {["Name aus XML", "Match", "Betrag", "Plan", "Eintritt", "Mandat", "Status"].map(h => <th key={h} style={{ padding: "10px 12px", textAlign: "left", fontSize: 12, color: "#64748b", textTransform: "uppercase" }}>{h}</th>)}
                </tr></thead>
                <tbody>
                  {importedPreview.slice(0, 80).map(row => (
                    <tr key={row.importId} style={{ borderTop: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>{row.name}</td>
                      <td style={{ padding: "10px 12px", color: row.alreadyMember || row.matchedCustomer ? "#059669" : "#d97706", fontSize: 13 }}>
                        {row.alreadyMember ? (row.existingMembership?.memberName || "bereits vorhanden") : row.matchedCustomer ? row.matchedCustomer.name : "wird neu angelegt"}
                      </td>
                      <td style={{ padding: "10px 12px", fontWeight: 700 }}>{fmt(row.amount)}</td>
                      <td style={{ padding: "10px 12px" }}>{row.plan}</td>
                      <td style={{ padding: "10px 12px" }}>
                        {row.alreadyMember ? (
                          <span style={{ color: "#94a3b8", fontSize: 13 }}>—</span>
                        ) : (
                          <input
                            type="date"
                            style={{ ...inp, minWidth: 128, padding: "7px 9px", fontSize: 12 }}
                            value={importOverrides[row.importId]?.startDate || row.signatureDate || row.collectionDate || today()}
                            onChange={e => setImportOverrides(overrides => ({
                              ...overrides,
                              [row.importId]: { ...(overrides[row.importId] || {}), startDate: e.target.value },
                            }))}
                          />
                        )}
                      </td>
                      <td style={{ padding: "10px 12px", color: "#64748b", fontSize: 12 }}>{row.mandateReference || "—"}</td>
                      <td style={{ padding: "10px 12px" }}>{row.alreadyMember ? <span style={{ color: "#64748b", fontSize: 13 }}>wird übersprungen</span> : <span style={{ color: "#64748b", fontSize: 13 }}>bereit</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
              <Btn variant="ghost" onClick={() => { setImportRows([]); setImportOverrides({}); }}>Verwerfen</Btn>
              <Btn onClick={importSepaMembers}>Nur neue Member anlegen</Btn>
            </div>
          </>
        )}
        {memberships.length > 0 && (
          <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, marginTop: importRows.length > 0 ? 12 : 0 }}>
            <Btn variant="ghost" onClick={syncMemberEmailsFromCustomers}>E-Mails synchronisieren</Btn>
            <Btn variant="ghost" onClick={runClearImportedSepaNotes}>Import-Notizen leeren</Btn>
            <Btn variant="ghost" onClick={repairMissingMemberCustomers}>Fehlende Personendaten reparieren</Btn>
          </div>
        )}
      </div>

      <div id="member-create" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 420px), 1fr))", gap: 18, marginBottom: 24, scrollMarginTop: 24 }}>
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
          <h3 style={{ margin: "0 0 12px", fontSize: 16 }}>Person</h3>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <Btn small variant={!newPerson ? "outline" : "ghost"} onClick={() => setNewPerson(null)}>Vorhandene Person</Btn>
            <Btn small variant={newPerson ? "outline" : "ghost"} onClick={startNewMember}>Neue Person</Btn>
          </div>
          {newPerson ? (
            <div>
              <Field label="Vor- und Nachname" required>
                <input style={inp} value={newPerson.name} placeholder="Name" onChange={e => setNewPerson(person => ({ ...person, name: e.target.value }))} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "0 12px" }}>
                <Field label="E-Mail">
                  <input style={inp} type="email" value={newPerson.email} placeholder="name@beispiel.de" onChange={e => setNewPerson(person => ({ ...person, email: e.target.value }))} />
                </Field>
                <Field label="Telefon">
                  <input style={inp} value={newPerson.phone} placeholder="Telefonnummer" onChange={e => setNewPerson(person => ({ ...person, phone: e.target.value }))} />
                </Field>
              </div>
              <Field label="Adresse">
                <input style={inp} value={newPerson.address} placeholder="Straße und Hausnummer" onChange={e => setNewPerson(person => ({ ...person, address: e.target.value }))} />
              </Field>
              <div style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "0 12px" }}>
                <Field label="PLZ">
                  <input style={inp} value={newPerson.zip} onChange={e => setNewPerson(person => ({ ...person, zip: e.target.value }))} />
                </Field>
                <Field label="Ort">
                  <input style={inp} value={newPerson.city} onChange={e => setNewPerson(person => ({ ...person, city: e.target.value }))} />
                </Field>
              </div>
              <div style={{ fontSize: 12, color: "#64748b", marginTop: 4 }}>Mindestens E-Mail oder Telefonnummer ist erforderlich. Doppelte Kontaktdaten werden vor dem Speichern erkannt.</div>
            </div>
          ) : (
            <>
              <Field label="Person suchen">
                <input style={inp} value={query} placeholder="Name, E-Mail, Telefon…" onChange={e => { setQuery(e.target.value); setSelectedId(""); }} />
              </Field>
              <div style={{ border: "1px solid #e2e8f0", borderRadius: 10, maxHeight: 260, overflow: "auto", marginBottom: 16 }}>
                {matches.map(member => {
                  const activePackages = memberships.filter(m => m.memberId === member.id && m.status === "aktiv");
                  return (
                    <button key={member.id} type="button" onClick={() => { setSelectedId(member.id); setQuery(member.name || ""); }} style={{ display: "block", width: "100%", padding: "10px 12px", border: "none", borderBottom: "1px solid #f1f5f9", textAlign: "left", background: selectedId === member.id ? "#eff6ff" : "#fff", cursor: "pointer" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                        <span style={{ fontWeight: 700, color: "#1e293b" }}>{member.name || "Name fehlt"}</span>
                        {activePackages.length > 0 && <Badge status={activePackages.length > 1 ? `${activePackages.length} Pakete` : "aktiv"} />}
                      </div>
                      <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>
                        {[member.email, member.phone].filter(Boolean).join(" · ") || "Keine Kontaktdaten"}
                        {activePackages.length > 0 ? ` · ${activePackages.length} aktive${activePackages.length === 1 ? "s" : ""} Paket${activePackages.length === 1 ? "" : "e"}` : ""}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 16 }}>Vertrag</h3>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
            <Field label="Membership">
              <select style={sel} value={form.plan} onChange={e => setPlan(e.target.value)}>
                {Object.keys(MEMBERSHIP_PLANS).map(plan => <option key={plan} value={plan}>{plan}</option>)}
              </select>
            </Field>
            <Field label="Monatsbetrag">
              <input style={inp} type="number" step="0.01" value={form.monthlyAmount} disabled={form.plan !== "Individuell"} onChange={e => setForm(f => ({ ...f, monthlyAmount: e.target.value }))} />
            </Field>
            <Field label="Vertragsunterschrift">
              <input style={inp} type="date" value={form.contractSignedAt || ""} onChange={e => setForm(f => ({ ...f, contractSignedAt: e.target.value }))} />
            </Field>
            <Field label="Eintritt / Vertragsbeginn">
              <input style={inp} type="date" value={form.startDate} onChange={e => setStartDate(e.target.value)} />
            </Field>
            <Field label="Vertragsende">
              <input style={inp} type="date" value={form.endDate} onChange={e => setForm(f => ({ ...f, endDate: e.target.value }))} />
            </Field>
            <Field label="Abbuchungstag">
              <select style={sel} value={form.debitDay} onChange={e => setForm(f => ({ ...f, debitDay: e.target.value }))}>
                {["1", "5", "10", "15", "20", "25"].map(day => <option key={day} value={day}>{day}. des Monats</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select style={sel} value={form.status} onChange={e => setForm(f => ({
                ...f,
                status: e.target.value,
                setupBankingStatus: e.target.value === "vorbereitung" ? (f.setupBankingStatus || "offen") : f.setupBankingStatus,
              }))}>
                {["aktiv", "vorbereitung", "pausiert", "gekündigt", "abgelaufen"].map(status => <option key={status} value={status}>{status}</option>)}
              </select>
            </Field>
          </div>
          <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#475569", fontWeight: 800 }}>Laufende SEPA-Sammellastschrift vorbereiten</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 12px" }}>
              <Field label="SEPA-Status">
                <select style={sel} value={form.setupBankingStatus || "offen"} onChange={e => setForm(f => ({
                  ...f,
                  setupBankingStatus: e.target.value,
                  setupBankingDoneAt: e.target.value === "erledigt" ? (f.setupBankingDoneAt || today()) : "",
                }))}>
                  <option value="offen">offen</option>
                  <option value="erledigt">erledigt</option>
                </select>
              </Field>
              <Field label="Erledigt am">
                <input style={inp} type="date" value={form.setupBankingDoneAt || ""} onChange={e => setForm(f => ({ ...f, setupBankingDoneAt: e.target.value }))} />
              </Field>
            </div>
            <input style={inp} value={form.setupBankingNote || ""} placeholder="SEPA-Notiz, z.B. ab 01.08. in der Sammellastschrift" onChange={e => setForm(f => ({ ...f, setupBankingNote: e.target.value }))} />
          </div>
          <div style={{ display: "grid", gap: 8, padding: 12, borderRadius: 10, background: "#f8fafc", border: "1px solid #e2e8f0", marginBottom: 12 }}>
            <div style={{ fontSize: 12, color: "#475569", fontWeight: 800 }}>Einmalige Einrichtungsgebühr</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "0 12px" }}>
              <Field label="Betrag">
                <input style={inp} type="number" step="0.01" value={form.setupFeeAmount || ""} onChange={e => setForm(f => ({ ...f, setupFeeAmount: e.target.value }))} />
              </Field>
              <Field label="Status">
                <select style={sel} value={form.setupFeeStatus || "offen"} onChange={e => setForm(f => ({
                  ...f,
                  setupFeeStatus: e.target.value,
                  setupFeeDoneAt: isTaskDone(e.target.value) ? (f.setupFeeDoneAt || today()) : "",
                }))}>
                  <option value="offen">offen</option>
                  <option value="erledigt">erledigt</option>
                  <option value="entfällt">entfällt</option>
                </select>
              </Field>
              <Field label="Erledigt am">
                <input style={inp} type="date" value={form.setupFeeDoneAt || ""} onChange={e => setForm(f => ({ ...f, setupFeeDoneAt: e.target.value }))} />
              </Field>
            </div>
          </div>
          <Field label="SEPA-Mandatsreferenz">
            <input style={inp} value={form.mandateReference} placeholder="z.B. PDB-2026-0001" onChange={e => setForm(f => ({ ...f, mandateReference: e.target.value }))} />
          </Field>
          <Field label="Notiz">
            <textarea style={{ ...inp, minHeight: 62, resize: "vertical" }} value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} />
          </Field>
          <Btn onClick={addMembership} disabled={!selectedCustomer && !newPerson}>
            {newPerson
              ? "Member anlegen"
              : selectedCustomer
              ? `${selectedCustomer.name} ${memberships.some(m => m.memberId === selectedCustomer.id && m.status === "aktiv") ? "weiteres Paket hinzufügen" : "hinzufügen"}`
              : "Person auswählen"}
          </Btn>
        </div>
      </div>

      <div style={{ background: "#fff", borderRadius: 14, border: "1px solid #e2e8f0", overflow: "hidden" }}>
        <div style={{ display: "grid", gap: 14, padding: "16px", borderBottom: "1px solid #e2e8f0", background: "linear-gradient(180deg, #fff 0%, #fcfbf9 100%)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: "#1e293b" }}>Member-Liste</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 2 }}>{sortedMemberships.length} von {memberships.length} Membern sichtbar</div>
          </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <Btn small variant="outline" disabled={!exportRows.length} onClick={() => downloadMembershipCsv(exportRows, `PDB-Member-${exportFileSuffix}.csv`)}>CSV exportieren</Btn>
              <Btn small disabled={!exportRows.length} onClick={() => downloadMembershipPdf(exportRows, exportFilterLabel, `PDB-Member-${exportFileSuffix}.pdf`)}>PDF exportieren</Btn>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 10, alignItems: "end" }}>
            <label style={{ display: "grid", gap: 5, fontSize: 11, color: "#64748b", fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase" }}>
              Suche
              <input style={{ ...inp, width: "100%" }} value={membershipSearch} placeholder="Name, E-Mail oder Notiz…" onChange={e => setMembershipSearch(e.target.value)} />
            </label>
            <label style={{ display: "grid", gap: 5, fontSize: 11, color: "#64748b", fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase" }}>
              Paket
              <select style={{ ...sel, width: "100%" }} value={membershipPlanFilter} onChange={e => setMembershipPlanFilter(e.target.value)}>
                <option value="alle">Alle Pakete</option>
                {Object.keys(MEMBERSHIP_PLANS).map(plan => <option key={plan} value={plan}>{plan}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 5, fontSize: 11, color: "#64748b", fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase" }}>
              Status
              <select style={{ ...sel, width: "100%" }} value={membershipStatusFilter} onChange={e => setMembershipStatusFilter(e.target.value)}>
                <option value="alle">Alle Status</option>
                {["aktiv", "vorbereitung", "pausiert", "gekündigt", "abgelaufen"].map(status => <option key={status} value={status}>{status}</option>)}
              </select>
            </label>
            <label style={{ display: "grid", gap: 5, fontSize: 11, color: "#64748b", fontWeight: 800, letterSpacing: ".04em", textTransform: "uppercase" }}>
              Sortierung
              <select style={{ ...sel, width: "100%" }} value={membershipSort} onChange={e => setMembershipSort(e.target.value)}>
              <option value="recent-desc">Zuletzt hinzugefügt/geändert</option>
              <option value="name-asc">Alphabetisch A-Z</option>
              <option value="name-desc">Alphabetisch Z-A</option>
              <option value="start-desc">Eintritt neueste zuerst</option>
              <option value="start-asc">Eintritt älteste zuerst</option>
              <option value="amount-desc">Betrag absteigend</option>
              <option value="amount-asc">Betrag aufsteigend</option>
              </select>
            </label>
          </div>
        </div>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead><tr style={{ background: "#f8fafc" }}>
            {["Nr.", "Name", "Aktuell", "Unterschrift", "Eintritt", "Vertragsende", "Monat", "Upgrade / Planung", "Status", "Notiz", ""].map(h => <th key={h} style={{ padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {sortedMemberships.length === 0 ? <tr><td colSpan={11} style={{ padding: 36, textAlign: "center", color: "#94a3b8" }}>Noch keine Member angelegt</td></tr> :
              sortedMemberships.map((m, index) => {
                const displayName = getMemberDisplayName(m);
                const scheduledAmount = getScheduledAmount(m);
                const canApplyScheduledPlan = m.scheduledPlan && m.scheduledStartDate && m.scheduledStartDate <= today();
                const scheduledDelta = m.scheduledPlan ? scheduledAmount - (Number(m.monthlyAmount) || 0) : 0;
                return (
                <tr key={m.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "12px 14px", color: "#94a3b8", fontSize: 13, fontWeight: 700 }}>{index + 1}</td>
                  <td style={{ padding: "12px 14px", fontWeight: 700, minWidth: 220 }}>
                    <div>{displayName}</div>
                    {m.packageLabel && <div style={{ fontSize: 11, color: "#64748b", fontWeight: 700, marginTop: 3 }}>{m.packageLabel}</div>}
                  </td>
                  <td style={{ padding: "12px 14px", fontSize: 13, color: "#1e293b", fontWeight: 800 }}>
                    {m.plan}
                  </td>
                  <td style={{ padding: "12px 14px" }}><input style={{ ...inp, minWidth: 128 }} type="date" value={m.contractSignedAt || ""} onChange={e => updateMembership(m.id, { contractSignedAt: e.target.value })} /></td>
                  <td style={{ padding: "12px 14px", color: "#64748b", fontSize: 13 }}>{fmtDate(m.startDate)}</td>
                  <td style={{ padding: "12px 14px" }}><input style={{ ...inp, minWidth: 128 }} type="date" value={m.endDate || ""} onChange={e => updateMembership(m.id, { endDate: e.target.value })} /></td>
                  <td style={{ padding: "12px 14px", fontWeight: 700 }}>
                    {m.plan === "Individuell"
                      ? <input style={{ ...inp, minWidth: 92 }} type="number" step="0.01" value={m.monthlyAmount || ""} onChange={e => updateMembership(m.id, { monthlyAmount: e.target.value })} />
                      : fmt(m.monthlyAmount)}
                  </td>
                  <td style={{ padding: "12px 14px", minWidth: 230 }}>
                    <div style={{ display: "grid", gap: 6 }}>
                      <select style={{ ...sel, minWidth: 128, fontSize: 12, padding: "7px 9px" }} value={m.scheduledPlan || ""} onChange={e => updateMembership(m.id, {
                        scheduledPlan: e.target.value,
                        scheduledStartDate: e.target.value ? (m.scheduledStartDate || "") : "",
                        scheduledMonthlyAmount: e.target.value === "Individuell" ? (m.scheduledMonthlyAmount || m.monthlyAmount || "") : "",
                        scheduledContractSignedAt: e.target.value ? (m.scheduledContractSignedAt || "") : "",
                        scheduledContractEndDate: e.target.value ? (m.scheduledContractEndDate || "") : "",
                        scheduledBankingStatus: e.target.value ? (m.scheduledBankingStatus || "offen") : "",
                        scheduledBankingDoneAt: e.target.value ? (m.scheduledBankingDoneAt || "") : "",
                        scheduledBankingNote: e.target.value ? (m.scheduledBankingNote || "") : "",
                      })}>
                        <option value="">Keine Änderung planen</option>
                        {Object.keys(MEMBERSHIP_PLANS).map(plan => <option key={plan} value={plan}>{plan}</option>)}
                      </select>
                      {m.scheduledPlan && (
                        <>
                          <input style={{ ...inp, minWidth: 128, fontSize: 12, padding: "7px 9px" }} type="date" value={m.scheduledStartDate || ""} onChange={e => updateMembership(m.id, { scheduledStartDate: e.target.value, scheduledContractEndDate: addOneYear(e.target.value) })} />
                          {m.scheduledPlan === "Individuell" && (
                            <input style={{ ...inp, minWidth: 92, fontSize: 12, padding: "7px 9px" }} type="number" step="0.01" value={m.scheduledMonthlyAmount || ""} placeholder="Betrag" onChange={e => updateMembership(m.id, { scheduledMonthlyAmount: e.target.value })} />
                          )}
                          <div style={{ fontSize: 11, color: "#64748b" }}>
                            ab {fmtDate(m.scheduledStartDate)} · {scheduledAmount ? fmt(scheduledAmount) : "Betrag offen"}
                            {scheduledDelta ? ` (${scheduledDelta > 0 ? "+" : ""}${fmt(scheduledDelta)})` : ""}
                          </div>
                          <div style={{ display: "grid", gap: 6, padding: 8, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                            <div style={{ fontSize: 11, color: "#475569", fontWeight: 800 }}>Neuer Vertrag</div>
                          <input style={{ ...inp, minWidth: 128, fontSize: 12, padding: "7px 9px" }} type="date" value={m.scheduledContractSignedAt || ""} onChange={e => updateMembership(m.id, { scheduledContractSignedAt: e.target.value })} />
                          <div style={{ fontSize: 11, color: "#64748b" }}>unterschrieben am</div>
                            <input style={{ ...inp, minWidth: 128, fontSize: 12, padding: "7px 9px" }} type="date" value={m.scheduledContractEndDate || ""} onChange={e => updateMembership(m.id, { scheduledContractEndDate: e.target.value })} />
                            <div style={{ fontSize: 11, color: "#64748b" }}>neues Vertragsende</div>
                          </div>
                          {m.scheduledStartDate > today() && (
                            <div style={{ fontSize: 11, color: "#1e40af", fontWeight: 700 }}>Vorgemerkt, wird noch nicht aktiv gebucht.</div>
                          )}
                          <div style={{ display: "grid", gap: 6, padding: 8, borderRadius: 8, background: "#f8fafc", border: "1px solid #e2e8f0" }}>
                            <div style={{ fontSize: 11, color: "#475569", fontWeight: 800 }}>Onlinebanking</div>
                            <select style={{ ...sel, minWidth: 128, fontSize: 12, padding: "7px 9px" }} value={m.scheduledBankingStatus === "geprüft" ? "erledigt" : (m.scheduledBankingStatus || "offen")} onChange={e => updateScheduledBanking(m, e.target.value)}>
                              <option value="offen">offen</option>
                              <option value="erledigt">erledigt</option>
                            </select>
                            {(["erledigt", "geprüft"].includes(m.scheduledBankingStatus)) && (
                              <input style={{ ...inp, minWidth: 128, fontSize: 12, padding: "7px 9px" }} type="date" value={m.scheduledBankingDoneAt || today()} onChange={e => updateMembership(m.id, { scheduledBankingDoneAt: e.target.value })} />
                            )}
                            <input style={{ ...inp, minWidth: 160, fontSize: 12, padding: "7px 9px" }} value={m.scheduledBankingNote || ""} placeholder="Banking-Notiz, z.B. am 09.06. geändert" onChange={e => updateMembership(m.id, { scheduledBankingNote: e.target.value })} />
                          </div>
                          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                            {(m.scheduledBankingStatus || "offen") === "offen" && <Btn small variant="outline" onClick={() => updateScheduledBanking(m, "erledigt")}>Banking erledigt</Btn>}
                            <Btn small variant="outline" disabled={!canApplyScheduledPlan} onClick={() => applyScheduledPlan(m)}>{m.scheduledStartDate ? (canApplyScheduledPlan ? "Übernehmen" : "Ab Datum übernehmen") : "Datum wählen"}</Btn>
                            <Btn small variant="ghost" onClick={() => updateMembership(m.id, { scheduledPlan: "", scheduledStartDate: "", scheduledMonthlyAmount: "", scheduledContractSignedAt: "", scheduledContractEndDate: "", scheduledBankingStatus: "", scheduledBankingDoneAt: "", scheduledBankingNote: "" })}>Leeren</Btn>
                          </div>
                        </>
                      )}
                    </div>
                  </td>
                  <td style={{ padding: "12px 14px" }}>
                    <select style={{ ...sel, minWidth: 112 }} value={m.status || "aktiv"} onChange={e => updateMembership(m.id, { status: e.target.value })}>
                      {["aktiv", "vorbereitung", "pausiert", "gekündigt", "abgelaufen"].map(status => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </td>
                  <td style={{ padding: "12px 14px", minWidth: 220 }}>
                    <input style={inp} value={m.notes || ""} placeholder="Notiz hinzufügen…" onChange={e => updateMembership(m.id, { notes: e.target.value })} />
                  </td>
                  <td style={{ padding: "12px 14px", textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      <Btn small variant="ghost" onClick={() => openCustomerEditFromMembership(m)}>Personendaten</Btn>
                      {m.status === "gekündigt" && <Btn small variant="outline" onClick={() => openCancellationPreview(m)}>{m.cancellationEmailSentAt ? "Erneut prüfen" : "E-Mail prüfen"}</Btn>}
                      <Btn small variant="danger" onClick={() => requestRemoveMembership(m)}>Löschen</Btn>
                    </div>
                  </td>
                </tr>
              );})}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Member Finanzen ─────────────────────────────────────────────────────────
function MemberFinance({ data }) {
  const [financeData, setFinanceData] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/member-finance-data.json")
      .then(response => {
        if (!response.ok) throw new Error("Member-Finanzdaten konnten nicht geladen werden.");
        return response.json();
      })
      .then(json => {
        if (!alive) return;
        setFinanceData(json);
        setSelectedMonth(json.months?.at(-1)?.month || "");
      })
      .catch(error => {
        if (!alive) return;
        setLoadError(error.message || "Member-Finanzdaten fehlen.");
      });
    return () => { alive = false; };
  }, []);

  const memberById = useMemo(() => new Map((data.members || []).map(member => [member.id, member])), [data.members]);
  const displayNameForMembership = (membership) => membership.memberName || memberById.get(membership.memberId)?.name || "Unbekannt";
  const normalizeIban = (iban = "") => iban.replace(/\s+/g, "").toUpperCase();
  const amountKey = tx => normalizeIban(tx.iban) || normalizeMemberName(tx.name);
  const monthLabel = month => month ? new Date(`${month}-01T00:00:00`).toLocaleDateString("de-DE", { month: "long", year: "numeric" }) : "—";
  const planOrder = ["Private", "Beyond", "Pure", "Define", "Individuell"];

  const matchedTransactions = useMemo(() => {
    if (!financeData) return [];
    const memberships = data.memberships || [];
    const byIban = new Map(memberships.filter(m => m.sepaIban).map(m => [normalizeIban(m.sepaIban), m]));

    return (financeData.transactions || []).map(tx => {
      const ibanMatch = byIban.get(normalizeIban(tx.iban));
      const txName = normalizeMemberName(tx.name);
      const nameMatch = !ibanMatch && txName
        ? memberships.find(membership => {
            const crmName = normalizeMemberName(displayNameForMembership(membership));
            if (!crmName) return false;
            return crmName === txName || crmName.includes(txName) || txName.includes(crmName);
          })
        : null;
      const membership = ibanMatch || nameMatch || null;
      const matchStatus = membership?.status === "gekündigt"
        ? "gekündigt"
        : membership?.status === "abgelaufen"
          ? "beendet"
          : membership
            ? "gematcht"
            : "ungeklärt";
      return {
        ...tx,
        match: membership,
        matchStatus,
        matchedName: membership ? displayNameForMembership(membership) : "",
        resolvedPlan: membership?.plan || tx.plan || "Individuell",
      };
    });
  }, [financeData, data.memberships, memberById]);

  if (loadError) {
    return (
      <div>
        <h2 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 800, color: "#1e293b" }}>Member Finanzen</h2>
        <div style={{ background: "#fef2f2", border: "1px solid #fecaca", borderRadius: 12, padding: 16, color: "#991b1b", fontWeight: 700 }}>{loadError}</div>
      </div>
    );
  }

  if (!financeData) {
    return (
      <div>
        <h2 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 800, color: "#1e293b" }}>Member Finanzen</h2>
        <div style={{ color: "#64748b", fontSize: 14 }}>XML-Auszüge werden geladen…</div>
      </div>
    );
  }

  const months = financeData.months || [];
  const currentMonth = months.find(month => month.month === selectedMonth) || months.at(-1) || { month: selectedMonth, amount: 0, count: 0 };
  const previousCalendarMonthValue = (() => {
    if (!currentMonth.month) return "";
    const [year, monthNumber] = currentMonth.month.split("-").map(Number);
    const date = new Date(Date.UTC(year, monthNumber - 2, 1));
    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
  })();
  const previousMonth = months.find(month => month.month === previousCalendarMonthValue) || null;
  const txMonth = tx => tx.financeMonth || tx.collectionDate?.slice(0, 7) || "";
  const currentRows = matchedTransactions.filter(tx => txMonth(tx) === currentMonth.month);
  const previousRows = previousMonth ? matchedTransactions.filter(tx => txMonth(tx) === previousMonth.month) : [];
  const revenueDelta = previousMonth ? currentMonth.amount - (previousMonth.amount || 0) : 0;
  const currentMonthStart = currentMonth.month ? `${currentMonth.month}-01` : "";
  const currentMonthEnd = (() => {
    if (!currentMonth.month) return "";
    const [year, monthNumber] = currentMonth.month.split("-").map(Number);
    return new Date(Date.UTC(year, monthNumber, 0)).toISOString().split("T")[0];
  })();
  const isMembershipExpectedInCurrentMonth = membership => {
    if (!membership || !currentMonthStart || !currentMonthEnd) return false;
    const status = membership.status || "aktiv";
    if (!["aktiv", "vorbereitung", "gekündigt", "abgelaufen"].includes(status)) return false;
    if (membership.startDate && membership.startDate > currentMonthEnd) return false;
    if (membership.endDate && membership.endDate < currentMonthStart) return false;
    if (["gekündigt", "abgelaufen"].includes(status) && !membership.endDate) return false;
    return true;
  };
  const maxMonthAmount = Math.max(...months.map(month => month.amount || 0), 1);
  const matchedCount = currentRows.filter(tx => tx.match).length;
  const unresolvedCount = currentRows.filter(tx => !tx.match).length;
  const matchedRate = currentRows.length ? Math.round((matchedCount / currentRows.length) * 100) : 0;

  const byPlan = planOrder.map(plan => {
    const rows = currentRows.filter(tx => tx.resolvedPlan === plan);
    return {
      plan,
      count: rows.reduce((sum, tx) => sum + (Number(tx.packageCount) || 1), 0),
      amount: rows.reduce((sum, tx) => sum + (Number(tx.amount) || 0), 0),
    };
  }).filter(plan => plan.count || plan.amount);
  const maxPlanAmount = Math.max(...byPlan.map(plan => plan.amount), 1);

  const currentByKey = new Map(currentRows.map(tx => [amountKey(tx), tx]));
  const previousByKey = new Map(previousRows.map(tx => [amountKey(tx), tx]));
  const firstSeenMonthByKey = matchedTransactions.reduce((acc, tx) => {
    const key = amountKey(tx);
    const month = txMonth(tx);
    if (!key || !month) return acc;
    if (!acc.has(key) || month < acc.get(key)) acc.set(key, month);
    return acc;
  }, new Map());
  const isFirstSeenInCurrentMonth = tx => firstSeenMonthByKey.get(amountKey(tx)) === currentMonth.month;
  const unresolvedRows = currentRows.filter(tx => !tx.match);
  const newPayments = currentRows
    .filter(tx => (!previousByKey.has(amountKey(tx)) || isFirstSeenInCurrentMonth(tx)) && !tx.match)
    .slice(0, 12);
  const missingFromPrevious = previousRows
    .filter(tx => !currentByKey.has(amountKey(tx)))
    .map(tx => ({
      ...tx,
      expectedAbsence: Boolean(tx.match && !isMembershipExpectedInCurrentMonth(tx.match)),
    }))
    .slice(0, 12);
  const amountChanges = currentRows
    .map(tx => {
      const prev = previousByKey.get(amountKey(tx));
      if (isFirstSeenInCurrentMonth(tx)) return null;
      if (!prev || Number(prev.amount) === Number(tx.amount)) return null;
      return { tx, previousAmount: Number(prev.amount), delta: Number(tx.amount) - Number(prev.amount) };
    })
    .filter(Boolean)
    .slice(0, 12);

  const activeMemberships = (data.memberships || []).filter(isMembershipExpectedInCurrentMonth);
  const paidKeys = new Set(currentRows.map(tx => normalizeIban(tx.iban)).filter(Boolean));
  const crmMissingPayments = activeMemberships
    .filter(membership => membership.sepaIban && !paidKeys.has(normalizeIban(membership.sepaIban)))
    .slice(0, 12);

  const txName = tx => tx.matchedName || cleanSepaName(tx.name);
  const planColor = plan => ({
    Private: "#111827",
    Beyond: "#7c3aed",
    Pure: "#0f766e",
    Define: "#2563eb",
    Individuell: "#64748b",
  }[plan] || "#64748b");

  return (
    <div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", marginBottom: 22 }}>
        <div>
          <h2 style={{ margin: "0 0 8px", fontSize: 26, fontWeight: 800, color: "#1e293b" }}>Member Finanzen</h2>
          <p style={{ margin: 0, color: "#64748b", fontSize: 14 }}>Auswertung der SEPA-XMLs aus dem Ordner {financeData.sourceFolder}.</p>
          {financeData.monthRule && <p style={{ margin: "6px 0 0", color: "#64748b", fontSize: 12 }}>{financeData.monthRule}</p>}
        </div>
        <select style={{ ...sel, width: 220 }} value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)}>
          {months.map(month => <option key={month.month} value={month.month}>{monthLabel(month.month)}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 14, marginBottom: 22 }}>
        {[
          ["Member Umsatz", fmt(currentMonth.amount), revenueDelta >= 0 ? "#047857" : "#b91c1c", revenueDelta ? `${revenueDelta > 0 ? "+" : ""}${fmt(revenueDelta)} zum Vormonat` : "kein Vergleich"],
          ["Abbuchungen", currentMonth.count, "#1e40af", `${matchedCount} CRM-Matches`],
          ["CRM Trefferquote", `${matchedRate}%`, unresolvedCount ? "#b45309" : "#047857", `${unresolvedCount} ungeklärt`],
          ["XML-Dateien", currentMonth.files?.length || 0, "#475569", `${financeData.fileCount} Dateien gesamt`],
        ].map(([label, value, color, hint]) => (
          <div key={label} style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 900, color }}>{value}</div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 4, fontWeight: 700 }}>{label}</div>
            <div style={{ fontSize: 11, color, marginTop: 6, fontWeight: 800 }}>{hint}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1.1fr) minmax(320px, 0.9fr)", gap: 18, marginBottom: 22 }}>
        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 16, color: "#1e293b" }}>Monatsverlauf</h3>
          <div style={{ display: "grid", gap: 10 }}>
            {months.map(month => (
              <button key={month.month} onClick={() => setSelectedMonth(month.month)} style={{ border: 0, background: month.month === currentMonth.month ? "#eff6ff" : "transparent", borderRadius: 8, padding: 8, cursor: "pointer", textAlign: "left" }}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12, fontSize: 13, fontWeight: 800, color: "#1e293b", marginBottom: 5 }}>
                  <span>{monthLabel(month.month)}</span>
                  <span>{fmt(month.amount)} · {month.count} Einzüge</span>
                </div>
                <div style={{ height: 10, background: "#f1f5f9", borderRadius: 20, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(4, Math.round((month.amount / maxMonthAmount) * 100))}%`, height: "100%", background: "#1e40af", borderRadius: 20 }} />
                </div>
              </button>
            ))}
          </div>
        </div>

        <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 18 }}>
          <h3 style={{ margin: "0 0 14px", fontSize: 16, color: "#1e293b" }}>Pakete im Monat</h3>
          <div style={{ display: "grid", gap: 12 }}>
            {byPlan.map(plan => (
              <div key={plan.plan}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 800, color: "#1e293b", marginBottom: 5 }}>
                  <span>{plan.plan}</span>
                  <span>{fmt(plan.amount)} · {plan.count}</span>
                </div>
                <div style={{ height: 9, background: "#f1f5f9", borderRadius: 20, overflow: "hidden" }}>
                  <div style={{ width: `${Math.max(5, Math.round((plan.amount / maxPlanAmount) * 100))}%`, height: "100%", background: planColor(plan.plan), borderRadius: 20 }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 18, marginBottom: 22 }}>
        <FinanceList title="Betragsänderungen" items={amountChanges} empty="Keine Betragsänderungen zum Vormonat." render={change => (
          <>
            <strong>{txName(change.tx)}</strong>
            <span>{fmt(change.previousAmount)} → {fmt(change.tx.amount)} ({change.delta > 0 ? "+" : ""}{fmt(change.delta)})</span>
          </>
        )} />
        <FinanceList title="Neu/offen" items={newPayments} empty="Keine neuen ungeklärten Einzüge." render={tx => (
          <>
            <strong>{txName(tx)}</strong>
            <span>{fmt(tx.amount)} · {tx.resolvedPlan}</span>
          </>
        )} />
        <FinanceList title="Ungeklärte CRM-Zuordnung" items={unresolvedRows} empty="Alle Einzüge sind einem CRM-Member zugeordnet." render={tx => (
          <>
            <strong>{cleanSepaName(tx.name)}</strong>
            <span>{fmt(tx.amount)} · {tx.sourceFile}</span>
          </>
        )} />
        <FinanceList title="Fehlt gegenüber Vormonat" items={missingFromPrevious} empty="Keine fehlenden Vorjahres-/Vormonatszahler." render={tx => (
          <>
            <strong>{txName(tx)}</strong>
            <span>
              vorher {fmt(tx.amount)} · {tx.resolvedPlan}
              {tx.expectedAbsence
                ? ` · erwartet: Vertrag beendet${tx.match?.endDate ? ` am ${fmtDate(tx.match.endDate)}` : ""}`
                : " · bitte prüfen"}
            </span>
          </>
        )} />
        <FinanceList title="CRM aktiv, im XML nicht gefunden" items={crmMissingPayments} empty="Alle aktiven SEPA-Member wurden gefunden." render={membership => (
          <>
            <strong>{displayNameForMembership(membership)}</strong>
            <span>{membership.plan} · erwartet {fmt(membership.monthlyAmount)}</span>
          </>
        )} />
      </div>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "16px 18px", borderBottom: "1px solid #f1f5f9", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h3 style={{ margin: 0, fontSize: 16, color: "#1e293b" }}>Einzüge {monthLabel(currentMonth.month)}</h3>
          <span style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>{currentRows.length} Positionen</span>
        </div>
        <div style={{ maxHeight: 420, overflow: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse" }}>
            <thead><tr style={{ background: "#f8fafc" }}>
              {["Name", "Paket", "Betrag", "CRM", "Quelle"].map(h => <th key={h} style={{ padding: "10px 14px", textAlign: "left", color: "#64748b", fontSize: 12, textTransform: "uppercase" }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {currentRows.map(tx => (
                <tr key={tx.id} style={{ borderTop: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 800, color: "#1e293b" }}>{txName(tx)}</td>
                  <td style={{ padding: "10px 14px" }}><Badge status={tx.resolvedPlan} /></td>
                  <td style={{ padding: "10px 14px", fontSize: 13, fontWeight: 900, color: "#047857" }}>{fmt(tx.amount)}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: tx.match ? (tx.matchStatus === "gekündigt" ? "#b45309" : "#047857") : "#b45309", fontWeight: 800 }}>{tx.matchStatus}</td>
                  <td style={{ padding: "10px 14px", fontSize: 12, color: "#64748b" }}>{tx.sourceFile}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function FinanceList({ title, items, empty, render }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 14, padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center", marginBottom: 10 }}>
        <h3 style={{ margin: 0, fontSize: 15, color: "#1e293b" }}>{title}</h3>
        <span style={{ color: "#64748b", fontSize: 12, fontWeight: 800 }}>{items.length}</span>
      </div>
      {items.length === 0 ? (
        <div style={{ color: "#94a3b8", fontSize: 13 }}>{empty}</div>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {items.map((item, index) => (
            <div key={item.id || item.tx?.id || item.memberId || index} style={{ display: "flex", justifyContent: "space-between", gap: 12, borderTop: index ? "1px solid #f1f5f9" : 0, paddingTop: index ? 8 : 0, fontSize: 13, color: "#475569" }}>
              {render(item)}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── App Shell ────────────────────────────────────────────────────────────────
const NAV = [
  { id: "dashboard", label: "Dashboard", icon: "📊" },
  { id: "memberships", label: "Member", icon: "💎" },
  { id: "member-finance", label: "Member Finanzen", icon: "📈" },
  { id: "work-time", label: "Arbeitszeiten", icon: "🕒" },
  { id: "revenue", label: "Umsätze", icon: "◉" },
  { id: "invoices", label: "Rechnungen", icon: "📄" },
  { id: "reminders", label: "Mahnwesen", icon: "⚠️" },
  { id: "bank", label: "Kontoauszüge", icon: "🏦" },
  { id: "settings", label: "Einstellungen", icon: "⚙️" },
];

export default function CRM() {
  const [data, save] = useStorage();
  const [page, setPage] = useState("dashboard");
  const [isCompact, setIsCompact] = useState(() => window.innerWidth < 760);
  const [sidebarOpen, setSidebarOpen] = useState(() => window.innerWidth >= 760);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 759px)");
    const syncLayout = event => {
      setIsCompact(event.matches);
      if (event.matches) setSidebarOpen(false);
    };
    media.addEventListener("change", syncLayout);
    return () => media.removeEventListener("change", syncLayout);
  }, []);

  const overdueCount = data.invoices.filter(i => i.status === "überfällig" || i.status?.includes("Mahnung")).length;
  const activeMemberCount = new Set((data.memberships || []).filter(membership => membership.status === "aktiv").map(membership => membership.memberId)).size;

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'DM Sans', system-ui, sans-serif", background: "#f6f3ee", color: "#1e293b" }}>
      {/* Sidebar */}
      <aside style={{
        width: sidebarOpen ? 220 : 64, background: "#161616", display: "flex", flexDirection: "column",
        transition: "width 0.2s", flexShrink: 0, overflow: "hidden",
        position: isCompact && sidebarOpen ? "fixed" : "relative", inset: isCompact && sidebarOpen ? "0 auto 0 0" : undefined,
        zIndex: isCompact && sidebarOpen ? 1200 : undefined, boxShadow: isCompact && sidebarOpen ? "18px 0 50px rgba(0,0,0,.24)" : undefined,
      }}>
        <div style={{ padding: "20px 16px", borderBottom: "1px solid #2c2c2c", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ width: 32, height: 32, background: "#d8c3a5", borderRadius: 8, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, fontWeight: 900, color: "#161616", flexShrink: 0 }}>PDB</div>
          {sidebarOpen && <span style={{ fontSize: 15, fontWeight: 800, color: "#fff", whiteSpace: "nowrap" }}>PDB Office</span>}
          <button aria-label={sidebarOpen ? "Seitenleiste einklappen" : "Seitenleiste ausklappen"} onClick={() => setSidebarOpen(o => !o)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", marginLeft: "auto", fontSize: 18, flexShrink: 0 }}>
            {sidebarOpen ? "◀" : "▶"}
          </button>
        </div>

        <nav style={{ flex: 1, padding: "12px 8px" }}>
          {NAV.map(n => (
            <button key={n.id} aria-label={n.label} onClick={() => setPage(n.id)} style={{
              display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "10px 10px",
              background: page === n.id ? "#2c2c2c" : "none", border: "none", borderRadius: 8,
              color: page === n.id ? "#fff" : "#94a3b8", cursor: "pointer", marginBottom: 2,
              fontSize: 14, fontWeight: page === n.id ? 700 : 500, textAlign: "left", transition: "all 0.15s",
              position: "relative",
            }}>
              <span style={{ width: 22, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 18, lineHeight: 1, flexShrink: 0 }}>{n.icon}</span>
              {sidebarOpen && <span style={{ whiteSpace: "nowrap" }}>{n.label}</span>}
              {n.id === "reminders" && overdueCount > 0 && (
                <span style={{ background: "#dc2626", color: "#fff", borderRadius: 20, fontSize: 11, fontWeight: 700, padding: "1px 7px", marginLeft: "auto", flexShrink: 0 }}>{overdueCount}</span>
              )}
            </button>
          ))}
        </nav>

        <div style={{ padding: "12px 16px", borderTop: "1px solid #2c2c2c" }}>
          {sidebarOpen && <div style={{ fontSize: 11, color: "#475569" }}>v1.0 · {activeMemberCount} aktive Member</div>}
        </div>
      </aside>

      {/* Main */}
      <main style={{ flex: 1, minWidth: 0, overflow: "auto", padding: isCompact ? "18px 14px" : "32px 36px" }}>
        {page === "dashboard" && <Dashboard data={data} onNavigate={setPage} />}
        {page === "members" && <Members data={data} save={save} />}
        {page === "memberships" && <Memberships data={data} save={save} />}
        {page === "member-finance" && <MemberFinance data={data} />}
        {page === "work-time" && <WorkTimeWorkspace data={data} save={save} />}
        {page === "revenue" && <RevenueWorkspace data={data} save={save} />}
        {page === "invoices" && <Invoices data={data} save={save} />}
        {page === "reminders" && <Reminders data={data} save={save} />}
        {page === "bank" && <BankUpload data={data} save={save} />}
        {page === "shopify" && <ShopifyImport data={data} save={save} onNavigate={setPage} />}
        {page === "settings" && <Settings data={data} save={save} />}
      </main>
    </div>
  );
}
