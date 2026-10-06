import { pool } from '../config/pool.js';

function normalized(value) {
  return String(value || '').trim().toLocaleLowerCase('de-DE').replace(/\s+/g, ' ');
}

function samePerson(firstName, lastName, email, person) {
  return normalized(person.email) === normalized(email)
    && normalized(person.first_name || person.firstName) === normalized(firstName)
    && normalized(person.last_name || person.lastName) === normalized(lastName);
}

function crmCandidates(crm, { firstName, lastName, email, mandateReference }) {
  const people = new Map((crm?.members || []).map((person) => [String(person.id), person]));
  const candidates = [];
  for (const membership of crm?.memberships || []) {
    if (!['pure', 'define', 'beyond', 'private'].includes(normalized(membership.plan))) continue;
    const person = people.get(String(membership.memberId)) || {};
    const name = String(person.name || membership.memberName || '').trim().split(/\s+/);
    const matchingName = normalized(name.join(' ')) === normalized(`${firstName} ${lastName}`);
    const matchingEmail = normalized(person.email || membership.memberEmail) === normalized(email);
    if (!matchingName || !matchingEmail) continue;
    const matchingReference = mandateReference
      && normalized(membership.mandateReference) === normalized(mandateReference);
    candidates.push({ source: 'office', exact: Boolean(matchingReference) });
  }
  return candidates;
}

export async function findContractActionMatch({ firstName, lastName, email, mandateReference }, db = pool) {
  const online = await db.query(
    `SELECT id, mandate_reference FROM membership_applications
     WHERE LOWER(email) = LOWER($1)
       AND LOWER(first_name) = LOWER($2)
       AND LOWER(last_name) = LOWER($3)
     ORDER BY CASE WHEN UPPER(mandate_reference) = UPPER($4) THEN 0 ELSE 1 END,
              created_at DESC
     LIMIT 3`,
    [email, firstName, lastName, mandateReference]
  );
  const local = await db.query(
    `SELECT id, email, first_name, last_name FROM members
     WHERE LOWER(email) = LOWER($1)
     LIMIT 3`,
    [email]
  );
  const candidates = online.rows.map((row) => ({
    source: 'online',
    id: row.id,
    exact: Boolean(mandateReference && normalized(row.mandate_reference) === normalized(mandateReference))
  }));
  for (const row of local.rows) {
    if (samePerson(firstName, lastName, email, row)) {
      candidates.push({ source: 'member', exact: false });
    }
  }

  let officeAvailable = true;
  try {
    const result = await db.query(
      `SELECT payload FROM pdb_office.documents WHERE document_key = 'crm' LIMIT 1`
    );
    if (result.rows[0]?.payload) {
      candidates.push(...crmCandidates(result.rows[0].payload, {
        firstName, lastName, email, mandateReference
      }));
    } else {
      officeAvailable = false;
    }
  } catch {
    // A missing Office document must never prevent receipt of a declaration.
    officeAvailable = false;
  }

  const exactOnline = candidates.filter((candidate) => candidate.source === 'online' && candidate.exact);
  const exactOffice = candidates.filter((candidate) => candidate.source === 'office' && candidate.exact);
  const state = exactOnline.length === 1 || exactOffice.length === 1
    ? 'reference_match'
    : candidates.length ? 'possible_match' : officeAvailable ? 'unmatched' : 'review_required';
  return {
    state,
    sources: [...new Set(candidates.map((candidate) => candidate.source))],
    matchedApplicationId: exactOnline.length === 1 ? exactOnline[0].id : null
  };
}
