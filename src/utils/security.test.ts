import test from 'node:test';
import assert from 'node:assert/strict';
import {
  hashPassword,
  verifyPassword,
  generateResetCode,
  hashResetCode,
  signSessionToken,
  verifySessionToken,
} from './security';

test('hashPassword creates unique salted scrypt hashes and verifyPassword validates accurately', () => {
  const hash1 = hashPassword('RoyalKatti#2026');
  const hash2 = hashPassword('RoyalKatti#2026');

  assert.ok(hash1.startsWith('scrypt$'));
  assert.notEqual(hash1, hash2, 'Two hashes of the same password must have different random salts');

  assert.equal(verifyPassword('RoyalKatti#2026', hash1), true);
  assert.equal(verifyPassword('RoyalKatti#2026', hash2), true);
  assert.equal(verifyPassword('WrongPassword123', hash1), false);
  assert.equal(verifyPassword('', hash1), false);
});

test('hashPassword rejects passwords shorter than 6 characters', () => {
  assert.throws(() => hashPassword('12345'), /at least 6 characters/);
});

test('generateResetCode creates a 6-digit code and verifiable HMAC hash', () => {
  const { code, tokenHash, expiresAt } = generateResetCode();
  assert.equal(code.length, 6);
  assert.equal(hashResetCode(code), tokenHash);
  assert.ok(expiresAt.getTime() > Date.now());
});

test('signSessionToken and verifySessionToken round-trip and reject tampered tokens', () => {
  const token = signSessionToken({
    userId: 42,
    uid: 'user_42',
    email: 'player@royalkatti.com',
  });

  const payload = verifySessionToken(token);
  assert.ok(payload);
  assert.equal(payload.userId, 42);
  assert.equal(payload.email, 'player@royalkatti.com');

  const tampered = token.slice(0, -3) + 'abc';
  assert.equal(verifySessionToken(tampered), null);
});
