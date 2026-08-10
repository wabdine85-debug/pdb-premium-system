export const PRIVATE_PROTOCOL_SESSION_LIMITS = Object.freeze({
  "private-morpheus8-total-face": 1,
  "private-hifu-total-face": 1,
  "private-redtouch-360": 1,
  "private-hydraforma-ultimate": 1,
  "private-regeneration-pro": 1,
  "private-glass-skin": 1,
  "private-pigment-texture": 1,
  "private-laser-complete": 1,
  "private-body-sculpt-intensive": 4,
  "private-cryo-contour-intensive": 1
});

export function getPrivateProtocolSessionLimit(treatmentKey) {
  return PRIVATE_PROTOCOL_SESSION_LIMITS[treatmentKey] || 1;
}
