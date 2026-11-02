/** Operator console: configuration, sessions, dev login, BFF actions, and OIDC sign-in. */
import { createServer, type IncomingMessage, type Server } from 'node:http'
import { exportJWK, generateKeyPair, SignJWT } from 'jose'
import { afterEach, describe, expect, it } from 'vitest'
import { createAdminServer } from '../src/server.ts'
import { loadConfig, type Config } from '../src/config.ts'
import {
  createSession, OIDC_COOKIE, safeReturnTo, SESSION_COOKIE, verifyOidcState, verifySession,
} from '../src/session.ts'

const servers: Server[] = []

async function listen(server: Server): Promise<string> {
  servers.push(server)
  return await new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address !== 'object' || address === null) throw new Error('test server has no address')
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((done) => { server.close(() => { done() }) })))
})

function json(res: import('node:http').ServerResponse, value: unknown): void {
  res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(value))
}

function body(req: IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')) })
  })
}

interface ApiState {
  readonly calls: { method: string | undefined; path: string; headers: IncomingMessage['headers'] }[]
  disabled: boolean
  balance: string
}

async function startApi(): Promise<{ base: string; state: ApiState }> {
  const state: ApiState = { calls: [], disabled: false, balance: '12.34' }
  const user = { id: 'u1', email: 'user@topask.local', name: 'User One', picture: null }
  const wallet = () => ({ userId: 'u1', currency: 'CNY', balanceCents: Math.round(Number(state.balance) * 100), bonusCents: 0, updatedAt: 1 })
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    state.calls.push({ method: req.method, path: url.pathname, headers: req.headers })
    if (url.pathname === '/admin-api/overview') { json(res, { users: 1, disabledUsers: state.disabled ? 1 : 0, grants: 1, devices: 1, attempts: 1 }); return }
    if (url.pathname === '/admin-api/users') { json(res, { users: [{ ...user, disabled: state.disabled }], total: 1 }); return }
    if (url.pathname === '/admin-api/users/u1') { json(res, { user: { ...user, disabled: state.disabled }, wallet: wallet(), bonuses: [] }); return }
    if (url.pathname === '/admin-api/users/u1/disabled') { state.disabled = true; json(res, { ok: true }); return }
    if (url.pathname === '/admin-api/grants') {
      json(res, { grants: [{ tokenHash: 'abcdef0123456789', userId: 'u1', deviceId: 'd1', expiresAt: 2, createdAt: 1, email: user.email, name: user.name }], total: 1 })
      return
    }
    if (url.pathname === '/admin-api/devices') { json(res, { devices: [{ id: 'd1', model: 'darwin-arm64', osVersion: 'Darwin 25', createdAt: 1 }], total: 1 }); return }
    if (url.pathname === '/admin-api/attempts') {
      json(res, { attempts: [{ authorizeId: 'a1', state: 's', codeChallenge: 'c', redirectUri: 'http://127.0.0.1:1/oauth/callback', locale: 'zh_CN', loginSource: 'desktop', userId: 'u1', expiresAt: 2, status: 'approved' }], total: 1 })
      return
    }
    if (url.pathname === '/admin-api/wallets') { json(res, { wallets: [wallet()], total: 1 }); return }
    if (url.pathname === '/admin-api/wallets/u1') { json(res, { user: { ...user, disabled: state.disabled }, wallet: wallet(), bonuses: [] }); return }
    if (url.pathname === '/admin-api/wallets/u1/balance') {
      void body(req).then((text) => {
        state.balance = String((JSON.parse(text) as { balance: unknown }).balance)
        json(res, { wallet: wallet() })
      })
      return
    }
    if (url.pathname === '/admin-api/wallets/u1/bonuses') { json(res, { bonus: {} }); return }
    if (url.pathname === '/admin-api/audit') {
      json(res, { entries: [{ id: 1, actorSubject: 'dev-operator', actorEmail: 'ops@topask.local', action: 'user.disable', target: 'u1', details: '{}', createdAt: 1 }], total: 1 })
      return
    }
    res.writeHead(404).end('not found')
  })
  return { base: await listen(server), state }
}

function devConfig(apiUrl: string): Config {
  return {
    origin: 'http://127.0.0.1:8792',
    host: '127.0.0.1',
    port: 0,
    apiUrl,
    adminToken: 'admin-token',
    sessionSecret: 'test-session-secret-at-least-32-characters',
    sessionTtlMs: 3_600_000,
    allowedSubjects: new Set(),
    allowedEmails: new Set(),
    devLogin: true,
    devOperator: { subject: 'dev-operator', email: 'ops@topask.local', name: 'TopAsk Operator' },
  }
}

async function startAdmin(config: Config): Promise<string> {
  return await listen(createAdminServer(config))
}

function cookieOf(response: Response, name: string): string {
  const header = response.headers.get('set-cookie') ?? ''
  const match = new RegExp(`${name}=([^;]+)`).exec(header)
  return match === null ? '' : `${name}=${match[1] ?? ''}`
}

function csrfFrom(html: string): string {
  const match = /name="_csrf" value="([^"]+)"/u.exec(html)
  if (match === null) throw new Error('page has no CSRF token')
  return match[1] as string
}

describe('configuration and sessions', () => {
  it('allows the loopback development login and rejects a public one', () => {
    const base = {
      TOPASK_ADMIN_ORIGIN: 'http://127.0.0.1:8792',
      TOPASK_API_URL: 'http://127.0.0.1:8790',
      TOPASK_ADMIN_TOKEN: 'admin-token',
      TOPASK_ADMIN_SESSION_SECRET: 'a'.repeat(32),
      TOPASK_ADMIN_DEV_LOGIN: '1',
    }
    expect(loadConfig(base)).toMatchObject({ devLogin: true, origin: 'http://127.0.0.1:8792' })
    expect(() => loadConfig({ ...base, TOPASK_ADMIN_ORIGIN: 'https://admin.example.com' })).toThrow(/loopback/)
    expect(() => loadConfig({ ...base, TOPASK_ADMIN_DEV_LOGIN: '0' })).toThrow(/OIDC/)
  })

  it('signs, verifies, expires, and rejects tampered sessions', () => {
    const secret = 's'.repeat(32)
    const token = createSession(secret, { subject: 'op', email: 'op@example.test', name: 'Op' }, 1_000, 10_000)
    expect(verifySession(secret, token, 10_500)).toMatchObject({ subject: 'op', email: 'op@example.test' })
    expect(verifySession(secret, token, 11_001)).toBeUndefined()
    expect(verifySession(secret, `${token}x`, 10_500)).toBeUndefined()
    expect(verifySession('x'.repeat(32), token, 10_500)).toBeUndefined()
    expect(safeReturnTo('//evil.example')).toBe('/')
    expect(safeReturnTo('/users?q=x')).toBe('/users?q=x')
  })
})

describe('operator console', () => {
  it('redirects anonymous visitors, signs in through the development login, and serves pages', async () => {
    const api = await startApi()
    const base = await startAdmin(devConfig(api.base))

    const anonymous = await fetch(`${base}/`, { redirect: 'manual' })
    expect(anonymous.status).toBe(302)
    expect(anonymous.headers.get('location')).toContain('/login')

    const aliased = await fetch(`${base}/auth/dev-login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { origin: base, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ returnTo: '/' }),
    })
    expect(aliased.status).toBe(302)

    const login = await fetch(`${base}/auth/dev-login`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ returnTo: '/' }),
    })
    expect(login.status).toBe(302)
    const session = cookieOf(login, SESSION_COOKIE)
    expect(session).toContain(SESSION_COOKIE)

    const overview = await fetch(`${base}/`, { headers: { cookie: session } })
    expect(overview.status).toBe(200)
    expect(await overview.text()).toContain('概览')

    const users = await (await fetch(`${base}/users`, { headers: { cookie: session } })).text()
    expect(users).toContain('User One')
    expect(api.state.calls.some(call => call.path === '/admin-api/users')).toBe(true)
    const headers = api.state.calls.find(call => call.path === '/admin-api/users')?.headers
    expect(headers?.['x-topask-admin-token']).toBe('admin-token')
    expect(headers?.['x-topask-operator-email']).toBe('ops@topask.local')

    const csrf = csrfFrom(users)
    const disabled = await fetch(`${base}/users/u1/disabled`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: session, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: csrf, disabled: 'true', returnTo: '/users' }),
    })
    expect(disabled.status).toBe(302)
    expect(api.state.disabled).toBe(true)

    const denied = await fetch(`${base}/users/u1/disabled`, {
      method: 'POST',
      headers: { cookie: session, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: 'wrong', disabled: 'true' }),
    })
    expect(denied.status).toBe(403)

    const wallet = await (await fetch(`${base}/wallets/u1`, { headers: { cookie: session } })).text()
    expect(wallet).toContain('12.34')
    const walletCsrf = csrfFrom(wallet)
    const updated = await fetch(`${base}/wallets/u1/balance`, {
      method: 'POST',
      redirect: 'manual',
      headers: { cookie: session, 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ _csrf: walletCsrf, balance: '20.00', returnTo: '/wallets/u1' }),
    })
    expect(updated.status).toBe(302)
    expect(api.state.balance).toBe('20.00')
  })

  it('signs in through OIDC and rejects an operator outside the allowlist', async () => {
    const { publicKey, privateKey } = await generateKeyPair('RS256')
    const jwk = await exportJWK(publicKey)
    let base = ''
    let nonce = ''
    const idp = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (url.pathname === '/.well-known/openid-configuration') {
        json(res, { issuer: base, authorization_endpoint: `${base}/authorize`, token_endpoint: `${base}/token`, jwks_uri: `${base}/jwks` })
        return
      }
      if (url.pathname === '/jwks') {
        json(res, { keys: [{ ...jwk, kid: 'test', alg: 'RS256', use: 'sig' }] })
        return
      }
      if (url.pathname === '/token') {
        void body(req).then(async () => {
          const idToken = await new SignJWT({ email: 'operator@topask.local', name: 'Operator', nonce })
            .setProtectedHeader({ alg: 'RS256', kid: 'test' })
            .setIssuer(base).setAudience('client-id').setSubject('op-1')
            .setIssuedAt().setExpirationTime('5m').sign(privateKey)
          res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ id_token: idToken }))
        })
        return
      }
      res.writeHead(404).end()
    })
    base = await listen(idp)

    const api = await startApi()
    const baseConfig = devConfig(api.base)
    const config: Config = {
      origin: baseConfig.origin,
      host: baseConfig.host,
      port: baseConfig.port,
      apiUrl: baseConfig.apiUrl,
      adminToken: baseConfig.adminToken,
      sessionSecret: baseConfig.sessionSecret,
      sessionTtlMs: baseConfig.sessionTtlMs,
      oidc: {
        issuer: base, clientId: 'client-id', clientSecret: 'secret',
        scopes: 'openid email profile', redirectUri: 'http://127.0.0.1:8792/auth/callback',
      },
      allowedSubjects: new Set(['op-1']),
      allowedEmails: new Set(),
      devLogin: false,
    }
    const admin = await startAdmin(config)

    const started = await fetch(`${admin}/auth/login?returnTo=/users`, { redirect: 'manual' })
    expect(started.status).toBe(302)
    const location = started.headers.get('location')
    if (location === null) throw new Error('OIDC login has no redirect')
    const target = new URL(location)
    expect(target.origin).toBe(base)
    expect(target.searchParams.get('code_challenge_method')).toBe('S256')
    const state = target.searchParams.get('state')
    if (state === null) throw new Error('OIDC login has no state')
    const oidcCookie = cookieOf(started, OIDC_COOKIE)
    const oidc = verifyOidcState(config.sessionSecret, oidcCookie.slice(OIDC_COOKIE.length + 1), Date.now())
    if (oidc === undefined) throw new Error('OIDC state cookie is invalid')
    nonce = oidc.nonce

    const callback = await fetch(`${admin}/auth/callback?state=${encodeURIComponent(state)}&code=code`, {
      redirect: 'manual', headers: { cookie: oidcCookie },
    })
    expect(callback.status).toBe(302)
    expect(callback.headers.get('location')).toBe('/users')
    const session = cookieOf(callback, SESSION_COOKIE)
    expect(session).not.toBe('')

    const users = await fetch(`${admin}/users`, { headers: { cookie: session } })
    expect(users.status).toBe(200)
    expect(api.state.calls.some(call => call.path === '/admin-api/users')).toBe(true)

    const disallowed: Config = { ...config, allowedSubjects: new Set() }
    const disallowedAdmin = await startAdmin(disallowed)
    const startedAgain = await fetch(`${disallowedAdmin}/auth/login`, { redirect: 'manual' })
    const locationAgain = startedAgain.headers.get('location')
    if (locationAgain === null) throw new Error('OIDC login has no redirect')
    const stateAgain = new URL(locationAgain).searchParams.get('state')
    const cookieAgain = cookieOf(startedAgain, OIDC_COOKIE)
    const oidcAgain = verifyOidcState(disallowed.sessionSecret, cookieAgain.slice(OIDC_COOKIE.length + 1), Date.now())
    if (oidcAgain === undefined || stateAgain === null) throw new Error('OIDC state cookie is invalid')
    nonce = oidcAgain.nonce
    const rejected = await fetch(`${disallowedAdmin}/auth/callback?state=${encodeURIComponent(stateAgain)}&code=code`, {
      redirect: 'manual', headers: { cookie: cookieAgain },
    })
    expect(rejected.status).toBe(403)
  })
})
