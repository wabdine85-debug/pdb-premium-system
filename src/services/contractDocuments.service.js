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

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'Europe/Berlin'
  }).format(date);
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value ?? '');
  return new Intl.DateTimeFormat('de-DE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'Europe/Berlin',
    timeZoneName: 'short'
  }).format(date);
}

function documentShell(title, body) {
  return `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><style>body{margin:0;background:#f6f3f0;color:#171717;font:16px/1.55 Arial,sans-serif}.page{max-width:760px;margin:0 auto;padding:36px 22px}.document{background:#fff;border:1px solid #e3ddd7;border-radius:18px;padding:32px}.brand{margin-bottom:24px;color:#80644f;font-size:12px;font-weight:700;letter-spacing:.14em;text-transform:uppercase}h1,h2{line-height:1.18}h1{margin:0 0 14px;font-size:30px}h2{margin:28px 0 10px;font-size:20px}p{margin:0 0 16px}table{width:100%;border-collapse:collapse;margin:22px 0}td{padding:11px 8px;border-bottom:1px solid #e5dfda;vertical-align:top}td:first-child{width:42%;color:#5f5852;font-weight:700}.status{margin:20px 0;padding:16px 18px;border-left:4px solid #80644f;background:#f7f2ed}.note{background:#f7f2ed;padding:18px;border-radius:12px}.meta{margin-top:24px;color:#6f6760;font-size:13px}.footer{margin-top:28px;padding-top:20px;border-top:1px solid #e5dfda;color:#5f5852;font-size:13px}a{color:#5f4431}@media(max-width:600px){.page{padding:0}.document{border:0;border-radius:0;padding:24px 18px}h1{font-size:25px}td{display:block;width:auto!important;padding:8px 0}td:first-child{padding-bottom:0;border-bottom:0}}@media print{body{background:#fff}.page{max-width:none;padding:0}.document{border:0;padding:0}}</style></head><body><div class="page"><main class="document"><div class="brand">PDB Aesthetic Room · PREMIUM</div>${body}<div class="footer">PDB – AESTHETIC ROOM · Rheinstraße 59 · 65185 Wiesbaden · <a href="mailto:info@palaisdebeaute.de">info@palaisdebeaute.de</a></div></main></div></body></html>`;
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
  const nextStep = isActive
    ? 'Ihre Mitgliedschaft wurde freigeschaltet. Die für Ihr Paket verfügbaren Behandlungen finden Sie nach der Anmeldung im PREMIUM-Mitgliederbereich.'
    : 'Wir richten nun den SEPA-Einzug ein und prüfen Ihre Bestellung. Nach unserer ausdrücklichen Annahme erhalten Sie eine gesonderte Vertragsbestätigung und Ihr Mitgliederbereich wird freigeschaltet.';

  const earlyStart = application.early_start_requested_at
    ? 'Ja · ausdrücklich verlangt; bei Widerruf ist Wertersatz für bis dahin erbrachte Leistungen möglich.'
    : 'Nein · Leistungen werden erst nach Ablauf der 14-tägigen Widerrufsfrist freigegeben.';

  return documentShell(heading, `<h1>${heading}</h1><p>${intro}</p><div class="status"><strong>Status:</strong> ${status}</div><table><tr><td>Vertragspartner / Kontoinhaber</td><td>${escapeHtml(application.first_name)} ${escapeHtml(application.last_name)}</td></tr><tr><td>Paket und Leistung</td><td>PDB PREMIUM ${escapeHtml(offer?.name)} · ${escapeHtml(offer?.monthlyClaim)}</td></tr><tr><td>Monatsbeitrag</td><td>${money(application.monthly_price_cents)}</td></tr><tr><td>Einrichtungsgebühr</td><td>${money(application.setup_fee_cents)} einmalig</td></tr><tr><td>Erste Belastung</td><td>${money(application.monthly_price_cents + application.setup_fee_cents)} zum Vertragsbeginn</td></tr><tr><td>Gesamtkosten Mindestlaufzeit</td><td>${money(application.minimum_total_cents)}</td></tr><tr><td>Vertragsbeginn</td><td>${escapeHtml(formatDate(application.starts_on))}</td></tr><tr><td>Vorzeitiger Leistungsbeginn</td><td>${earlyStart}</td></tr><tr><td>Laufzeit und Kündigung</td><td>12 Monate Mindestlaufzeit; anschließend unbefristet mit einer Kündigungsfrist von 1 Monat.</td></tr><tr><td>Zahlungsweise</td><td>Monatlich im Voraus per SEPA-Basislastschrift, Fälligkeit jeweils am ${escapeHtml(application.debit_day)}. Kalendertag.</td></tr><tr><td>SEPA-Mandat</td><td>Gläubiger-ID DE73ZZZ00002018874 · Mandatsreferenz ${escapeHtml(application.mandate_reference)} · ${escapeHtml(maskIban(application.iban_last4))} · wiederkehrende Lastschrift</td></tr></table><h2>Wie geht es weiter?</h2><p>${nextStep}</p><p>Bitte bewahren Sie diese E-Mail und Ihre Mandatsreferenz als Nachweis auf. Ihre Bestätigung können Sie zusätzlich im PREMIUM-Bereich herunterladen.</p><h2>Vertragsbedingungen</h2><p>Nicht genutzte Monatsleistungen verfallen am Monatsende und werden nicht auf Folgemonate übertragen. Termine werden über Appointly vereinbart. Eine kostenfreie Absage oder Umbuchung ist bis 24 Stunden vor dem Termin möglich. Bei späterer Absage oder Nichterscheinen kann der reservierte Monatsanspruch als genutzt gelten, soweit der Termin nicht anderweitig vergeben werden konnte.</p><p>Änderungen von Betrag oder Fälligkeit der Lastschrift teilt PDB mindestens 3 Kalendertage vor der Belastung in Textform mit. Die ständig erreichbare Kündigungsfunktion sowie die elektronische Widerrufsfunktion finden Sie unter <a href="https://palaisdebeaute.de/pages/premium">palaisdebeaute.de/pages/premium</a>.</p><div class="note"><strong>Widerruf:</strong> Sie können Ihre Vertragserklärung grundsätzlich innerhalb von 14 Tagen ohne Angabe von Gründen widerrufen. Die Frist beginnt mit Vertragsschluss. Zur Ausübung genügt eine eindeutige Erklärung an PDB – AESTHETIC ROOM, Rheinstraße 59, 65185 Wiesbaden, info@palaisdebeaute.de. Sie können dafür auch die elektronische Funktion „Vertrag widerrufen“ unter <a href="https://palaisdebeaute.de/pages/premium?contract_action=withdrawal#pdb-contract-service">palaisdebeaute.de/pages/premium</a> verwenden.</div><p class="meta">Vertragsversion: ${escapeHtml(application.contract_version)} · Erstellt: ${escapeHtml(formatDateTime(application.updated_at || application.created_at))} · Vertragskennung: ${escapeHtml(application.id)}</p>`);
}

export function adminApplicationNotificationHtml(application) {
  const offer = getPackageOffer(application.package_key);
  return documentShell('Neuer PDB PREMIUM Vertragsantrag', `<h1>Neuer PDB PREMIUM Vertragsantrag</h1><p>Ein neuer Antrag wurde sicher gespeichert und wartet auf die SEPA-Einrichtung sowie die ausdrückliche Annahme.</p><table><tr><td>Name</td><td>${escapeHtml(application.first_name)} ${escapeHtml(application.last_name)}</td></tr><tr><td>E-Mail</td><td>${escapeHtml(application.email)}</td></tr><tr><td>Paket</td><td>${escapeHtml(offer?.name)}</td></tr><tr><td>Monatsbeitrag</td><td>${money(application.monthly_price_cents)}</td></tr><tr><td>Vertragsbeginn</td><td>${escapeHtml(formatDate(application.starts_on))}</td></tr><tr><td>Mandatsreferenz</td><td>${escapeHtml(application.mandate_reference)}</td></tr><tr><td>IBAN</td><td>${escapeHtml(maskIban(application.iban_last4))}</td></tr><tr><td>Status</td><td>SEPA-Einrichtung ausstehend</td></tr></table><div class="note"><strong>Sicherheit:</strong> Die vollständige IBAN befindet sich nicht in dieser E-Mail. Öffnen Sie die geschützte Vertragsverwaltung unter <a href="https://pdb-premium-system.onrender.com/admin/contracts">pdb-premium-system.onrender.com/admin/contracts</a> und melden Sie sich mit Ihrem Admin-Passwort an.</div>`);
}

export function adminAcceptanceSummaryHtml(application, { customerConfirmationSent = false } = {}) {
  const offer = getPackageOffer(application.package_key);
  const earlyStart = application.early_start_requested_at
    ? `Ja · bestätigt am ${formatDateTime(application.early_start_requested_at)}`
    : 'Nein';
  return documentShell(
    'PDB PREMIUM Vertrag angenommen',
    `<h1>Vertrag angenommen</h1><p>Die Mitgliedschaft wurde aktiviert. Diese interne Übersicht enthält bewusst keine vollständigen oder maskierten Bankdaten.</p><div class="status"><strong>Status:</strong> Vertrag aktiv</div><table><tr><td>Name</td><td>${escapeHtml(application.first_name)} ${escapeHtml(application.last_name)}</td></tr><tr><td>Kunden-E-Mail</td><td>${escapeHtml(application.email)}</td></tr><tr><td>Paket</td><td>PDB PREMIUM ${escapeHtml(offer?.name)}</td></tr><tr><td>Monatsbeitrag</td><td>${money(application.monthly_price_cents)}</td></tr><tr><td>Vertragsbeginn</td><td>${escapeHtml(formatDate(application.starts_on))}</td></tr><tr><td>Mandatsreferenz</td><td>${escapeHtml(application.mandate_reference)}</td></tr><tr><td>Vorzeitiger Leistungsbeginn</td><td>${escapeHtml(earlyStart)}</td></tr><tr><td>Früheste Behandlung</td><td>${escapeHtml(formatDate(application.treatment_available_at))}</td></tr><tr><td>Kundenbestätigung</td><td>${customerConfirmationSent === true ? 'Erfolgreich per E-Mail versendet' : customerConfirmationSent === false ? 'Versand nicht bestätigt · bitte Kunden-E-Mail erneut senden' : 'Diese Übersicht wurde nachträglich erstellt. Der ursprüngliche E-Mail-Versand an die Kundin wurde dabei nicht erneut ausgelöst oder rückwirkend geprüft.'}</td></tr><tr><td>Annahme</td><td>${escapeHtml(formatDateTime(application.activated_at || application.updated_at))}</td></tr></table><div class="note">Die vollständigen Vertrags- und SEPA-Daten bleiben ausschließlich in der geschützten Vertragsverwaltung: <a href="https://pdb-premium-system.onrender.com/admin/contracts">Vertragsverwaltung öffnen</a>.</div>`
  );
}

export function contractActionReceiptHtml(action) {
  const isWithdrawal = action.action_type === 'withdrawal';
  const title = isWithdrawal ? 'Eingangsbestätigung Ihres Widerrufs' : 'Eingangsbestätigung Ihrer Kündigung';
  const actionLabel = isWithdrawal ? 'Widerrufserklärung' : 'Kündigungserklärung';
  const details = isWithdrawal
    ? ''
    : `<tr><td>Art der Kündigung</td><td>${action.cancellation_type === 'extraordinary' ? 'Außerordentlich' : 'Ordentlich'}</td></tr><tr><td>Gewünschtes Vertragsende</td><td>${escapeHtml(action.requested_end_on || 'zum nächstmöglichen Zeitpunkt')}</td></tr>${action.cancellation_reason ? `<tr><td>Begründung</td><td>${escapeHtml(action.cancellation_reason)}</td></tr>` : ''}`;

  return documentShell(title, `<h1>${title}</h1><p>Ihre ${actionLabel} ist bei PDB – AESTHETIC ROOM eingegangen und wird unverzüglich geprüft.</p><table><tr><td>Vorgangsnummer</td><td>${escapeHtml(action.id)}</td></tr><tr><td>Eingang</td><td>${escapeHtml(formatDateTime(action.created_at))}</td></tr><tr><td>Name</td><td>${escapeHtml(action.first_name)} ${escapeHtml(action.last_name)}</td></tr><tr><td>Vertrag / Mandatsreferenz</td><td>${escapeHtml(action.mandate_reference || 'nicht angegeben')}</td></tr><tr><td>Bestätigungsadresse</td><td>${escapeHtml(action.communication_email)}</td></tr>${details}</table><div class="note">Diese Bestätigung dokumentiert den Eingang Ihrer Erklärung. Sie enthält noch keine Aussage über das Ergebnis einer rechtlichen oder sachlichen Prüfung.</div>`);
}
