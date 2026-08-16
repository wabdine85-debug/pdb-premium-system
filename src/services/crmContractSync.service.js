function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function normalizeName(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isoDate(value) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const day = String(value.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }
  const calendarDate = String(value || '').match(/^\d{4}-\d{2}-\d{2}/)?.[0];
  if (calendarDate) return calendarDate;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function contractEndDate(startsOn) {
  const date = new Date(`${isoDate(startsOn)}T12:00:00Z`);
  date.setUTCFullYear(date.getUTCFullYear() + 1);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

function packageLabel(packageKey) {
  return {
    pure: 'Pure',
    define: 'Define',
    beyond: 'Beyond',
    private: 'Private'
  }[String(packageKey || '').toLowerCase()] || String(packageKey || '');
}

function uniquePerson(people, predicate) {
  const matches = people.filter(predicate);
  if (matches.length > 1) throw new Error('CRM_MEMBER_AMBIGUOUS');
  return matches[0] || null;
}

export function applyAcceptedContractToCrm(crmData, application, now = new Date()) {
  const people = Array.isArray(crmData.members) ? crmData.members : [];
  const memberships = Array.isArray(crmData.memberships) ? crmData.memberships : [];
  const applicationId = String(application.id);
  const existingMembership = memberships.find((membership) =>
    String(membership.onlineApplicationId || '') === applicationId
    || (
      normalizeEmail(membership.memberEmail) === normalizeEmail(application.email)
      && String(membership.mandateReference || '') === String(application.mandate_reference || '')
    )
  );
  if (existingMembership) {
    return {
      crmData,
      memberId: existingMembership.memberId,
      membershipId: existingMembership.id,
      createdPerson: false,
      createdMembership: false
    };
  }

  const fullName = [application.first_name, application.last_name].filter(Boolean).join(' ').trim();
  const email = normalizeEmail(application.email);
  let person = email
    ? uniquePerson(people, (candidate) => normalizeEmail(candidate.email) === email)
    : null;
  if (!person) {
    const name = normalizeName(fullName);
    person = name
      ? uniquePerson(people, (candidate) => normalizeName(candidate.name) === name)
      : null;
  }

  const today = isoDate(now);
  const plan = packageLabel(application.package_key);
  let createdPerson = false;
  if (!person) {
    person = {
      id: `online-${applicationId}`,
      name: fullName,
      email,
      phone: '',
      address: application.address_line1 || '',
      zip: application.postal_code || '',
      city: application.city || '',
      status: 'aktiv',
      source: 'shopify',
      sources: ['shopify'],
      membershipTier: plan,
      shopifyCustomerId: String(application.shopify_customer_id),
      createdAt: today,
      updatedAt: today
    };
    people.push(person);
    createdPerson = true;
  }

  const activeMemberships = memberships.filter((membership) =>
    membership.memberId === person.id && membership.status === 'aktiv'
  );
  person.status = 'aktiv';
  person.membershipTier = activeMemberships.length ? 'Mehrere Pakete' : plan;
  person.shopifyCustomerId = String(application.shopify_customer_id);
  person.updatedAt = today;

  const membership = {
    id: `online-${applicationId}`,
    memberId: person.id,
    memberName: person.name || fullName,
    memberEmail: person.email || email,
    memberPhone: person.phone || '',
    plan,
    contractSignedAt: isoDate(application.created_at || now),
    startDate: isoDate(application.starts_on),
    endDate: contractEndDate(application.starts_on),
    monthlyAmount: Number(application.monthly_price_cents || 0) / 100,
    status: 'aktiv',
    paymentMethod: 'SEPA',
    sepaIban: '',
    debitDay: String(application.debit_day || '1'),
    mandateReference: application.mandate_reference,
    notes: 'Automatisch aus angenommenem Online-Vertrag übernommen.',
    setupBankingStatus: 'erledigt',
    setupBankingDoneAt: today,
    setupBankingNote: 'Vertrag in der Online-Vertragsverwaltung angenommen.',
    setupFeeAmount: Number(application.setup_fee_cents || 0) / 100,
    setupFeeStatus: 'offen',
    setupFeeDoneAt: '',
    onlineApplicationId: applicationId,
    shopifyCustomerId: String(application.shopify_customer_id),
    createdAt: today,
    updatedAt: today,
    newMemberNoticeAt: today,
    packageLabel: activeMemberships.length ? `${activeMemberships.length + 1}. Paket` : '1. Paket'
  };
  memberships.push(membership);
  crmData.members = people;
  crmData.memberships = memberships;

  return {
    crmData,
    memberId: person.id,
    membershipId: membership.id,
    createdPerson,
    createdMembership: true
  };
}

export async function syncAcceptedContractToCrm(application, db) {
  const result = await db.query(
    `SELECT payload, revision
     FROM pdb_office.documents
     WHERE document_key = 'crm'
     FOR UPDATE`
  );
  const document = result.rows[0];
  if (!document?.payload) throw new Error('CRM_NOT_INITIALIZED');

  const sync = applyAcceptedContractToCrm(document.payload, application);
  if (!sync.createdMembership) return sync;

  const nextRevision = Number(document.revision || 0) + 1;
  sync.crmData._storageRevision = nextRevision;
  sync.crmData._storageUpdatedAt = new Date().toISOString();
  await db.query(
    `UPDATE pdb_office.documents
     SET payload = $1::jsonb, revision = $2, updated_at = NOW()
     WHERE document_key = 'crm'`,
    [JSON.stringify(sync.crmData), nextRevision]
  );
  return sync;
}
