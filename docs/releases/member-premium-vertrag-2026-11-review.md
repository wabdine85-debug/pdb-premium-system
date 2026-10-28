# Member Premium 2026-11 – Änderungen zur Freigabe

Status: **am 28.10.2026 mit ausdrücklicher Freigabe live veröffentlicht**. Auftrag: Abschnitt 3 der Übergabe vom 28.10.2026. Gedruckte Flyer und deren Dateien wurden nicht verändert. Die Prüfungen haben keine echten Anträge, Buchungen, Lastschriften oder E-Mails ausgelöst. Die anschließenden freigegebenen Veröffentlichungen sind unten dokumentiert.

## Sichtbare Änderungen

| Paket | Monatsbeitrag unverändert | Einrichtung neu | 12 Monate einschließlich Einrichtung |
|---|---:|---:|---:|
| PURE | 149,00 € | 49,00 € | 1.837,00 € |
| DEFINE | 169,00 € | 49,00 € | 2.077,00 € |
| BEYOND | 199,00 € | 49,00 € | 2.437,00 € |
| PRIVATE | 399,00 € | 49,00 € | 4.837,00 € |

- Hero, Konditionszeile, beide Bestellübersichten, Paketwechsel im Formular und Ersparnishinweis nennen die neuen Beträge. Einrichtung umfasst Erstberatung, Hautanalyse und Eignungsprüfung.
- Vertragspartner: PDB Aesthetic Room, Inhaberin Noureen Hussain. PURE: drei Behandlungen. PRIVATE: ein vollständiges Monatsprotokoll nach Anlage 1 der neuen Bedingungen.
- Bedingungen enthalten den vollständigen Originaltext §§ 1–24 und Anlage 1; die separate Widerrufsseite enthält Anlage 2 einschließlich Musterformular und Hinweis auf die elektronische Widerrufsfunktion. Grundlage sind ausschließlich die beiden finalen TXT-Exporte, keine Zwischenfassung.
- Checkboxen verweisen auf Version 2026-11 und sind nicht vorbelegt. Ein verborgenes Versionsfeld bindet den Antrag an die angezeigten Bedingungen; alte zwischengespeicherte Formulare erhalten eine Aufforderung zum Neuladen.
- FAQ, sichtbare Bedingungen und FAQ-Schema nennen die Ausnahme vom Verfall: rechtzeitige Anfrage bis zum 20. und Leistungshindernis auf Seiten von PDB; Nachholung in den zwei folgenden Monaten, bei erneutem PDB-Hindernis bleibt der Anspruch bestehen.
- Kündigung erstmals zum Ende der zwölf Monate mit einem Monat Frist, danach jederzeit mit einem Monat Frist. CIRCADIA ohne Kaufpflicht; Exosomen und Polynukleotide ausschließlich äußerlich.

## Backend und dauerhafte Unterlagen

- Neue Anträge speichern 4.900 Cent Einrichtung und die neuen Mindestgesamtpreise. Migration 013 ändert ausschließlich den Datenbankstandard für künftige Datensätze; bestehende Beträge werden nicht aktualisiert.
- Vertragsbeginn wird serverseitig auf den 1. eines kommenden Monats beschränkt, bis sechs Monate im Voraus. Der Einzugstag ist für neue Anträge fest; frei übermittelte Tage werden abgelehnt.
- Die echte Annahme-/Vertragsbestätigung wird im neueren Backend bereits per E-Mail versendet. Für Version 2026-11 enthält sie nun sämtliche Bedingungen und beide Anlagen direkt im HTML- und Textinhalt der E-Mail. Damit liegen die Texte beim Mitglied dauerhaft vor; ein bloßer Link auf veränderbare Seiten wird vermieden. Es wurde keine PDF-Bibliothek ergänzt.
- Die E-Mail nennt Mandatsreferenz, Gläubiger-ID, ersten Einzug einschließlich Einrichtung und zwölf konkrete Einzugstermine mit Beträgen. Danach gilt der angekündigte gleichbleibende Beitrag am ersten Bankarbeitstag. Berechnung nach dem SEPA/TARGET-Kalender; Wochenenden und TARGET-Schließtage werden berücksichtigt.
- Die Annahme eines neuen Vertrags wird vor Kunden-Tagging und Datenbankänderungen abgewiesen, wenn bis zum ersten geplanten Einzug weniger als zwei Berliner Kalendertage bleiben. Der Beginn muss dann vor Annahme neu abgestimmt werden.
- Historische Verträge erhalten nicht nachträglich die neuen Bedingungen oder 49 € Einrichtung. Alte Texte verbleiben ausschließlich im historischen Bestätigungszweig.
- Der Einzug selbst bleibt der vorhandene manuelle Naspa-Ablauf. Vor Einzug müssen Versandstatus und tatsächliche Banktermine geprüft sein. Ein fehlgeschlagener Bestätigungsversand ersetzt keine Vorabankündigung.
- Vollständige IBAN und Verschlüsselungsdaten gelangen weiterhin weder in Shopify-Kundennotizen/-Tags noch in Bestätigungs-E-Mails. Keine neuen Links zur abgeschalteten EU-OS-Plattform.

## Kündigung und Widerruf

Die vorhandenen öffentlichen Endpunkte `/action-token`, `/action` und `/action-confirmation` sowie der bestehende E-Mail-Versand wurden wiederverwendet. Beide Wege benötigen keinen Mitglieder-Login. Einstieg: „Verträge hier kündigen“ bzw. „Vertrag widerrufen“; Abschluss: „jetzt kündigen“ bzw. „Widerruf bestätigen“.

Der Vertragsservice zeigt jetzt ausdrücklich, ob der Server den E-Mail-Versand bestätigt hat. Bei fehlender Versandbestätigung bleibt die Erklärung gespeichert; der Hinweis verweist auf den herunterladbaren Eingangsbeleg und Kontakt per E-Mail. Die vorhandene Sicherheitsprüfung und die getrennte sachliche Bearbeitung der Erklärung bleiben erhalten.

Rechtsgrundlagen für die Funktionsprüfung: [§ 312k BGB](https://www.gesetze-im-internet.de/bgb/__312k.html) und [§ 356a BGB](https://www.gesetze-im-internet.de/bgb/__356a.html). Dies ist eine Implementierungsprüfung; die in der Übergabe separat genannte anwaltliche Gesamtprüfung wurde nicht durchgeführt.

## Katalogauffälligkeiten – nur gemeldet

Unverändert in `src/data/treatments.data.js`:

- ID 114 „Microneedling + Ausreinigung“: Kategorie DEFINE, aber `salonized_url: URL_PURE`.
- ID 203 „Microneedling“: Kategorie PURE, aber `salonized_url: URL_DEFINE`.

Die Kategorien entsprechen dem neuen Vertrag. Nach Klarstellung der Inhaberin vom 28.10.2026 läuft die aktive Buchung vollständig über Apntly. Die genannten Salonized-Felder sind Altbestand und werden nicht geändert. Die aktive Member-Seite verlinkt auf die Shopify-Produkte `/products/microneedling` (PURE) und `/products/microneedling-ausreinigung` (DEFINE); deren Produkt-Tags und 0-€-Varianten wurden live korrekt vorgefunden. Aus diesen Alt-Feldern folgt kein nachgewiesener Fehler der Apntly-Buchung. Ob Kundinnen mit altem Flyer weiterhin 39 € Einrichtung zahlen, bleibt offen.

## Prüfstand und Dateien

Dieses Arbeitsverzeichnis steht auf `ebdce28` und enthält bereits zahlreiche fremde/unveröffentlichte Änderungen. Für die tatsächliche spätere Backend-Veröffentlichung wurde deshalb der aktuelle GitHub-Hauptstand frisch abgerufen: `ed8e4020e3196004f494dac97619c025111eb9da` (letzter Body-Sculpt-Release). Die neuen Änderungen wurden auf diesen Stand übertragen, ohne andere lokale Arbeiten zu veröffentlichen oder zurückzusetzen.

Der vollständige Prüfstand liegt unter `/private/tmp/pdb-member-premium-2026-11-source`. Der dauerhafte Patch `output/review/member-premium-2026-11/production.patch` enthält ausschließlich die Unterschiede gegen den genannten Hauptstand. Er ist für genau diese Basis gedacht; vor einer späteren Veröffentlichung muss geprüft werden, ob `main` inzwischen weitergelaufen ist. Das alte Arbeitsverzeichnis darf nicht vollständig als Produktion ausgerollt werden.

Geänderte bzw. neue Dateien dieses Auftrags im Arbeitsverzeichnis:

- `.env.example`, `README.md`, `src/config/env.js`
- `src/utils/packageCatalog.js`, `src/utils/memberPremiumLegal.js`, `src/utils/contractSchedule.js`
- `src/legal/member-premium-2026-11.txt`, `src/legal/member-premium-agreement-2026-11.txt`
- `src/routes/contracts.js`, `src/services/contractDocuments.service.js`
- `src/scripts/syncShopifyPremiumLegalPages.js`
- `migrations/013_member_premium_setup_fee_2026_11.sql`
- `test/securityAndContracts.test.js`, `test/memberPremiumContract.test.js`
- `preview-theme-overrides/sections/pdb-premium-membership-v2.liquid` und `pdb-premium-service.liquid`
- dieselben beiden Sections in `shopify-theme-premium-dummy-clean/sections/`
- `docs/pdb-premium-hinter-dieser-tuer.md`, dieser Prüfbericht und die lokalen HTML-Vorschauen

Zusätzlich im Produktionspatch: bestehender Schema-Startpfad mit neuem Standardwert, dessen Testanpassung sowie `test/memberPremiumActions.test.js` für öffentliche Erklärungen und Annahmeschutz. Die neuere Versand-/Endpunktarchitektur wurde nicht in das alte Arbeitsverzeichnis zurückportiert.

## Validierung und Grenzen

- Lokales Arbeitsverzeichnis: `npm test` – 56 Tests bestanden.
- Produktionsprüfstand: `npm test` – 116 Tests bestanden.
- Originaltextvergleich: jede nichtleere Zeile des TXT-Exports ist im generierten Rechtstext enthalten; 24 Paragraphen, vier Leistungstabellen und beide Anlagen geprüft.
- Automatisierte Endpunktprüfung mit simulierter Datenbank und simuliertem SMTP: öffentliche Kündigung und Widerruf werden gespeichert; E-Mail enthält Erklärung, Datum und Uhrzeit; Beleg ist mit Token abrufbar, falscher Token wird abgewiesen. Kein echter Versand.
- Browserprüfung lokal mit simulierten Antworten: Widerruf, außerordentliche Kündigung mit Pflichtbegründung, Beleglink, Fehlversandhinweis, alle vier dynamischen Paket-Gesamtsummen, nicht vorbelegte Checkboxen und Version 2026-11. Kein horizontaler Überlauf bei 390 Pixeln.
- Shopify Theme Check in zusammengesetzter lokaler Theme-Kopie mit vorhandenem Hero-Bild: beide geänderten Sections ohne Befunde. Der Gesamtcheck des alten Themes enthält 74 bestehende Fehler in anderen Dateien. Die direkte lokale Theme-Kopie meldet zusätzlich das dort bereits fehlende Hero-Bild. Es wird kein fehlerfreier Gesamt-Theme-Build behauptet.
- Der Shopify-Skill-Validator selbst war wegen eines fehlenden internen Pakets nicht startbar; stattdessen wurde der vorhandene Shopify-CLI-Theme-Check verwendet.
- Kein produktiver Browserabschluss, keine echte Erklärung, keine Testlastschrift und kein E-Mail-Zustellnachweis an einem realen Postfach. Vor einem späteren Einzug muss der bestehende Versandprozess mit kontrolliertem Testempfänger verifiziert werden; dies wurde hier nicht als erfolgreich behauptet.

## Vor einer späteren Veröffentlichung

Erst nach ausdrücklicher Freigabe der Inhaberin: Patch gegen dann aktuellen Hauptstand prüfen, Migration 013 ausführen, `CONTRACT_VERSION=2026-11` konfigurieren, Backend und die beiden Theme-Sections koordiniert veröffentlichen, die beiden Rechtstextseiten mit dem vorhandenen Synchronisationsskript aktualisieren. Das reine Importieren des Skripts zum Erzeugen der Vorschau führt keine Shopify-Aufrufe aus.


## Freigabe und erneute Prüfung am 28.10.2026

Die Inhaberin hat die Live-Veröffentlichung ausdrücklich freigegeben: „gut dann prüfe und danach live freigabe hast du“. Render-Arbeitsbereich „My Workspace“ anschließend ausdrücklich bestätigt. Ihre Klarstellung „es läuft alles über apntly“ wurde übernommen: keine Salonized-Änderung, keine Migration 014 und kein Katalog-Sync. Die kurzzeitig vorbereiteten lokalen Alt-Link-Korrekturen wurden vollständig zurückgenommen; in Produktion wurden sie nie angewendet.


## Veröffentlichung und Live-Verifikation

- Produktionscommit: `9df8b994704f06a71b847e1deee9a0e044a5eaef`; Render-Deploy `dep-dbh75ftig2qs73bp7l2g`: **live**. `/ping` HTTP 200; im abgefragten Zeitfenster keine neuen Error-Logs.
- `CONTRACT_VERSION=2026-11` gesetzt. Migration 013: neuer Standard 4.900 Cent, bestehende Vertragsgebühren nachweislich unverändert. Keine Behandlungs-/Buchungsdaten verändert. Lesende Kontrolle des Rollout-Fensters: keine neuen 2026-11-Verträge mit abweichender Gebühr.
- Shopify-Theme `204041519368`: ausschließlich die zwei Vertrags-Sections hochgeladen, erneut heruntergeladen und bytegleich mit dem geprüften Stand verglichen. Beide Rechtstextseiten veröffentlicht und textgleich nach HTML-Normalisierung verifiziert.
- Browserprüfung live: Einrichtung 49 €, Monatsbeiträge 149/169/199/399 €, Version 2026-11, 24 Paragraphen, Anlagen 1 und 2 auf den jeweiligen Seiten. Kein horizontaler Überlauf bei 390 Pixeln. Kündigung ohne Login sichtbar; Widerrufs-Beschriftung korrekt. Öffentlicher Sicherheitsnachweis-Endpunkt HTTP 200.
- 116 Backend-Tests im Release-Checkout bestanden; 36 gezielte Prüfungen zusätzlich bestanden; Office-Produktionsbuild erfolgreich mit bestehender Bündelgrößenwarnung.
- Apntly unverändert. Shopify-Produkte korrekt: `Microneedling` (PURE, Produkt 11940633379080, Variante 57703058080008) und `Microneedling + Ausreinigung` (DEFINE, Produkt 11951950037256, Variante 57760193184008), jeweils 0 €. Member-Links und Premium-Behandlungsschlüssel stimmen überein. „No Payment“ wurde nicht in einem angemeldeten Apntly-Admin bestätigt oder geändert. Kein echter Kalenderabschluss.
- Die automatische Freigabeprüfung lehnte absichtlich ungültige POST-Tests am produktiven Vertragsendpunkt wegen möglicher Speicher-/Versandwirkungen ab. Diese Tests wurden nicht ausgeführt. Die weitere Live-Prüfung erfolgte nur lesend; Schreibpfade sind lokal automatisiert getestet. Kein echter E-Mail-Zustelltest.
- Ein zusätzlicher Dokumentationscommit wurde zunächst von der automatischen Prüfung wegen fehlender ausdrücklicher Commit-Freigabe blockiert. Anschließend hat die Inhaberin ausdrücklich freigegeben: „Ja, nur Dokumentation nachtragen“. README und Prüfbericht werden als reiner Dokumentationscommit mit `[skip render]` nachgetragen; der bereits laufende Produktionsstand bleibt unverändert.
- Sicherungen: `backups/member-premium-2026-11/`; Screenshot: `output/review/member-premium-2026-11/live-sales-mobile.png`.
