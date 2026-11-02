/** TopAsk platform server: authorization pages, signed-in surfaces, and the account API proxy. */
import { createServer, request as httpRequest, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { decide, readAttempt, type DecisionResult } from './api.ts'
import { authorizedPage, authorizePage, noticePage, type NoticeKind } from './auth-pages.ts'
import { PLATFORM_SCRIPT } from './client-script.ts'
import type { Config } from './config.ts'
import { AUTH_CONTENT_SECURITY_POLICY, PLATFORM_CONTENT_SECURITY_POLICY, sendHtml, sendJson } from './html.ts'
import { localeFrom, type PageLocale } from './locale.ts'
import { platformPage, type PlatformSection } from './platform-pages.ts'

/** Largest request body the platform forwards to the account API. */
const MAX_REQUEST_BYTES = 65_536
/** Deadline for one proxied account API request. */
const UPSTREAM_TIMEOUT_MS = 30_000

/** A request rejected before reaching business logic. */
class RequestError extends Error {
  /** @param status - HTTP status the caller receives. */
  constructor(readonly status: number) { super(`topask-platform: request rejected with ${status}`) }
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

function methodNotAllowed(res: ServerResponse, allow: string): void {
  res.writeHead(405, { allow, 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
  res.end('method not allowed')
}

function assertNever(value: never): never {
  throw new Error(`topask-platform: unhandled decision ${String(value)}`)
}

function notice(res: ServerResponse, kind: NoticeKind, locale: PageLocale, status: number): void {
  sendHtml(res, status, noticePage(kind, locale), AUTH_CONTENT_SECURITY_POLICY)
}

function redirect(res: ServerResponse, location: string): void {
  let target: URL
  try { target = new URL(location) } catch { sendJson(res, 502, { error: 'upstream' }); return }
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(target.hostname)
  if (target.protocol !== 'http:' || !loopback || target.port === '' || target.username !== '' || target.password !== '') {
    sendJson(res, 502, { error: 'upstream' })
    return
  }
  res.writeHead(303, { location, 'cache-control': 'no-store', 'content-length': '0' })
  res.end()
}

async function authorizeGet(res: ServerResponse, url: URL, config: Config): Promise<void> {
  const authorizeId = url.searchParams.get('authorize_id')
  if (authorizeId === null) { notice(res, 'missing', 'zh', 400); return }
  const result = await readAttempt(config, authorizeId)
  if (result.kind === 'missing') { notice(res, 'not-found', 'zh', 404); return }
  if (result.kind === 'unavailable') { notice(res, 'unavailable', 'zh', 503); return }
  const locale = localeFrom(result.attempt.locale)
  if (result.attempt.expiresAt <= Date.now()) { notice(res, 'expired', locale, 410); return }
  sendHtml(res, 200, authorizePage(result.attempt, locale), AUTH_CONTENT_SECURITY_POLICY)
}

async function authorizePost(req: IncomingMessage, res: ServerResponse, config: Config): Promise<void> {
  const form = new URLSearchParams((await readBody(req)).toString('utf8'))
  const authorizeId = form.get('authorize_id')
  const state = form.get('state')
  const action = form.get('action')
  const locale = localeFrom(form.get('locale') ?? undefined)
  if (authorizeId === null || state === null || (action !== 'approve' && action !== 'deny')) {
    notice(res, 'invalid-confirmation', locale, 400)
    return
  }
  const result: DecisionResult = await decide(config, authorizeId, action, state)
  switch (result.kind) {
    case 'approved': redirect(res, result.redirect); return
    case 'denied': notice(res, 'cancelled', locale, 200); return
    case 'missing': notice(res, 'not-found', locale, 410); return
    case 'expired': notice(res, 'expired', locale, 410); return
    case 'state-mismatch': notice(res, 'state-mismatch', locale, 400); return
    case 'unavailable': notice(res, 'unavailable', locale, 503); return
    default: assertNever(result)
  }
}

function proxy(req: IncomingMessage, res: ServerResponse, config: Config): void {
  const target = new URL(config.apiUrl)
  const client = target.protocol === 'https:' ? httpsRequest : httpRequest
  const upstream = client({
    protocol: target.protocol,
    hostname: target.hostname,
    port: target.port === '' ? undefined : target.port,
    method: req.method,
    path: req.url,
    headers: { ...req.headers, host: target.host },
    timeout: UPSTREAM_TIMEOUT_MS,
  }, (upstreamRes) => {
    res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers)
    upstreamRes.pipe(res)
  })
  upstream.on('timeout', () => { upstream.destroy(new Error('topask-platform: account API timeout')) })
  upstream.on('error', () => {
    if (!res.headersSent) sendJson(res, 502, { error: 'upstream' })
    else res.destroy()
  })
  req.pipe(upstream)
}

function sendScript(res: ServerResponse): void {
  const body = Buffer.from(PLATFORM_SCRIPT)
  res.writeHead(200, {
    'content-type': 'text/javascript; charset=utf-8',
    'content-length': String(body.byteLength),
    'cache-control': 'no-store',
    'content-security-policy': "default-src 'none'",
  })
  res.end(body)
}

function sendPlatform(res: ServerResponse, section: PlatformSection, url: URL): void {
  const locale = localeFrom(url.searchParams.get('locale') ?? undefined)
  const dist = url.searchParams.get('dist') ?? ''
  sendHtml(res, 200, platformPage(section, locale, dist), PLATFORM_CONTENT_SECURITY_POLICY)
}

async function handle(req: IncomingMessage, res: ServerResponse, config: Config): Promise<void> {
  const url = new URL(req.url ?? '/', config.platformOrigin)
  if (url.pathname === '/healthz') {
    if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
    sendJson(res, 200, { status: 'ok' })
    return
  }
  if (url.pathname === '/assets/app.js') {
    if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
    sendScript(res)
    return
  }
  if (url.pathname.startsWith('/auth-api/') || url.pathname.startsWith('/api/')) {
    proxy(req, res, config)
    return
  }
  switch (url.pathname) {
    case '/dsh/authorize':
      if (req.method === 'GET') { await authorizeGet(res, url, config); return }
      if (req.method === 'POST') { await authorizePost(req, res, config); return }
      methodNotAllowed(res, 'GET, POST')
      return
    case '/dsh/authorized':
      if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
      sendHtml(res, 200, authorizedPage(
        localeFrom(url.searchParams.get('locale') ?? undefined),
        url.searchParams.get('login_source'),
      ), AUTH_CONTENT_SECURITY_POLICY)
      return
    case '/':
      if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
      sendPlatform(res, 'home', url)
      return
    case '/usage':
      if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
      sendPlatform(res, 'usage', url)
      return
    case '/top_up':
      if (req.method !== 'GET') { methodNotAllowed(res, 'GET'); return }
      sendPlatform(res, 'top-up', url)
      return
    default:
      res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' })
      res.end('not found')
  }
}

/**
 * Create the platform server without listening.
 * @param config - validated platform configuration.
 * @returns an unlistened HTTP server.
 */
export function createPlatformServer(config: Config): Server {
  return createServer((req, res) => {
    void handle(req, res, config).catch((error: unknown) => {
      if (res.headersSent) { res.destroy(); return }
      if (error instanceof RequestError) { sendJson(res, error.status, { error: error.status }); return }
      const message = error instanceof Error ? error.message : String(error)
      console.error(`topask-platform: request failed: ${message}`)
      sendJson(res, 500, { error: 'internal' })
    })
  })
}
