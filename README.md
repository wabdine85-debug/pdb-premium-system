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
npm run test:pdb-office
npm run build:pdb-office
npm run validate:treatments
shopify theme check --path shopify-theme-premium-dummy-clean
```

## PDB Office

PDB Office is served by this same application at `/office/`. It uses the
existing contract-administration login and keeps its CRM documents in the
separate PostgreSQL schema `pdb_office`. No second Render service or browser
API token is required.

The production build command must include the frontend build:

```sh
npm install && npm run build:pdb-office
```

The `/office/` workspace also contains an auditable membership direct-debit
workflow. Monthly collection runs, confirmed Naspa CSV return imports, bank
fees, follow-up dates, and resolution history are stored additively in the
existing protected CRM document. See `pdb-office/docs/direct-debits.md`.

## Production configuration

The following environment variables are required in production:

- `DATABASE_URL`
- `FRONTEND_ORIGIN`
- `SHOPIFY_SHOP`
- `SHOPIFY_CLIENT_ID`
- `SHOPIFY_CLIENT_SECRET`
- `SHOPIFY_APP_SECRET`
- `CONTRACT_ENCRYPTION_KEY` (32 random bytes encoded as Base64 or 64 hex characters)
- `ADMIN_API_TOKEN` (a long random bearer token; also signs browser sessions)
- `ADMIN_PASSWORD` (minimum 12 characters; unique password for the browser administration)
- `ADMIN_SESSION_HOURS` (optional, 1–24 hours; defaults to 8)
- `CONTRACT_VERSION`
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM`
- `CONTRACT_ADMIN_EMAIL` (receives new-application notices without full IBAN data)

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

The protected administration page is available at `/admin/contracts`. The
administrator signs in with `ADMIN_PASSWORD`; the server creates an `HttpOnly`,
`Secure`, `SameSite=Strict` cookie that expires automatically. `ADMIN_API_TOKEN`
remains available as a recovery and private API credential and is never
persisted by the page. Full SEPA data is revealed only on explicit request and
the access is written to the contract event log.

## Contract confirmations and public contract actions

The storefront exposes permanently reachable links for `Vertrag widerrufen`
and `Verträge hier kündigen`. Every declaration is stored independently in
`contract_action_requests`, including declarations that cannot be matched
automatically. The customer receives an immediate downloadable HTML receipt;
when SMTP is configured, the same receipt is also sent as an attachment.

Submitting the membership form is a binding order and grants the SEPA mandate.
The contract is formed only when an administrator activates the application.
Activation sends the explicit acceptance and contract confirmation when SMTP
is configured. The latest order or contract confirmation remains downloadable
from the signed customer area.

## Internal member administration

The existing contract administration endpoints remain unchanged. Additional
member administration endpoints are available below `/api/admin` and require
the same `Authorization: Bearer <ADMIN_API_TOKEN>` header:

- `GET /api/admin/members` lists members and supports `q`, `status` and `limit`.
- `GET /api/admin/members/:id` returns the member, two monthly entitlement
  summaries, bookings, allowed treatments and the manual audit history.
- `POST /api/admin/members/:id/manual-usage` records an already consumed
  treatment with `treatment_key`, `booking_month`, `actor` and `reason`.
- `POST /api/admin/bookings/:id/cancel-manual` reverses only a manually created
  usage and requires `actor` and `reason`.

Run `migrations/005_add_manual_booking_audit.sql` before enabling these routes
in an environment. The migration only adds columns, indexes and an audit table;
it does not modify or delete existing member or booking records.

## Shopify products

The ten PRIVATE carrier products are created idempotently with:

```sh
npm run sync:shopify-private-products -- --apply
```

Use `--ensure-unlisted` to restore the direct-link-only status. The `--publish`
flag publishes every carrier product to both **Onlineshop** and **Shop**, which
Appointly requires for a working product-to-calendar association. It requires
the
`read_publications` / `write_publications` scopes.

## Appointly service setup

Do not search for a newly created Shopify carrier product directly in an
existing Appointly service form. In Shopify Admin, open Appointly, go to
**Services**, click **Neuen Service hinzufügen**, and then select the Shopify
product from the list shown in that flow. Configure every PRIVATE service with
a duration of 90 minutes. Body Sculpt Intensive represents one monthly PRIVATE
protocol with four separately booked 90-minute appointments; the backend locks
the member to that protocol after the first appointment and permits three more
appointments in the same membership month.
