# Premium-System-Verwaltung

## Zweck

Die Online-Verwaltung im Bereich **Member** zeigt Live-Kontingente und
Vertragsanträge aus dem Premium-System. Die bestehenden lokalen CRM-Daten
bleiben davon getrennt und werden weder ersetzt noch automatisch
zusammengeführt.

## Sicherheitsmodell

- PDB Office läuft im bestehenden Premium-Service unter `/office/`.
- Die Vertragsverwaltung und PDB Office verwenden dieselbe geschützte
  Admin-Sitzung. Das Admin-Passwort oder der API-Token gelangen nicht in den
  Browser-Code.
- Der Browser spricht ausschließlich mit den freigegebenen `/api/office`-,
  `/api/admin`- und `/api/contracts/admin`-Routen derselben Herkunft.
- Schreibvorgänge benötigen Bearbeiter und Begründung und werden vor dem
  Absenden bestätigt.
- Kontingentänderungen werden im Premium-System protokolliert. Lokale
  Membership-Datensätze in PDB Office bleiben unverändert.

## Produktions-Rollout

Der vorhandene Render-Service baut PDB Office zusammen mit dem Premium-System:

```sh
npm install && npm run build:pdb-office
```

Die Oberfläche ist danach unter `/office/` erreichbar. Nicht angemeldete
Aufrufe werden zur bestehenden Vertragsverwaltung weitergeleitet und kehren
nach erfolgreicher Anmeldung automatisch zu PDB Office zurück.

Die CRM-Dokumente liegen getrennt von den Premium-Tabellen im PostgreSQL-Schema
`pdb_office`. Änderungen verwenden eine Revisionsprüfung, damit ein älterer
Browserstand keine neueren Daten überschreibt.

## BEYOND-Abgleich

Die Ansicht **BEYOND-Abgleich** führt aktive BEYOND-Mitgliedschaften aus dem
CRM lesend mit Shopify-Kunden zusammen, die den Tag `premium-beyond` tragen.
Eine Zuordnung über eine eindeutige E-Mail-Adresse gilt als bestätigt. Eine
reine Namensübereinstimmung wird nur zur Prüfung angezeigt und niemals
automatisch übernommen. Der Abgleich legt keine Online-Konten an und verändert
keine Monatskontingente. Vor der Übernahme historischer Member muss zunächst
der tatsächliche Verbrauch des laufenden Monats feststehen.

## Bewusste Grenzen

- Der Abgleich über Namen oder E-Mail-Adressen ist eine schreibgeschützte
  Vorschau und löst keine automatische Freischaltung aus.
- Die lokale CRM-Personenliste bleibt die führende Quelle für das bisherige
  PDB Office.
- Shopify-IDs werden nur dort angezeigt, wo das Premium-System sie bereits als
  technische Referenz liefert; sie werden nicht als neue CRM-ID eingeführt.
- Shopify- und Appointly-Bereiche werden nicht als eigene CRM-Navigation
  eingeführt. Neue Kontakte werden im Bereich **Member** angelegt.
