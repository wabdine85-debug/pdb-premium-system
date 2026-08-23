function array(value) {
  return Array.isArray(value) ? value : [];
}

export function removeOnlineApplicationFromCrm(crmData, applicationId) {
  const id = String(applicationId || '');
  const memberships = array(crmData?.memberships);
  const removedMemberships = memberships.filter((membership) =>
    String(membership.onlineApplicationId || '') === id
  );
  const remainingMemberships = memberships.filter((membership) =>
    String(membership.onlineApplicationId || '') !== id
  );
  const createdPersonId = `online-${id}`;
  const canRemoveCreatedPerson = removedMemberships.some((membership) => membership.memberId === createdPersonId)
    && !remainingMemberships.some((membership) => membership.memberId === createdPersonId);
  const people = array(crmData?.members);
  const remainingPeople = canRemoveCreatedPerson
    ? people.filter((person) => person.id !== createdPersonId)
    : people;

  return {
    crmData: {
      ...crmData,
      members: remainingPeople,
      memberships: remainingMemberships
    },
    removedMembershipCount: removedMemberships.length,
    removedPersonCount: people.length - remainingPeople.length
  };
}

async function countRows(db, sql, values) {
  const result = await db.query(sql, values);
  return Number(result.rows[0]?.count || 0);
}

export async function purgeTestApplication({ application, actor, reason }, db) {
  const applicationId = application.id;
  const memberId = application.activated_member_id;
  const counts = {
    contract_events: await countRows(db, 'SELECT COUNT(*) FROM membership_contract_events WHERE application_id = $1', [applicationId]),
    contract_actions: await countRows(db, 'SELECT COUNT(*) FROM contract_action_requests WHERE matched_application_id = $1', [applicationId]),
    bookings: memberId ? await countRows(db, 'SELECT COUNT(*) FROM bookings WHERE member_id = $1', [memberId]) : 0,
    booking_admin_events: memberId ? await countRows(db, 'SELECT COUNT(*) FROM booking_admin_events WHERE member_id = $1', [memberId]) : 0,
    booking_tokens: memberId ? await countRows(db, 'SELECT COUNT(*) FROM booking_tokens WHERE member_id = $1', [memberId]) : 0,
    usage_imports: memberId ? await countRows(db, 'SELECT COUNT(*) FROM member_monthly_usage_imports WHERE member_id = $1', [memberId]) : 0,
    crm_memberships: 0,
    crm_people: 0
  };

  const crmResult = await db.query(
    `SELECT payload, revision
     FROM pdb_office.documents
     WHERE document_key = 'crm'
     FOR UPDATE`
  );
  const crmDocument = crmResult.rows[0];
  if (crmDocument?.payload) {
    const cleanup = removeOnlineApplicationFromCrm(crmDocument.payload, applicationId);
    counts.crm_memberships = cleanup.removedMembershipCount;
    counts.crm_people = cleanup.removedPersonCount;
    if (cleanup.removedMembershipCount || cleanup.removedPersonCount) {
      const nextRevision = Number(crmDocument.revision || 0) + 1;
      cleanup.crmData._storageRevision = nextRevision;
      cleanup.crmData._storageUpdatedAt = new Date().toISOString();
      await db.query(
        `UPDATE pdb_office.documents
         SET payload = $1::jsonb, revision = $2, updated_at = NOW()
         WHERE document_key = 'crm'`,
        [JSON.stringify(cleanup.crmData), nextRevision]
      );
    }
  }

  if (memberId) {
    await db.query('DELETE FROM booking_admin_events WHERE member_id = $1', [memberId]);
  }
  await db.query('DELETE FROM contract_action_requests WHERE matched_application_id = $1', [applicationId]);
  await db.query('DELETE FROM membership_applications WHERE id = $1', [applicationId]);
  if (memberId) {
    await db.query('DELETE FROM members WHERE id = $1', [memberId]);
  }
  await db.query(
    `INSERT INTO test_record_purges (
       application_id, mandate_reference, member_id, shopify_customer_id,
       actor, reason, removed_counts
     ) VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb)`,
    [
      applicationId,
      application.mandate_reference,
      memberId,
      application.shopify_customer_id,
      actor,
      reason,
      JSON.stringify(counts)
    ]
  );

  return counts;
}
