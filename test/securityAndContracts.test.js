import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';
import { calculateAppProxySignature } from '../src/middleware/shopifyAppProxy.js';
import { getPackageOffer } from '../src/utils/packageCatalog.js';
import { decryptIban, encryptIban, isValidIban, maskIban } from '../src/utils/sepaCrypto.js';

test('PRIVATE offer includes 12 months and setup fee', () => {
  assert.deepEqual(getPackageOffer('private'), {
    name: 'PRIVATE',
    monthlyPriceCents: 39900,
    monthlyClaim: '1 Behandlung aus PRIVATE',
    minimumTotalCents: 482700
  });
});

test('IBAN validation rejects malformed values', () => {
  assert.equal(isValidIban('DE89 3704 0044 0532 0130 00'), true);
  assert.equal(isValidIban('DE89 3704 0044 0532 0130 01'), false);
  assert.equal(isValidIban('not-an-iban'), false);
});

test('IBAN encryption uses authenticated encryption and masks output', () => {
  const key = crypto.randomBytes(32).toString('base64');
  const encrypted = encryptIban('DE89 3704 0044 0532 0130 00', key);
  assert.equal(encrypted.last4, '3000');
  assert.equal(maskIban(encrypted.last4).endsWith('3000'), true);
  assert.equal(decryptIban(encrypted, key), 'DE89370400440532013000');

  assert.throws(
    () => decryptIban({ ...encrypted, ciphertext: Buffer.from('tampered').toString('base64') }, key),
    /authenticate|Unsupported state|unable/i
  );
});

test('Shopify app proxy signature follows sorted concatenation format', () => {
  const query = {
    extra: ['1', '2'],
    shop: 'example.myshopify.com',
    logged_in_customer_id: '1',
    path_prefix: '/apps/pdb',
    timestamp: '1317327555'
  };
  const canonical = 'extra=1,2logged_in_customer_id=1path_prefix=/apps/pdbshop=example.myshopify.comtimestamp=1317327555';
  const expected = crypto.createHmac('sha256', 'hush').update(canonical).digest('hex');
  assert.equal(calculateAppProxySignature(query, 'hush'), expected);
});
