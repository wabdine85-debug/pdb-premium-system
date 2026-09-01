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

1. Die bei Naspa verwendete `pain.008`-XML über **SEPA-XML importieren** einlesen. Dadurch werden der Monatslauf und **Member Finanzen** gemeinsam aktualisiert.
2. Nach Einreichung beziehungsweise Buchung den Laufstatus aktualisieren.
3. Naspa-CSV-CAMT exportieren und über **Naspa-CSV prüfen** einlesen.
4. Vorgeschlagene Zuordnung kontrollieren. Nur bestätigte Zeilen werden
   übernommen; unsichere oder mehrdeutige Treffer bleiben offen.
5. Rücklastschrift bearbeiten, nächste Aktion und Verlauf dokumentieren.
6. Erst bei Zahlungseingang oder bewusstem Storno wird der Fall geschlossen.

Wiederholte Dateiimporte erzeugen anhand eines stabilen
Transaktionsfingerprints keine doppelten Rücklastschriftbuchungen.

Ein erneuter SEPA-XML-Import ersetzt ausschließlich den Monatslauf mit demselben
Fälligkeitsmonat. Ältere Finanzmonate bleiben unverändert. Enthält der bestehende
Monatslauf bereits Rücklastschriftfälle, wird ein Ersetzen aus Sicherheitsgründen
abgelehnt.

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
