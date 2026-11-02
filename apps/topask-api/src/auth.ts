/** Opaque handles, PKCE challenges, and constant-time comparison. */
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto'

/**
 * Mint a URL-safe handle from cryptographically random bytes.
 * @param bytes - random byte count.
 * @returns base64url text, which the account token grammar accepts.
 */
export function randomHandle(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

/** Hash one secret for storage. @param value - token or authorization code. @returns lowercase SHA-256 hex. */
export function hashSecret(value: string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** Derive the S256 PKCE challenge. @param verifier - client code verifier. @returns base64url SHA-256 digest. */
export function pkceChallenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

/**
 * Compare two protocol strings without leaking their first difference.
 * @param left - expected value.
 * @param right - received value.
 * @returns true when both have the same bytes.
 */
export function equalText(left: string, right: string): boolean {
  const a = Buffer.from(left)
  const b = Buffer.from(right)
  return a.byteLength === b.byteLength && timingSafeEqual(a, b)
}
