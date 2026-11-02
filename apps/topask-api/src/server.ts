/** Platform-compatible account HTTP API: browser sign-in, token issue, and account reads. */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { z } from 'zod'
import { equalText, hashSecret, pkceChallenge, randomHandle } from './auth.ts'
import type { Config } from './config.ts'
import { failure, sendJson, success } from './envelope.ts'
import type { GrantRecord, PageQuery, Store, UserRecord } from './store.ts'

/** Largest request body any account endpoint accepts. */
const MAX_REQUEST_BYTES = 65_536
/** Business outcome for a malformed or unacceptable request. */
const BIZ_INVALID_REQUEST = 1
/** Business outcome for an unknown, expired, or replayed authorization code. */
const BIZ_INVALID_GRANT = 2
/** Business outcome for an account the operator disabled. */
const BIZ_ACCOUNT_DISABLED = 3

/** Dependencies one server instance reads for its lifetime. */
export interface ApiOptions {
  readonly config: Config
  readonly store: Store
  /** Clock override for tests; defaults to `Date.now`. */
  readonly now?: () => number
}

/** A request rejected before reaching business logic. */
class RequestError extends Error {
  /** @param status - HTTP status the caller receives. */
  constructor(readonly status: number) { super(`topask-api: request rejected with ${status}`) }
}

const initRequest = z.object({
  code_challenge: z.string().min(1).max(256),
  code_challenge_method: z.literal('S256'),
  state: z.string().min(1).max(512),
  redirect_uri: z.string().min(1).max(2048),
  locale: z.string().max(32).optional(),
  login_source: z.enum(['web', 'desktop']).optional(),
})

const exchangeRequest = z.object({
  code: z.string().min(1).max(512),
  code_verifier: z.string().min(1).max(256),
  redirect_uri: z.string().min(1).max(2048),
  device_id: z.string().min(1).max(128).optional(),
  device_model: z.string().max(128).optional(),
  os_version: z.string().max(128).optional(),
})

const cancelRequest = z.object({
  authorize_id: z.string().min(1).max(128),
  code_verifier: z.string().max(256).optional(),
})

const bonusRequest = z.object({ order_id: z.string().min(1).max(256) })

const decisionRequest = z.object({
  action: z.enum(['approve', 'deny']),
  state: z.string().min(1).max(512),
})

const disabledRequest = z.object({ disabled: z.boolean() })

const money = z.string().regex(/^\d{1,9}(?:\.\d{1,2})?$/u)

const balanceRequest = z.object({ balance: money })

const adminBonusRequest = z.object({
  amount: money,
  title: z.string().trim().min(1).max(200),
  message: z.string().trim().min(1).max(1000),
  expiresInDays: z.number().int().min(1).max(3650).optional(),
})

function readBody(req: IncomingMessage): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0
    req.on('data', (chunk: Buffer) => {
      size += chunk.byteLength
      if (size > MAX_REQUEST_BYTES) {
        reject(new RequestError(413))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => { resolve(Buffer.concat(chunks)) })
    req.on('error', reject)
  })
}

function parseJson<T>(schema: z.ZodType<T>, body: Buffer): T {
  let value: unknown
  try { value = JSON.parse(body.toString('utf8')) } catch { throw new RequestError(400) }
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw new RequestError(400)
  return parsed.data
}

/**
 * Accept only the loopback callback the account client registers.
 * @param value - client-supplied redirect URI.
 * @returns the normalized URI.
 */
function loopbackRedirect(value: string): URL {
  let url: URL
  try { url = new URL(value) } catch { throw new RequestError(400) }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  const allowedPath = url.pathname === '/oauth/callback' || url.pathname === '/oauth/topask/callback'
  if (url.protocol !== 'http:' || !loopback || url.port === '' || url.username !== '' || url.password !== ''
    || url.search !== '' || url.hash !== '' || !allowedPath) {
    throw new RequestError(400)
  }
  return url
}

function tokenOf(req: IncomingMessage): string | undefined {
  const value = req.headers['x-dsh-auth-token']
  return Array.isArray(value) ? value[0] : value
}

function grantOf(req: IncomingMessage, options: ApiOptions, now: number): GrantRecord | undefined {
  const token = tokenOf(req)
  if (token === undefined || !/^[\x21-\x7e]+$/.test(token)) return undefined
  const grant = options.store.findGrant(hashSecret(token), now)
  if (grant === undefined) return undefined
  return options.store.findUser(grant.userId)?.disabled === true ? undefined : grant
}

function headerOf(req: IncomingMessage, name: string): string | undefined {
  const value = req.headers[name]
  return Array.isArray(value) ? value[0] : value
}

function adminAuthorized(req: IncomingMessage, options: ApiOptions): boolean {
  const token = headerOf(req, 'x-topask-admin-token')
  return token !== undefined && equalText(token, options.config.adminToken)
}

function operatorOf(req: IncomingMessage): { subject: string; email: string } | undefined {
  const subject = headerOf(req, 'x-topask-operator-subject')?.trim()
  const email = headerOf(req, 'x-topask-operator-email')?.trim()
  if (subject === undefined || subject === '' || email === undefined || email === '' || email.length > 320) return undefined
  return { subject, email }
}

function pageOf(url: URL): PageQuery {
  const rawQuery = url.searchParams.get('q')?.trim() ?? ''
  const rawLimit = Number(url.searchParams.get('limit') ?? '50')
  const rawOffset = Number(url.searchParams.get('offset') ?? '0')
  const limit = Number.isInteger(rawLimit) ? Math.min(200, Math.max(1, rawLimit)) : 50
  const offset = Number.isInteger(rawOffset) ? Math.min(1_000_000, Math.max(0, rawOffset)) : 0
  return { query: rawQuery.slice(0, 200), limit, offset }
}

function formatCents(cents: number): string {
  return (cents / 100).toFixed(2)
}

function parseCents(value: string): number {
  return Math.round(Number(value) * 100)
}

function audit(options: ApiOptions, operator: { subject: string; email: string }, action: string,
  target: string, details: string, now: number): void {
  options.store.appendAudit({
    actorSubject: operator.subject, actorEmail: operator.email, action, target, details, createdAt: now,
  })
}

function userPayload(user: UserRecord): unknown {
  return {
    id: user.id,
    email: user.email,
    mobile: '',
    id_profile: { name: user.name, picture: user.picture },
  }
}

function unauthorized(res: ServerResponse): void {
  sendJson(res, 401, { code: 40003 })
}

function methodNotAllowed(res: ServerResponse, allow: string): void {
  res.writeHead(405, { allow, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  res.end('method not allowed')
}

/**
 * Whether the request carries the shared platform-to-API internal token.
 * @param req - inbound request.
 * @param options - server dependencies.
 * @returns true when the token matches.
 */
function internalAuthorized(req: IncomingMessage, options: ApiOptions): boolean {
  const value = req.headers['x-topask-internal-token']
  const token = Array.isArray(value) ? value[0] : value
  return token !== undefined && equalText(token, options.config.internalToken)
}

/**
 * Read one sign-in attempt for the platform app.
 * @param res - response to write.
 * @param authorizeId - attempt identity.
 * @param options - server dependencies.
 */
function internalAttempt(res: ServerResponse, authorizeId: string, options: ApiOptions): void {
  const attempt = options.store.findAttempt(authorizeId)
  if (attempt === undefined) { sendJson(res, 404, { error: 'not-found' }); return }
  const user = options.store.findUser(attempt.userId)
  if (user === undefined) { sendJson(res, 500, { error: 'unavailable' }); return }
  if (user.disabled === true) { sendJson(res, 403, { error: 'disabled' }); return }
  sendJson(res, 200, {
    authorizeId: attempt.authorizeId,
    state: attempt.state,
    locale: attempt.locale,
    loginSource: attempt.loginSource,
    expiresAt: attempt.expiresAt,
    user: { name: user.name, email: user.email },
  })
}

/**
 * Approve or deny one sign-in attempt for the platform app.
 * @param req - inbound request carrying the decision.
 * @param res - response to write.
 * @param options - server dependencies.
 * @param now - epoch milliseconds.
 * @param authorizeId - attempt identity.
 */
async function internalDecision(req: IncomingMessage, res: ServerResponse, options: ApiOptions,
  now: number, authorizeId: string): Promise<void> {
  const request = parseJson(decisionRequest, await readBody(req))
  const attempt = options.store.findAttempt(authorizeId)
  if (attempt === undefined) { sendJson(res, 404, { error: 'not-found' }); return }
  const user = options.store.findUser(attempt.userId)
  if (user === undefined) { sendJson(res, 500, { error: 'unavailable' }); return }
  if (user.disabled === true) { sendJson(res, 403, { error: 'disabled' }); return }
  if (attempt.expiresAt <= now) { sendJson(res, 410, { error: 'expired' }); return }
  if (!equalText(attempt.state, request.state)) { sendJson(res, 400, { error: 'state-mismatch' }); return }
  if (request.action === 'deny') {
    options.store.cancelAttempt(authorizeId)
    sendJson(res, 200, { redirect: null })
    return
  }
  const code = randomHandle(32)
  if (!options.store.approveAttempt(authorizeId, hashSecret(code), now)) {
    sendJson(res, 410, { error: 'expired' })
    return
  }
  sendJson(res, 200, {
    redirect: `${attempt.redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(attempt.state)}`,
  })
}

async function authInit(req: IncomingMessage, res: ServerResponse, options: ApiOptions, now: number): Promise<void> {
  const request = parseJson(initRequest, await readBody(req))
  const redirect = loopbackRedirect(request.redirect_uri)
  const user = options.config.identity.user
  options.store.upsertUser(user)
  if (options.store.findUser(user.id)?.disabled === true) {
    sendJson(res, 200, failure(BIZ_ACCOUNT_DISABLED))
    return
  }
  const authorizeId = randomHandle(16)
  options.store.createAttempt({
    authorizeId,
    state: request.state,
    codeChallenge: request.code_challenge,
    redirectUri: redirect.href,
    locale: request.locale ?? '',
    loginSource: request.login_source ?? 'web',
    userId: user.id,
    expiresAt: now + options.config.attemptTtlMs,
  })
  sendJson(res, 200, success({
    authorize_url: `${options.config.platformOrigin}/dsh/authorize?authorize_id=${encodeURIComponent(authorizeId)}`,
    authorize_id: authorizeId,
    expires_in: Math.floor(options.config.attemptTtlMs / 1000),
  }))
}

async function authExchange(req: IncomingMessage, res: ServerResponse, options: ApiOptions, now: number): Promise<void> {
  const request = parseJson(exchangeRequest, await readBody(req))
  const redirect = loopbackRedirect(request.redirect_uri)
  const attempt = options.store.findAttemptByCode(hashSecret(request.code), now)
  if (attempt === undefined) { sendJson(res, 200, failure(BIZ_INVALID_GRANT)); return }
  if (attempt.redirectUri !== redirect.href) { sendJson(res, 200, failure(BIZ_INVALID_GRANT)); return }
  if (!equalText(pkceChallenge(request.code_verifier), attempt.codeChallenge)) {
    sendJson(res, 200, failure(BIZ_INVALID_GRANT))
    return
  }
  if (!options.store.consumeAttempt(attempt.authorizeId, now)) { sendJson(res, 200, failure(BIZ_INVALID_GRANT)); return }
  const user = options.store.findUser(attempt.userId)
  if (user === undefined) { sendJson(res, 200, failure(BIZ_INVALID_REQUEST)); return }
  if (user.disabled === true) { sendJson(res, 200, failure(BIZ_ACCOUNT_DISABLED)); return }
  const token = randomHandle(32)
  const deviceId = request.device_id ?? randomHandle(16)
  options.store.putDevice({
    id: deviceId,
    model: request.device_model ?? '',
    osVersion: request.os_version ?? '',
    createdAt: now,
  }, now)
  options.store.createGrant({
    tokenHash: hashSecret(token),
    userId: user.id,
    deviceId,
    expiresAt: now + options.config.tokenTtlMs,
    createdAt: now,
  })
  const localeTag = attempt.locale === '' ? 'zh_CN' : attempt.locale
  sendJson(res, 200, success({
    token,
    authorized_url: `${options.config.platformOrigin}/dsh/authorized?locale=${encodeURIComponent(localeTag)}`,
    user: userPayload(user),
  }))
}

async function authCancel(req: IncomingMessage, res: ServerResponse, options: ApiOptions): Promise<void> {
  const request = parseJson(cancelRequest, await readBody(req))
  options.store.cancelAttempt(request.authorize_id)
  sendJson(res, 200, success({}))
}

function logout(req: IncomingMessage, res: ServerResponse, options: ApiOptions, now: number): void {
  const grant = grantOf(req, options, now)
  if (grant === undefined) { unauthorized(res); return }
  options.store.deleteGrant(grant.tokenHash)
  sendJson(res, 200, success({}))
}

function currentUser(req: IncomingMessage, res: ServerResponse, options: ApiOptions, now: number): void {
  const grant = grantOf(req, options, now)
  const user = grant === undefined ? undefined : options.store.findUser(grant.userId)
  if (user === undefined) { unauthorized(res); return }
  sendJson(res, 200, success(userPayload(user)))
}

function walletSummary(req: IncomingMessage, res: ServerResponse, options: ApiOptions, now: number): void {
  const grant = grantOf(req, options, now)
  if (grant === undefined) { unauthorized(res); return }
  const wallet = options.store.getWallet(grant.userId)
  sendJson(res, 200, success({
    normal_wallets: [{ currency: 'CNY', balance: formatCents(wallet.balanceCents) }],
    bonus_wallets: [{ currency: 'CNY', balance: formatCents(wallet.bonusCents) }],
  }))
}

function bonuses(req: IncomingMessage, res: ServerResponse, options: ApiOptions, now: number): void {
  const grant = grantOf(req, options, now)
  if (grant === undefined) { unauthorized(res); return }
  const entries = options.store.listBonuses(grant.userId)
    .filter(entry => !entry.notified && entry.expiresAt > now)
    .map(entry => ({
      order_id: entry.orderId,
      title: entry.title,
      amount: formatCents(entry.amountCents),
      currency: entry.currency,
      granted_at: new Date(entry.createdAt).toISOString(),
      expires_at: new Date(entry.expiresAt).toISOString(),
      msg: entry.message,
    }))
  sendJson(res, 200, success(entries))
}

async function acknowledgeBonus(req: IncomingMessage, res: ServerResponse, options: ApiOptions, now: number): Promise<void> {
  const request = parseJson(bonusRequest, await readBody(req))
  const grant = grantOf(req, options, now)
  if (grant === undefined) { unauthorized(res); return }
  options.store.ackBonus(request.order_id, grant.userId)
  sendJson(res, 200, success({}))
}

async function adminRoute(req: IncomingMessage, res: ServerResponse, options: ApiOptions,
  now: number, url: URL): Promise<void> {
  const operator = operatorOf(req)
  if (operator === undefined) { sendJson(res, 401, { error: 'operator-required' }); return }
  const path = url.pathname.slice('/admin-api/'.length)
  if (path === 'overview') {
    if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
    sendJson(res, 200, options.store.overview())
    return
  }
  if (path === 'users') {
    if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
    sendJson(res, 200, options.store.listUsers(pageOf(url)))
    return
  }
  const userMatch = /^users\/([^/]+)$/u.exec(path)
  if (userMatch !== null) {
    if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
    let id: string
    try { id = decodeURIComponent(userMatch[1] as string) } catch { sendJson(res, 400, { error: 'invalid-id' }); return }
    const detail = options.store.findUser(id)
    if (detail === undefined) { sendJson(res, 404, { error: 'not-found' }); return }
    sendJson(res, 200, {
      user: detail,
      wallet: options.store.getWallet(id),
      bonuses: options.store.listBonuses(id),
    })
    return
  }
  const disabledMatch = /^users\/([^/]+)\/disabled$/u.exec(path)
  if (disabledMatch !== null) {
    if (req.method !== 'POST') { methodNotAllowed(res, 'POST'); return }
    let id: string
    try { id = decodeURIComponent(disabledMatch[1] as string) } catch { sendJson(res, 400, { error: 'invalid-id' }); return }
    const request = parseJson(disabledRequest, await readBody(req))
    if (!options.store.setUserDisabled(id, request.disabled)) { sendJson(res, 404, { error: 'not-found' }); return }
    audit(options, operator, request.disabled ? 'user.disable' : 'user.enable', id,
      JSON.stringify({ disabled: request.disabled }), now)
    sendJson(res, 200, { ok: true })
    return
  }
  if (path === 'grants') {
    if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
    sendJson(res, 200, options.store.listGrants(pageOf(url)))
    return
  }
  const grantMatch = /^grants\/([^/]+)$/u.exec(path)
  if (grantMatch !== null) {
    if (req.method !== 'DELETE') { methodNotAllowed(res, 'DELETE'); return }
    let tokenHash: string
    try { tokenHash = decodeURIComponent(grantMatch[1] as string) } catch { sendJson(res, 400, { error: 'invalid-id' }); return }
    if (!options.store.deleteGrant(tokenHash)) { sendJson(res, 404, { error: 'not-found' }); return }
    audit(options, operator, 'grant.revoke', tokenHash, '{}', now)
    sendJson(res, 200, { ok: true })
    return
  }
  if (path === 'devices') {
    if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
    sendJson(res, 200, options.store.listDevices(pageOf(url)))
    return
  }
  if (path === 'attempts') {
    if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
    sendJson(res, 200, options.store.listAttempts(pageOf(url)))
    return
  }
  if (path === 'wallets') {
    if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
    sendJson(res, 200, options.store.listWallets(pageOf(url)))
    return
  }
  const walletMatch = /^wallets\/([^/]+)$/u.exec(path)
  if (walletMatch !== null) {
    if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
    let userId: string
    try { userId = decodeURIComponent(walletMatch[1] as string) } catch { sendJson(res, 400, { error: 'invalid-id' }); return }
    const detail = options.store.findUser(userId)
    if (detail === undefined) { sendJson(res, 404, { error: 'not-found' }); return }
    sendJson(res, 200, {
      user: detail,
      wallet: options.store.getWallet(userId),
      bonuses: options.store.listBonuses(userId),
    })
    return
  }
  const balanceMatch = /^wallets\/([^/]+)\/balance$/u.exec(path)
  if (balanceMatch !== null) {
    if (req.method !== 'POST') { methodNotAllowed(res, 'POST'); return }
    let userId: string
    try { userId = decodeURIComponent(balanceMatch[1] as string) } catch { sendJson(res, 400, { error: 'invalid-id' }); return }
    const request = parseJson(balanceRequest, await readBody(req))
    if (options.store.findUser(userId) === undefined) { sendJson(res, 404, { error: 'not-found' }); return }
    const wallet = options.store.setWalletBalance(userId, parseCents(request.balance), now)
    audit(options, operator, 'wallet.balance', userId, JSON.stringify({ balance: request.balance }), now)
    sendJson(res, 200, { wallet })
    return
  }
  const bonusMatch = /^wallets\/([^/]+)\/bonuses$/u.exec(path)
  if (bonusMatch !== null) {
    if (req.method !== 'POST') { methodNotAllowed(res, 'POST'); return }
    let userId: string
    try { userId = decodeURIComponent(bonusMatch[1] as string) } catch { sendJson(res, 400, { error: 'invalid-id' }); return }
    const request = parseJson(adminBonusRequest, await readBody(req))
    if (options.store.findUser(userId) === undefined) { sendJson(res, 404, { error: 'not-found' }); return }
    const expiresInDays = request.expiresInDays ?? 30
    const bonus = options.store.addBonus(userId, parseCents(request.amount), request.title, request.message,
      now + expiresInDays * 86_400_000, now)
    audit(options, operator, 'bonus.grant', userId,
      JSON.stringify({ amount: request.amount, title: request.title, expiresInDays }), now)
    sendJson(res, 200, { bonus })
    return
  }
  if (path === 'audit') {
    if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
    sendJson(res, 200, options.store.listAudit(pageOf(url)))
    return
  }
  sendJson(res, 404, { error: 'not-found' })
}

async function handle(req: IncomingMessage, res: ServerResponse, options: ApiOptions, now: () => number): Promise<void> {
  const clock = now()
  const url = new URL(req.url ?? '/', options.config.platformOrigin)
  if (url.pathname.startsWith('/admin-api/')) {
    if (!adminAuthorized(req, options)) { sendJson(res, 401, { error: 'unauthorized' }); return }
    await adminRoute(req, res, options, clock, url)
    return
  }
  const internal = /^\/internal\/attempts\/([^/]+)(\/decision)?$/u.exec(url.pathname)
  if (internal !== null) {
    if (!internalAuthorized(req, options)) { sendJson(res, 401, { error: 'unauthorized' }); return }
    let authorizeId: string
    try { authorizeId = decodeURIComponent(internal[1] as string) } catch { sendJson(res, 400, { error: 'invalid-id' }); return }
    if (internal[2] === undefined) {
      if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
      internalAttempt(res, authorizeId, options)
      return
    }
    if (req.method !== 'POST') { methodNotAllowed(res, 'POST'); return }
    await internalDecision(req, res, options, clock, authorizeId)
    return
  }
  switch (url.pathname) {
    case '/healthz':
      if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
      sendJson(res, 200, { status: 'ok' })
      return
    case '/auth-api/v0/dsh/auth_init':
      if (req.method !== 'POST') { methodNotAllowed(res, 'POST'); return }
      await authInit(req, res, options, clock)
      return
    case '/auth-api/v0/dsh/auth_exchange':
      if (req.method !== 'POST') { methodNotAllowed(res, 'POST'); return }
      await authExchange(req, res, options, clock)
      return
    case '/auth-api/v0/dsh/auth_cancel':
      if (req.method !== 'POST') { methodNotAllowed(res, 'POST'); return }
      await authCancel(req, res, options)
      return
    case '/auth-api/v0/users/logout':
      if (req.method !== 'POST') { methodNotAllowed(res, 'POST'); return }
      logout(req, res, options, clock)
      return
    case '/auth-api/v0/users/current':
      if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
      currentUser(req, res, options, clock)
      return
    case '/api/v0/users/get_user_summary':
      if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
      walletSummary(req, res, options, clock)
      return
    case '/api/v0/users/get_unnotified_bonuses':
      if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
      bonuses(req, res, options, clock)
      return
    case '/api/v0/users/ack_bonus_notified':
      if (req.method !== 'POST') { methodNotAllowed(res, 'POST'); return }
      await acknowledgeBonus(req, res, options, clock)
      return
    default:
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      res.end('not found')
  }
}

/**
 * Create the account API server without listening.
 * @param options - configuration, persistence, and optional clock.
 * @returns an unlistened HTTP server.
 */
export function createApiServer(options: ApiOptions): Server {
  const now = options.now ?? Date.now
  return createServer((req, res) => {
    void handle(req, res, options, now).catch((error: unknown) => {
      if (res.headersSent) { res.destroy(); return }
      if (error instanceof RequestError) { sendJson(res, error.status, { error: error.status }); return }
      const message = error instanceof Error ? error.message : String(error)
      console.error(`topask-api: request failed: ${message}`)
      sendJson(res, 500, { error: 'internal' })
    })
  })
}
