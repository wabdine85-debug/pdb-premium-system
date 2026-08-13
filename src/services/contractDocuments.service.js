import { getPackageOffer } from '../utils/packageCatalog.js';
import { maskIban } from '../utils/sepaCrypto.js';

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function money(cents) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

function documentShell(title, body) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{font:16px/1.55 Arial,sans-serif;color:#171717;max-width:760px;margin:40px auto;padding:0 24px}h1,h2{line-height:1.15}table{width:100%;border-collapse:collapse;margin:20px 0}td{padding:10px;border-bottom:1px solid #ddd;vertical-align:top}td:first-child{font-weight:700;width:42%}.note{background:#f7f2ed;padding:18px;border-radius:12px}.meta{color:#615a54;font-size:14px}@media print{body{margin:0}.note{border:1px solid #ddd}}</style></head><body>${body}</body></html>`;
}

export function applicationConfirmationHtml(application) {
  const offer = getPackageOffer(application.package_key);
  const isActive = application.status === 'active';
  const heading = isActive
    ? 'Annahme- und Vertragsbestätigung Ihrer PDB PREMIUM Mitgliedschaft'
    : 'Eingangsbestätigung Ihrer verbindlichen Bestellung';
  const intro = isActive
    ? 'PDB – AESTHETIC ROOM nimmt Ihre Bestellung ausdrücklich an. Der Mitgliedschaftsvertrag ist damit zustande gekommen.'
    : 'Ihre verbindliche Bestellung und Ihr SEPA-Basislastschriftmandat sind bei PDB – AESTHETIC ROOM eingegangen. Der Vertrag kommt erst mit der ausdrücklichen Annahme durch PDB zustande.';
  const status = isActive ? 'Vertrag angenommen und Mitgliedschaft aktiv' : 'Bestellung eingegangen · Annahme durch PDB ausstehend';

  const earlyStart = application.early_start_requested_at
    ? 'Ja · ausdrücklich verlangt; bei Widerruf ist Wertersatz für bis dahin erbrachte Leistungen möglich.'
    : 'Nein · Leistungen werden erst nach Ablauf der 14-tägigen Widerrufsfrist freigegeben.';

  return documentShell(heading, `<h1>${heading}</h1><p>${intro}</p><table><tr><td>Vertragspartner / Kontoinhaber</td><td>${escapeHtml(application.first_name)} ${escapeHtml(application.last_name)}</td></tr><tr><td>Paket und Leistung</td><td>PDB PREMIUM ${escapeHtml(offer?.name)} · ${escapeHtml(offer?.monthlyClaim)}</td></tr><tr><td>Monatsbeitrag</td><td>${money(application.monthly_price_cents)}</td></tr><tr><td>Einrichtungsgebühr</td><td>${money(application.setup_fee_cents)} einmalig</td></tr><tr><td>Erste Belastung</td><td>${money(application.monthly_price_cents + application.setup_fee_cents)} zum Vertragsbeginn</td></tr><tr><td>Gesamtkosten Mindestlaufzeit</td><td>${money(application.minimum_total_cents)}</td></tr><tr><td>Vertragsbeginn</td><td>${escapeHtml(application.starts_on)}</td></tr><tr><td>Vorzeitiger Leistungsbeginn</td><td>${earlyStart}</td></tr><tr><td>Laufzeit und Kündigung</td><td>12 Monate Mindestlaufzeit; anschließend unbefristet mit einer Kündigungsfrist von 1 Monat.</td></tr><tr><td>Zahlungsweise</td><td>Monatlich im Voraus per SEPA-Basislastschrift, Fälligkeit jeweils am ${escapeHtml(application.debit_day)}. Kalendertag.</td></tr><tr><td>SEPA-Mandat</td><td>Gläubiger-ID DE73ZZZ00002018874 · Mandatsreferenz ${escapeHtml(application.mandate_reference)} · ${escapeHtml(maskIban(application.iban_last4))} · wiederkehrende Lastschrift</td></tr><tr><td>Status</td><td>${status}</td></tr></table><h2>Vertragsbedingungen</h2><p>Nicht genutzte Monatsleistungen verfallen am Monatsende und werden nicht auf Folgemonate übertragen. Termine werden über Appointly vereinbart. Eine kostenfreie Absage oder Umbuchung ist bis 24 Stunden vor dem Termin möglich. Bei späterer Absage oder Nichterscheinen kann der reservierte Monatsanspruch als genutzt gelten, soweit der Termin nicht anderweitig vergeben werden konnte.</p><p>Änderungen von Betrag oder Fälligkeit der Lastschrift teilt PDB mindestens 3 Kalendertage vor der Belastung in Textform mit. Die ständig erreichbare Kündigungsfunktion sowie die elektronische Widerrufsfunktion finden Sie unter palaisdebeaute.de/pages/premium.</p><div class="note"><strong>Widerruf:</strong> Sie können Ihre Vertragserklärung grundsätzlich innerhalb von 14 Tagen ohne Angabe von Gründen widerrufen. Die Frist beginnt mit Vertragsschluss. Zur Ausübung genügt eine eindeutige Erklärung an PDB – AESTHETIC ROOM, Rheinstraße 59, 65185 Wiesbaden, info@palaisdebeaute.de. Sie können dafür auch die elektronische Funktion „Vertrag widerrufen“ unter palaisdebeaute.de/pages/premium verwenden.</div><h2>Unternehmer</h2><p>PDB – AESTHETIC ROOM · Rheinstraße 59 · 65185 Wiesbaden · info@palaisdebeaute.de</p><p class="meta">Vertragsversion: ${escapeHtml(application.contract_version)} · Erstellt: ${escapeHtml(application.updated_at || application.created_at)} · Vertragskennung: ${escapeHtml(application.id)}</p>`);
}

export function adminApplicationNotificationHtml(application) {
  const offer = getPackageOffer(application.package_key);
  return documentShell('Neuer PDB PREMIUM Vertragsantrag', `<h1>Neuer PDB PREMIUM Vertragsantrag</h1><p>Ein neuer Antrag wurde sicher gespeichert und wartet auf die SEPA-Einrichtung sowie die ausdrückliche Annahme.</p><table><tr><td>Name</td><td>${escapeHtml(application.first_name)} ${escapeHtml(application.last_name)}</td></tr><tr><td>E-Mail</td><td>${escapeHtml(application.email)}</td></tr><tr><td>Paket</td><td>${escapeHtml(offer?.name)}</td></tr><tr><td>Monatsbeitrag</td><td>${money(application.monthly_price_cents)}</td></tr><tr><td>Vertragsbeginn</td><td>${escapeHtml(application.starts_on)}</td></tr><tr><td>Mandatsreferenz</td><td>${escapeHtml(application.mandate_reference)}</td></tr><tr><td>IBAN</td><td>${escapeHtml(maskIban(application.iban_last4))}</td></tr><tr><td>Status</td><td>SEPA-Einrichtung ausstehend</td></tr></table><div class="note"><strong>Sicherheit:</strong> Die vollständige IBAN befindet sich nicht in dieser E-Mail. Öffnen Sie die geschützte Vertragsverwaltung unter https://pdb-premium-system.onrender.com/admin/contracts und melden Sie sich mit Ihrem Admin-Passwort an.</div>`);
}

export function contractActionReceiptHtml(action) {
  const isWithdrawal = action.action_type === 'withdrawal';
  const title = isWithdrawal ? 'Eingangsbestätigung Ihres Widerrufs' : 'Eingangsbestätigung Ihrer Kündigung';
  const actionLabel = isWithdrawal ? 'Widerrufserklärung' : 'Kündigungserklärung';
  const details = isWithdrawal
    ? ''
    : `<tr><td>Art der Kündigung</td><td>${action.cancellation_type === 'extraordinary' ? 'Außerordentlich' : 'Ordentlich'}</td></tr><tr><td>Gewünschtes Vertragsende</td><td>${escapeHtml(action.requested_end_on || 'zum nächstmöglichen Zeitpunkt')}</td></tr>${action.cancellation_reason ? `<tr><td>Begründung</td><td>${escapeHtml(action.cancellation_reason)}</td></tr>` : ''}`;

  return documentShell(title, `<h1>${title}</h1><p>Ihre ${actionLabel} ist bei PDB – AESTHETIC ROOM eingegangen und wird unverzüglich geprüft.</p><table><tr><td>Vorgangsnummer</td><td>${escapeHtml(action.id)}</td></tr><tr><td>Eingang</td><td>${escapeHtml(action.created_at)}</td></tr><tr><td>Name</td><td>${escapeHtml(action.first_name)} ${escapeHtml(action.last_name)}</td></tr><tr><td>Vertrag / Mandatsreferenz</td><td>${escapeHtml(action.mandate_reference || 'nicht angegeben')}</td></tr><tr><td>Bestätigungsadresse</td><td>${escapeHtml(action.communication_email)}</td></tr>${details}</table><div class="note">Diese Bestätigung dokumentiert den Eingang Ihrer Erklärung. Sie enthält noch keine Aussage über das Ergebnis einer rechtlichen oder sachlichen Prüfung.</div><p>PDB – AESTHETIC ROOM · Rheinstraße 59 · 65185 Wiesbaden · info@palaisdebeaute.de</p>`);
}
