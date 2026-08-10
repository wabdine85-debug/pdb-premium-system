import crypto from 'node:crypto';

function getEncryptionKey(rawKey = process.env.CONTRACT_ENCRYPTION_KEY) {
  if (!rawKey) {
    throw new Error('CONTRACT_ENCRYPTION_KEY is not configured');
  }

  const value = String(rawKey).trim();
  const key = /^[0-9a-f]{64}$/i.test(value)
    ? Buffer.from(value, 'hex')
    : Buffer.from(value, 'base64');

  if (key.length !== 32) {
    throw new Error('CONTRACT_ENCRYPTION_KEY must decode to exactly 32 bytes');
  }

  return key;
}

export function normalizeIban(value) {
  return String(value || '').replace(/\s+/g, '').toUpperCase();
}

export function isValidIban(value) {
  const iban = normalizeIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;

  const rearranged = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let remainder = 0;

  for (const character of rearranged) {
    const expanded = /[A-Z]/.test(character)
      ? String(character.charCodeAt(0) - 55)
      : character;

    for (const digit of expanded) {
      remainder = (remainder * 10 + Number(digit)) % 97;
    }
  }

  return remainder === 1;
}

export function encryptIban(value, rawKey) {
  const iban = normalizeIban(value);
  if (!isValidIban(iban)) throw new Error('INVALID_IBAN');

  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getEncryptionKey(rawKey), iv);
  const ciphertext = Buffer.concat([cipher.update(iban, 'utf8'), cipher.final()]);

  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64'),
    last4: iban.slice(-4)
  };
}

export function decryptIban({ ciphertext, iv, authTag }, rawKey) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    getEncryptionKey(rawKey),
    Buffer.from(iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(authTag, 'base64'));

  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64')),
    decipher.final()
  ]).toString('utf8');
}

export function maskIban(last4) {
  return `DE•• •••• •••• •••• ••${String(last4 || '').slice(-4)}`;
}

export function hashPublicToken(token) {
  return crypto.createHash('sha256').update(String(token)).digest('hex');
}
