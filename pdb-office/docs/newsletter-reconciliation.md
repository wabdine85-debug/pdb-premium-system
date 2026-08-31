# E-Mail-Abgleich

Der Bereich **E-Mail-Abgleich** führt Shopify- und Salonized-Exporte für die
Newsletter-Vorbereitung zusammen. Das Hochladen und Prüfen ist read-only: Es
verändert weder CRM-Daten noch Daten in Shopify oder Salonized.
Die Ergebnisliste kann nach Status und Herkunft gefiltert sowie nach E-Mail,
Name, Herkunft oder Ergebnis sortiert werden.

## Erwartete Quelldateien

- Shopify: Kundenexport als CSV für Excel, einschließlich `Email` und
  `Accepts Email Marketing` beziehungsweise eines unterstützten
  E-Mail-Abonnementstatus.
- Salonized: Kundenexport als CSV, einschließlich `email` und
  `newsletter_optin`.

Komma- und Semikolon-Dateien sowie mehrzeilige, korrekt zitierte CSV-Felder
werden unterstützt. Fehlt die Einwilligungsspalte, bleiben die Adressen in der
Gesamtliste, werden aber nicht automatisch als newsletterfähig eingestuft.

## Abgleichregeln

1. E-Mail-Adressen werden getrimmt und kleingeschrieben.
2. Nur exakt gleiche normalisierte E-Mail-Adressen werden automatisch
   zusammengeführt.
3. Eine Einwilligung aus einer Quelle reicht nur dann, wenn keine andere Quelle
   für dieselbe Adresse ausdrücklich `Nein` oder `unsubscribed` meldet.
4. Widersprüchliche Einwilligungen bleiben in **Prüfen**.
5. Gleicher Name und gleiche Telefonnummer mit verschiedenen E-Mail-Adressen
   werden zur manuellen Prüfung markiert.
6. Fehlende und ungültige Adressen erscheinen in der Prüfliste, aber nie in der
   Shopify-Newsletterdatei.

## Exporte

- `PDB-shopify-neue-salonized-kontakte.csv`: nur gültige E-Mail-Adressen, die
  in Salonized vorkommen und im aktuellen Shopify-Export fehlen. Dies ist der
  empfohlene Import, um den Shopify-Kundenbestand ohne Überschreiben zu
  vervollständigen.
- `PDB-alle-email-adressen.csv`: vollständiger Audit mit Herkunft,
  Einwilligungen und Ergebnis.
- `PDB-email-pruefliste.csv`: widersprüchliche, fehlende oder unsichere Fälle.
- `PDB-shopify-email-master.csv`: alle eindeutigen gültigen Adressen im
  Shopify-Kundenformat; `Accepts Email Marketing` ist je nach Ergebnis `yes`
  oder `no`. Telefonnummern werden bewusst nicht importiert, damit gleiche
  Telefonnummern den E-Mail-Abgleich in Shopify nicht blockieren.
- `PDB-shopify-newsletterfaehig.csv`: nur automatisch freigegebene Empfänger.

Shopify-Importdateien werden als UTF-8-CSV mit Kommatrennung und den
Shopify-Spalten `First Name`, `Last Name`, `Email`,
`Accepts Email Marketing` und `Tags` erzeugt.

Beim Import in Shopify dürfen vorhandene Kunden nicht pauschal überschrieben
werden. Doppelte Shopify-Adressen können übersprungen werden. Das spätere
Empfängersegment wird in Shopify über
`email_subscription_status = 'SUBSCRIBED'` gebildet.
