export const BEYOND_TREATMENT_SESSION_LIMITS = Object.freeze({
  "3x-kryolipolyse": 3,
  "3x-ems-sella": 3,
  "2x-forma": 2,
  "3x-ems-sculpt": 3
});

export function getBeyondTreatmentSessionLimit(treatmentKey) {
  return BEYOND_TREATMENT_SESSION_LIMITS[treatmentKey] || 1;
}
