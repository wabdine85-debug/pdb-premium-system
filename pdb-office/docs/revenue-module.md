# Umsatzmodul

## Zweck

Die CRM-Rubrik `Umsätze` ersetzt die bisherige monatliche Excel-Erfassung. Sie führt tägliche Summen, offene Kundenzahlungen, Mitarbeiter-Vorschüsse und Monatsberichte in einer Oberfläche zusammen.

## Berechnungslogik

- Geschäftsumsatz: Bar, Karte, Shopify, PayPal Business, Treatwell und Premium.
- Persönliche Zuflüsse: historischer Bar-Privat-Bestand und PayPal Privat.
- Gesamtzufluss: Geschäftsumsatz plus persönliche Zuflüsse.
- Premium wird bevorzugt aus der zentralen Schnittstelle `/api/office/member-finance` gelesen. Fehlt dort ein Monat, dient der importierte Excel-Wert als Fallback.
- Die fachlich richtige Einordnung einer Zahlung bleibt Aufgabe des Anwenders. Geschäftliche Einnahmen dürfen nicht als persönliche Zuflüsse klassifiziert werden.

## Monatsabschluss

Beim ersten Öffnen nach Monatsende legt das CRM automatisch eine unveränderliche Berichtsversion im internen Archiv an. Das Tagesjournal bleibt weiterhin bearbeitbar. Nach Änderungen kann über `Neue Version archivieren` eine weitere Version erzeugt werden.

Jede Berichtsversion kann als CSV heruntergeladen oder über die Druckansicht als PDF gespeichert werden.

## Offene Zahlungen

Eine offene Kundenzahlung enthält Name, Betrag, Leistungsdatum, optionales Fälligkeitsdatum und Notiz. Beim Buchen als bezahlt wird der Betrag automatisch am Zahlungstag dem ausgewählten geschäftlichen Zahlungsweg zugerechnet.

Historische Werte im bisherigen Feld `cash` bleiben unverändert als persönliche
Zuflüsse erhalten. Neue geschäftliche Barzahlungen werden getrennt im Feld
`cashBusiness` gespeichert. Dadurch ändern sich abgeschlossene Monatsberichte
nicht rückwirkend.

## Mitarbeiterkonten

Für Wafa, Nabila, Shazia und Raffaela können Vorschüsse und Rückzahlungen erfasst werden. Ein positiver Saldo zeigt den noch offenen Betrag. Es findet keine automatische Lohnverrechnung statt.

## Import

`data/revenue-seed-2026.json` enthält den einmaligen Import aus `Bilanzen .xlsx` für Januar bis August 2026. Die Migration übernimmt den Seed nur, wenn im bestehenden CRM-Datensatz noch kein Umsatzjournal vorhanden ist. Ein später bewusst geleertes Journal wird nicht erneut befüllt.

## Prüfung

```bash
npm test
npm run build
```
