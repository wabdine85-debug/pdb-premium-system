import assert from "node:assert/strict";
import { Readable } from "node:stream";
import test from "node:test";

import { createPremiumAdminProxy, isSameOriginRequest, resolvePremiumAdminRoute } from "../server/premium-admin-proxy.mjs";

test("premium admin proxy only exposes allow-listed routes", () => {
  assert.equal(resolvePremiumAdminRoute("GET", "/members"), "/api/admin/members");
  assert.equal(resolvePremiumAdminRoute("GET", "/members/17"), "/api/admin/members/17");
  assert.equal(resolvePremiumAdminRoute("POST", "/members/17/manual-usage"), "/api/admin/members/17/manual-usage");
  assert.equal(resolvePremiumAdminRoute("POST", "/bookings/23/cancel-manual"), "/api/admin/bookings/23/cancel-manual");
  assert.equal(resolvePremiumAdminRoute("GET", "/contracts"), "/api/contracts/admin");
  assert.equal(resolvePremiumAdminRoute("GET", "/contracts/17/sepa"), null);
  assert.equal(resolvePremiumAdminRoute("DELETE", "/members/17"), null);
});

test("premium admin proxy rejects cross-origin browser requests", () => {
  assert.equal(isSameOriginRequest({ headers: { host: "127.0.0.1:5173", origin: "http://127.0.0.1:5173" } }), true);
  assert.equal(isSameOriginRequest({ headers: { host: "127.0.0.1:5173", origin: "https://attacker.example" } }), false);
  assert.equal(isSameOriginRequest({ headers: { host: "127.0.0.1:5173" } }), true);
});

test("premium admin proxy keeps the bearer token server-side", async () => {
  let forwarded = null;
  const proxy = createPremiumAdminProxy({
    baseUrl: "https://premium.example",
    adminToken: "server-secret",
    fetchImpl: async (url, options) => {
      forwarded = { url: String(url), options };
      return new Response(JSON.stringify({ ok: true, members: [] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    },
  });
  const req = Readable.from([]);
  req.method = "GET";
  req.url = "/members?q=anna";
  req.headers = { host: "127.0.0.1:5173", origin: "http://127.0.0.1:5173" };
  const headers = {};
  let responseBody = "";
  const res = {
    statusCode: 0,
    setHeader(name, value) { headers[name] = value; },
    end(value) { responseBody = value || ""; },
  };

  await proxy(req, res);

  assert.equal(res.statusCode, 200);
  assert.equal(forwarded.url, "https://premium.example/api/admin/members?q=anna");
  assert.equal(forwarded.options.headers.Authorization, "Bearer server-secret");
  assert.equal(responseBody.includes("server-secret"), false);
  assert.equal(headers["Cache-Control"], "no-store");
});
