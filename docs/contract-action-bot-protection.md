# Schutz für öffentliche Kündigung und Widerruf

Der öffentliche Vertragsservice bleibt ohne Login erreichbar. Der Server prüft
Shopify-App-Proxy-Signatur und Zeitstempel, begrenzt Einsendungen pro Besucher-IP
in PostgreSQL und ordnet Eingänge für die manuelle Prüfung zu. Für den zweiten
Schutzschritt stellt `GET /apps/pdb/contracts/action-token` einen 30 Minuten
gültigen Formularnachweis bereit. Der Server akzeptiert ihn frühestens nach
zwei Sekunden und nur einmal. Es werden keine externen Dienste benötigt.

## Shopify-Formular ergänzen

Im veröffentlichten Theme liegen die Formulare `#pdb-withdrawal-form` und
`#pdb-public-cancellation-form` in
`sections/pdb-premium-membership-v2.liquid`. Beide Formulare enthalten jetzt
folgende Felder:

```html
<label class="full">Mitgliedschaft beschreiben (wenn keine Vertragskennung vorliegt)
  <input name="contract_description" maxlength="160" placeholder="z. B. PDB PREMIUM BEYOND, Vertragsbeginn August 2026">
</label>
<div hidden aria-hidden="true">
  <label>Website <input name="contact_website" tabindex="-1" autocomplete="off"></label>
</div>
```

Der Submit-Handler lädt unmittelbar vor `JSON.stringify(payload)` den
Nachweis und ergänzt ihn:

```js
const tokenResponse = await fetch('/apps/pdb/contracts/action-token', { cache: 'no-store' });
const tokenResult = await tokenResponse.json();
if (!tokenResponse.ok || !tokenResult.ok) {
  throw new Error('Der Sicherheitsnachweis konnte nicht geladen werden. Bitte erneut versuchen.');
}
await new Promise((resolve) => window.setTimeout(resolve, 2100));
payload.action_token = tokenResult.action_token;
```

Die Abfrage liegt im bestehenden `try`-Block. Der Formularcode zeigt
`INVALID_ACTION_TOKEN` als erneuten Versuch und
`CONTRACT_DESCRIPTION_REQUIRED` als Aufforderung zur Vertragsbezeichnung an.
Die sichtbare Vorgangsnummer kommt aus `result.request.reference`.

## Aktivierung

1. Backend mit Datenbanktabelle und Token-Endpunkt bereitstellen.
2. Theme-Formulare aktualisieren und beide Wege auf einer Vorschauseite testen.
3. Erst danach `CONTRACT_ACTION_TOKEN_REQUIRED=true` im Backend setzen.
4. Einen Widerruf und eine Kündigung ohne Login testen, einschließlich
   Eingangsbeleg, Admin-Liste und wiederholtem Absenden. Danach prüfen, dass
   fehlende, manipulierte und erneut verwendete Token abgewiesen werden.

Wird Schritt 3 vor Schritt 2 ausgeführt, funktionieren die derzeitigen
Shopify-Formulare nicht mehr. Wer die öffentliche Funktion nicht nutzen kann,
kann weiterhin per E-Mail eine Erklärung abgeben. Diese Alternative ersetzt
die erforderliche öffentliche Online-Funktion nicht.
