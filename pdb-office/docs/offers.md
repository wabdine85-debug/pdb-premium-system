# Angebote

Der Bereich **Angebote** verwaltet Kostenvorschläge getrennt von Rechnungen.

## Verhalten

- Angebote werden in `offers` gespeichert und nicht in `invoices`.
- Sie erscheinen deshalb weder als Umsatz noch im Mahnwesen oder Bankabgleich.
- Jedes Rechnungsprofil besitzt einen eigenen Angebotspräfix und Angebotsnummernkreis.
- PDB verwendet standardmäßig `PDB-AN-`, MED verwendet `MED-AN-`.
- Die Status sind `entwurf`, `versendet`, `angenommen` und `abgelehnt`.
- Die PDF verwendet das ausgewählte Profil, dessen Logo und dessen Design.

## Umwandlungen

Eine offene Rechnung kann nach Bestätigung in ein Angebot umgewandelt werden. Der vollständige Inhalt wird übernommen, die ursprüngliche Rechnungsnummer bleibt als Herkunftsangabe gespeichert und wird nicht erneut vergeben.

Ein Angebot kann nach Bestätigung als neue offene Rechnung angelegt werden. Dabei erhält die Rechnung eine neue Nummer aus dem Rechnungsnummernkreis. Das Angebot wird anschließend aus der Angebotsliste entfernt.

Bezahlte, überfällige oder bereits gemahnte Rechnungen können nicht in Angebote umgewandelt werden.
