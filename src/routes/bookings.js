import express from "express";
import { pool } from "../config/pool.js";
import { findMemberByShopifyId } from "../repositories/member.repository.js";
import {
  getEntitlements,
  getEntitlementsForMonth,
  getTreatmentEntitlementsForMonth
} from "../services/entitlement.service.js";
import { getAllowedCategoriesForPackage } from "../utils/packageRules.js";
import {
  getBookingMonth,
  getBookingMonthForAppointmentDate,
  getNextBookingMonth,
  isCurrentOrNextBookingMonth
} from "../utils/dates.js";
import crypto from "crypto";
import {
  requireMatchingCustomer,
  requireShopifyCustomer,
  verifyShopifyAppProxy
} from "../middleware/shopifyAppProxy.js";
import { getMemberBookingAccess } from "../services/bookingAccess.service.js";

const router = express.Router();

router.post("/create", verifyShopifyAppProxy, requireShopifyCustomer, requireMatchingCustomer(), async (req, res) => {
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

    if (member.status !== "active") {
      return res.status(403).json({ ok: false, error: "MEMBER_NOT_ACTIVE" });
    }

    const bookingAccess = await getMemberBookingAccess(member.id);
    if (!bookingAccess.allowed) {
      return res.status(403).json({
        ok: false,
        error: bookingAccess.reason,
        booking_available_at: bookingAccess.available_at
      });
    }

const allowedForPackage =
  getAllowedCategoriesForPackage(member.package_key);

if (!allowedForPackage.includes(treatment.category_key)) {
  return res.status(403).json({
    ok: false,
    error: "TREATMENT_NOT_ALLOWED"
  });
}

const [entitlements, nextMonthEntitlements] = await Promise.all([
  getTreatmentEntitlementsForMonth(
    member,
    treatment,
    getBookingMonth()
  ),
  getTreatmentEntitlementsForMonth(member, treatment, getNextBookingMonth())
]);

const availableBookingMonths = [entitlements, nextMonthEntitlements]
  .filter(
    monthlyEntitlements =>
      (monthlyEntitlements.remaining?.[treatment.category_key] ?? 0) > 0
  )
  .map(monthlyEntitlements => monthlyEntitlements.month);

if (availableBookingMonths.length === 0) {
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
      nextMonthEntitlements,
      available_booking_months: availableBookingMonths,
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

router.post("/validate-slot", verifyShopifyAppProxy, requireShopifyCustomer, requireMatchingCustomer(), async (req, res) => {
  try {
    const { token, appointment_date } = req.body || {};
    const shopifyCustomerId = String(
      req.body?.shopify_customer_id || ""
    ).trim();
    const bookingMonth = getBookingMonthForAppointmentDate(appointment_date);

    if (!token) {
      return res.status(400).json({ ok: false, error: "TOKEN_REQUIRED" });
    }

    if (!shopifyCustomerId) {
      return res.status(400).json({
        ok: false,
        error: "SHOPIFY_CUSTOMER_ID_REQUIRED"
      });
    }

    if (!bookingMonth) {
      return res.status(400).json({
        ok: false,
        error: "APPOINTMENT_DATE_INVALID"
      });
    }

    if (!isCurrentOrNextBookingMonth(bookingMonth)) {
      return res.status(403).json({
        ok: false,
        error: "APPOINTMENT_MONTH_NOT_ALLOWED"
      });
    }

    const result = await pool.query(
      `
      SELECT
        bt.expires_at,
        bt.used_at,
        t.category_key,
        t.treatment_key,
        m.id AS member_id,
        m.shopify_customer_id,
        m.package_key,
        m.status,
        NOW() > bt.expires_at AS is_expired
      FROM booking_tokens bt
      JOIN treatments t
        ON t.id = bt.treatment_id
      JOIN members m
        ON m.id = bt.member_id
      WHERE bt.token = $1
      LIMIT 1
      `,
      [token]
    );

    const bookingToken = result.rows[0];

    if (!bookingToken) {
      return res.status(404).json({ ok: false, error: "TOKEN_NOT_FOUND" });
    }

    if (bookingToken.is_expired) {
      return res.status(410).json({ ok: false, error: "TOKEN_EXPIRED" });
    }

    if (bookingToken.used_at) {
      return res.status(400).json({
        ok: false,
        error: "TOKEN_ALREADY_USED"
      });
    }

    if (String(bookingToken.shopify_customer_id) !== shopifyCustomerId) {
      return res.status(403).json({
        ok: false,
        error: "TOKEN_CUSTOMER_MISMATCH"
      });
    }

    if (bookingToken.status !== "active") {
      return res.status(403).json({
        ok: false,
        error: "MEMBER_NOT_ACTIVE"
      });
    }

    const bookingAccess = await getMemberBookingAccess(bookingToken.member_id);
    if (!bookingAccess.allowed) {
      return res.status(403).json({
        ok: false,
        error: bookingAccess.reason,
        booking_available_at: bookingAccess.available_at
      });
    }

    const allowedForPackage = getAllowedCategoriesForPackage(
      bookingToken.package_key
    );

    if (!allowedForPackage.includes(bookingToken.category_key)) {
      return res.status(403).json({
        ok: false,
        error: "TREATMENT_NOT_ALLOWED"
      });
    }

    const member = {
      id: bookingToken.member_id,
      package_key: bookingToken.package_key
    };
    const entitlements = await getTreatmentEntitlementsForMonth(
      member,
      {
        category_key: bookingToken.category_key,
        treatment_key: bookingToken.treatment_key
      },
      bookingMonth
    );
    const remainingForCategory =
      entitlements.remaining?.[bookingToken.category_key] ?? 0;

    if (remainingForCategory <= 0) {
      return res.status(403).json({ ok: false, error: "LIMIT_REACHED" });
    }

    return res.json({
      ok: true,
      booking_month: bookingMonth,
      entitlements
    });
  } catch (error) {
    console.error("POST /api/bookings/validate-slot error:", error);
    return res.status(500).json({
      ok: false,
      error: "INTERNAL_SERVER_ERROR"
    });
  }
});

router.post("/consume", verifyShopifyAppProxy, requireShopifyCustomer, requireMatchingCustomer(), async (req, res) => {
  const client = await pool.connect();

  try {
    const { token, shopify_customer_id, appointment_date } = req.body || {};
    const shopifyCustomerId = String(shopify_customer_id || "").trim();
    const requestedBookingMonth = appointment_date
      ? getBookingMonthForAppointmentDate(appointment_date)
      : null;

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

    if (appointment_date && !requestedBookingMonth) {
      return res.status(400).json({
        ok: false,
        error: "APPOINTMENT_DATE_INVALID"
      });
    }

    if (
      requestedBookingMonth &&
      !isCurrentOrNextBookingMonth(requestedBookingMonth)
    ) {
      return res.status(403).json({
        ok: false,
        error: "APPOINTMENT_MONTH_NOT_ALLOWED"
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
        t.category_key,
        t.treatment_key,
        t.salonized_url,
        m.id AS verified_member_id,
        m.shopify_customer_id,
        m.email,
        m.first_name,
        m.last_name,
        m.package_key,
        m.status
      FROM booking_tokens bt
      JOIN treatments t
        ON t.id = bt.treatment_id
      JOIN members m
        ON m.id = bt.member_id
      WHERE bt.token = $1
      LIMIT 1
      FOR UPDATE OF bt, m
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

    if (String(bookingToken.shopify_customer_id) !== shopifyCustomerId) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        error: "TOKEN_CUSTOMER_MISMATCH"
      });
    }

    const member = {
      id: bookingToken.verified_member_id,
      shopify_customer_id: bookingToken.shopify_customer_id,
      email: bookingToken.email,
      first_name: bookingToken.first_name,
      last_name: bookingToken.last_name,
      package_key: bookingToken.package_key,
      status: bookingToken.status
    };

    if (member.status !== "active") {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        error: "MEMBER_NOT_ACTIVE"
      });
    }

    const bookingAccess = await getMemberBookingAccess(member.id, client);
    if (!bookingAccess.allowed) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        error: bookingAccess.reason,
        booking_available_at: bookingAccess.available_at
      });
    }

    const allowedForPackage = getAllowedCategoriesForPackage(member.package_key);

    if (!allowedForPackage.includes(bookingToken.category_key)) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        error: "TREATMENT_NOT_ALLOWED"
      });
    }

    let bookingMonth = requestedBookingMonth;

    if (!bookingMonth) {
      const bookingMonthResult = await client.query(
        `
        SELECT date_trunc('month', NOW())::date AS booking_month
        `
      );
      bookingMonth = String(bookingMonthResult.rows[0].booking_month);
    }

    const entitlementsBeforeConsume = await getTreatmentEntitlementsForMonth(
      member,
      {
        category_key: bookingToken.category_key,
        treatment_key: bookingToken.treatment_key
      },
      bookingMonth,
      client
    );
    const remainingForCategory =
      entitlementsBeforeConsume.remaining?.[bookingToken.category_key] ?? 0;

    if (remainingForCategory <= 0) {
      await client.query("ROLLBACK");
      return res.status(403).json({
        ok: false,
        error: "LIMIT_REACHED"
      });
    }

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

    const entitlements = requestedBookingMonth
      ? await getEntitlementsForMonth(member, requestedBookingMonth)
      : await getEntitlements(member);

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
  return res.redirect(bookingToken.salonized_url);
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
