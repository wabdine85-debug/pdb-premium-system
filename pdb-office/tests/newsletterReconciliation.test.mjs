import test from "node:test";
import assert from "node:assert/strict";
import {
  createAuditCsv,
  createShopifyCsv,
  isValidEmail,
  parseCustomerCsv,
  parseMarketingConsent,
  reconcileEmailContacts,
  selectSalonizedAdditions,
  selectSalonizedNewsletterAdditions,
} from "../modules/customers/newsletterReconciliation.js";

test("parses Shopify comma CSV including marketing consent", () => {
  const parsed = parseCustomerCsv("First Name,Last Name,Email,Accepts Email Marketing\nAnna,Test,ANNA@example.de,yes", "shopify.csv");
  assert.equal(parsed.source, "shopify");
  assert.equal(parsed.contacts[0].normalizedEmail, "anna@example.de");
  assert.equal(parsed.contacts[0].marketingConsent, "yes");
});

test("parses Salonized semicolon CSV and quoted values", () => {
  const parsed = parseCustomerCsv('salonized_id;first_name;last_name;email;newsletter_optin\n12;"Eva;Maria";Muster;eva@example.de;true');
  assert.equal(parsed.source, "salonized");
  assert.equal(parsed.contacts[0].firstName, "Eva;Maria");
  assert.equal(parsed.contacts[0].marketingConsent, "yes");
});

test("recognizes common consent values conservatively", () => {
  assert.equal(parseMarketingConsent("SUBSCRIBED"), "yes");
  assert.equal(parseMarketingConsent("unsubscribed"), "no");
  assert.equal(parseMarketingConsent(""), "unknown");
});

test("rejects malformed email addresses before export", () => {
  assert.equal(isValidEmail("anna+shop@example.de"), true);
  assert.equal(isValidEmail(",,.anna@example.de"), false);
  assert.equal(isValidEmail("anna..test@example.de"), false);
  assert.equal(isValidEmail("anna@-example.de"), false);
  assert.equal(isValidEmail("anna@example"), false);
});

test("deduplicates by exact normalized email and preserves both sources", () => {
  const result = reconcileEmailContacts([
    { source: "shopify", email: "anna@example.de", name: "Anna Test", marketingConsent: "yes" },
    { source: "salonized", email: " ANNA@example.de ", name: "Anna Test", marketingConsent: "yes" },
  ]);
  assert.equal(result.rows.length, 1);
  assert.deepEqual(result.rows[0].sources, ["shopify", "salonized"]);
  assert.equal(result.rows[0].status, "eligible");
  assert.equal(result.summary.duplicatesRemoved, 1);
});

test("keeps conflicting consent out of the automatic newsletter list", () => {
  const result = reconcileEmailContacts([
    { source: "shopify", email: "anna@example.de", marketingConsent: "no" },
    { source: "salonized", email: "anna@example.de", marketingConsent: "yes" },
  ]);
  assert.equal(result.rows[0].status, "review");
  assert.match(result.rows[0].reason, /widersprüchlich/i);
});

test("keeps all valid addresses while separating missing and invalid addresses", () => {
  const result = reconcileEmailContacts([
    { source: "shopify", email: "valid@example.de", marketingConsent: "unknown" },
    { source: "salonized", email: "", marketingConsent: "yes" },
    { source: "salonized", email: "kaputt", marketingConsent: "yes" },
  ]);
  assert.equal(result.summary.validUnique, 1);
  assert.equal(result.summary.missing, 1);
  assert.equal(result.summary.invalid, 1);
  assert.equal(result.rows[0].status, "excluded");
});

test("creates separate audit and Shopify imports with safe subscription flags", () => {
  const result = reconcileEmailContacts([
    { source: "shopify", email: "yes@example.de", firstName: "=Anna", marketingConsent: "yes" },
    { source: "salonized", email: "no@example.de", marketingConsent: "no" },
  ]);
  const allShopify = createShopifyCsv(result.rows);
  const eligibleShopify = createShopifyCsv(result.rows, { eligibleOnly: true });
  assert.match(allShopify, /^﻿First Name,Last Name,Email,Accepts Email Marketing,Tags/m);
  assert.match(allShopify, /yes@example\.de,yes/);
  assert.match(allShopify, /no@example\.de,no/);
  assert.match(allShopify, /"pdb-email-master, source-shopify, pdb-newsletter"/);
  assert.doesNotMatch(eligibleShopify, /no@example\.de/);
  assert.match(allShopify, /'=Anna/);
  assert.match(createAuditCsv(result), /Newsletter-Einwilligung vorhanden/);
});

test("selects only newsletter-approved Salonized contacts missing from Shopify", () => {
  const result = reconcileEmailContacts([
    { source: "shopify", email: "existing@example.de", marketingConsent: "yes" },
    { source: "salonized", email: "existing@example.de", marketingConsent: "yes" },
    { source: "salonized", email: "new@example.de", marketingConsent: "yes" },
    { source: "salonized", email: "no-consent@example.de", marketingConsent: "no" },
  ]);
  assert.deepEqual(selectSalonizedAdditions(result.rows).map(row => row.email), ["new@example.de", "no-consent@example.de"]);
  assert.deepEqual(selectSalonizedNewsletterAdditions(result.rows).map(row => row.email), ["new@example.de"]);
});
