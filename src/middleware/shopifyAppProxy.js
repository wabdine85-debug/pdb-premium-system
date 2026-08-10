import crypto from 'node:crypto';
import { env } from '../config/env.js';

function safeEqualHex(left, right) {
  if (!/^[0-9a-f]{64}$/i.test(String(left || ''))) return false;
  const leftBuffer = Buffer.from(String(left), 'hex');
  const rightBuffer = Buffer.from(String(right), 'hex');
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

export function calculateAppProxySignature(query, secret = env.shopifyAppSecret) {
  const sorted = Object.entries(query)
    .filter(([key]) => key !== 'signature')
    .map(([key, value]) => `${key}=${Array.isArray(value) ? value.join(',') : String(value ?? '')}`)
    .sort()
    .join('');

  return crypto.createHmac('sha256', secret).update(sorted).digest('hex');
}

export function verifyShopifyAppProxy(req, res, next) {
  if (!env.shopifyAppSecret) {
    return res.status(503).json({ ok: false, error: 'SHOPIFY_PROXY_NOT_CONFIGURED' });
  }

  const suppliedSignature = String(req.query.signature || '');
  const expectedSignature = calculateAppProxySignature(req.query);
  if (!safeEqualHex(suppliedSignature, expectedSignature)) {
    return res.status(401).json({ ok: false, error: 'INVALID_SHOPIFY_PROXY_SIGNATURE' });
  }

  const timestamp = Number(req.query.timestamp);
  if (!Number.isFinite(timestamp) || Math.abs(Date.now() / 1000 - timestamp) > 300) {
    return res.status(401).json({ ok: false, error: 'EXPIRED_SHOPIFY_PROXY_REQUEST' });
  }

  req.shopifyProxy = {
    customerId: String(req.query.logged_in_customer_id || '').trim(),
    shop: String(req.query.shop || '').trim()
  };
  next();
}

export function requireShopifyCustomer(req, res, next) {
  if (!req.shopifyProxy?.customerId) {
    return res.status(401).json({ ok: false, error: 'CUSTOMER_LOGIN_REQUIRED' });
  }
  next();
}

export function requireMatchingCustomer(bodyField = 'shopify_customer_id') {
  return (req, res, next) => {
    const bodyCustomerId = String(req.body?.[bodyField] || '').trim();
    if (!bodyCustomerId || bodyCustomerId !== req.shopifyProxy?.customerId) {
      return res.status(403).json({ ok: false, error: 'CUSTOMER_MISMATCH' });
    }
    next();
  };
}
