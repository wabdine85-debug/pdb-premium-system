import dotenv from "dotenv";

dotenv.config();

const API_VERSION = "2026-04";
const SHOP = process.env.SHOPIFY_SHOP;
const CLIENT_ID = process.env.SHOPIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SHOPIFY_CLIENT_SECRET;
const APPLY = process.argv.includes("--apply");
const PUBLISH = process.argv.includes("--publish");
const ENSURE_UNLISTED = process.argv.includes("--ensure-unlisted");
const APPOINTLY_ACTIVE = process.argv.includes("--appointly-active");
const TARGET_HANDLE = process.argv
  .find((argument) => argument.startsWith("--handle="))
  ?.slice("--handle=".length);

if (APPOINTLY_ACTIVE && ENSURE_UNLISTED) {
  throw new Error("Use either --appointly-active or --ensure-unlisted, not both");
}

const products = [
  {
    title: "Morpheus8 Total Face",
    handle: "private-morpheus8-total-face",
    descriptionHtml: "<p>Morpheus8 für das gesamte Gesicht in einer 90-minütigen PRIVATE-Sitzung.</p>"
  },
  {
    title: "HIFU Total Face",
    handle: "private-hifu-total-face",
    descriptionHtml: "<p>HIFU für das gesamte Gesicht in einer 90-minütigen PRIVATE-Sitzung.</p>"
  },
  {
    title: "RedTouch PRO 360°",
    handle: "private-redtouch-360",
    descriptionHtml: "<p>RedTouch PRO für Gesicht, Hals und Dekolleté in einer 90-minütigen PRIVATE-Sitzung.</p>"
  },
  {
    title: "HydraForma Ultimate",
    handle: "private-hydraforma-ultimate",
    descriptionHtml: "<p>HydraFacial und FORMA by INMODE™ kombiniert in einer 90-minütigen PRIVATE-Sitzung.</p>"
  },
  {
    title: "Regeneration Pro",
    handle: "private-regeneration-pro",
    descriptionHtml: "<p>Medical Needling und Exosomen kombiniert in einer 90-minütigen PRIVATE-Sitzung.</p>"
  },
  {
    title: "Glass Skin Protocol",
    handle: "private-glass-skin",
    descriptionHtml: "<p>Dermaplaning, HydraFacial und OxyGeneo als 90-minütiges PRIVATE-Protokoll.</p>"
  },
  {
    title: "Pigment & Texture Protocol",
    handle: "private-pigment-texture",
    descriptionHtml: "<p>MESO PEEL MD und eine passend zum Hautbild ausgewählte apparative Technologie in einer 90-minütigen PRIVATE-Sitzung.</p>"
  },
  {
    title: "Laser Complete",
    handle: "private-laser-complete",
    descriptionHtml: "<p>MOTUS PRO DEKA Ganzkörper-Laserbehandlung in einer 90-minütigen PRIVATE-Sitzung.</p>"
  },
  {
    title: "Body Sculpt Intensive",
    handle: "private-body-sculpt-intensive",
    descriptionHtml: "<p>EMS Sculpt, G8 und Lymphdrainage als vier einzelne PRIVATE-Termine à 90 Minuten innerhalb eines Mitgliedschaftsmonats.</p>"
  },
  {
    title: "Cryo Contour Intensive",
    handle: "private-cryo-contour-intensive",
    descriptionHtml: "<p>Kryolipolyse, G8 und Lymphdrainage kombiniert in einer 90-minütigen PRIVATE-Sitzung.</p>"
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
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: CLIENT_ID,
      client_secret: CLIENT_SECRET
    })
  });

  if (!response.ok) {
    throw new Error(`Shopify token request failed: ${response.status} ${await response.text()}`);
  }

  return (await response.json()).access_token;
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

async function findProductByHandle(token, handle) {
  const data = await graphql(
    token,
    `
      query ProductByHandle($query: String!) {
        products(first: 1, query: $query) {
          nodes {
            id
            title
            handle
            status
          }
        }
      }
    `,
    { query: `handle:${handle}` }
  );

  return data.products.nodes[0] || null;
}

async function findAppointlyPublications(token) {
  const data = await graphql(
    token,
    `
      query Publications {
        publications(first: 20) {
          nodes {
            id
            catalog {
              title
            }
            autoPublish
          }
        }
      }
    `
  );

  const requiredTitles = ["online-store", "shop"];
  const publications = data.publications.nodes.filter((publication) => {
    const title = publication.catalog?.title?.trim().toLowerCase();
    return title === "online store" || title === "onlineshop" || title === "shop";
  });
  const foundTitles = new Set(
    publications.map((publication) => {
      const title = publication.catalog?.title?.trim().toLowerCase();
      return title === "online store" || title === "onlineshop" ? "online-store" : title;
    })
  );
  const missingTitles = requiredTitles.filter((title) => !foundTitles.has(title));

  if (missingTitles.length) {
    throw new Error(`Required publications not found: ${missingTitles.join(", ")}`);
  }

  return publications;
}

async function publishProduct(token, productId, publicationIds) {
  const data = await graphql(
    token,
    `
      mutation PublishProduct($id: ID!, $input: [PublicationInput!]!) {
        publishablePublish(id: $id, input: $input) {
          publishable {
            availablePublicationsCount {
              count
            }
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      id: productId,
      input: publicationIds.map((publicationId) => ({ publicationId }))
    }
  );

  if (data.publishablePublish.userErrors.length) {
    throw new Error(`publishablePublish userErrors: ${JSON.stringify(data.publishablePublish.userErrors)}`);
  }
}

async function updateProductStatus(token, productId, status) {
  const data = await graphql(
    token,
    `
      mutation UpdateProductStatus($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { product: { id: productId, status } }
  );

  if (data.productUpdate.userErrors.length) {
    throw new Error(`productUpdate userErrors: ${JSON.stringify(data.productUpdate.userErrors)}`);
  }

  return data.productUpdate.product;
}

async function updateProductDetails(token, productId, product) {
  const data = await graphql(
    token,
    `
      mutation UpdatePrivateProduct($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id
            title
            handle
            status
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    {
      product: {
        id: productId,
        title: product.title,
        descriptionHtml: product.descriptionHtml,
        productType: "PDB PREMIUM PRIVATE",
        templateSuffix: "premium-dummy"
      }
    }
  );

  if (data.productUpdate.userErrors.length) {
    throw new Error(`productUpdate userErrors: ${JSON.stringify(data.productUpdate.userErrors)}`);
  }

  return data.productUpdate.product;
}

async function createProduct(token, product) {
  const input = {
    title: product.title,
    handle: product.handle,
    descriptionHtml: product.descriptionHtml,
    status: "UNLISTED",
    productType: "PDB PREMIUM PRIVATE",
    vendor: "PDB Aesthetic Room",
    category: "gid://shopify/TaxonomyCategory/se",
    templateSuffix: "premium-dummy",
    tags: [
      "premium-category:private",
      "premium-dummy",
      `premium-treatment:${product.handle}`
    ],
    productOptions: [
      {
        name: "Title",
        position: 1,
        values: [{ name: "Default Title" }]
      }
    ],
    variants: [
      {
        optionValues: [{ optionName: "Title", name: "Default Title" }],
        price: "0.00",
        taxable: true,
        inventoryPolicy: "DENY",
        inventoryItem: {
          tracked: false,
          requiresShipping: false
        }
      }
    ]
  };

  const data = await graphql(
    token,
    `
      mutation CreatePrivateProduct($input: ProductSetInput!) {
        productSet(input: $input) {
          product {
            id
            title
            handle
            status
            tags
          }
          userErrors {
            field
            message
          }
        }
      }
    `,
    { input }
  );

  if (data.productSet.userErrors.length) {
    throw new Error(`Shopify productSet userErrors: ${JSON.stringify(data.productSet.userErrors)}`);
  }

  return data.productSet.product;
}

async function main() {
  const token = await getAccessToken();
  const publications = PUBLISH ? await findAppointlyPublications(token) : [];
  const publicationIds = publications.map((publication) => publication.id);
  const result = [];

  for (const product of products) {
    if (TARGET_HANDLE && product.handle !== TARGET_HANDLE) continue;

    const existing = await findProductByHandle(token, product.handle);

    if (existing) {
      let currentProduct = existing;

      if (APPLY) {
        currentProduct = await updateProductDetails(token, existing.id, product);
      }

      const desiredStatus = APPOINTLY_ACTIVE
        ? "ACTIVE"
        : ENSURE_UNLISTED
          ? "UNLISTED"
          : null;

      if (desiredStatus && currentProduct.status !== desiredStatus) {
        const updated = await updateProductStatus(token, existing.id, desiredStatus);
        currentProduct = { ...currentProduct, status: updated.status };
      }
      if (PUBLISH) await publishProduct(token, existing.id, publicationIds);
      result.push({
        action: PUBLISH ? "updated-and-published" : APPLY ? "updated" : "unchanged",
        product: currentProduct
      });
      continue;
    }

    if (!APPLY) {
      result.push({ action: "would-create", product: { title: product.title, handle: product.handle } });
      continue;
    }

    const created = await createProduct(token, product);
    if (PUBLISH) await publishProduct(token, created.id, publicationIds);
    result.push({ action: PUBLISH ? "created-and-published" : "created", product: created });
  }

  console.log(JSON.stringify({ apply: APPLY, result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
