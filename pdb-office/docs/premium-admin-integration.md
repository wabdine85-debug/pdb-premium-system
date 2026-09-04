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
- Manuelle Verbuchungen benötigen ein konkretes vereinbartes Termindatum.
  Aktive Member-Buchungen können mit Audit-Grund verschoben oder storniert
  werden; der Leistungsmonat wird aus dem Termindatum abgeleitet.
- Bei älteren Online-Buchungen ohne Termindatum zeigt die Verwaltung zusätzlich
  den Buchungszeitpunkt und bietet ein protokolliertes Nachtragen des tatsächlich
  vereinbarten Termins an.
- Bei Online-Buchungen ändert diese Admin-Aktion den Premium-Kontingenteintrag.
  Ein verknüpfter Salonized-Termin muss bis zu einer eigenen Salonized-API-
  Integration zusätzlich dort geändert oder storniert werden.
- Nach der Vertragsannahme ist die Terminplanung sofort verfügbar. Das System
  prüft das gewählte Behandlungsdatum separat gegen Vertragsbeginn und
  Widerrufsfrist. Die Vertragsansicht zeigt deshalb sowohl die Entscheidung zum
  vorzeitigen Leistungsbeginn als auch das früheste Behandlungsdatum.
- Eine nachträgliche Zustimmung zum vorzeitigen Leistungsbeginn kann nur die
  eingeloggte Kundin im Shopify-Kundenbereich erteilen. Die Erklärung wird im
  Vertragsereignisprotokoll gespeichert und per aktualisierter Bestätigung
  dokumentiert; die Admin-Oberfläche kann sie nicht stellvertretend setzen.

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

## BEYOND-Bestandsabgleich

Die Ansicht **BEYOND-Bestandsabgleich** führt aktive BEYOND-Mitgliedschaften aus dem
CRM lesend mit Shopify-Kunden zusammen, die den Tag `premium-beyond` tragen.
Eine Zuordnung über eine eindeutige E-Mail-Adresse gilt als bestätigt. Eine
reine Namensübereinstimmung wird nur zur Prüfung angezeigt und niemals
automatisch übernommen. Die Vorschau legt keine Online-Konten an und verändert
keine Monatskontingente. Erst das ausdrücklich bestätigte Speichern des
Bestandsstands legt fehlende Online-Konten an oder aktualisiert sie und übernimmt
den ausgewählten historischen Monatsverbrauch. Vorher muss der tatsächliche
Verbrauch des angezeigten Monats feststehen.

Nach der Freigabe speichert die Übernahme den bekannten Altverbrauch getrennt
von echten Buchungen. Dadurch entstehen keine erfundenen Behandlungstermine.
Jede Übernahme enthält Bearbeiter, Grund und Monat und kann erneut sicher mit
dem korrigierten Stand gespeichert werden. Offene Shopify-Zuordnungen bleiben
unangetastet.

Der Bestandsabgleich ist nicht für laufende Salonized-Termine vorgesehen.
Solche Termine werden unter **Online-Kontingente** mit Behandlungsdatum,
Behandlung und Begründung erfasst. Nach Änderungen und beim manuellen
Aktualisieren wird eine bereits geöffnete Memberansicht erneut vom Server
geladen.

## Bewusste Grenzen

- Der Abgleich über Namen oder E-Mail-Adressen ist eine schreibgeschützte
  Vorschau und löst keine automatische Freischaltung aus.
- Die lokale CRM-Personenliste bleibt die führende Quelle für das bisherige
  PDB Office.
- Shopify-IDs werden nur dort angezeigt, wo das Premium-System sie bereits als
  technische Referenz liefert; sie werden nicht als neue CRM-ID eingeführt.
- Shopify- und Appointly-Bereiche werden nicht als eigene CRM-Navigation
  eingeführt. Neue Kontakte werden im Bereich **Member** angelegt.
