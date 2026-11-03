import crypto from 'node:crypto';

const SCRYPT_KEYLEN = 64;
const TOKEN_SECRET = process.env.AUTH_TOKEN_SECRET || 'royal-katti-cloudsql-rls-secret-2026';

/**
 * Hashes a plaintext password using scrypt with a unique 16-byte random salt.
 * Format: `scrypt$<salt_hex>$<hash_hex>`
 */
export function hashPassword(password: string, customSaltHex?: string): string {
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters long.');
  }
  const salt = customSaltHex
    ? Buffer.from(customSaltHex, 'hex')
    : crypto.randomBytes(16);
  const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
  return `scrypt$${salt.toString('hex')}$${derivedKey.toString('hex')}`;
}

/**
 * Verifies a plaintext password against a stored `scrypt$<salt_hex>$<hash_hex>` hash
 * using constant-time comparison (`crypto.timingSafeEqual`).
 */
export function verifyPassword(password: string, storedHash: string): boolean {
  if (!password || !storedHash || !storedHash.startsWith('scrypt$')) {
    return false;
  }
  const parts = storedHash.split('$');
  if (parts.length !== 3) return false;
  const [, saltHex, keyHex] = parts;
  try {
    const salt = Buffer.from(saltHex, 'hex');
    const storedKey = Buffer.from(keyHex, 'hex');
    if (storedKey.length !== SCRYPT_KEYLEN) return false;
    const derivedKey = crypto.scryptSync(password, salt, SCRYPT_KEYLEN);
    return crypto.timingSafeEqual(storedKey, derivedKey);
  } catch {
    return false;
  }
}

/**
 * Generates a 6-digit numeric password reset code and its SHA-256 hash.
 */
export function generateResetCode(): { code: string; tokenHash: string; expiresAt: Date } {
  const num = crypto.randomInt(100000, 999999);
  const code = String(num);
  const tokenHash = hashResetCode(code);
  const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
  return { code, tokenHash, expiresAt };
}

/**
 * Hashes a 6-digit reset code with HMAC-SHA256 for storage in PostgreSQL.
 */
export function hashResetCode(code: string): string {
  return crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(code.trim())
    .digest('hex');
}

export interface SessionPayload {
  userId: number;
  uid: string;
  email: string;
  exp: number;
}

/**
 * Signs a stateless session token using HMAC-SHA256.
 */
export function signSessionToken(payload: Omit<SessionPayload, 'exp'>, ttlSeconds = 86400 * 7): string {
  const fullPayload: SessionPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + ttlSeconds,
  };
  const data = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', TOKEN_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

/**
 * Verifies and decodes a session token.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || !token.includes('.')) return null;
  const [data, sig] = token.split('.');
  if (!data || !sig) return null;
  try {
    const expectedSig = crypto
      .createHmac('sha256', TOKEN_SECRET)
      .update(data)
      .digest('base64url');
    const a = Buffer.from(sig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
    const decoded = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as SessionPayload;
    if (decoded.exp < Math.floor(Date.now() / 1000)) {
      return null;
    }
    return decoded;
  } catch {
    return null;
  }
}
