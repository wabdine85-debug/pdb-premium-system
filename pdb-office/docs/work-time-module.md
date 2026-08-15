# Arbeitszeiten

Die Rubrik **Arbeitszeiten** verwaltet Mitarbeitende und deren tägliche Zeitbuchungen. Die Monatsauswertung berechnet Nettozeiten aus Beginn, Ende und Pause.

## Datenmodell

Die Daten werden über die bestehende Storage-Abstraktion gespeichert:

- `staffMembers`: Mitarbeiterstammdaten (`id`, `name`, `role`, `active`)
- `workTimeEntries`: Zeitbuchungen (`staffMemberId`, `date`, `startTime`, `endTime`, `breakMinutes`, `note`)

Zeitbuchungen referenzieren Mitarbeitende ausschließlich über `staffMemberId`. Dadurch kann die bestehende lokale Persistenz später ohne UI-Umbau durch eine API ersetzt werden.

## Berechnung

`modules/work-time/workTimeUtils.js` enthält die transport- und UI-unabhängige Berechnung. Die Nettozeit entspricht:

`Ende - Beginn - Pause`

Ungültige oder nicht positive Zeiträume werden nicht gespeichert. Monatswerte werden anhand des Datums (`YYYY-MM`) gruppiert.

## Validierung

```bash
npm test
npm run build
```
