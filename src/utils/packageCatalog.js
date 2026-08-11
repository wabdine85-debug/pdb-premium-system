export const PACKAGE_CATALOG = Object.freeze({
  pure: Object.freeze({ name: 'PURE', monthlyPriceCents: 14900, monthlyClaim: 'Bis zu 3 Behandlungen aus PURE' }),
  define: Object.freeze({ name: 'DEFINE', monthlyPriceCents: 16900, monthlyClaim: '1 × PURE und 1 × DEFINE' }),
  beyond: Object.freeze({ name: 'BEYOND', monthlyPriceCents: 19900, monthlyClaim: '1 Behandlung aus BEYOND' }),
  private: Object.freeze({ name: 'PRIVATE', monthlyPriceCents: 39900, monthlyClaim: '1 vollständiges PRIVATE-Protokoll' })
});

export const SETUP_FEE_CENTS = 3900;

export function getPackageOffer(packageKey) {
  const offer = PACKAGE_CATALOG[String(packageKey || '').toLowerCase()];
  if (!offer) return null;

  return {
    ...offer,
    minimumTotalCents: offer.monthlyPriceCents * 12 + SETUP_FEE_CENTS
  };
}
