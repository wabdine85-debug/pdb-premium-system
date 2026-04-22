import express from "express";
import { pool } from "../config/pool.js";
import { findMemberByShopifyId } from "../repositories/member.repository.js";
import { getEntitlements } from "../services/entitlement.service.js";
import crypto from "crypto";

const router = express.Router();

router.post("/create", async (req, res) => {
  try {
    const { treatment_key } = req.body;

    const shopifyCustomerId = String(req.body.shopify_customer_id || "").trim();

    if (!treatment_key) {
      return res.status(400).json({
        ok: false,
        error: "TREATMENT_KEY_REQUIRED"
      });
    }

    if (!shopifyCustomerId) {
      return res.status(400).json({
        ok: false,
        error: "SHOPIFY_CUSTOMER_ID_REQUIRED"
      });
    }

    const result = await pool.query(
  `SELECT id, treatment_key, category_key, salonized_url FROM treatments WHERE treatment_key = $1 LIMIT 1`,
  [treatment_key]
);

    const treatment = result.rows[0];

    if (!treatment) {
      return res.status(404).json({
        ok: false,
        error: "TREATMENT_NOT_FOUND"
      });
    }

    const member = await findMemberByShopifyId(shopifyCustomerId);

    if (!member) {
      return res.status(404).json({
        ok: false,
        error: "MEMBER_NOT_FOUND"
      });
    }

const entitlements = await getEntitlements(member);

const remainingForCategory =
  entitlements.remaining?.[treatment.category_key] ?? 0;

// ERLAUBTE KATEGORIEN PRO PAKET (hart definiert)
const PACKAGE_CATEGORIES = {
  pure: ["pure"],
  define: ["pure", "define"],
  beyond: ["beyond"]
};

const allowedForPackage =
  PACKAGE_CATEGORIES[member.package_key] || [];

if (!allowedForPackage.includes(treatment.category_key)) {
  return res.status(403).json({
    ok: false,
    error: "TREATMENT_NOT_ALLOWED"
  });
}

if (remainingForCategory <= 0) {
  return res.status(403).json({
    ok: false,
    error: "LIMIT_REACHED"
  });
}
    const token = crypto.randomUUID();

    await pool.query(
      `
      INSERT INTO booking_tokens (
        token,
        member_id,
        treatment_id,
        expires_at
      )
      VALUES ($1, $2, $3, NOW() + INTERVAL '15 minutes')
      `,
      [token, member.id, treatment.id]
    );

    return res.json({
      ok: true,
      token,
      member: {
      id: member.id,
      shopify_customer_id: member.shopify_customer_id,
      package_key: member.package_key
  },
      entitlements,
      treatment,
      booking_url: treatment.salonized_url || null
    });

  } catch (error) {
    console.error("POST /api/bookings/create error:", error);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.get("/token/:token", async (req, res) => {
  try {
    const { token } = req.params;

    const result = await pool.query(
      `
      SELECT id, member_id, treatment_id, token, expires_at, used_at
      FROM booking_tokens
      WHERE token = $1
      LIMIT 1
      `,
      [token]
    );

    const bookingToken = result.rows[0];

    if (!bookingToken) {
      return res.status(404).json({
        ok: false,
        error: "TOKEN_NOT_FOUND"
      });
    }

    const expiredCheck = await pool.query(
      `
      SELECT NOW() > expires_at AS is_expired
      FROM booking_tokens
      WHERE token = $1
      `,
      [token]
    );

    if (expiredCheck.rows[0].is_expired) {
      return res.status(410).json({
        ok: false,
        error: "TOKEN_EXPIRED"
      });
    }

    if (bookingToken.used_at) {
      return res.status(400).json({
        ok: false,
        error: "TOKEN_ALREADY_USED"
      });
    }

    return res.json({
      ok: true,
      bookingToken
    });

  } catch (error) {
    console.error("GET /api/bookings/token/:token error:", error);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.post("/consume", async (req, res) => {
  const client = await pool.connect();

  try {
    const { token, shopify_customer_id } = req.body || {};
    const shopifyCustomerId = String(shopify_customer_id || "").trim();

    if (!token) {
      return res.status(400).json({
        ok: false,
        error: "TOKEN_REQUIRED"
      });
    }

    if (!shopifyCustomerId) {
      return res.status(400).json({
        ok: false,
        error: "SHOPIFY_CUSTOMER_ID_REQUIRED"
      });
    }

    await client.query("BEGIN");

    const tokenResult = await client.query(
      `
      SELECT
        bt.id,
        bt.member_id,
        bt.treatment_id,
        bt.token,
        bt.expires_at,
        bt.used_at,
        t.salonized_url
      FROM booking_tokens bt
      JOIN treatments t
        ON t.id = bt.treatment_id
      WHERE bt.token = $1
      LIMIT 1
      `,
      [token]
    );

    const bookingToken = tokenResult.rows[0];

    if (!bookingToken) {
      await client.query("ROLLBACK");
      return res.status(404).json({
        ok: false,
        error: "TOKEN_NOT_FOUND"
      });
    }

    const expiredCheck = await client.query(
      `
      SELECT NOW() > expires_at AS is_expired
      FROM booking_tokens
      WHERE token = $1
      LIMIT 1
      `,
      [token]
    );

    if (expiredCheck.rows[0].is_expired) {
      await client.query("ROLLBACK");
      return res.status(410).json({
        ok: false,
        error: "TOKEN_EXPIRED"
      });
    }

    if (bookingToken.used_at) {
      await client.query("ROLLBACK");
      return res.status(400).json({
        ok: false,
        error: "TOKEN_ALREADY_USED"
      });
    }

    const bookingMonthResult = await client.query(
      `
      SELECT date_trunc('month', NOW())::date AS booking_month
      `
    );

    const bookingMonth = bookingMonthResult.rows[0].booking_month;

    await client.query(
      `
      INSERT INTO bookings (
        member_id,
        treatment_id,
        booking_month,
        status,
        booking_token,
        booked_at
      )
      VALUES ($1, $2, $3, 'confirmed', $4, NOW())
      `,
      [
        bookingToken.member_id,
        bookingToken.treatment_id,
        bookingMonth,
        bookingToken.token
      ]
    );

    await client.query(
      `
      UPDATE booking_tokens
      SET used_at = NOW()
      WHERE token = $1
      `,
      [token]
    );

    const updatedResult = await client.query(
      `
      SELECT
        bt.id,
        bt.member_id,
        bt.treatment_id,
        bt.token,
        bt.expires_at,
        bt.used_at,
        t.salonized_url
      FROM booking_tokens bt
      JOIN treatments t
        ON t.id = bt.treatment_id
      WHERE bt.token = $1
      LIMIT 1
      `,
      [token]
    );

    await client.query("COMMIT");

    const updatedToken = updatedResult.rows[0];

    const member = await findMemberByShopifyId(shopifyCustomerId);

    if (!member) {
      return res.status(404).json({
        ok: false,
        error: "MEMBER_NOT_FOUND"
      });
    }

    const entitlements = await getEntitlements(member);

    return res.json({
      ok: true,
      bookingToken: updatedToken,
      booking_url: `https://pdb-premium-system.onrender.com/api/bookings/redirect/${updatedToken.token}`,
      member: {
        id: member.id,
        shopify_customer_id: member.shopify_customer_id,
        package_key: member.package_key
      },
      entitlements
    });

  } catch (error) {
    await client.query("ROLLBACK");
    console.error("POST /api/bookings/consume error:", error);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_SERVER_ERROR"
    });
  } finally {
    client.release();
  }
});
router.get("/redirect/:token", async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).send("TOKEN_REQUIRED");
    }

    const tokenResult = await pool.query(
      `
      SELECT
        bt.id,
        bt.token,
        bt.expires_at,
        bt.used_at,
        t.salonized_url
      FROM booking_tokens bt
      JOIN treatments t
        ON t.id = bt.treatment_id
      WHERE bt.token = $1
      LIMIT 1
      `,
      [token]
    );

    const bookingToken = tokenResult.rows[0];

    if (!bookingToken) {
      return res.status(404).send("TOKEN_NOT_FOUND");
    }

    if (bookingToken.used_at) {
      return res.status(400).send("TOKEN_ALREADY_USED");
    }

    if (new Date(bookingToken.expires_at).getTime() < Date.now()) {
      return res.status(410).send("TOKEN_EXPIRED");
    }

    if (!bookingToken.salonized_url) {
      return res.status(404).send("BOOKING_URL_NOT_FOUND");
    }

    return res.redirect(bookingToken.salonized_url);
  } catch (error) {
    console.error("redirect route error:", error);
    return res.status(500).send("REDIRECT_ERROR");
  }
});
export default router;