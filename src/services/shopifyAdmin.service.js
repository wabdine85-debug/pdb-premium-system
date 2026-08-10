import { env } from '../config/env.js';

const API_VERSION = '2026-04';

function requireShopifyAdminConfig() {
  if (!env.shopifyShop || !env.shopifyClientId || !env.shopifyClientSecret) {
    throw new Error('SHOPIFY_ADMIN_NOT_CONFIGURED');
  }
}

async function getAccessToken() {
  requireShopifyAdminConfig();
  const response = await fetch(`https://${env.shopifyShop}.myshopify.com/admin/oauth/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: env.shopifyClientId,
      client_secret: env.shopifyClientSecret
    })
  });
  if (!response.ok) throw new Error(`SHOPIFY_TOKEN_FAILED_${response.status}`);
  return (await response.json()).access_token;
}

async function graphql(query, variables) {
  const token = await getAccessToken();
  const response = await fetch(
    `https://${env.shopifyShop}.myshopify.com/admin/api/${API_VERSION}/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token
      },
      body: JSON.stringify({ query, variables })
    }
  );
  if (!response.ok) throw new Error(`SHOPIFY_GRAPHQL_FAILED_${response.status}`);
  const body = await response.json();
  if (body.errors?.length) throw new Error(`SHOPIFY_GRAPHQL_ERROR: ${JSON.stringify(body.errors)}`);
  return body.data;
}

export async function setPremiumCustomerTag(customerId, packageKey) {
  const id = `gid://shopify/Customer/${customerId}`;
  const tagsToRemove = ['premium-pure', 'premium-define', 'premium-beyond', 'premium-private'];
  const data = await graphql(
    `mutation SetPremiumTags($id: ID!, $remove: [String!]!, $add: [String!]!) {
      tagsRemove(id: $id, tags: $remove) { userErrors { field message } }
      tagsAdd(id: $id, tags: $add) { userErrors { field message } }
    }`,
    { id, remove: tagsToRemove, add: [`premium-${packageKey}`] }
  );
  const errors = [
    ...(data.tagsRemove.userErrors || []),
    ...(data.tagsAdd.userErrors || [])
  ];
  if (errors.length) throw new Error(`SHOPIFY_TAG_UPDATE_FAILED: ${JSON.stringify(errors)}`);
}
