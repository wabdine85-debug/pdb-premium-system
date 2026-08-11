import { pool } from '../config/pool.js';

const PUBLIC_COLUMNS = `
  id,
  shopify_customer_id,
  email,
  first_name,
  last_name,
  package_key,
  monthly_price_cents,
  setup_fee_cents,
  minimum_total_cents,
  starts_on,
  debit_day,
  status,
  mandate_reference,
  iban_last4,
  contract_version,
  early_start_requested_at,
  activated_at,
  cancellation_requested_at,
  cancellation_effective_on,
  cancelled_at,
  created_at,
  updated_at
`;

export async function createApplication(application, db = pool) {
  const result = await db.query(
    `
      INSERT INTO membership_applications (
        id, shopify_customer_id, shop_domain, email, first_name, last_name,
        address_line1, postal_code, city, package_key, monthly_price_cents,
        setup_fee_cents, minimum_total_cents, starts_on, debit_day, status,
        mandate_reference, iban_ciphertext, iban_iv, iban_auth_tag, iban_last4,
        contract_version, agb_accepted_at, withdrawal_received_at,
        sepa_accepted_at, early_start_requested_at, public_token_hash
      ) VALUES (
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'sepa_pending',
        $16,$17,$18,$19,$20,$21,$22,$22,$22,$23,$24
      )
      RETURNING ${PUBLIC_COLUMNS}
    `,
    [
      application.id,
      application.shopifyCustomerId,
      application.shopDomain,
      application.email,
      application.firstName,
      application.lastName,
      application.addressLine1,
      application.postalCode,
      application.city,
      application.packageKey,
      application.monthlyPriceCents,
      application.setupFeeCents,
      application.minimumTotalCents,
      application.startsOn,
      application.debitDay,
      application.mandateReference,
      application.ibanCiphertext,
      application.ibanIv,
      application.ibanAuthTag,
      application.ibanLast4,
      application.contractVersion,
      application.acceptedAt,
      application.earlyStartRequestedAt,
      application.publicTokenHash
    ]
  );
  return result.rows[0];
}

export async function addContractEvent(applicationId, eventType, actorType, metadata = {}, db = pool) {
  await db.query(
    `INSERT INTO membership_contract_events (application_id, event_type, actor_type, metadata)
     VALUES ($1,$2,$3,$4::jsonb)`,
    [applicationId, eventType, actorType, JSON.stringify(metadata)]
  );
}

export async function findApplicationByPublicTokenHash(tokenHash, customerId, db = pool) {
  const result = await db.query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM membership_applications
     WHERE public_token_hash = $1 AND shopify_customer_id = $2
     LIMIT 1`,
    [tokenHash, customerId]
  );
  return result.rows[0] || null;
}

export async function findLatestApplicationByCustomer(customerId, db = pool) {
  const result = await db.query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM membership_applications
     WHERE shopify_customer_id = $1
     ORDER BY created_at DESC
     LIMIT 1`,
    [customerId]
  );
  return result.rows[0] || null;
}

export async function findActiveApplicationForBooking(memberId, db = pool) {
  const result = await db.query(
    `SELECT id, package_key, status, starts_on, early_start_requested_at, activated_at
     FROM membership_applications
     WHERE activated_member_id = $1 AND status = 'active'
     ORDER BY activated_at DESC
     LIMIT 1`,
    [memberId]
  );
  return result.rows[0] || null;
}

export async function findApplicationForAdmin(id, db = pool) {
  const result = await db.query(
    `SELECT *, 'DE•• •••• •••• •••• ••' || iban_last4 AS masked_iban
     FROM membership_applications WHERE id = $1 LIMIT 1`,
    [id]
  );
  return result.rows[0] || null;
}

export async function listApplications({ status, limit = 50 }, db = pool) {
  const values = [];
  const where = status ? 'WHERE status = $1' : '';
  if (status) values.push(status);
  values.push(Math.min(Math.max(Number(limit) || 50, 1), 100));
  const limitParam = values.length;

  const result = await db.query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM membership_applications
     ${where}
     ORDER BY created_at DESC
     LIMIT $${limitParam}`,
    values
  );
  return result.rows;
}

export async function activateApplication(id, memberId, db = pool) {
  const result = await db.query(
    `UPDATE membership_applications
     SET status = 'active', activated_member_id = $2, activated_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND status = 'sepa_pending'
     RETURNING ${PUBLIC_COLUMNS}`,
    [id, memberId]
  );
  return result.rows[0] || null;
}

export async function requestCancellation(id, customerId, db = pool) {
  const result = await db.query(
    `UPDATE membership_applications
     SET
       status = 'cancel_requested',
       cancellation_requested_at = NOW(),
       cancellation_effective_on = GREATEST(
         starts_on + INTERVAL '12 months',
         CURRENT_DATE + INTERVAL '1 month'
       )::date,
       updated_at = NOW()
     WHERE id = $1 AND shopify_customer_id = $2 AND status = 'active'
     RETURNING ${PUBLIC_COLUMNS}`,
    [id, customerId]
  );
  return result.rows[0] || null;
}

export async function findApplicationForPublicAction({
  mandateReference,
  email,
  firstName,
  lastName
}, db = pool) {
  const result = await db.query(
    `SELECT ${PUBLIC_COLUMNS}
     FROM membership_applications
     WHERE UPPER(mandate_reference) = UPPER($1)
       AND LOWER(email) = LOWER($2)
       AND LOWER(first_name) = LOWER($3)
       AND LOWER(last_name) = LOWER($4)
     ORDER BY created_at DESC
     LIMIT 1`,
    [mandateReference, email, firstName, lastName]
  );
  return result.rows[0] || null;
}

export async function createContractActionRequest(request, db = pool) {
  const result = await db.query(
    `INSERT INTO contract_action_requests (
       id, action_type, first_name, last_name, email, mandate_reference,
       communication_email, cancellation_type, cancellation_reason,
       requested_end_on, matched_application_id, receipt_token_hash,
       request_metadata
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
     RETURNING *`,
    [
      request.id,
      request.actionType,
      request.firstName,
      request.lastName,
      request.email,
      request.mandateReference,
      request.communicationEmail,
      request.cancellationType,
      request.cancellationReason,
      request.requestedEndOn,
      request.matchedApplicationId,
      request.receiptTokenHash,
      JSON.stringify(request.metadata || {})
    ]
  );
  return result.rows[0];
}

export async function findContractActionByReceiptTokenHash(tokenHash, db = pool) {
  const result = await db.query(
    `SELECT id, action_type, first_name, last_name, email, mandate_reference,
            communication_email, cancellation_type, cancellation_reason,
            requested_end_on, status, created_at
     FROM contract_action_requests
     WHERE receipt_token_hash = $1
     LIMIT 1`,
    [tokenHash]
  );
  return result.rows[0] || null;
}

export async function listContractActionRequests({ status, limit = 50 }, db = pool) {
  const values = [];
  const where = status ? 'WHERE status = $1' : '';
  if (status) values.push(status);
  values.push(Math.min(Math.max(Number(limit) || 50, 1), 100));
  const limitParam = values.length;
  const result = await db.query(
    `SELECT id, action_type, first_name, last_name, email, mandate_reference,
            communication_email, cancellation_type, cancellation_reason,
            requested_end_on, matched_application_id, status, created_at, updated_at
     FROM contract_action_requests
     ${where}
     ORDER BY created_at ASC
     LIMIT $${limitParam}`,
    values
  );
  return result.rows;
}
