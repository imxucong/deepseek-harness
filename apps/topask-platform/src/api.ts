/** Internal account API calls made by the platform on behalf of one browser. */
import { z } from 'zod'
import type { Config } from './config.ts'

/** Identity and attempt facts the consent page renders. */
export interface AttemptView {
  readonly authorizeId: string
  readonly state: string
  readonly locale: string
  readonly loginSource: string
  readonly expiresAt: number
  readonly user: { readonly name: string; readonly email: string }
}

/** Outcome of reading one sign-in attempt. */
export type AttemptResult =
  | { readonly kind: 'ready'; readonly attempt: AttemptView }
  | { readonly kind: 'missing' }
  | { readonly kind: 'unavailable' }

/** Outcome of an internal approve or deny decision. */
export type DecisionResult =
  | { readonly kind: 'approved'; readonly redirect: string }
  | { readonly kind: 'denied' }
  | { readonly kind: 'missing' }
  | { readonly kind: 'expired' }
  | { readonly kind: 'state-mismatch' }
  | { readonly kind: 'unavailable' }

const attemptSchema = z.object({
  authorizeId: z.string().min(1),
  state: z.string().min(1),
  locale: z.string(),
  loginSource: z.string(),
  expiresAt: z.number().int(),
  user: z.object({ name: z.string(), email: z.string() }),
})

const decisionSchema = z.object({ redirect: z.url().nullable() })

function headers(config: Config): Record<string, string> {
  return { 'x-topask-internal-token': config.internalToken }
}

/**
 * Read one attempt from the account API.
 * @param config - platform configuration carrying the API origin and token.
 * @param authorizeId - attempt identity.
 * @returns the attempt, a missing outcome, or an unavailable outcome.
 */
export async function readAttempt(config: Config, authorizeId: string): Promise<AttemptResult> {
  let response: Response
  try {
    response = await fetch(`${config.apiUrl}/internal/attempts/${encodeURIComponent(authorizeId)}`, {
      headers: headers(config), signal: AbortSignal.timeout(10_000),
    })
  } catch { return { kind: 'unavailable' } }
  if (response.status === 404) return { kind: 'missing' }
  if (!response.ok) return { kind: 'unavailable' }
  const parsed = attemptSchema.safeParse(await response.json().catch(() => undefined))
  return parsed.success ? { kind: 'ready', attempt: parsed.data } : { kind: 'unavailable' }
}

/**
 * Approve or deny one attempt through the account API.
 * @param config - platform configuration carrying the API origin and token.
 * @param authorizeId - attempt identity.
 * @param action - decision the browser submitted.
 * @param state - CSRF state the attempt was created with.
 * @returns the application redirect, the denied outcome, or the refusal reason.
 */
export async function decide(config: Config, authorizeId: string, action: 'approve' | 'deny',
  state: string): Promise<DecisionResult> {
  let response: Response
  try {
    response = await fetch(`${config.apiUrl}/internal/attempts/${encodeURIComponent(authorizeId)}/decision`, {
      method: 'POST',
      headers: { ...headers(config), 'content-type': 'application/json' },
      body: JSON.stringify({ action, state }),
      signal: AbortSignal.timeout(10_000),
    })
  } catch { return { kind: 'unavailable' } }
  if (response.status === 404) return { kind: 'missing' }
  if (response.status === 410) return { kind: 'expired' }
  if (response.status === 400) return { kind: 'state-mismatch' }
  if (!response.ok) return { kind: 'unavailable' }
  const parsed = decisionSchema.safeParse(await response.json().catch(() => undefined))
  if (!parsed.success) return { kind: 'unavailable' }
  if (parsed.data.redirect === null) return { kind: 'denied' }
  return { kind: 'approved', redirect: parsed.data.redirect }
}
