import express from "express";
import { pool } from "../config/pool.js";
import { getEntitlements } from "../services/entitlement.service.js";
import { findMemberByShopifyId } from "../repositories/member.repository.js";


const router = express.Router();

router.get("/allowed", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT id, treatment_key, title, category_key, salonized_url
        FROM treatments
        WHERE is_active = true
        ORDER BY title ASC
    `);

const member = await findMemberByShopifyId("123456");
        if (!member) {
  return res.status(404).json({
    ok: false,
    error: "MEMBER_NOT_FOUND"
  });
}
const entitlements = await getEntitlements(member);
const allowedCategories = entitlements.allowedCategories;
const allowedTreatments = rows.filter(t => allowedCategories.includes(t.category_key));
    
return res.json({
  ok: true,
  member: {
    id: member.id,
    shopify_customer_id: member.shopify_customer_id,
    package_key: member.package_key
  },
  entitlements,
  treatments: allowedTreatments
});
  } catch (error) {
    console.error("GET /api/treatments/allowed error:", error);
    return res.status(500).json({
      error: "INTERNAL_SERVER_ERROR"
    });
  }
});

export default router;