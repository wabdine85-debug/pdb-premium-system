import dotenv from "dotenv";
import { treatments } from "../data/treatments.data.js";

dotenv.config();

const API_VERSION = "2026-04";
const SHOP = process.env.SHOPIFY_SHOP;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;

function requireEnv(name, value) {
  if (!value) {
    throw new Error(`Missing env variable: ${name}`);
  }
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/®|™/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function scoreCandidate(treatment, product) {
  const treatmentWords = new Set(normalize(treatment.title).split(" ").filter(Boolean));
  const productWords = new Set(normalize(product.title).split(" ").filter(Boolean));
  let score = 0;

  for (const word of treatmentWords) {
    if (productWords.has(word)) score += 2;
    if (normalize(product.handle).split(" ").includes(word)) score += 1;
  }

  if (product.handle.includes(treatment.treatment_key)) score += 4;

  return score;
}

async function getAccessToken() {
  requireEnv("SHOPIFY_SHOP", SHOP);
  requireEnv("SHOPIFY_CLIENT_ID", CLIENT_ID);
  requireEnv("SHOPIFY_CLIENT_SECRET", CLIENT_SECRET);

  const response = await fetch(`https://${SHOP}.myshopify.com/admin/oauth/access_token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    })
  });

  if (!response.ok) {
    throw new Error(`Shopify token request failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  return body.access_token;
}

async function graphql(token, query, variables = {}) {
  const response = await fetch(`https://${SHOP}.myshopify.com/admin/api/${API_VERSION}/graphql.json`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token
    },
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    throw new Error(`Shopify GraphQL request failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();

  if (body.errors?.length) {
    throw new Error(`Shopify GraphQL errors: ${JSON.stringify(body.errors)}`);
  }

  return body.data;
}

async function fetchProducts(token) {
  const products = [];
  let cursor = null;
  let hasNextPage = true;

  while (hasNextPage) {
    const data = await graphql(
      token,
      `
      query Products($cursor: String) {
        products(first: 250, after: $cursor) {
          edges {
            cursor
            node {
              id
              title
              handle
              status
            }
          }
          pageInfo {
            hasNextPage
          }
        }
      }
      `,
      { cursor }
    );

    for (const edge of data.products.edges) {
      products.push(edge.node);
      cursor = edge.cursor;
    }

    hasNextPage = data.products.pageInfo.hasNextPage;
  }

  return products;
}

function auditProducts(products) {
  const activeTreatments = treatments.filter((treatment) => treatment.is_active);
  const productsByHandle = new Map(products.map((product) => [product.handle, product]));
  const productsByTitle = new Map(products.map((product) => [normalize(product.title), product]));

  return activeTreatments.map((treatment) => {
    const desiredHandle = treatment.shopify_product_handle || treatment.treatment_key;
    const exactProduct = productsByHandle.get(desiredHandle);
    const titleMatch = productsByTitle.get(normalize(treatment.title));

    return {
      treatment: treatment.title,
      desiredHandle,
      status: exactProduct ? "OK" : titleMatch ? "HANDLE_ABWEICHEND" : "FEHLT",
      shopifyTitle: exactProduct?.title || titleMatch?.title || null,
      currentHandle: exactProduct?.handle || titleMatch?.handle || null,
      candidates: exactProduct || titleMatch
        ? []
        : products
            .map((product) => ({ ...product, score: scoreCandidate(treatment, product) }))
            .filter((product) => product.score > 0)
            .sort((a, b) => b.score - a.score)
            .slice(0, 5)
    };
  });
}

function printReport(products, rows) {
  const ok = rows.filter((row) => row.status === "OK");
  const changed = rows.filter((row) => row.status === "HANDLE_ABWEICHEND");
  const missing = rows.filter((row) => row.status === "FEHLT");

  console.log(`Shopify-Produkte gefunden: ${products.length}`);
  console.log(`Aktive Treatments geprüft: ${rows.length}`);
  console.log(`OK: ${ok.length}`);
  console.log(`Handle abweichend: ${changed.length}`);
  console.log(`Fehlt / kein sicherer Match: ${missing.length}`);

  if (changed.length) {
    console.log("\nHANDLE ABWEICHEND:");
    for (const row of changed) {
      console.log(`- ${row.treatment}: ${row.currentHandle} -> ${row.desiredHandle}`);
    }
  }

  if (missing.length) {
    console.log("\nFEHLT / KEIN SICHERER MATCH:");
    for (const row of missing) {
      console.log(`- ${row.treatment}: erwartet /products/${row.desiredHandle}`);
      for (const candidate of row.candidates) {
        console.log(`  Kandidat: ${candidate.title} (/products/${candidate.handle})`);
      }
    }
  }
}

const token = await getAccessToken();
const products = await fetchProducts(token);
const rows = auditProducts(products);

printReport(products, rows);
