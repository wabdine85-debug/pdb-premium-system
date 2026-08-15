const PREMIUM_ADMIN_ENDPOINT = "/api/premium-admin";

export class PremiumAdminError extends Error {
  constructor(code, status) {
    super(code);
    this.name = "PremiumAdminError";
    this.code = code;
    this.status = status;
  }
}

async function requestPremiumAdmin(path, options = {}) {
  const response = await fetch(`${PREMIUM_ADMIN_ENDPOINT}${path}`, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...(options.headers || {}),
    },
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new PremiumAdminError(payload.error || "PREMIUM_ADMIN_REQUEST_FAILED", response.status);
  }
  return payload;
}

export function listPremiumMembers({ query = "", status = "", limit = 100 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (query.trim()) params.set("q", query.trim());
  if (status) params.set("status", status);
  return requestPremiumAdmin(`/members?${params.toString()}`);
}

export function getPremiumMember(memberId, month = "") {
  const params = new URLSearchParams();
  if (month) params.set("month", month);
  const suffix = params.size ? `?${params.toString()}` : "";
  return requestPremiumAdmin(`/members/${memberId}${suffix}`);
}

export function listPremiumContracts({ status = "", limit = 100 } = {}) {
  const params = new URLSearchParams({ limit: String(limit) });
  if (status) params.set("status", status);
  return requestPremiumAdmin(`/contracts?${params.toString()}`);
}

export function recordPremiumManualUsage(memberId, input) {
  return requestPremiumAdmin(`/members/${memberId}/manual-usage`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}
