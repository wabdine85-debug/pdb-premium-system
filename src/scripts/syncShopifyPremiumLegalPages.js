import dotenv from "dotenv";

dotenv.config();

const API_VERSION = "2026-04";
const SHOP = process.env.SHOPIFY_SHOP;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const APPLY = process.argv.includes("--apply");

const pages = [
  {
    title: "PDB PREMIUM Vertragsbedingungen",
    handle: "premium-vertragsbedingungen",
    body: `
      <p><strong>Stand: 10. August 2026</strong></p>
      <p>Diese Vertragsbedingungen gelten für PDB PREMIUM Mitgliedschaften zwischen PDB – AESTHETIC ROOM, Rheinstraße 59, 65185 Wiesbaden, und Verbraucherinnen oder Verbrauchern.</p>
      <h2>1. Vertragsschluss</h2>
      <p>Online gibt das Mitglied mit „Zahlungspflichtig bestellen“ eine verbindliche Bestellung ab. PDB bestätigt den Zugang elektronisch. Der Vertrag kommt mit der ausdrücklichen Annahmebestätigung von PDB zustande. Vertragsübersicht, Bedingungen und Widerrufsinformationen werden anschließend speicherbar bereitgestellt.</p>
      <h2>2. Pakete und Kosten</h2>
      <ul>
        <li><strong>PURE:</strong> 149,00 € monatlich; bis zu 3 Behandlungen aus PURE.</li>
        <li><strong>DEFINE:</strong> 169,00 € monatlich; 1 Behandlung aus PURE und 1 Behandlung aus DEFINE.</li>
        <li><strong>BEYOND:</strong> 199,00 € monatlich; 1 Behandlung aus BEYOND.</li>
        <li><strong>PRIVATE:</strong> 399,00 € monatlich; 1 vollständiges Protokoll aus PRIVATE.</li>
      </ul>
      <p>Die Einrichtungsgebühr beträgt einmalig 39,00 €. Die Gesamtkosten der Mindestlaufzeit betragen einschließlich Einrichtungsgebühr: PURE 1.827,00 €, DEFINE 2.067,00 €, BEYOND 2.427,00 € und PRIVATE 4.827,00 €. Maßgeblich ist die beim Vertragsschluss angezeigte Leistungsbeschreibung.</p>
      <h2>3. Laufzeit und Kündigung</h2>
      <p>Die Mindestlaufzeit beträgt zwölf Monate ab Vertragsbeginn. Währenddessen ist die ordentliche Kündigung ausgeschlossen. Danach läuft der Vertrag auf unbestimmte Zeit weiter und kann jederzeit mit einer Frist von einem Monat gekündigt werden. Das Recht zur außerordentlichen Kündigung aus wichtigem Grund bleibt unberührt. Für online abschließbare Mitgliedschaften steht im Mitgliederbereich eine Kündigungsschaltfläche bereit.</p>
      <h2>4. Zahlung und SEPA</h2>
      <p>Monatsbeiträge werden im Voraus per SEPA-Basislastschrift eingezogen. Die erste Belastung umfasst den ersten Monatsbeitrag und die Einrichtungsgebühr. Änderungen von Betrag oder Fälligkeit teilt PDB mindestens drei Kalendertage vor der Belastung in Textform mit; die Parteien vereinbaren insoweit eine verkürzte Vorankündigungsfrist von drei Kalendertagen.</p>
      <p>Rücklastschriftkosten können nur in tatsächlich entstandener Höhe verlangt werden, wenn das Mitglied die Rücklastschrift zu vertreten hat. Bei Zahlungsverzug darf PDB nach Mahnung und angemessener Frist Leistungen bis zum Ausgleich fälliger Beträge aussetzen.</p>
      <h2>5. Nutzung und Leistungsumfang</h2>
      <p>Die Mitgliedschaft ist persönlich und nicht übertragbar. Nicht genutzte Monatsansprüche verfallen am Monatsende und werden nicht ausgezahlt. Ein bestimmter Behandlungserfolg wird nicht geschuldet. Medizinische Leistungen sind nicht Bestandteil der Mitgliedschaft.</p>
      <p>Eine Behandlung kann aus fachlichen, gesundheitlichen oder sicherheitsrelevanten Gründen angepasst, verschoben oder abgelehnt werden. Soweit möglich, wird eine geeignete gleichwertige Alternative innerhalb des gebuchten Pakets angeboten.</p>
      <h2>6. Änderungen des Leistungsangebots</h2>
      <p>PDB darf einzelne Behandlungen aus sachlichem Grund, insbesondere wegen Sicherheitsrisiken, fehlender Geräteverfügbarkeit oder dauerhaftem Wegfall eines Verfahrens, durch mindestens gleichwertige Leistungen ersetzen. Der wirtschaftliche Kern und der monatliche Umfang dürfen nicht einseitig reduziert werden. Bei einer wesentlichen nachteiligen Änderung besteht ein Sonderkündigungsrecht zum Änderungszeitpunkt.</p>
      <h2>7. Termine und Stornierung</h2>
      <p>Termine werden über Appointly vereinbart und sind verbindlich. Eine kostenfreie Absage oder Umbuchung ist bis 24 Stunden vorher möglich. Bei späterer Absage oder Nichterscheinen kann der reservierte Monatsanspruch als genutzt gelten, soweit der Termin nicht anderweitig vergeben werden konnte. Das Mitglied kann nachweisen, dass kein oder ein wesentlich geringerer Schaden entstanden ist.</p>
      <h2>8. Gesundheit und Mitwirkung</h2>
      <p>Vor der ersten Behandlung und bei gesundheitlichen Änderungen macht das Mitglied vollständige und wahrheitsgemäße Angaben im Anamnesebogen. PDB kann Behandlungen zum Schutz des Mitglieds fachlich anpassen oder ablehnen.</p>
      <h2>9. Betriebsruhe und Verfügbarkeit</h2>
      <p>Betriebsferien und absehbare Einschränkungen werden rechtzeitig angekündigt. Kann ein Monatsanspruch aus einem von PDB zu vertretenden Grund nicht zumutbar genutzt werden, wird eine gleichwertige Ersatzmöglichkeit oder angemessene Verlängerung angeboten. Ein Anspruch auf einen bestimmten Wunschtermin besteht nicht.</p>
      <h2>10. Haftung</h2>
      <p>PDB haftet unbeschränkt bei Vorsatz und grober Fahrlässigkeit sowie bei schuldhafter Verletzung von Leben, Körper oder Gesundheit. Bei leicht fahrlässiger Verletzung einer wesentlichen Vertragspflicht ist die Haftung auf den vertragstypischen, vorhersehbaren Schaden begrenzt. Gesetzliche Haftungstatbestände bleiben unberührt.</p>
      <h2>11. Datenschutz</h2>
      <p>Personen-, Gesundheits- und Zahlungsdaten werden nur für Vertragsdurchführung, Terminorganisation, Behandlungsdokumentation und Zahlungsabwicklung verarbeitet. Einzelheiten ergeben sich aus der Datenschutzerklärung.</p>
      <h2>12. Schlussbestimmungen</h2>
      <p>Das Mitglied kann mit unbestrittenen, rechtskräftig festgestellten oder aus demselben Vertragsverhältnis stammenden Forderungen aufrechnen. Es gilt deutsches Recht unter Wahrung zwingender Verbraucherschutzvorschriften. Für Verbraucherinnen und Verbraucher gelten die gesetzlichen Gerichtsstände. Bei Unwirksamkeit einer Bestimmung gelten an ihrer Stelle die gesetzlichen Vorschriften.</p>
      <p>PDB – AESTHETIC ROOM · Rheinstraße 59 · 65185 Wiesbaden · 0178 600 11 03 · info@palaisdebeaute.de</p>
    `
  },
  {
    title: "Widerrufsbelehrung PDB PREMIUM",
    handle: "premium-widerruf",
    body: `
      <p><strong>Stand: 10. August 2026</strong></p>
      <h2>Widerrufsrecht</h2>
      <p>Sie haben das Recht, binnen vierzehn Tagen ohne Angabe von Gründen diesen Vertrag zu widerrufen. Die Widerrufsfrist beträgt vierzehn Tage ab dem Tag des Vertragsabschlusses.</p>
      <p>Um Ihr Widerrufsrecht auszuüben, müssen Sie uns – PDB – AESTHETIC ROOM, Rheinstraße 59, 65185 Wiesbaden, E-Mail: info@palaisdebeaute.de, Telefon: 0178 600 11 03 – mittels einer eindeutigen Erklärung, zum Beispiel per Post oder E-Mail, über Ihren Entschluss informieren. Sie können das nachstehende Muster-Widerrufsformular verwenden; dies ist jedoch nicht vorgeschrieben.</p>
      <p>Zur Wahrung der Widerrufsfrist reicht es aus, dass Sie die Mitteilung vor Ablauf der Widerrufsfrist absenden.</p>
      <h2>Folgen des Widerrufs</h2>
      <p>Wenn Sie diesen Vertrag widerrufen, erstatten wir alle von Ihnen erhaltenen Zahlungen unverzüglich und spätestens binnen vierzehn Tagen ab Eingang Ihrer Widerrufserklärung. Für die Rückzahlung verwenden wir grundsätzlich dasselbe Zahlungsmittel wie bei der ursprünglichen Transaktion; hierfür werden keine Entgelte berechnet.</p>
      <p>Haben Sie verlangt, dass Dienstleistungen während der Widerrufsfrist beginnen, zahlen Sie einen angemessenen Betrag für den Anteil der bis zum Widerruf bereits erbrachten Leistungen im Verhältnis zum vertraglich vorgesehenen Gesamtumfang, soweit die gesetzlichen Voraussetzungen für Wertersatz erfüllt sind.</p>
      <h2>Muster-Widerrufsformular</h2>
      <p>Wenn Sie den Vertrag widerrufen wollen, können Sie diesen Text ausfüllen und an uns zurücksenden:</p>
      <blockquote>
        <p>An PDB – AESTHETIC ROOM, Rheinstraße 59, 65185 Wiesbaden, info@palaisdebeaute.de</p>
        <p>Hiermit widerrufe ich den von mir abgeschlossenen Vertrag über die folgende PDB PREMIUM Mitgliedschaft:</p>
        <p>Paket: ______________________________</p>
        <p>Vertrag abgeschlossen am: ______________________________</p>
        <p>Name: ______________________________</p>
        <p>Anschrift: ______________________________</p>
        <p>Datum: ______________________________</p>
        <p>Unterschrift – nur bei Mitteilung auf Papier: ______________________________</p>
      </blockquote>
    `
  }
];

function requireEnv(name, value) {
  if (!value) throw new Error(`Missing env variable: ${name}`);
}

async function getAccessToken() {
  requireEnv("SHOPIFY_SHOP", SHOP);
  requireEnv("SHOPIFY_CLIENT_ID", CLIENT_ID);
  requireEnv("SHOPIFY_CLIENT_SECRET", CLIENT_SECRET);
  const response = await fetch(`https://${SHOP}.myshopify.com/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: CLIENT_ID, client_secret: CLIENT_SECRET })
  });
  if (!response.ok) throw new Error(`Shopify token request failed: ${response.status} ${await response.text()}`);
  return (await response.json()).access_token;
}

async function graphql(token, query, variables = {}) {
  const response = await fetch(`https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Shopify-Access-Token": token },
    body: JSON.stringify({ query, variables })
  });
  if (!response.ok) throw new Error(`Shopify GraphQL request failed: ${response.status} ${await response.text()}`);
  const body = await response.json();
  if (body.errors?.length) throw new Error(`Shopify GraphQL errors: ${JSON.stringify(body.errors)}`);
  return body.data;
}

async function findPage(token, handle) {
  const data = await graphql(token, `query PageByHandle($query: String!) { pages(first: 1, query: $query) { nodes { id title handle isPublished } } }`, { query: `handle:${handle}` });
  return data.pages.nodes[0] || null;
}

async function createPage(token, page) {
  const data = await graphql(token, `mutation CreatePage($page: PageCreateInput!) { pageCreate(page: $page) { page { id title handle isPublished } userErrors { field message } } }`, {
    page: { title: page.title, handle: page.handle, body: page.body.trim(), isPublished: true }
  });
  if (data.pageCreate.userErrors.length) throw new Error(`pageCreate userErrors: ${JSON.stringify(data.pageCreate.userErrors)}`);
  return data.pageCreate.page;
}

async function updatePage(token, id, page) {
  const data = await graphql(token, `mutation UpdatePage($id: ID!, $page: PageUpdateInput!) { pageUpdate(id: $id, page: $page) { page { id title handle isPublished } userErrors { field message } } }`, {
    id,
    page: { title: page.title, handle: page.handle, body: page.body.trim(), isPublished: true }
  });
  if (data.pageUpdate.userErrors.length) throw new Error(`pageUpdate userErrors: ${JSON.stringify(data.pageUpdate.userErrors)}`);
  return data.pageUpdate.page;
}

async function main() {
  const token = await getAccessToken();
  const result = [];
  for (const page of pages) {
    const existing = await findPage(token, page.handle);
    if (!APPLY) {
      result.push({ action: existing ? "would-update" : "would-create", page: existing || { title: page.title, handle: page.handle } });
      continue;
    }
    const saved = existing ? await updatePage(token, existing.id, page) : await createPage(token, page);
    result.push({ action: existing ? "updated" : "created", page: saved });
  }
  console.log(JSON.stringify({ apply: APPLY, result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
