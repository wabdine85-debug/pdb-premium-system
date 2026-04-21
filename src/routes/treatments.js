import express from "express";
import { pool } from "../config/pool.js";
import { getEntitlements } from "../services/entitlement.service.js";
import { findMemberByShopifyId, createMember, updateMemberByShopifyId } from "../repositories/member.repository.js";



const router = express.Router();

function resolvePackageFromTags(tags = []) {
  if (tags.includes("premium-beyond")) return "beyond";
  if (tags.includes("premium-define")) return "define";
  if (tags.includes("premium-pure")) return "pure";
  return null;
}

router.get("/allowed", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, treatment_key, title, category_key, salonized_url
      FROM treatments
      WHERE is_active = true
      ORDER BY title ASC
    `);

    const shopifyCustomerId = String(req.query.shopify_customer_id || "").trim();
    const proxyCustomerId = String(req.query.logged_in_customer_id || "").trim();

if (!proxyCustomerId || proxyCustomerId !== shopifyCustomerId) {
  return res.status(403).json({
    ok: false,
    error: "INVALID_CUSTOMER"
  });
}
    const email = String(req.query.email || "").trim();
    const firstName = String(req.query.firstName || "").trim();
    const lastName = String(req.query.lastName || "").trim();
    const tags = String(req.query.tags || "")
      .split(",")
      .map(t => t.trim())
      .filter(Boolean);

    if (!shopifyCustomerId) {
      return res.status(400).json({
        ok: false,
        error: "SHOPIFY_CUSTOMER_ID_REQUIRED"
      });
    }

    const packageKey = resolvePackageFromTags(tags);

    if (!email || !firstName || !lastName || !packageKey) {
      return res.status(400).json({
        ok: false,
        error: "CUSTOMER_DATA_INCOMPLETE"
      });
    }

    let member = await findMemberByShopifyId(shopifyCustomerId);

    if (!member) {
      member = await createMember({
        shopifyCustomerId,
        email,
        firstName,
        lastName,
        packageKey
      });
    } else {
      member = await updateMemberByShopifyId(shopifyCustomerId, {
        email,
        firstName,
        lastName,
        packageKey
      });
    }

    const entitlements = await getEntitlements(member);
    const allowedCategories = entitlements.allowedCategories;
    const allowedTreatments = rows.filter(t =>
      allowedCategories.includes(t.category_key)
    );

    return res.json({
      ok: true,
      member: {
        id: member.id,
        shopify_customer_id: member.shopify_customer_id,
        email: member.email,
        first_name: member.first_name,
        last_name: member.last_name,
        package_key: member.package_key,
        status: member.status
      },
      entitlements,
      treatments: allowedTreatments
    });
  } catch (error) {
    console.error("GET /api/treatments/allowed error:", error);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_SERVER_ERROR"
    });
  }
});

export default router;