# Lastschrift- und Rücklastschriftverwaltung

## Zweck

Der Bereich **Lastschriften** dokumentiert monatliche Membership-Einzüge und
hält Rücklastschriften bis zur abschließenden Klärung sichtbar. Er ersetzt
weder die Naspa noch die Finanzbuchhaltung, sondern bildet die operative
Arbeitsliste im CRM.

## Datenmodell

- `directDebitRuns`: Monatslauf mit Fälligkeit, Summe und Status.
- `directDebitItems`: eingefrorene Einzelpositionen mit Member, Betrag,
  Mandatsreferenz und IBAN zum Zeitpunkt des Laufs.
- `returnDebitCases`: Rückgabegrund, Bankkosten, nächste Aktion, Status und
  unveränderliche Verlaufseinträge.

Die drei Listen liegen im vorhandenen CRM-Dokument und werden durch
`migrateData` additiv ergänzt. Bestehende Produktionsdaten bleiben gültig.

## Arbeitsablauf

1. Die unmittelbar vor der Naspa-Einreichung erzeugte `pain.008`-XML über
   **SEPA-XML importieren** einlesen. Der Monatslauf wird damit als unveränderlicher
   Snapshot eingefroren und **Member Finanzen** erhält den Soll-Stand.
2. Genau diese Datei bei Naspa einreichen und den Lauf als **eingereicht** markieren.
3. Nach der Buchung den Naspa-CSV-CAMT-Export über **Naspa-CSV prüfen** einlesen.
   Der Import erkennt den Sammelbetrag, einzelne PDB-Nachträge und Rücklastschriften.
4. Vorgeschlagene Zuordnung kontrollieren. Nur bestätigte Zeilen werden
   übernommen; unsichere oder mehrdeutige Treffer bleiben offen.
5. Rücklastschrift bearbeiten, nächste Aktion und Verlauf dokumentieren.
6. Erst bei Zahlungseingang oder bewusstem Storno wird der Fall geschlossen.

Wiederholte Dateiimporte erzeugen anhand eines stabilen
Transaktionsfingerprints keine doppelten Rücklastschriftbuchungen.

Ein eingefrorener, eingereichter oder gebuchter Monatslauf wird durch einen späteren
XML-Export niemals ersetzt. Neue Verträge und Beitragsänderungen erscheinen als
Nachträge. Sie können für einen separaten Nachlauf im aktuellen Monat oder für den
Folgemonat vorgemerkt werden. Jeder Nachtrag speichert getrennt:

- Leistungsmonat,
- tatsächlichen Einzugsmonat,
- Buchungsart (Upgrade, neuer Vertrag, Einrichtungsgebühr oder Nachberechnung),
- Bankstatus (geplant, vorgemerkt oder gebucht).

Geplante Reaktivierungen werden in dem Monat berücksichtigt, in dem das hinterlegte
Reaktivierungsdatum liegt. Eine Reaktivierung zum 1. Oktober erscheint somit bereits
im Oktober-Entwurf, auch wenn der Member im September noch pausiert ist.

## Matching

Die Bewertung erfolgt in dieser Reihenfolge:

1. Mandatsreferenz
2. IBAN
3. Name
4. Betrag

Ein Betrag allein gilt als niedrige Sicherheit. Die Oberfläche übernimmt
keinen Vorschlag ohne Bestätigung durch die bearbeitende Person.

## Sicherheit und Grenzen

- IBANs werden in der Arbeitsliste nur maskiert angezeigt.
- Die Membership wird durch eine Rücklastschrift nicht automatisch beendet.
- Ein erneuter Einzug ist ein eigener operativer Schritt mit neuem
  Fälligkeitstag; das System wiederverwendet keine alte Bankbuchung.
- Bankkosten werden getrennt vom ursprünglichen Membershipbetrag gespeichert.
