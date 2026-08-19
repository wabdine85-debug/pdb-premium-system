const ROUTES = [
  { method: "GET", pattern: /^\/members$/, target: () => "/api/admin/members" },
  { method: "GET", pattern: /^\/members\/(\d+)$/, target: match => `/api/admin/members/${match[1]}` },
  { method: "POST", pattern: /^\/members\/(\d+)\/manual-usage$/, target: match => `/api/admin/members/${match[1]}/manual-usage` },
  { method: "POST", pattern: /^\/bookings\/(\d+)\/cancel-manual$/, target: match => `/api/admin/bookings/${match[1]}/cancel-manual` },
  { method: "POST", pattern: /^\/bookings\/(\d+)\/cancel$/, target: match => `/api/admin/bookings/${match[1]}/cancel` },
  { method: "POST", pattern: /^\/bookings\/(\d+)\/reschedule$/, target: match => `/api/admin/bookings/${match[1]}/reschedule` },
  { method: "GET", pattern: /^\/contracts$/, target: () => "/api/contracts/admin" },
];

function sendJson(res, status, payload) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(payload));
}

function cleanBaseUrl(value) {
  try {
    const url = new URL(String(value || "").trim());
    const local = ["127.0.0.1", "localhost"].includes(url.hostname);
    if (url.protocol !== "https:" && !local) return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function resolvePremiumAdminRoute(method, pathname) {
  for (const route of ROUTES) {
    if (route.method !== String(method || "").toUpperCase()) continue;
    const match = String(pathname || "").match(route.pattern);
    if (match) return route.target(match);
  }
  return null;
}

export function isSameOriginRequest(req) {
  const origin = String(req.headers.origin || "").trim();
  if (!origin) return true;
  try {
    return new URL(origin).host === String(req.headers.host || "");
  } catch {
    return false;
  }
}

async function readRequestBody(req, maxBytes = 32_000) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new Error("REQUEST_TOO_LARGE");
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

export function createPremiumAdminProxy({ baseUrl, adminToken, fetchImpl = fetch }) {
  const safeBaseUrl = cleanBaseUrl(baseUrl);
  const safeAdminToken = String(adminToken || "").trim();

  return async function premiumAdminProxy(req, res) {
    if (!safeBaseUrl || !safeAdminToken) {
      return sendJson(res, 503, { ok: false, error: "PREMIUM_ADMIN_NOT_CONFIGURED" });
    }
    if (!isSameOriginRequest(req)) {
      return sendJson(res, 403, { ok: false, error: "ORIGIN_NOT_ALLOWED" });
    }

    const incomingUrl = new URL(req.url || "/", "http://pdb-office.local");
    const targetPath = resolvePremiumAdminRoute(req.method, incomingUrl.pathname);
    if (!targetPath) {
      return sendJson(res, 404, { ok: false, error: "ADMIN_ROUTE_NOT_FOUND" });
    }

    try {
      const body = ["POST", "PUT", "PATCH"].includes(req.method)
        ? await readRequestBody(req)
        : undefined;
      const targetUrl = new URL(targetPath, safeBaseUrl);
      targetUrl.search = incomingUrl.search;
      const response = await fetchImpl(targetUrl, {
        method: req.method,
        redirect: "error",
        headers: {
          Authorization: `Bearer ${safeAdminToken}`,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        body,
      });
      const responseBody = await response.text();
      res.statusCode = response.status;
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Cache-Control", "no-store");
      res.end(responseBody || JSON.stringify({ ok: response.ok }));
    } catch (error) {
      const tooLarge = error.message === "REQUEST_TOO_LARGE";
      return sendJson(res, tooLarge ? 413 : 502, {
        ok: false,
        error: tooLarge ? "REQUEST_TOO_LARGE" : "PREMIUM_ADMIN_UNAVAILABLE",
      });
    }
  };
}
