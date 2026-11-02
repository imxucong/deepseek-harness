/** OIDC discovery, authorization redirect, code exchange, and ID token verification. */
import { createHash, randomBytes } from 'node:crypto'
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from 'jose'
import { z } from 'zod'
import type { OidcConfig } from './config.ts'
import type { OperatorIdentity } from './session.ts'

/** Provider endpoints read from its discovery document. */
export interface Discovery {
  readonly issuer: string
  readonly authorizationEndpoint: string
  readonly tokenEndpoint: string
  readonly jwksUri: string
}

const discoverySchema = z.object({
  issuer: z.string().min(1),
  authorization_endpoint: z.url(),
  token_endpoint: z.url(),
  jwks_uri: z.url(),
})

const tokenSchema = z.object({ id_token: z.string().min(1) })

const discoveries = new Map<string, Promise<Discovery>>()
const jwksSets = new Map<string, JWTVerifyGetKey>()

/**
 * Read and cache one provider discovery document.
 * @param issuer - configured issuer.
 * @returns the provider endpoints.
 * @throws when discovery fails or omits a required endpoint.
 */
export async function discover(issuer: string): Promise<Discovery> {
  const cached = discoveries.get(issuer)
  if (cached !== undefined) return await cached
  const pending = (async (): Promise<Discovery> => {
    const base = issuer.replace(/\/+$/u, '')
    const response = await fetch(`${base}/.well-known/openid-configuration`, { signal: AbortSignal.timeout(10_000) })
    if (!response.ok) throw new Error(`topask-admin: OIDC discovery failed with ${String(response.status)}`)
    const parsed = discoverySchema.safeParse(await response.json())
    if (!parsed.success) throw new Error('topask-admin: OIDC discovery is malformed')
    return {
      issuer: parsed.data.issuer,
      authorizationEndpoint: parsed.data.authorization_endpoint,
      tokenEndpoint: parsed.data.token_endpoint,
      jwksUri: parsed.data.jwks_uri,
    }
  })()
  discoveries.set(issuer, pending)
  pending.catch(() => { discoveries.delete(issuer) })
  return await pending
}

/** @returns a random URL-safe token. */
export function randomToken(): string {
  return randomBytes(32).toString('base64url')
}

/**
 * Compute one S256 PKCE challenge.
 * @param verifier - random verifier.
 * @returns the base64url-encoded SHA-256 digest.
 */
export function challenge(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url')
}

/**
 * Build the provider authorization redirect.
 * @param config - OIDC client settings.
 * @param discovery - provider endpoints.
 * @param state - round-trip state.
 * @param nonce - ID token nonce.
 * @param verifier - PKCE verifier.
 * @returns the authorization URL.
 */
export function authorizationUrl(config: OidcConfig, discovery: Discovery, state: string, nonce: string, verifier: string): string {
  const url = new URL(discovery.authorizationEndpoint)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('client_id', config.clientId)
  url.searchParams.set('redirect_uri', config.redirectUri)
  url.searchParams.set('scope', config.scopes)
  url.searchParams.set('state', state)
  url.searchParams.set('nonce', nonce)
  url.searchParams.set('code_challenge', challenge(verifier))
  url.searchParams.set('code_challenge_method', 'S256')
  return url.href
}

/**
 * Exchange one authorization code and verify its ID token.
 * @param config - OIDC client settings.
 * @param discovery - provider endpoints.
 * @param code - authorization code.
 * @param verifier - PKCE verifier.
 * @param nonce - nonce bound to the authorization request.
 * @param now - epoch milliseconds.
 * @returns the authenticated operator identity.
 * @throws when the exchange, verification, nonce, or required claims fail.
 */
export async function exchange(config: OidcConfig, discovery: Discovery, code: string, verifier: string,
  nonce: string, now: number): Promise<OperatorIdentity> {
  const response = await fetch(discovery.tokenEndpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.redirectUri,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`topask-admin: OIDC token exchange failed with ${String(response.status)}`)
  const parsed = tokenSchema.safeParse(await response.json())
  if (!parsed.success) throw new Error('topask-admin: OIDC token response has no ID token')
  let jwks = jwksSets.get(discovery.jwksUri)
  if (jwks === undefined) {
    jwks = createRemoteJWKSet(new URL(discovery.jwksUri))
    jwksSets.set(discovery.jwksUri, jwks)
  }
  const { payload } = await jwtVerify(parsed.data.id_token, jwks, {
    issuer: discovery.issuer,
    audience: config.clientId,
    currentDate: new Date(now),
  })
  if (payload.nonce !== nonce) throw new Error('topask-admin: OIDC ID token nonce mismatch')
  if (typeof payload.sub !== 'string' || payload.sub === '') throw new Error('topask-admin: OIDC ID token has no subject')
  const rawEmail = payload.email ?? payload.preferred_username
  const email = typeof rawEmail === 'string' && rawEmail !== '' ? rawEmail : payload.sub
  const name = typeof payload.name === 'string' && payload.name !== '' ? payload.name : email
  return { subject: payload.sub, email, name }
}
