/** Signed operator sessions, OIDC state cookies, and form CSRF checks. */
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

/** Session cookie carrying the signed operator identity. */
export const SESSION_COOKIE = 'topask_admin_session'
/** Short-lived cookie carrying OIDC state, nonce, and PKCE verifier. */
export const OIDC_COOKIE = 'topask_admin_oidc'

/** One authenticated operator session. */
export interface OperatorSession {
  readonly subject: string
  readonly email: string
  readonly name: string
  /** Form token required by every state-changing request. */
  readonly csrf: string
  readonly expiresAt: number
}

/** OIDC round-trip facts bound to one browser. */
export interface OidcState {
  readonly state: string
  readonly nonce: string
  readonly verifier: string
  readonly returnTo: string
  readonly expiresAt: number
}

/** One authenticated identity returned by the provider. */
export interface OperatorIdentity {
  readonly subject: string
  readonly email: string
  readonly name: string
}

function encode(value: unknown): string {
  return Buffer.from(JSON.stringify(value)).toString('base64url')
}

function signature(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url')
}

function sign(secret: string, value: unknown): string {
  const payload = encode(value)
  return `${payload}.${signature(secret, payload)}`
}

function verifiedPayload(secret: string, value: string): string | undefined {
  const separator = value.lastIndexOf('.')
  if (separator <= 0) return undefined
  const payload = value.slice(0, separator)
  const provided = value.slice(separator + 1)
  const expected = signature(secret, payload)
  if (provided.length !== expected.length) return undefined
  return timingSafeEqual(Buffer.from(provided), Buffer.from(expected)) ? payload : undefined
}

function parsed(secret: string, value: string, now: number): Record<string, unknown> | undefined {
  const payload = verifiedPayload(secret, value)
  if (payload === undefined) return undefined
  try {
    const decoded: unknown = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (typeof decoded !== 'object' || decoded === null) return undefined
    const record = decoded as Record<string, unknown>
    if (typeof record.expiresAt !== 'number' || record.expiresAt <= now) return undefined
    return record
  } catch { return undefined }
}

function isOperatorSession(value: unknown): value is OperatorSession {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.subject === 'string' && record.subject !== ''
    && typeof record.email === 'string' && record.email !== ''
    && typeof record.name === 'string'
    && typeof record.csrf === 'string' && record.csrf.length >= 16
    && typeof record.expiresAt === 'number'
}

function isOidcState(value: unknown): value is OidcState {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return typeof record.state === 'string' && record.state !== ''
    && typeof record.nonce === 'string' && record.nonce !== ''
    && typeof record.verifier === 'string' && record.verifier !== ''
    && typeof record.returnTo === 'string'
    && typeof record.expiresAt === 'number'
}

/**
 * Create one signed operator session.
 * @param secret - HMAC key.
 * @param operator - authenticated identity.
 * @param ttlMs - session lifetime.
 * @param now - epoch milliseconds.
 * @returns the session token.
 */
export function createSession(secret: string, operator: OperatorIdentity, ttlMs: number, now: number): string {
  const session: OperatorSession = {
    subject: operator.subject, email: operator.email, name: operator.name,
    csrf: randomBytes(24).toString('base64url'), expiresAt: now + ttlMs,
  }
  return sign(secret, session)
}

/**
 * Verify one signed operator session.
 * @param secret - HMAC key.
 * @param value - cookie value.
 * @param now - epoch milliseconds.
 * @returns the session, or undefined when tampered with or expired.
 */
export function verifySession(secret: string, value: string | undefined, now: number): OperatorSession | undefined {
  if (value === undefined) return undefined
  const session = parsed(secret, value, now)
  return session !== undefined && isOperatorSession(session) ? session : undefined
}

/**
 * Create one signed OIDC round-trip state.
 * @param secret - HMAC key.
 * @param state - random state.
 * @param nonce - random nonce.
 * @param verifier - PKCE verifier.
 * @param returnTo - local path to resume.
 * @param ttlMs - state lifetime.
 * @param now - epoch milliseconds.
 * @returns the cookie value.
 */
export function createOidcState(secret: string, state: string, nonce: string, verifier: string,
  returnTo: string, ttlMs: number, now: number): string {
  const value: OidcState = { state, nonce, verifier, returnTo, expiresAt: now + ttlMs }
  return sign(secret, value)
}

/**
 * Verify one signed OIDC round-trip state.
 * @param secret - HMAC key.
 * @param value - cookie value.
 * @param now - epoch milliseconds.
 * @returns the state, or undefined when tampered with or expired.
 */
export function verifyOidcState(secret: string, value: string | undefined, now: number): OidcState | undefined {
  if (value === undefined) return undefined
  const state = parsed(secret, value, now)
  return state !== undefined && isOidcState(state) ? state : undefined
}

/**
 * Parse one Cookie header into named values.
 * @param header - raw Cookie header.
 * @returns cookie values by name; repeated names keep the first.
 */
export function cookies(header: string | undefined): Readonly<Record<string, string>> {
  const result: Record<string, string> = {}
  if (header === undefined) return result
  for (const part of header.split(';')) {
    const separator = part.indexOf('=')
    if (separator <= 0) continue
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    if (name !== '' && result[name] === undefined) result[name] = decodeURIComponent(value)
  }
  return result
}

/**
 * Build one cookie header.
 * @param name - cookie name.
 * @param value - cookie value.
 * @param maxAgeSeconds - lifetime; zero clears the cookie.
 * @param secure - whether to add the Secure attribute.
 * @returns the Set-Cookie value.
 */
export function cookie(name: string, value: string, maxAgeSeconds: number, secure: boolean): string {
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${String(maxAgeSeconds)}`
    + (secure ? '; Secure' : '')
}

/**
 * Keep a resume path local to this console.
 * @param value - requested path.
 * @returns the path when it is a local absolute path, otherwise `/`.
 */
export function safeReturnTo(value: string | null | undefined): string {
  return value !== null && value !== undefined && value.startsWith('/') && !value.startsWith('//') ? value : '/'
}

/**
 * Compare one submitted CSRF token with the session token.
 * @param expected - session token.
 * @param provided - submitted token.
 * @returns true when both values match.
 */
export function csrfMatches(expected: string, provided: string | null | undefined): boolean {
  if (provided === null || provided === undefined || provided.length !== expected.length) return false
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided))
}
