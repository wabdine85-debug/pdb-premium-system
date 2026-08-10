import test from "node:test";
import assert from "node:assert/strict";

import {
  PACKAGE_KEYS,
  PACKAGE_RULES,
  createEmptyCategoryCounts,
  getAllowedCategoriesForPackage
} from "../src/utils/packageRules.js";
import { resolvePackageFromTags } from "../src/utils/packageTags.js";
import { treatments } from "../src/data/treatments.data.js";
import { getOrCreateMember } from "../src/services/member.service.js";

test("PRIVATE is a supported package with one monthly PRIVATE entitlement", () => {
  assert.deepEqual(PACKAGE_KEYS, ["pure", "define", "beyond", "private"]);
  assert.deepEqual(PACKAGE_RULES.private.limits, {
    pure: 0,
    define: 0,
    beyond: 0,
    private: 1
  });
  assert.deepEqual(getAllowedCategoriesForPackage("private"), ["private"]);
});

test("PRIVATE Shopify tag has precedence over lower package tags", () => {
  assert.equal(
    resolvePackageFromTags(["premium-pure", "premium-private"]),
    "private"
  );
});

test("PRIVATE requires the exact Shopify tag", () => {
  assert.equal(resolvePackageFromTags(["premium-private"]), "private");
  assert.equal(resolvePackageFromTags(["premium-private "]), null);
  assert.equal(resolvePackageFromTags(["PREMIUM-PRIVATE"]), null);
});

test("member access is denied when Shopify supplies no premium tag", async () => {
  await assert.rejects(
    getOrCreateMember({ id: "test-customer", tags: [] }),
    /PREMIUM_TAG_REQUIRED/
  );
});

test("empty category counters include PRIVATE", () => {
  assert.deepEqual(createEmptyCategoryCounts(), {
    pure: 0,
    define: 0,
    beyond: 0,
    private: 0
  });
});

test("the ten PRIVATE protocols have unique ids and keys", () => {
  const privateTreatments = treatments.filter(
    (treatment) => treatment.category_key === "private"
  );

  assert.equal(privateTreatments.length, 10);
  assert.equal(new Set(privateTreatments.map(({ id }) => id)).size, 10);
  assert.equal(
    new Set(privateTreatments.map(({ treatment_key }) => treatment_key)).size,
    10
  );
});
