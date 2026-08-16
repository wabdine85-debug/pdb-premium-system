import express from "express";
import { pool } from "../config/pool.js";
import {
  getEntitlements,
  getEntitlementsForMonth
} from "../services/entitlement.service.js";
import { getNextBookingMonth } from "../utils/dates.js";
import { requireShopifyCustomer, verifyShopifyAppProxy } from "../middleware/shopifyAppProxy.js";
import { getAuthorizedMember, isMemberAuthorizationError } from "../services/memberAuthorization.service.js";



const router = express.Router();

router.get("/allowed", verifyShopifyAppProxy, requireShopifyCustomer, async (req, res) => {
  try {
    res.set("Cache-Control", "private, no-store, no-cache, must-revalidate");

    const { rows } = await pool.query(`
      SELECT
  id,
  treatment_key,
  title,
  category_key,
  salonized_url,
  COALESCE(shopify_product_handle, treatment_key) AS shopify_product_handle,
  '/products/' || COALESCE(shopify_product_handle, treatment_key) AS premium_product_url
      FROM treatments
      WHERE is_active = true
      ORDER BY title ASC
    `);

    const proxyCustomerId = req.shopifyProxy.customerId;
const shopifyCustomerId = String(req.query.shopify_customer_id || proxyCustomerId || "").trim();

if (!proxyCustomerId) {
  return res.status(403).json({
    ok: false,
    error: "INVALID_CUSTOMER"
  });
}
    if (!shopifyCustomerId) {
      return res.status(400).json({
        ok: false,
        error: "SHOPIFY_CUSTOMER_ID_REQUIRED"
      });
    }

    const member = await getAuthorizedMember(shopifyCustomerId);

    const [entitlements, nextMonthEntitlements] = await Promise.all([
      getEntitlements(member),
      getEntitlementsForMonth(member, getNextBookingMonth())
    ]);
    const allowedCategories = [
      ...new Set([
        ...entitlements.allowedCategories,
        ...nextMonthEntitlements.allowedCategories
      ])
    ];
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
        entitlement_multiplier: member.entitlement_multiplier,
        status: member.status
      },
      entitlements,
      nextMonthEntitlements,
      treatments: allowedTreatments
    });
  } catch (error) {
    console.error("GET /api/treatments/allowed error:", error);
    const authorizationError = isMemberAuthorizationError(error);
    return res.status(authorizationError ? 403 : 500).json({
      ok: false,
      error: authorizationError ? error.message : "INTERNAL_SERVER_ERROR"
    });
  }
});

export default router;
