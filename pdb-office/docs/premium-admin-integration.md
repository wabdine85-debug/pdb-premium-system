# Premium-System-Verwaltung

## Zweck

Die Online-Verwaltung im Bereich **Member** zeigt Live-Kontingente und
Vertragsanträge aus dem Premium-System. Die bestehenden lokalen CRM-Daten
bleiben davon getrennt und werden weder ersetzt noch automatisch
zusammengeführt.

## Sicherheitsmodell

- Der Browser spricht ausschließlich mit `/api/premium-admin` auf derselben
  Herkunft wie PDB Office.
- Der Admin-Token liegt nur in der Server-Umgebung und darf niemals mit dem
  Präfix `VITE_` konfiguriert werden.
- Der Proxy erlaubt nur die benötigten Member-, Kontingent- und Vertragsrouten.
- Schreibvorgänge benötigen Bearbeiter und Begründung und werden vor dem
  Absenden bestätigt.
- Kontingentänderungen werden im Premium-System protokolliert. Lokale
  Membership-Datensätze in PDB Office bleiben unverändert.

## Lokale Konfiguration

Die Werte aus `.env.example` in der lokalen Server-Umgebung setzen:

```text
PREMIUM_API_BASE_URL=https://<premium-system-host>
PREMIUM_ADMIN_API_TOKEN=<serverseitiger-admin-token>
```

Anschließend PDB Office über den Vite-Entwicklungsserver starten. Ohne diese
Werte zeigt die Oberfläche bewusst nur einen Konfigurationshinweis.

## Produktions-Rollout

Die jetzige Proxy-Einbindung läuft im Vite-Entwicklungsserver. Für einen
weltweit erreichbaren Betrieb ist zusätzlich ein authentifizierter Node-Server
oder eine gleichwertige Backend-for-Frontend-Schicht für PDB Office nötig. Eine
reine statische Veröffentlichung darf den Admin-Token nicht enthalten.

Sichere Reihenfolge:

1. Datenbankmigration und neue Admin-Routen des Premium-Systems sichern und
   auf einer Testumgebung prüfen.
2. Premium-System bereitstellen, ohne bestehende Vertragsrouten zu entfernen.
3. PDB-Office-Server mit den beiden geheimen Umgebungswerten konfigurieren.
4. Zugriffsschutz für PDB Office aktivieren und Rollen/Berechtigungen prüfen.
5. Kontingente zunächst nur lesen, danach eine Testbuchung mit Audit-Protokoll
   durchführen.
6. Erst nach erfolgreicher Abnahme den weltweiten Zugriff freigeben.

## Bewusste Grenzen

- Es gibt keine automatische Zuordnung über Namen oder E-Mail-Adressen.
- Die lokale CRM-Personenliste bleibt die führende Quelle für das bisherige
  PDB Office.
- Shopify-IDs werden nur dort angezeigt, wo das Premium-System sie bereits als
  technische Referenz liefert; sie werden nicht als neue CRM-ID eingeführt.
- Produktionsmigration, Deployment und geheime Werte sind nicht Bestandteil
  der lokalen Implementierung.
