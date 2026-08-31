import React, { useMemo, useRef, useState } from "react";
import {
  createAuditCsv,
  createReviewCsv,
  createShopifyCsv,
  parseCustomerCsv,
  reconcileEmailContacts,
  selectSalonizedAdditions,
  selectSalonizedNewsletterAdditions,
} from "../../modules/customers/newsletterReconciliation.js";
import "./newsletter-reconciliation.css";

const PAGE_SIZE = 100;

const VIEW_LABELS = {
  all: "Alle Adressen",
  eligible: "Newsletterfähig",
  review: "Prüfen",
  excluded: "Nicht versandfähig",
};

const STATUS_LABELS = {
  eligible: "Newsletterfähig",
  review: "Prüfen",
  excluded: "Nicht versandfähig",
  missing: "E-Mail fehlt",
  invalid: "Ungültig",
};

function downloadCsv(content, fileName) {
  const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function sourceText(sources = []) {
  if (sources.length > 1) return "Shopify + Salonized";
  return sources[0] === "shopify" ? "Shopify" : sources[0] === "salonized" ? "Salonized" : "—";
}

function consentText(value) {
  if (value === "yes") return "Ja";
  if (value === "no") return "Nein";
  if (value === "conflict") return "Konflikt";
  return "Unbekannt";
}

function FileCard({ source, fileData, onSelect }) {
  const label = source === "shopify" ? "Shopify" : "Salonized";
  return (
    <section className={`newsletter-file newsletter-file--${source}`}>
      <div className="newsletter-file__mark" aria-hidden="true">{source === "shopify" ? "S" : "SZ"}</div>
      <div className="newsletter-file__copy">
        <span>{label}-Quelle</span>
        <strong>{fileData?.fileName || `${label}-CSV fehlt`}</strong>
        <small>
          {fileData
            ? `${fileData.contacts.length.toLocaleString("de-DE")} Datensätze · ${fileData.warnings.length ? fileData.warnings.join(" · ") : "Einwilligung erkannt"}`
            : source === "shopify"
              ? "Kunden → Exportieren → CSV für Excel"
              : "Einstellungen → Datenexport → Kundenbestand"}
        </small>
      </div>
      <label className="newsletter-file__button">
        {fileData ? "Ersetzen" : "CSV wählen"}
        <input type="file" accept=".csv,text/csv" onChange={event => onSelect(event.target.files?.[0], source)} />
      </label>
    </section>
  );
}

export default function NewsletterReconciliation() {
  const [imports, setImports] = useState({ shopify: null, salonized: null });
  const [error, setError] = useState("");
  const [view, setView] = useState("all");
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [sortBy, setSortBy] = useState("email");
  const [page, setPage] = useState(1);
  const combinedInputRef = useRef(null);

  const contacts = useMemo(() => Object.values(imports).filter(Boolean).flatMap(entry => entry.contacts), [imports]);
  const result = useMemo(() => reconcileEmailContacts(contacts), [contacts]);
  const shopifyAdditions = useMemo(() => selectSalonizedAdditions(result.rows), [result]);
  const newsletterAdditions = useMemo(() => selectSalonizedNewsletterAdditions(result.rows), [result]);
  const hasData = contacts.length > 0;

  const handleFiles = async files => {
    const selected = [...(files || [])];
    if (!selected.length) return;
    const next = { ...imports };
    try {
      for (const file of selected) {
        const parsed = parseCustomerCsv(await file.text(), file.name);
        next[parsed.source] = parsed;
      }
      setImports(next);
      setError("");
      setPage(1);
    } catch (fileError) {
      setError(fileError.message || "Die CSV-Datei konnte nicht gelesen werden.");
    }
  };

  const selectForSource = async (file, expectedSource) => {
    if (!file) return;
    try {
      const parsed = parseCustomerCsv(await file.text(), file.name);
      if (parsed.source !== expectedSource) throw new Error(`Diese Datei wurde als ${parsed.source === "shopify" ? "Shopify" : "Salonized"} erkannt.`);
      setImports(current => ({ ...current, [expectedSource]: parsed }));
      setError("");
      setPage(1);
    } catch (fileError) {
      setError(fileError.message || "Die CSV-Datei konnte nicht gelesen werden.");
    }
  };

  const visibleRows = useMemo(() => {
    const base = view === "all"
      ? result.rows
      : view === "eligible"
        ? result.rows.filter(row => row.status === "eligible")
        : view === "review"
          ? [...result.rows.filter(row => row.status === "review"), ...result.issues]
          : [...result.rows.filter(row => row.status === "excluded"), ...result.issues];
    const query = search.trim().toLowerCase();
    const filtered = base.filter(row => {
      const sources = row.sources || [row.source];
      const sourceMatches = sourceFilter === "all"
        || (sourceFilter === "both" && sources.includes("shopify") && sources.includes("salonized"))
        || sources.includes(sourceFilter);
      const queryMatches = !query || [row.email, row.name, row.phone, row.reason, ...sources]
        .some(value => String(value || "").toLowerCase().includes(query));
      return sourceMatches && queryMatches;
    });
    return [...filtered].sort((left, right) => {
      if (sortBy === "name") return String(left.name || "").localeCompare(String(right.name || ""), "de");
      if (sortBy === "source") return sourceText(left.sources || [left.source]).localeCompare(sourceText(right.sources || [right.source]), "de");
      if (sortBy === "status") return String(left.status || "").localeCompare(String(right.status || ""), "de");
      return String(left.email || "").localeCompare(String(right.email || ""), "de");
    });
  }, [result, search, sortBy, sourceFilter, view]);

  const pageCount = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const pagedRows = visibleRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const changeView = nextView => {
    setView(nextView);
    setPage(1);
  };

  const reset = () => {
    setImports({ shopify: null, salonized: null });
    setSearch("");
    setSourceFilter("all");
    setSortBy("email");
    setView("all");
    setPage(1);
    setError("");
  };

  return (
    <div className="newsletter-reconciliation">
      <header className="newsletter-hero">
        <div>
          <span className="newsletter-eyebrow">Empfängerliste</span>
          <h2>Shopify und Salonized abgleichen</h2>
          <p>Alle verfügbaren E-Mail-Adressen bleiben sichtbar. Newsletter-Einwilligung und Herkunft werden getrennt geprüft, bevor eine Shopify-Datei entsteht.</p>
        </div>
        <div className="newsletter-hero__actions">
          <button className="newsletter-button newsletter-button--quiet" type="button" onClick={reset} disabled={!hasData}>Zurücksetzen</button>
          <button className="newsletter-button" type="button" onClick={() => combinedInputRef.current?.click()}>Beide CSVs auswählen</button>
          <input ref={combinedInputRef} className="newsletter-hidden-input" type="file" multiple accept=".csv,text/csv" onChange={event => handleFiles(event.target.files)} />
        </div>
      </header>

      <div className="newsletter-files">
        <FileCard source="shopify" fileData={imports.shopify} onSelect={selectForSource} />
        <FileCard source="salonized" fileData={imports.salonized} onSelect={selectForSource} />
      </div>

      {error && <div className="newsletter-message newsletter-message--error" role="alert">{error}</div>}

      {!hasData ? (
        <section className="newsletter-empty">
          <div aria-hidden="true">@</div>
          <h3>Zwei Quellen, eine nachvollziehbare Liste</h3>
          <p>Wähle beide Exporte gleichzeitig oder lade sie einzeln. Der Abgleich verändert weder Shopify noch Salonized.</p>
        </section>
      ) : (
        <>
          <section className="newsletter-ledger" aria-label="Ergebnisübersicht">
            <div><span>Rohdatensätze</span><strong>{result.summary.imported.toLocaleString("de-DE")}</strong><small>aus beiden Dateien</small></div>
            <div><span>Eindeutige E-Mails</span><strong>{result.summary.validUnique.toLocaleString("de-DE")}</strong><small>{result.summary.duplicatesRemoved.toLocaleString("de-DE")} Dubletten entfernt</small></div>
            <div className="is-positive"><span>Newsletterfähig</span><strong>{result.summary.eligible.toLocaleString("de-DE")}</strong><small>mit Einwilligung</small></div>
            <div className="is-warning"><span>Prüfen</span><strong>{result.summary.review.toLocaleString("de-DE")}</strong><small>Konflikte oder Mehrfachadressen</small></div>
            <div><span>Nicht versandfähig</span><strong>{result.summary.excluded.toLocaleString("de-DE")}</strong><small>ohne nachweisbare Einwilligung</small></div>
            <div><span>Fehlend / ungültig</span><strong>{(result.summary.missing + result.summary.invalid).toLocaleString("de-DE")}</strong><small>separate Prüfliste</small></div>
          </section>

          <section className="newsletter-export">
            <div className="newsletter-export__copy">
              <span className="newsletter-eyebrow">Übergabe</span>
              <h3>Fertige Listen herunterladen</h3>
              <p>Für einen vollständigen Shopify-Kundenbestand werden nur gültige Salonized-Adressen exportiert, die noch nicht in Shopify vorhanden sind. Bestehende Shopify-Kunden bleiben unangetastet.</p>
              <div className="newsletter-export__recommendation">Empfohlen: „Shopify ergänzen“ herunterladen. Damit kommen {shopifyAdditions.length.toLocaleString("de-DE")} neue E-Mail-Adressen hinzu und Shopify enthält anschließend {result.summary.validUnique.toLocaleString("de-DE")} eindeutige Adressen.</div>
              <div className="newsletter-export__warning">Beim Shopify-Import „Bestehende Kunden überschreiben“ nicht auswählen.</div>
            </div>
            <div className="newsletter-export__actions">
              <button className="is-primary" type="button" disabled={!shopifyAdditions.length} onClick={() => downloadCsv(createShopifyCsv(shopifyAdditions), "PDB-shopify-neue-salonized-kontakte.csv")}>Shopify ergänzen · {shopifyAdditions.length.toLocaleString("de-DE")} neue E-Mails</button>
              <button type="button" onClick={() => downloadCsv(createShopifyCsv(result.rows), "PDB-shopify-email-master.csv")}>Gesamtliste · alle {result.summary.validUnique.toLocaleString("de-DE")}</button>
              <button type="button" disabled={!newsletterAdditions.length} onClick={() => downloadCsv(createShopifyCsv(newsletterAdditions), "PDB-shopify-newsletter-neu.csv")}>Davon newsletterfähig · {newsletterAdditions.length.toLocaleString("de-DE")} neu</button>
              <button type="button" disabled={!result.summary.eligible} onClick={() => downloadCsv(createShopifyCsv(result.rows, { eligibleOnly: true }), "PDB-shopify-newsletterfaehig.csv")}>Newsletterfähige Gesamtliste · {result.summary.eligible.toLocaleString("de-DE")}</button>
              <button type="button" onClick={() => downloadCsv(createAuditCsv(result), "PDB-alle-email-adressen.csv")}>Alle Adressen · Audit</button>
              <button type="button" onClick={() => downloadCsv(createReviewCsv(result), "PDB-email-pruefliste.csv")}>Prüfliste</button>
            </div>
            <div className="newsletter-export__steps">
              <span>In Shopify</span>
              <ol>
                <li>Kunden → Importieren</li>
                <li>Bestehende Kunden nicht überschreiben</li>
                <li>„Shopify ergänzen“-Datei importieren</li>
              </ol>
            </div>
          </section>

          <section className="newsletter-workspace">
            <div className="newsletter-workspace__head">
              <div>
                <span className="newsletter-eyebrow">Prüfung</span>
                <h3>{VIEW_LABELS[view]}</h3>
              </div>
              <div className="newsletter-workspace__filters">
                <input
                  aria-label="E-Mail-Liste durchsuchen"
                  type="search"
                  value={search}
                  onChange={event => { setSearch(event.target.value); setPage(1); }}
                  placeholder="E-Mail, Name oder Telefon"
                />
                <select aria-label="Nach Herkunft filtern" value={sourceFilter} onChange={event => { setSourceFilter(event.target.value); setPage(1); }}>
                  <option value="all">Alle Quellen</option>
                  <option value="shopify">Shopify</option>
                  <option value="salonized">Salonized</option>
                  <option value="both">Beide Quellen</option>
                </select>
                <select aria-label="E-Mail-Liste sortieren" value={sortBy} onChange={event => { setSortBy(event.target.value); setPage(1); }}>
                  <option value="email">E-Mail A–Z</option>
                  <option value="name">Name A–Z</option>
                  <option value="source">Herkunft</option>
                  <option value="status">Ergebnis</option>
                </select>
              </div>
            </div>
            <div className="newsletter-tabs" role="tablist" aria-label="Empfängerstatus">
              {[
                ["all", result.rows.length],
                ["eligible", result.summary.eligible],
                ["review", result.summary.review + result.issues.length],
                ["excluded", result.summary.excluded + result.issues.length],
              ].map(([key, count]) => (
                <button key={key} type="button" role="tab" aria-selected={view === key} className={view === key ? "is-active" : ""} onClick={() => changeView(key)}>
                  {VIEW_LABELS[key]} <span>{count.toLocaleString("de-DE")}</span>
                </button>
              ))}
            </div>
            <div className="newsletter-table-wrap">
              <table className="newsletter-table">
                <thead><tr><th>E-Mail / Person</th><th>Herkunft</th><th>Shopify</th><th>Salonized</th><th>Ergebnis</th></tr></thead>
                <tbody>
                  {pagedRows.map((row, index) => (
                    <tr key={row.id || `${row.source}-${index}`}>
                      <td><strong>{row.email || "Keine E-Mail"}</strong><small>{row.name || "Ohne Namen"}{row.phone ? ` · ${row.phone}` : ""}</small></td>
                      <td>{sourceText(row.sources || [row.source])}</td>
                      <td>{row.sources ? consentText(row.shopifyConsent) : row.source === "shopify" ? consentText(row.marketingConsent) : "—"}</td>
                      <td>{row.sources ? consentText(row.salonizedConsent) : row.source === "salonized" ? consentText(row.marketingConsent) : "—"}</td>
                      <td><span className={`newsletter-status newsletter-status--${row.status}`}>{STATUS_LABELS[row.status] || row.status}</span><small>{row.reason}</small></td>
                    </tr>
                  ))}
                  {!pagedRows.length && <tr><td colSpan="5" className="newsletter-table__empty">Keine Einträge in dieser Auswahl.</td></tr>}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="newsletter-pagination">
                <span>{visibleRows.length.toLocaleString("de-DE")} Einträge · Seite {page} von {pageCount}</span>
                <div><button type="button" disabled={page === 1} onClick={() => setPage(current => current - 1)}>Zurück</button><button type="button" disabled={page === pageCount} onClick={() => setPage(current => current + 1)}>Weiter</button></div>
              </div>
            )}
          </section>

        </>
      )}
    </div>
  );
}
