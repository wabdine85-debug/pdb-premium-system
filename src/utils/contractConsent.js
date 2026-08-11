export function hasRequiredContractConsents(body = {}) {
  return (
    body.confirm_age_18 === true &&
    body.accept_agb === true &&
    body.accept_withdrawal === true &&
    body.accept_sepa === true &&
    body.account_holder_confirmed === true
  );
}

export function hasHouseNumber(address) {
  return /\d/.test(String(address || ''));
}
