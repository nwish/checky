import crypto from 'node:crypto'

const SCHEME = 'pbkdf2-sha256'
// OWASP-recommended iteration count for PBKDF2-HMAC-SHA256.
const ITERATIONS = 600_000
const KEY_LEN = 32

export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16)
  const key = crypto.pbkdf2Sync(password, salt, ITERATIONS, KEY_LEN, 'sha256')
  return [SCHEME, String(ITERATIONS), salt.toString('base64url'), key.toString('base64url')].join('$')
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, iterStr, saltB64, keyB64] = stored.split('$')
  if (scheme !== SCHEME || !saltB64 || !keyB64) return false
  const iterations = Number.parseInt(iterStr ?? '', 10)
  if (!Number.isInteger(iterations) || iterations < 1) return false
  const expected = Buffer.from(keyB64, 'base64url')
  const actual = crypto.pbkdf2Sync(password, Buffer.from(saltB64, 'base64url'), iterations, expected.length, 'sha256')
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected)
}

/** 256-bit opaque tokens (sessions, invites). base64url, ~43 chars. */
export function newToken(): string {
  return crypto.randomBytes(32).toString('base64url')
}

/** Tokens are stored only as SHA-256, never in plaintext. */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}
