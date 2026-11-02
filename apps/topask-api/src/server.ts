/** Platform-compatible account HTTP API: browser sign-in, token issue, and account reads. */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { z } from 'zod'
import { equalText, hashSecret, pkceChallenge, randomHandle } from './auth.ts'
import type { Config } from './config.ts'
import { failure, sendHtml, sendJson, success } from './envelope.ts'
import { authorizedPage, authorizePage, localeFrom, noticePage } from './pages.ts'
import type { GrantRecord, Store, UserRecord } from './store.ts'

/** Largest request body any account endpoint accepts. */
const MAX_REQUEST_BYTES = 65_536
/** Business outcome for a malformed or unacceptable request. */
const BIZ_INVALID_REQUEST = 1
/** Business outcome for an unknown, expired, or replayed authorization code. */
const BIZ_INVALID_GRANT = 2

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
  return options.store.findGrant(hashSecret(token), now)
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

function authorizeGet(res: ServerResponse, url: URL, options: ApiOptions, now: number): void {
  const authorizeId = url.searchParams.get('authorize_id')
  if (authorizeId === null) { sendHtml(res, 400, noticePage('missing', 'zh')); return }
  const attempt = options.store.findAttempt(authorizeId)
  if (attempt === undefined) { sendHtml(res, 404, noticePage('not-found', 'zh')); return }
  const locale = localeFrom(attempt.locale)
  if (attempt.expiresAt <= now) { sendHtml(res, 410, noticePage('expired', locale)); return }
  const user = options.store.findUser(attempt.userId)
  if (user === undefined) { sendHtml(res, 500, noticePage('unavailable', locale)); return }
  sendHtml(res, 200, authorizePage(attempt, user, locale))
}

async function authorizePost(req: IncomingMessage, res: ServerResponse, options: ApiOptions, now: number): Promise<void> {
  const form = new URLSearchParams((await readBody(req)).toString('utf8'))
  const authorizeId = form.get('authorize_id')
  const state = form.get('state')
  const action = form.get('action')
  if (authorizeId === null || state === null || (action !== 'approve' && action !== 'deny')) {
    sendHtml(res, 400, noticePage('invalid-confirmation', 'zh'))
    return
  }
  const attempt = options.store.findAttempt(authorizeId)
  if (attempt === undefined) { sendHtml(res, 410, noticePage('not-found', 'zh')); return }
  const locale = localeFrom(attempt.locale)
  if (attempt.expiresAt <= now) { sendHtml(res, 410, noticePage('expired', locale)); return }
  if (!equalText(attempt.state, state)) { sendHtml(res, 400, noticePage('state-mismatch', locale)); return }
  if (action === 'deny') {
    options.store.cancelAttempt(authorizeId)
    sendHtml(res, 200, noticePage('cancelled', locale))
    return
  }
  const code = randomHandle(32)
  if (!options.store.approveAttempt(authorizeId, hashSecret(code), now)) {
    sendHtml(res, 410, noticePage('expired', locale))
    return
  }
  const location = `${attempt.redirectUri}?code=${encodeURIComponent(code)}&state=${encodeURIComponent(attempt.state)}`
  res.writeHead(303, { location, 'cache-control': 'no-store', 'content-length': '0' })
  res.end()
}

async function authInit(req: IncomingMessage, res: ServerResponse, options: ApiOptions, now: number): Promise<void> {
  const request = parseJson(initRequest, await readBody(req))
  const redirect = loopbackRedirect(request.redirect_uri)
  const user = options.config.identity.user
  options.store.upsertUser(user)
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
    authorize_url: `${options.config.origin}/dsh/authorize?authorize_id=${encodeURIComponent(authorizeId)}`,
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
  const token = randomHandle(32)
  const deviceId = request.device_id ?? randomHandle(16)
  options.store.putDevice({
    id: deviceId,
    model: request.device_model ?? '',
    osVersion: request.os_version ?? '',
  }, now)
  options.store.createGrant({
    tokenHash: hashSecret(token),
    userId: user.id,
    deviceId,
    expiresAt: now + options.config.tokenTtlMs,
  })
  const localeTag = attempt.locale === '' ? 'zh_CN' : attempt.locale
  sendJson(res, 200, success({
    token,
    authorized_url: `${options.config.origin}/dsh/authorized?locale=${encodeURIComponent(localeTag)}`,
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
  if (grantOf(req, options, now) === undefined) { unauthorized(res); return }
  sendJson(res, 200, success({
    normal_wallets: [{ currency: 'CNY', balance: '0.00' }],
    bonus_wallets: [],
  }))
}

function bonuses(req: IncomingMessage, res: ServerResponse, options: ApiOptions, now: number): void {
  if (grantOf(req, options, now) === undefined) { unauthorized(res); return }
  sendJson(res, 200, success([]))
}

async function acknowledgeBonus(req: IncomingMessage, res: ServerResponse, options: ApiOptions, now: number): Promise<void> {
  parseJson(bonusRequest, await readBody(req))
  if (grantOf(req, options, now) === undefined) { unauthorized(res); return }
  sendJson(res, 200, success({}))
}

async function handle(req: IncomingMessage, res: ServerResponse, options: ApiOptions, now: () => number): Promise<void> {
  const clock = now()
  const url = new URL(req.url ?? '/', options.config.origin)
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
    case '/dsh/authorize':
      if (req.method === 'GET') { authorizeGet(res, url, options, clock); return }
      if (req.method === 'POST') { await authorizePost(req, res, options, clock); return }
      methodNotAllowed(res, 'GET, POST')
      return
    case '/dsh/authorized':
      if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
      sendHtml(res, 200, authorizedPage(
        localeFrom(url.searchParams.get('locale') ?? undefined),
        url.searchParams.get('login_source'),
      ))
      return
    case '/usage':
      if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
      sendHtml(res, 200, noticePage('usage', localeFrom(url.searchParams.get('locale') ?? undefined)))
      return
    case '/top_up':
      if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
      sendHtml(res, 200, noticePage('top-up', localeFrom(url.searchParams.get('locale') ?? undefined)))
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
