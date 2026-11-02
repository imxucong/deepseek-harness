/** Operator console server: OIDC sign-in, signed sessions, and the admin API BFF. */
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import {
  addBonus, AdminApiError, attempts, audit, devices, grants, overview, revokeGrant, setBalance, setDisabled,
  userDetail, users, walletDetail, wallets,
} from './admin-api.ts'
import { operatorAllowed, type Config } from './config.ts'
import { authorizationUrl, discover, exchange, randomToken } from './oidc.ts'
import {
  attemptsPage, auditPage, devicesPage, failurePage, grantsPage, loginPage, overviewPage, userPage, usersPage,
  walletPage, walletsPage,
} from './pages.ts'
import {
  cookie, cookies, createOidcState, createSession, csrfMatches, OIDC_COOKIE, safeReturnTo, SESSION_COOKIE,
  verifyOidcState, verifySession, type OperatorSession,
} from './session.ts'

/** Largest form body the console accepts. */
const MAX_REQUEST_BYTES = 65_536
/** Lifetime of one OIDC round trip. */
const OIDC_STATE_TTL_MS = 10 * 60_000
/** Content policy for every console page: inline styles and same-origin forms only. */
const CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; form-action 'self'"

/** A request rejected before reaching business logic. */
class RequestError extends Error {
  /** @param status - HTTP status the caller receives. */
  constructor(readonly status: number) { super(`topask-admin: request rejected with ${status}`) }
}

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

async function formOf(req: IncomingMessage): Promise<URLSearchParams> {
  return new URLSearchParams((await readBody(req)).toString('utf8'))
}

function sendHtml(res: ServerResponse, status: number, html: string): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': String(Buffer.byteLength(html)),
    'cache-control': 'no-store',
    'content-security-policy': CONTENT_SECURITY_POLICY,
  })
  res.end(html)
}

function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = Buffer.from(JSON.stringify(value))
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(body.byteLength),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function redirect(res: ServerResponse, location: string, setCookies: readonly string[] = []): void {
  const headers: Record<string, string | string[]> = {
    location, 'cache-control': 'no-store', 'content-length': '0',
  }
  if (setCookies.length > 0) headers['set-cookie'] = [...setCookies]
  res.writeHead(302, headers)
  res.end()
}

function secure(config: Config): boolean {
  return config.origin.startsWith('https:')
}

function sessionOf(req: IncomingMessage, config: Config, now: number): OperatorSession | undefined {
  return verifySession(config.sessionSecret, cookies(req.headers.cookie)[SESSION_COOKIE], now)
}

function apiFailure(error: unknown): string {
  if (error instanceof AdminApiError) {
    if (error.status === 401 || error.status === 403) return '运营 API 拒绝了请求，请检查服务端配置。'
    if (error.status === 404) return '目标不存在或已被删除。'
    if (error.status === 400) return '提交的内容无效。'
  }
  return '运营 API 暂时不可用，请稍后重试。'
}

function pageQuery(url: URL): { query: string; limit: number; offset: number } {
  const query = (url.searchParams.get('q') ?? '').trim().slice(0, 200)
  const rawLimit = Number(url.searchParams.get('limit') ?? '50')
  const rawOffset = Number(url.searchParams.get('offset') ?? '0')
  return {
    query,
    limit: Number.isInteger(rawLimit) ? Math.min(200, Math.max(1, rawLimit)) : 50,
    offset: Number.isInteger(rawOffset) ? Math.min(1_000_000, Math.max(0, rawOffset)) : 0,
  }
}

function localPath(url: URL): string {
  return `${url.pathname}${url.search}`
}

function postAllowed(req: IncomingMessage, res: ServerResponse, config: Config, session: OperatorSession,
  form: URLSearchParams): boolean {
  if (req.headers.origin !== undefined && req.headers.origin !== config.origin) {
    sendHtml(res, 403, failurePage('请求来源不匹配，请重试。'))
    return false
  }
  if (!csrfMatches(session.csrf, form.get('_csrf'))) {
    sendHtml(res, 403, failurePage('表单已过期，请刷新页面后重试。'))
    return false
  }
  return true
}

function operatorOf(session: OperatorSession): { subject: string; email: string; name: string } {
  return { subject: session.subject, email: session.email, name: session.name }
}

function moneyValue(value: string | null): string | undefined {
  return value !== null && /^\d{1,9}(?:\.\d{1,2})?$/u.test(value) ? value : undefined
}

async function oidcStart(res: ServerResponse, config: Config, url: URL, now: number): Promise<void> {
  if (config.oidc === undefined) { redirect(res, '/login'); return }
  const state = randomToken()
  const nonce = randomToken()
  const verifier = randomToken()
  const returnTo = safeReturnTo(url.searchParams.get('returnTo'))
  const value = createOidcState(config.sessionSecret, state, nonce, verifier, returnTo, OIDC_STATE_TTL_MS, now)
  const discovery = await discover(config.oidc.issuer)
  const destination = authorizationUrl(config.oidc, discovery, state, nonce, verifier)
  redirect(res, destination, [cookie(OIDC_COOKIE, value, Math.floor(OIDC_STATE_TTL_MS / 1000), secure(config))])
}

async function oidcCallback(req: IncomingMessage, res: ServerResponse, config: Config, url: URL, now: number): Promise<void> {
  if (config.oidc === undefined) { sendHtml(res, 404, failurePage('未配置 OIDC 登录。')); return }
  const state = verifyOidcState(config.sessionSecret, cookies(req.headers.cookie)[OIDC_COOKIE], now)
  if (state === undefined) { sendHtml(res, 400, failurePage('登录状态已过期，请重新登录。')); return }
  const received = url.searchParams.get('state')
  const code = url.searchParams.get('code')
  if (url.searchParams.get('error') !== null || received === null || code === null || !csrfMatches(state.state, received)) {
    sendHtml(res, 400, failurePage('登录回调无效，请重新登录。'))
    return
  }
  let identity: { subject: string; email: string; name: string }
  try {
    const discovery = await discover(config.oidc.issuer)
    identity = await exchange(config.oidc, discovery, code, state.verifier, state.nonce, now)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error(`topask-admin: OIDC login failed: ${message}`)
    sendHtml(res, 502, failurePage('OIDC 登录失败，请稍后重试。'))
    return
  }
  if (!operatorAllowed(config, identity.subject, identity.email)) {
    sendHtml(res, 403, failurePage('该身份没有运营后台权限。'))
    return
  }
  const session = createSession(config.sessionSecret, identity, config.sessionTtlMs, now)
  redirect(res, state.returnTo, [
    cookie(SESSION_COOKIE, session, Math.floor(config.sessionTtlMs / 1000), secure(config)),
    cookie(OIDC_COOKIE, '', 0, secure(config)),
  ])
}

async function devLogin(req: IncomingMessage, res: ServerResponse, config: Config, now: number): Promise<void> {
  if (!config.devLogin || config.devOperator === undefined) { sendHtml(res, 404, failurePage('未启用开发登录。')); return }
  if (req.headers.origin !== undefined && req.headers.origin !== config.origin) {
    sendHtml(res, 403, failurePage('请求来源不匹配。'))
    return
  }
  const form = await formOf(req)
  const returnTo = safeReturnTo(form.get('returnTo'))
  const session = createSession(config.sessionSecret, config.devOperator, config.sessionTtlMs, now)
  redirect(res, returnTo, [cookie(SESSION_COOKIE, session, Math.floor(config.sessionTtlMs / 1000), secure(config))])
}

async function handle(req: IncomingMessage, res: ServerResponse, config: Config, now: number): Promise<void> {
  const url = new URL(req.url ?? '/', config.origin)
  const session = sessionOf(req, config, now)

  if (url.pathname === '/healthz') {
    if (req.method !== 'GET') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    sendJson(res, 200, { status: 'ok' })
    return
  }
  if (url.pathname === '/login') {
    if (req.method !== 'GET') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    if (session !== undefined) { redirect(res, '/'); return }
    sendHtml(res, 200, loginPage({
      devLogin: config.devLogin,
      returnTo: safeReturnTo(url.searchParams.get('returnTo')),
    }))
    return
  }
  if (url.pathname === '/auth/login') {
    if (req.method !== 'GET') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    await oidcStart(res, config, url, now)
    return
  }
  if (url.pathname === '/auth/callback') {
    if (req.method !== 'GET') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    await oidcCallback(req, res, config, url, now)
    return
  }
  if (url.pathname === '/auth/dev-login') {
    if (req.method !== 'POST') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    await devLogin(req, res, config, now)
    return
  }
  if (url.pathname === '/auth/logout') {
    if (req.method !== 'POST') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    if (session === undefined) { redirect(res, '/login'); return }
    const form = await formOf(req)
    if (!postAllowed(req, res, config, session, form)) return
    redirect(res, '/login', [cookie(SESSION_COOKIE, '', 0, secure(config))])
    return
  }

  if (session === undefined) {
    redirect(res, `/login?returnTo=${encodeURIComponent(localPath(url))}`)
    return
  }
  const operator = operatorOf(session)
  const listing = pageQuery(url)

  if (url.pathname === '/') {
    if (req.method !== 'GET') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    const [counts, recent] = await Promise.all([
      overview(config, operator),
      audit(config, operator, { limit: 6 }),
    ])
    sendHtml(res, 200, overviewPage({ operator, csrf: session.csrf, overview: counts, audit: recent }))
    return
  }
  if (url.pathname === '/users') {
    if (req.method !== 'GET') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    const page = await users(config, operator, listing)
    sendHtml(res, 200, usersPage({ operator, csrf: session.csrf, page, ...listing }))
    return
  }
  const userMatch = /^\/users\/([^/]+)$/u.exec(url.pathname)
  if (userMatch !== null) {
    if (req.method !== 'GET') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    const id = decodeURIComponent(userMatch[1] as string)
    const [detail, page] = await Promise.all([
      userDetail(config, operator, id),
      grants(config, operator, { query: id, limit: 100 }),
    ])
    sendHtml(res, 200, userPage({ operator, csrf: session.csrf, detail, grants: page }))
    return
  }
  const disabledMatch = /^\/users\/([^/]+)\/disabled$/u.exec(url.pathname)
  if (disabledMatch !== null) {
    if (req.method !== 'POST') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    const form = await formOf(req)
    if (!postAllowed(req, res, config, session, form)) return
    const id = decodeURIComponent(disabledMatch[1] as string)
    await setDisabled(config, operator, id, form.get('disabled') === 'true')
    redirect(res, safeReturnTo(form.get('returnTo')))
    return
  }
  if (url.pathname === '/grants') {
    if (req.method !== 'GET') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    const page = await grants(config, operator, listing)
    sendHtml(res, 200, grantsPage({ operator, csrf: session.csrf, page, ...listing }))
    return
  }
  const grantMatch = /^\/grants\/([^/]+)\/revoke$/u.exec(url.pathname)
  if (grantMatch !== null) {
    if (req.method !== 'POST') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    const form = await formOf(req)
    if (!postAllowed(req, res, config, session, form)) return
    await revokeGrant(config, operator, decodeURIComponent(grantMatch[1] as string))
    redirect(res, safeReturnTo(form.get('returnTo')))
    return
  }
  if (url.pathname === '/devices') {
    if (req.method !== 'GET') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    const page = await devices(config, operator, listing)
    sendHtml(res, 200, devicesPage({ operator, csrf: session.csrf, page, ...listing }))
    return
  }
  if (url.pathname === '/attempts') {
    if (req.method !== 'GET') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    const page = await attempts(config, operator, listing)
    sendHtml(res, 200, attemptsPage({ operator, csrf: session.csrf, page, ...listing }))
    return
  }
  if (url.pathname === '/wallets') {
    if (req.method !== 'GET') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    const page = await wallets(config, operator, listing)
    sendHtml(res, 200, walletsPage({ operator, csrf: session.csrf, page, ...listing }))
    return
  }
  const walletMatch = /^\/wallets\/([^/]+)$/u.exec(url.pathname)
  if (walletMatch !== null) {
    if (req.method !== 'GET') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    const detail = await walletDetail(config, operator, decodeURIComponent(walletMatch[1] as string))
    sendHtml(res, 200, walletPage({ operator, csrf: session.csrf, detail }))
    return
  }
  const balanceMatch = /^\/wallets\/([^/]+)\/balance$/u.exec(url.pathname)
  if (balanceMatch !== null) {
    if (req.method !== 'POST') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    const form = await formOf(req)
    if (!postAllowed(req, res, config, session, form)) return
    const balance = moneyValue(form.get('balance'))
    if (balance === undefined) { sendHtml(res, 400, failurePage('金额格式无效。')); return }
    await setBalance(config, operator, decodeURIComponent(balanceMatch[1] as string), balance)
    redirect(res, safeReturnTo(form.get('returnTo')))
    return
  }
  const bonusMatch = /^\/wallets\/([^/]+)\/bonuses$/u.exec(url.pathname)
  if (bonusMatch !== null) {
    if (req.method !== 'POST') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    const form = await formOf(req)
    if (!postAllowed(req, res, config, session, form)) return
    const amount = moneyValue(form.get('amount'))
    const title = form.get('title')?.trim() ?? ''
    const message = form.get('message')?.trim() ?? ''
    const expires = Number(form.get('expiresInDays') ?? '30')
    if (amount === undefined || title === '' || message === '' || !Number.isInteger(expires) || expires < 1 || expires > 3650) {
      sendHtml(res, 400, failurePage('赠金参数无效。'))
      return
    }
    await addBonus(config, operator, decodeURIComponent(bonusMatch[1] as string), {
      amount, title: title.slice(0, 200), message: message.slice(0, 1000), expiresInDays: expires,
    })
    redirect(res, safeReturnTo(form.get('returnTo')))
    return
  }
  if (url.pathname === '/audit') {
    if (req.method !== 'GET') { sendHtml(res, 405, failurePage('请求方法不被允许。')); return }
    const page = await audit(config, operator, listing)
    sendHtml(res, 200, auditPage({ operator, csrf: session.csrf, page, ...listing }))
    return
  }
  sendHtml(res, 404, failurePage('页面不存在。'))
}

/**
 * Create the operator console server without listening.
 * @param config - validated console configuration.
 * @returns an unlistened HTTP server.
 */
export function createAdminServer(config: Config): Server {
  return createServer((req, res) => {
    void handle(req, res, config, Date.now()).catch((error: unknown) => {
      if (res.headersSent) { res.destroy(); return }
      if (error instanceof RequestError) { sendJson(res, error.status, { error: error.status }); return }
      const message = error instanceof Error ? error.message : String(error)
      console.error(`topask-admin: request failed: ${message}`)
      sendHtml(res, 502, failurePage(apiFailure(error)))
    })
  })
}
