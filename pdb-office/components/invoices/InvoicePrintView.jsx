import React, { useEffect, useMemo, useState } from "react";
import { fmt, fmtDate } from "../../utils/formatters.js";
import { getInvoiceDueLabel, getInvoicePositionDateLabel, isMedicalInvoiceProfile } from "../../modules/invoices/invoiceProfiles.js";
import { createInvoicePdfDownload } from "../../modules/invoices/invoicePdf.js";
import { getInvoiceBranding } from "../../modules/invoices/invoiceBranding.js";

function loadLogoDataUrl(url, onReady, onError) {
  if (!url) {
    onError();
    return () => {};
  }
  if (url.startsWith("data:image/")) {
    onReady(url);
    return () => {};
  }

  let active = true;
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.onload = () => {
    if (!active) return;
    try {
      const canvas = document.createElement("canvas");
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      canvas.getContext("2d").drawImage(image, 0, 0);
      onReady(canvas.toDataURL("image/png"));
    } catch {
      onError();
    }
  };
  image.onerror = () => active && onError();
  image.src = url;
  return () => { active = false; };
}

export default function InvoicePrintView({ inv, profile, onClose, Button }) {
  const [downloadState, setDownloadState] = useState("idle");
  const branding = useMemo(() => getInvoiceBranding(profile), [profile]);
  const [logoState, setLogoState] = useState({ status: "loading", dataUrl: "" });

  useEffect(() => {
    setLogoState({ status: "loading", dataUrl: "" });
    return loadLogoDataUrl(
      branding.logoUrl,
      dataUrl => setLogoState({ status: "ready", dataUrl }),
      () => setLogoState({ status: "error", dataUrl: "" }),
    );
  }, [branding.logoUrl]);

  const pdfProfile = useMemo(() => ({ ...profile, pdfLogoDataUrl: logoState.dataUrl }), [profile, logoState.dataUrl]);
  const pdfDownload = useMemo(() => createInvoicePdfDownload(inv, pdfProfile), [inv, pdfProfile]);
  const taxRate = inv.taxRate ?? profile.defaultTaxRate ?? 0;
  const design = {
    "pdb-premium": { accent: "#1e40af", header: "#1e40af", logoBg: "#fff" },
    "medical-clean": { accent: "#0f766e", header: "#0f766e", logoBg: "#f0fdfa" },
    classic: { accent: "#1e293b", header: "#1e293b", logoBg: "#f8fafc" },
  }[profile.pdfDesignVariant] || { accent: "#1e40af", header: "#1e40af", logoBg: "#fff" };

  return (
    <div className="invoice-preview-backdrop" style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div className="invoice-preview-modal" style={{ background: "#fff", borderRadius: 16, width: 720, maxWidth: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
        <div className="invoice-preview-toolbar" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>Druckvorschau — {inv.number}</h3>
          <div className="invoice-preview-actions" style={{ display: "flex", gap: 10 }}>
            <form action="/api/office/invoice-pdf" method="post" onSubmit={event => {
              if (logoState.status === "loading") event.preventDefault();
              else setDownloadState("done");
            }} style={{ margin: 0 }}>
              <input type="hidden" name="admin_csrf" value="1" />
              <input type="hidden" name="filename" value={pdfDownload.fileName} />
              <input type="hidden" name="pdf" value={pdfDownload.base64} />
              <button
                type="submit"
                disabled={logoState.status === "loading"}
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 34, padding: "0 14px", border: 0, borderRadius: 8, background: design.accent, color: "#fff", fontSize: 11, fontWeight: 700, cursor: logoState.status === "loading" ? "wait" : "pointer", opacity: logoState.status === "loading" ? 0.6 : 1 }}
              >
                {logoState.status === "loading" ? "Logo wird geladen…" : "⬇️ PDF herunterladen"}
              </button>
            </form>
            <button aria-label="PDF-Vorschau schließen" onClick={onClose} style={{ background: "none", border: "none", fontSize: 17, cursor: "pointer", color: "#94a3b8" }}>×</button>
          </div>
        </div>
        <div className="invoice-preview-status" role="status" aria-live="polite" style={{ padding: "8px 24px", borderBottom: "1px solid #f1f5f9", fontSize: 11, color: "#64748b" }}>
          {downloadState === "done" ? "Der PDF-Download wurde gestartet." : logoState.status === "error" ? "Das Logo konnte nicht geladen werden. Die PDF wird mit Textkopf erstellt." : "Die Rechnung wird direkt als PDF-Datei heruntergeladen."}
        </div>
        <div className="invoice-preview-scroll">
          <div className="invoice-print-page" style={{ position: "relative", width: 680, minHeight: 960, boxSizing: "border-box", padding: "22px 34px 112px 46px", fontSize: 11, lineHeight: 1.38, background: "#fff", color: "#1e293b", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
          <div className="invoice-print-header" style={{ display: "flex", justifyContent: "space-between", paddingBottom: 16, marginBottom: 18, borderBottom: `2px solid ${design.accent}` }}>
            <div className="invoice-print-brand" style={{ display: "flex", gap: 16 }}>
              <div className="invoice-print-logo" style={{ width: 70, height: 84, display: "flex", alignItems: "center", justifyContent: "flex-start", fontWeight: 800, color: "#1e293b", overflow: "hidden" }}>
                {branding.logoUrl ? <img src={branding.logoUrl} alt={profile.companyName || "Logo"} width="70" height="84" fetchPriority="high" style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : (profile.logoPlaceholder || "PDB")}
              </div>
              <div className="invoice-print-brand-copy">
                <div className="invoice-print-brand-primary" style={{ fontSize: 17, fontWeight: 800 }}>{branding.headerPrimary}</div>
                {branding.headerBrand && <div className="invoice-print-brand-secondary" style={{ fontSize: 13, fontWeight: 800, color: "#1e293b", marginTop: 2 }}>{branding.headerBrand}</div>}
                <div className="invoice-print-brand-email" style={{ fontSize: 10, color: "#64748b", marginTop: 6, lineHeight: 1.35, whiteSpace: "pre-line" }}>{profile.companyEmail}</div>
              </div>
            </div>
            <div className="invoice-print-meta" style={{ textAlign: "right" }}>
              <div className="invoice-print-title" style={{ fontSize: 24, fontWeight: 800, color: design.accent }}>RECHNUNG</div>
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 8, lineHeight: 1.45 }}>Rechnungsnr.: <strong>{inv.number}</strong><br />Datum: {fmtDate(inv.date)}<br />Fällig: {getInvoiceDueLabel(inv)}{inv.status === "bezahlt" && <><br />Bezahlt: {fmtDate(inv.paidDate || inv.date)}{inv.paymentMethod ? ` · ${inv.paymentMethod}` : ""}</>}</div>
            </div>
          </div>
          <div className="invoice-print-recipient" style={{ background: "#fff", borderRadius: 0, padding: "0", marginBottom: 24, width: 430, minHeight: 96 }}>
            <div className="invoice-print-sender" style={{ width: 350, paddingBottom: 5, marginBottom: 10, borderBottom: "1px solid #cbd5e1", color: "#64748b" }}>
              <div className="invoice-print-sender-line" style={{ fontSize: 7, lineHeight: 1.3, whiteSpace: "nowrap" }}>{branding.senderName}</div>
              {branding.senderAddress && <div className="invoice-print-sender-line" style={{ fontSize: 7, lineHeight: 1.3, whiteSpace: "nowrap" }}>{branding.senderAddress}</div>}
            </div>
            <div style={{ fontSize: 10, fontWeight: 700 }}>{inv.memberName}</div>
            {inv.customerAddress && <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, whiteSpace: "pre-line", lineHeight: 1.35 }}>{inv.customerAddress}</div>}
          </div>
          {isMedicalInvoiceProfile(profile) && inv.diagnosis && (
            <div style={{ background: "#fafafa", border: "1px solid #eef2f7", borderRadius: 4, padding: "6px 8px", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: "#64748b", marginBottom: 4 }}>Befund / Diagnose</div>
              <div style={{ fontSize: 9, color: "#475569", whiteSpace: "pre-line", lineHeight: 1.35 }}>{inv.diagnosis}</div>
            </div>
          )}
          <table className="invoice-print-table" style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
            <thead><tr style={{ background: design.header }}>
              {[getInvoicePositionDateLabel(profile, inv.invoiceCategory), "Beschreibung", "Menge", "Einzelpreis", "Gesamt"].map(h => <th key={h} style={{ padding: "7px 9px", textAlign: "left", color: "#fff", fontSize: 10 }}>{h}</th>)}
            </tr></thead>
            <tbody>
              {(inv.items || []).map((item, i) => (
                <tr key={i} style={{ borderBottom: "1px solid #e2e8f0" }}>
                  <td style={{ padding: "7px 9px", fontSize: 9, color: "#64748b" }}>{fmtDate(item.treatmentDate || inv.date)}</td>
                  <td style={{ padding: "7px 9px" }}>{item.desc}</td>
                  <td style={{ padding: "7px 9px" }}>{item.qty}</td>
                  <td style={{ padding: "7px 9px" }}>{fmt(item.price)}</td>
                  <td style={{ padding: "7px 9px", fontWeight: 600 }}>{fmt(item.qty * item.price)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="invoice-print-totals-wrap" style={{ display: "flex", justifyContent: "flex-end" }}>
            <div className="invoice-print-totals" style={{ width: 230 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#64748b" }}><span>Netto</span><span>{fmt(inv.net)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#64748b" }}><span>MwSt. {taxRate}%</span><span>{fmt(inv.tax)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontWeight: 800, fontSize: 15, borderTop: `2px solid ${design.accent}`, marginTop: 4 }}><span>Gesamt brutto</span><span>{fmt(inv.total)}</span></div>
            </div>
          </div>
          {!isMedicalInvoiceProfile(profile) && inv.invoiceNote && (
            <div style={{ marginTop: 18, padding: "8px 10px", borderRadius: 4, background: "#fbfaf8", border: "1px solid #e8e1d6", color: "#475569", fontSize: 9, lineHeight: 1.45, whiteSpace: "pre-line" }}>{inv.invoiceNote}</div>
          )}
          {(profile.taxNumber || profile.vatId || profile.iban || profile.bic || profile.bankName) && (
            <div className="invoice-print-footer" style={{ position: "absolute", left: 46, right: 34, bottom: 24, display: "flex", justifyContent: "space-between", gap: 24, paddingTop: 8, borderTop: "1px solid #e2e8f0", fontSize: 8, color: "#64748b", lineHeight: 1.35 }}>
              <div>
                {profile.taxNumber && <div>Steuernummer: {profile.taxNumber}</div>}
                {profile.vatId && <div>USt-ID: {profile.vatId}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                {profile.bankName && <div>{profile.bankName}</div>}
                {profile.iban && <div>IBAN: {profile.iban}</div>}
                {profile.bic && <div>BIC: {profile.bic}</div>}
              </div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
