import React, { useMemo, useState } from "react";
import { fmt, fmtDate } from "../../utils/formatters.js";
import { getInvoiceDueLabel, getInvoicePositionDateLabel, isMedicalInvoiceProfile } from "../../modules/invoices/invoiceProfiles.js";
import { createInvoicePdfDownload } from "../../modules/invoices/invoicePdf.js";

export default function InvoicePrintView({ inv, profile, onClose, Button }) {
  const [downloadState, setDownloadState] = useState("idle");
  const pdfDownload = useMemo(() => createInvoicePdfDownload(inv, profile), [inv, profile]);
  const taxRate = inv.taxRate ?? profile.defaultTaxRate ?? 0;
  const design = {
    "pdb-premium": { accent: "#1e40af", header: "#1e40af", logoBg: "#fff" },
    "medical-clean": { accent: "#0f766e", header: "#0f766e", logoBg: "#f0fdfa" },
    classic: { accent: "#1e293b", header: "#1e293b", logoBg: "#f8fafc" },
  }[profile.pdfDesignVariant] || { accent: "#1e40af", header: "#1e40af", logoBg: "#fff" };

  const rawCompanyName = String(profile.companyName || "").trim();
  const normalizedCompanyName = rawCompanyName.replace(/\s+/g, " ");
  const brandText = "PDB Aesthetic Room";
  const brandIndex = normalizedCompanyName.toLowerCase().indexOf(brandText.toLowerCase());
  const nameWithoutBrand = brandIndex >= 0
    ? normalizedCompanyName.slice(0, brandIndex).replace(/\s*-\s*$/, "").trim()
    : normalizedCompanyName;
  const headerPrimary = nameWithoutBrand.toLowerCase() === "pdb"
    ? (String(profile.name || "").toLowerCase().includes("medizin") ? "Ärztliche Praxis" : brandText)
    : (nameWithoutBrand || brandText);
  const headerBrand = headerPrimary === brandText ? "" : brandText;
  const compactSenderName = headerBrand ? headerPrimary + " - " + headerBrand : headerPrimary;
  const senderAddressLine = String(profile.companyAddress || "")
    .split("\n")
    .map(line => {
      const lower = line.toLowerCase();
      if (["tel", "telefon", "phone", "mobil"].some(token => lower.includes(token))) return "";
      const parts = line.split(",");
      const last = (parts[parts.length - 1] || "").trim();
      const digitCount = last.replace(/\D/g, "").length;
      if (digitCount >= 7) parts.pop();
      return parts.join(",").trim();
    })
    .filter(Boolean)
    .join(", ");
  const senderLine = [compactSenderName, senderAddressLine].filter(Boolean).join(" · ");
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", zIndex: 1500, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
      <div style={{ background: "#fff", borderRadius: 16, width: 720, maxWidth: "100%", maxHeight: "90vh", overflow: "auto", boxShadow: "0 24px 64px rgba(0,0,0,0.2)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "16px 24px", borderBottom: "1px solid #e2e8f0" }}>
          <h3 style={{ margin: 0, fontSize: 10, fontWeight: 700 }}>Druckvorschau — {inv.number}</h3>
          <div style={{ display: "flex", gap: 10 }}>
            <form action="/api/office/invoice-pdf" method="post" onSubmit={() => setDownloadState("done")} style={{ margin: 0 }}>
              <input type="hidden" name="admin_csrf" value="1" />
              <input type="hidden" name="filename" value={pdfDownload.fileName} />
              <input type="hidden" name="pdf" value={pdfDownload.base64} />
              <button
                type="submit"
                style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", minHeight: 34, padding: "0 14px", border: 0, borderRadius: 8, background: design.accent, color: "#fff", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
              >
                ⬇️ PDF herunterladen
              </button>
            </form>
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 17, cursor: "pointer", color: "#94a3b8" }}>×</button>
          </div>
        </div>
        <div style={{ padding: "8px 24px", borderBottom: "1px solid #f1f5f9", fontSize: 11, color: "#64748b" }}>
          {downloadState === "done" ? "Der PDF-Download wurde gestartet." : "Die Rechnung wird direkt als PDF-Datei heruntergeladen."}
        </div>
        <div className="invoice-print-page" style={{ position: "relative", width: 680, minHeight: 960, boxSizing: "border-box", padding: "22px 34px 112px 46px", fontSize: 11, lineHeight: 1.38, background: "#fff", color: "#1e293b", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
          <div style={{ position: "absolute", left: 0, top: 188, width: 22, height: 1, background: "#94a3b8" }}></div>
          <div style={{ position: "absolute", left: 0, top: 405, width: 16, height: 1, background: "#cbd5e1" }}></div>
          <div style={{ position: "absolute", left: 0, top: 620, width: 22, height: 1, background: "#94a3b8" }}></div>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 46 }}>
            <div style={{ display: "flex", gap: 16 }}>
              <div style={{ width: 90, height: 64, display: "flex", alignItems: "center", justifyContent: "flex-start", fontWeight: 800, color: "#1e293b", overflow: "hidden" }}>
                {profile.logoUrl ? <img src={profile.logoUrl} alt={profile.companyName || "Logo"} style={{ maxWidth: "100%", maxHeight: "100%", objectFit: "contain" }} /> : (profile.logoPlaceholder || "PDB")}
              </div>
              <div>
                <div style={{ fontSize: 17, fontWeight: 800 }}>{headerPrimary}</div>
                {headerBrand && <div style={{ fontSize: 13, fontWeight: 800, color: "#1e293b", marginTop: 2 }}>{headerBrand}</div>}
                <div style={{ fontSize: 10, color: "#64748b", marginTop: 6, lineHeight: 1.35, whiteSpace: "pre-line" }}>{profile.companyEmail}</div>
              </div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: design.accent }}>RECHNUNG</div>
              <div style={{ fontSize: 10, color: "#64748b", marginTop: 8, lineHeight: 1.45 }}>Rechnungsnr.: <strong>{inv.number}</strong><br />Datum: {fmtDate(inv.date)}<br />Fällig: {getInvoiceDueLabel(inv)}{inv.status === "bezahlt" && <><br />Bezahlt: {fmtDate(inv.paidDate || inv.date)}{inv.paymentMethod ? ` · ${inv.paymentMethod}` : ""}</>}</div>
            </div>
          </div>
          <div style={{ background: "#fff", borderRadius: 0, padding: "4px 0", marginBottom: 24, width: 430, minHeight: 86 }}>
            <div style={{ fontWeight: 700, fontSize: 10, color: "#64748b", marginBottom: 4 }}><span style={{ fontSize: 6.5, fontWeight: 400, color: "#94a3b8", whiteSpace: "nowrap" }}>{senderLine}</span></div>
            <div style={{ fontSize: 10, fontWeight: 600 }}>{inv.memberName}</div>
            {inv.customerAddress && <div style={{ fontSize: 10, color: "#64748b", marginTop: 4, whiteSpace: "pre-line", lineHeight: 1.35 }}>{inv.customerAddress}</div>}
          </div>
          {isMedicalInvoiceProfile(profile) && inv.diagnosis && (
            <div style={{ background: "#fafafa", border: "1px solid #eef2f7", borderRadius: 4, padding: "6px 8px", marginBottom: 14 }}>
              <div style={{ fontWeight: 700, fontSize: 10, color: "#64748b", marginBottom: 4 }}>Befund / Diagnose</div>
              <div style={{ fontSize: 9, color: "#475569", whiteSpace: "pre-line", lineHeight: 1.35 }}>{inv.diagnosis}</div>
            </div>
          )}
          <table style={{ width: "100%", borderCollapse: "collapse", marginBottom: 20 }}>
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
          <div style={{ display: "flex", justifyContent: "flex-end" }}>
            <div style={{ width: 230 }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#64748b" }}><span>Netto</span><span>{fmt(inv.net)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "3px 0", color: "#64748b" }}><span>MwSt. {taxRate}%</span><span>{fmt(inv.tax)}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", fontWeight: 800, fontSize: 15, borderTop: `2px solid ${design.accent}`, marginTop: 4 }}><span>Gesamt brutto</span><span>{fmt(inv.total)}</span></div>
            </div>
          </div>
          {!isMedicalInvoiceProfile(profile) && inv.invoiceNote && (
            <div style={{ marginTop: 18, padding: "8px 10px", borderRadius: 4, background: "#fbfaf8", border: "1px solid #e8e1d6", color: "#475569", fontSize: 9, lineHeight: 1.45, whiteSpace: "pre-line" }}>{inv.invoiceNote}</div>
          )}
          {(profile.taxNumber || profile.vatId || profile.iban || profile.bic || profile.bankName) && (
            <div style={{ position: "absolute", left: 34, right: 34, bottom: 24, paddingTop: 8, borderTop: "1px solid #e2e8f0", fontSize: 8, color: "#64748b", lineHeight: 1.25, textAlign: "right" }}>
              {profile.taxNumber && <div>Steuernummer: {profile.taxNumber}</div>}
              {profile.vatId && <div>USt-ID: {profile.vatId}</div>}
              {profile.bankName && <div>{profile.bankName}</div>}
              {profile.iban && <div>IBAN: {profile.iban}</div>}
              {profile.bic && <div>BIC: {profile.bic}</div>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
