/** Server-side client for the account API's operator endpoints. */
import type { Config } from './config.ts'
import type { OperatorIdentity } from './session.ts'

/** One account returned by the operator API. */
export interface AdminUser {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly picture: string | null
  readonly disabled: boolean
}

/** One grant returned by the operator API. */
export interface AdminGrant {
  readonly tokenHash: string
  readonly userId: string
  readonly deviceId: string
  readonly expiresAt: number
  readonly createdAt?: number
  readonly email: string
  readonly name: string
}

/** One device returned by the operator API. */
export interface AdminDevice {
  readonly id: string
  readonly model: string
  readonly osVersion: string
  readonly createdAt?: number
}

/** One sign-in attempt returned by the operator API. */
export interface AdminAttempt {
  readonly authorizeId: string
  readonly state: string
  readonly codeChallenge: string
  readonly redirectUri: string
  readonly locale: string
  readonly loginSource: string
  readonly userId: string
  readonly expiresAt: number
  readonly status: 'pending' | 'approved' | 'exchanged'
}

/** One wallet returned by the operator API. */
export interface AdminWallet {
  readonly userId: string
  readonly currency: 'CNY'
  readonly balanceCents: number
  readonly bonusCents: number
  readonly updatedAt: number
}

/** One granted bonus returned by the operator API. */
export interface AdminBonus {
  readonly orderId: string
  readonly userId: string
  readonly amountCents: number
  readonly currency: 'CNY'
  readonly title: string
  readonly message: string
  readonly expiresAt: number
  readonly notified: boolean
  readonly createdAt: number
}

/** One operator action returned by the audit endpoint. */
export interface AdminAudit {
  readonly id: number
  readonly actorSubject: string
  readonly actorEmail: string
  readonly action: string
  readonly target: string
  readonly details: string
  readonly createdAt: number
}

/** Counts shown by the overview. */
export interface AdminOverview {
  readonly users: number
  readonly disabledUsers: number
  readonly grants: number
  readonly devices: number
  readonly attempts: number
}

/** One page of a listing. */
export interface Listing<T> {
  readonly items: readonly T[]
  readonly total: number
}

/** One user detail projection. */
export interface UserDetail {
  readonly user: AdminUser
  readonly wallet: AdminWallet
  readonly bonuses: readonly AdminBonus[]
}

/** Listing parameters shared by the console pages. */
export interface ListingQuery {
  readonly query?: string
  readonly limit?: number
  readonly offset?: number
}

/** One bonus the console grants. */
export interface BonusInput {
  readonly amount: string
  readonly title: string
  readonly message: string
  readonly expiresInDays?: number
}

/** Failure reported by the operator API. */
export class AdminApiError extends Error {
  /** @param status - HTTP status returned by the API. */
  constructor(readonly status: number) { super(`topask-admin: account API returned ${String(status)}`) }
}

function queryOf(listing: ListingQuery): string {
  const params = new URLSearchParams()
  if (listing.query !== undefined && listing.query !== '') params.set('q', listing.query)
  if (listing.limit !== undefined) params.set('limit', String(listing.limit))
  if (listing.offset !== undefined) params.set('offset', String(listing.offset))
  const value = params.toString()
  return value === '' ? '' : `?${value}`
}

async function call<T>(config: Config, operator: OperatorIdentity, path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${config.apiUrl}/admin-api/${path}`, {
      ...init,
      headers: (() => {
        const headers = new Headers(init.headers)
        headers.set('x-topask-admin-token', config.adminToken)
        headers.set('x-topask-operator-subject', operator.subject)
        headers.set('x-topask-operator-email', operator.email)
        if (init.body !== undefined) headers.set('content-type', 'application/json')
        return headers
      })(),
      signal: AbortSignal.timeout(10_000),
    })
  } catch {
    throw new AdminApiError(503)
  }
  if (!response.ok) throw new AdminApiError(response.status)
  return await response.json() as T
}

/**
 * Read overview counts.
 * @param config - console configuration.
 * @param operator - authenticated operator.
 * @returns account, grant, device, and attempt counts.
 */
export async function overview(config: Config, operator: OperatorIdentity): Promise<AdminOverview> {
  return await call<AdminOverview>(config, operator, 'overview')
}

/**
 * List one page of users.
 * @param config - console configuration.
 * @param operator - authenticated operator.
 * @param listing - query page.
 * @returns one page of users.
 */
export async function users(config: Config, operator: OperatorIdentity, listing: ListingQuery): Promise<Listing<AdminUser>> {
  const result = await call<{ users: AdminUser[]; total: number }>(config, operator, `users${queryOf(listing)}`)
  return { items: result.users, total: result.total }
}

/**
 * Disable or re-enable one account.
 * @param config - console configuration.
 * @param operator - authenticated operator.
 * @param id - account id.
 * @param disabled - requested state.
 * @returns after the API records the change.
 */
export async function setDisabled(config: Config, operator: OperatorIdentity, id: string, disabled: boolean): Promise<void> {
  await call(config, operator, `users/${encodeURIComponent(id)}/disabled`, {
    method: 'POST', body: JSON.stringify({ disabled }),
  })
}

/**
 * Read one user with its wallet and bonuses.
 * @param config - console configuration.
 * @param operator - authenticated operator.
 * @param id - account id.
 * @returns one user with its wallet and bonuses.
 */
export async function userDetail(config: Config, operator: OperatorIdentity, id: string): Promise<UserDetail> {
  return await call<UserDetail>(config, operator, `users/${encodeURIComponent(id)}`)
}

/**
 * List one page of grants.
 * @param config - console configuration.
 * @param operator - authenticated operator.
 * @param listing - query page.
 * @returns one page of grants.
 */
export async function grants(config: Config, operator: OperatorIdentity, listing: ListingQuery): Promise<Listing<AdminGrant>> {
  const result = await call<{ grants: AdminGrant[]; total: number }>(config, operator, `grants${queryOf(listing)}`)
  return { items: result.grants, total: result.total }
}

/**
 * Revoke one grant.
 * @param config - console configuration.
 * @param operator - authenticated operator.
 * @param tokenHash - grant digest.
 * @returns after the API revokes the grant.
 */
export async function revokeGrant(config: Config, operator: OperatorIdentity, tokenHash: string): Promise<void> {
  await call(config, operator, `grants/${encodeURIComponent(tokenHash)}`, { method: 'DELETE' })
}

/**
 * List one page of devices.
 * @param config - console configuration.
 * @param operator - authenticated operator.
 * @param listing - query page.
 * @returns one page of devices.
 */
export async function devices(config: Config, operator: OperatorIdentity, listing: ListingQuery): Promise<Listing<AdminDevice>> {
  const result = await call<{ devices: AdminDevice[]; total: number }>(config, operator, `devices${queryOf(listing)}`)
  return { items: result.devices, total: result.total }
}

/**
 * List one page of attempts.
 * @param config - console configuration.
 * @param operator - authenticated operator.
 * @param listing - query page.
 * @returns one page of attempts.
 */
export async function attempts(config: Config, operator: OperatorIdentity, listing: ListingQuery): Promise<Listing<AdminAttempt>> {
  const result = await call<{ attempts: AdminAttempt[]; total: number }>(config, operator, `attempts${queryOf(listing)}`)
  return { items: result.attempts, total: result.total }
}

/**
 * List one page of wallets.
 * @param config - console configuration.
 * @param operator - authenticated operator.
 * @param listing - query page.
 * @returns one page of wallets.
 */
export async function wallets(config: Config, operator: OperatorIdentity, listing: ListingQuery): Promise<Listing<AdminWallet>> {
  const result = await call<{ wallets: AdminWallet[]; total: number }>(config, operator, `wallets${queryOf(listing)}`)
  return { items: result.wallets, total: result.total }
}

/**
 * Read one wallet detail.
 * @param config - console configuration.
 * @param operator - authenticated operator.
 * @param userId - account id.
 * @returns one user with its wallet and bonuses.
 */
export async function walletDetail(config: Config, operator: OperatorIdentity, userId: string): Promise<UserDetail> {
  return await call<UserDetail>(config, operator, `wallets/${encodeURIComponent(userId)}`)
}

/**
 * Set one wallet's normal balance.
 * @param config - console configuration.
 * @param operator - authenticated operator.
 * @param userId - account id.
 * @param balance - decimal balance.
 * @returns after the API records the new balance.
 */
export async function setBalance(config: Config, operator: OperatorIdentity, userId: string, balance: string): Promise<void> {
  await call(config, operator, `wallets/${encodeURIComponent(userId)}/balance`, {
    method: 'POST', body: JSON.stringify({ balance }),
  })
}

/**
 * Grant one bonus.
 * @param config - console configuration.
 * @param operator - authenticated operator.
 * @param userId - account id.
 * @param bonus - granted bonus.
 * @returns after the API grants the bonus.
 */
export async function addBonus(config: Config, operator: OperatorIdentity, userId: string, bonus: BonusInput): Promise<void> {
  await call(config, operator, `wallets/${encodeURIComponent(userId)}/bonuses`, {
    method: 'POST', body: JSON.stringify(bonus),
  })
}

/**
 * List one page of audit entries.
 * @param config - console configuration.
 * @param operator - authenticated operator.
 * @param listing - query page.
 * @returns one page of audit entries.
 */
export async function audit(config: Config, operator: OperatorIdentity, listing: ListingQuery): Promise<Listing<AdminAudit>> {
  const result = await call<{ entries: AdminAudit[]; total: number }>(config, operator, `audit${queryOf(listing)}`)
  return { items: result.entries, total: result.total }
}
