import dotenv from "dotenv";
import { pathToFileURL } from 'node:url';
import { memberPremiumTermsHtml, memberPremiumWithdrawalHtml } from '../utils/memberPremiumLegal.js';
import { PACKAGE_CATALOG, getPackageOffer, SETUP_FEE_CENTS } from '../utils/packageCatalog.js';

function money(cents) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(cents / 100);
}

dotenv.config();

const API_VERSION = "2026-04";
const SHOP = process.env.SHOPIFY_SHOP;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const APPLY = process.argv.includes("--apply");

export const pages = [
  {
    title: "PDB PREMIUM Vertragsbedingungen",
    handle: "premium-vertragsbedingungen",
    body: `<p><strong>Version 2026-11</strong></p>
      <p>PDB Aesthetic Room, Inhaberin Noureen Hussain · USt-IdNr. DE308824377</p>
      <h2>Pakete und Preise</h2>
      <ul>${Object.entries(PACKAGE_CATALOG).map(([key, offer]) => `<li>${offer.name}: ${money(offer.monthlyPriceCents)} monatlich · ${offer.monthlyClaim} · 12 Monate inkl. Einrichtung: ${money(getPackageOffer(key).minimumTotalCents)}</li>`).join('')}</ul>
      <p>Einmalige Einrichtung: ${money(SETUP_FEE_CENTS)} für Erstberatung, Hautanalyse und Eignungsprüfung.</p>
      ${memberPremiumTermsHtml}
      <p><a href="/pages/premium-widerruf">Anlage 2 · Widerrufsbelehrung und Musterformular · Version 2026-11</a></p>`
  },
  {
    title: "Widerrufsbelehrung PDB PREMIUM",
    handle: "premium-widerruf",
    body: `<p><strong>Version 2026-11</strong></p>${memberPremiumWithdrawalHtml}
      <p><a href="/pages/premium?view=premium-service&amp;contract_action=withdrawal#pdb-withdrawal-card">Vertrag widerrufen</a></p>`
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
