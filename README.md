# PDB Premium System

Backend and Shopify theme integration for the PDB Premium memberships PURE,
DEFINE, BEYOND and PRIVATE. The service validates signed Shopify app-proxy
requests, enforces monthly treatment entitlements and stores online membership
applications with encrypted SEPA data.

## Requirements

- Node.js 20 or newer
- PostgreSQL
- A Shopify custom app with the required scopes
- Appointly configured for the 0.00 EUR carrier products

## Setup

1. Copy `.env.example` to `.env` and provide the local values. Never commit
   `.env` or real secrets.
2. Run the SQL files in order: `001_init.sql`, followed by every file in
   `migrations/`.
3. Install dependencies with `npm install`.
4. Synchronize treatments with `npm run sync:treatments`.
5. Start the service with `npm start`.

## Validation

```sh
npm test
npm run validate:treatments
shopify theme check --path shopify-theme-premium-dummy-clean
```

## Production configuration

The following environment variables are required in production:

- `DATABASE_URL`
- `FRONTEND_ORIGIN`
- `SHOPIFY_SHOP`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_APP_SECRET`
- `CONTRACT_ENCRYPTION_KEY` (32 random bytes encoded as Base64 or 64 hex characters)
- `ADMIN_API_TOKEN` (a long random bearer token)
- `CONTRACT_VERSION`

The Shopify app proxy must forward `/apps/pdb/*` to this service under
`/api/*`. Contract and booking endpoints reject unsigned proxy requests.

For product and legal-page synchronization, the Shopify app requires the
corresponding product, publication, content and online-store-page scopes.

## Manual SEPA workflow

New applications start with status `sepa_pending`. An administrator retrieves
the IBAN only through the protected admin endpoint, creates the recurring
direct debit in Naspa Online-Banking, and then activates the application. The
activation adds the matching Shopify customer tag and enables the member in
the local database. IBAN values must never be placed in Shopify notes, tags,
emails or logs.

## Shopify products

The ten PRIVATE carrier products are created idempotently with:

```sh
npm run sync:shopify-private-products -- --apply
```

Use `--ensure-unlisted` to restore the direct-link-only status. Publishing to
the Online Store requires the additional `--publish` flag and the
`read_publications` / `write_publications` scopes.
