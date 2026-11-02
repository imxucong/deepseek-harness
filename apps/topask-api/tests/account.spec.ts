/** Protocol behavior of the TopAsk account API. */
import { createHash, randomBytes } from 'node:crypto'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import type { Config } from '../src/config.ts'
import type { ProtocolEnvelope } from '../src/envelope.ts'
import { createApiServer } from '../src/server.ts'
import { MemoryStore } from '../src/store.ts'

const config: Config = {
  origin: 'http://127.0.0.1:8790',
  host: '127.0.0.1',
  port: 0,
  dataDir: '',
  attemptTtlMs: 600_000,
  tokenTtlMs: 30 * 24 * 60 * 60 * 1000,
  identity: {
    kind: 'dev',
    user: { id: 'dev-user', email: 'dev@topask.local', name: 'TopAsk Dev', picture: null },
  },
}

const redirectUri = 'http://127.0.0.1:43111/oauth/callback'

function verifier(): string { return randomBytes(32).toString('base64url') }
function challenge(value: string): string { return createHash('sha256').update(value).digest('base64url') }

const servers: Server[] = []

async function start(now?: () => number): Promise<string> {
  const server = createApiServer({
    config,
    store: new MemoryStore(),
    ...(now === undefined ? {} : { now }),
  })
  servers.push(server)
  await new Promise<void>((ready) => { server.listen(0, '127.0.0.1', ready) })
  const address = server.address()
  if (typeof address !== 'object' || address === null) throw new Error('test server has no address')
  return `http://127.0.0.1:${address.port}`
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((done) => { server.close(() => { done() }) })))
})

async function json(response: Response): Promise<ProtocolEnvelope> {
  return await response.json() as ProtocolEnvelope
}

async function initialize(base: string, state = 'state-1', redirect = redirectUri): Promise<{
  authorizeId: string
  authorizePath: string
  codeVerifier: string
  state: string
  redirect: string
}> {
  const codeVerifier = verifier()
  const response = await fetch(`${base}/auth-api/v0/dsh/auth_init`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code_challenge: challenge(codeVerifier),
      code_challenge_method: 'S256',
      state,
      redirect_uri: redirect,
      locale: 'zh_CN',
      login_source: 'desktop',
    }),
  })
  const envelope = await json(response)
  if (envelope.data.biz_code !== 0) throw new Error(`auth_init failed: ${String(envelope.data.biz_code)}`)
  const biz = envelope.data.biz_data as { authorize_url: string; authorize_id: string; expires_in: number }
  const authorizeUrl = new URL(biz.authorize_url)
  return {
    authorizeId: biz.authorize_id,
    authorizePath: `${authorizeUrl.pathname}${authorizeUrl.search}`,
    codeVerifier,
    state,
    redirect,
  }
}

async function approve(base: string, attempt: { authorizeId: string; state: string }): Promise<{ code: string; state: string }> {
  const response = await fetch(`${base}/dsh/authorize`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ authorize_id: attempt.authorizeId, state: attempt.state, action: 'approve' }),
    redirect: 'manual',
  })
  expect(response.status).toBe(303)
  const location = response.headers.get('location')
  if (location === null) throw new Error('approval has no location')
  const target = new URL(location)
  return { code: target.searchParams.get('code') ?? '', state: target.searchParams.get('state') ?? '' }
}

async function exchange(base: string, attempt: {
  code: string
  codeVerifier: string
  redirect: string
}): Promise<ProtocolEnvelope> {
  const response = await fetch(`${base}/auth-api/v0/dsh/auth_exchange`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      code: attempt.code,
      code_verifier: attempt.codeVerifier,
      redirect_uri: attempt.redirect,
      device_id: '11111111-1111-4111-8111-111111111111',
      device_model: 'darwin-arm64',
      os_version: 'Darwin 25.0.0',
    }),
  })
  return await json(response)
}

async function current(base: string, token: string): Promise<Response> {
  return await fetch(`${base}/auth-api/v0/users/current`, { headers: { 'x-dsh-auth-token': token } })
}

describe('account protocol', () => {
  it('completes init, browser approval, exchange, profile read, and logout', async () => {
    const base = await start()
    const attempt = await initialize(base)

    const page = await fetch(`${base}${attempt.authorizePath}`)
    expect(page.status).toBe(200)
    // The approval redirects to the Host callback on another loopback port.
    expect(page.headers.get('content-security-policy')).toContain(
      "form-action 'self' http://127.0.0.1:* http://localhost:* http://[::1]:*",
    )
    expect(await page.text()).toContain('TopAsk Dev')

    const approved = await approve(base, attempt)
    expect(approved.state).toBe('state-1')

    const exchanged = await exchange(base, {
      code: approved.code, codeVerifier: attempt.codeVerifier, redirect: attempt.redirect,
    })
    expect(exchanged.data.biz_code).toBe(0)
    const grant = exchanged.data.biz_data as { token: string; authorized_url: string }
    expect(grant.token).toMatch(/^[\x21-\x7e]+$/)
    expect(grant.authorized_url).toBe('http://127.0.0.1:8790/dsh/authorized?locale=zh_CN')

    const profile = await current(base, grant.token)
    expect(profile.status).toBe(200)
    const profileEnvelope = await json(profile)
    expect(profileEnvelope.data.biz_data).toMatchObject({
      id: 'dev-user', email: 'dev@topask.local', id_profile: { name: 'TopAsk Dev', picture: null },
    })

    const summary = await fetch(`${base}/api/v0/users/get_user_summary`, { headers: { 'x-dsh-auth-token': grant.token } })
    expect((await json(summary)).data.biz_data).toMatchObject({ normal_wallets: [{ currency: 'CNY', balance: '0.00' }] })

    const logout = await fetch(`${base}/auth-api/v0/users/logout`, {
      method: 'POST', headers: { 'x-dsh-auth-token': grant.token },
    })
    expect(logout.status).toBe(200)
    expect((await current(base, grant.token)).status).toBe(401)
  })

  it('renders the branded consent and completion pages', async () => {
    const base = await start()
    const attempt = await initialize(base)

    const consent = await fetch(`${base}${attempt.authorizePath}`)
    const consentHtml = await consent.text()
    expect(consentHtml).toContain('允许登录 TopAsk')
    expect(consentHtml).toContain('TopAsk Dev')
    expect(consentHtml).toContain('action="/dsh/authorize"')
    expect(consentHtml).toContain('class="brand-pane"')

    const desktop = await fetch(`${base}/dsh/authorized?locale=zh_CN&login_source=desktop`)
    const desktopHtml = await desktop.text()
    expect(desktopHtml).toContain('登录成功')
    expect(desktopHtml).toContain('href="dsh://open"')
    expect(desktopHtml).toContain('共探智能上限')

    const web = await fetch(`${base}/dsh/authorized?locale=en_US&login_source=web`)
    const webHtml = await web.text()
    expect(webHtml).toContain('Signed in')
    expect(webHtml).not.toContain('dsh://open')

    const missing = await fetch(`${base}/dsh/authorize?authorize_id=missing`)
    expect(missing.status).toBe(404)
    expect(await missing.text()).toContain('登录请求不存在')
  })

  it('refuses a wrong PKCE verifier without consuming the code', async () => {
    const base = await start()
    const attempt = await initialize(base)
    const approved = await approve(base, attempt)

    const rejected = await exchange(base, {
      code: approved.code, codeVerifier: 'wrong-verifier', redirect: attempt.redirect,
    })
    expect(rejected.data.biz_code).not.toBe(0)

    const accepted = await exchange(base, {
      code: approved.code, codeVerifier: attempt.codeVerifier, redirect: attempt.redirect,
    })
    expect(accepted.data.biz_code).toBe(0)
  })

  it('consumes an authorization code once', async () => {
    const base = await start()
    const attempt = await initialize(base)
    const approved = await approve(base, attempt)

    const first = await exchange(base, {
      code: approved.code, codeVerifier: attempt.codeVerifier, redirect: attempt.redirect,
    })
    expect(first.data.biz_code).toBe(0)

    const replay = await exchange(base, {
      code: approved.code, codeVerifier: attempt.codeVerifier, redirect: attempt.redirect,
    })
    expect(replay.data.biz_code).not.toBe(0)
  })

  it('rejects a non-loopback redirect', async () => {
    const base = await start()
    const response = await fetch(`${base}/auth-api/v0/dsh/auth_init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code_challenge: challenge(verifier()),
        code_challenge_method: 'S256',
        state: 'state-1',
        redirect_uri: 'https://attacker.example/oauth/callback',
      }),
    })
    expect(response.status).toBe(400)
  })

  it('expires attempts and refuses stale approval', async () => {
    let clock = 1_000_000
    const base = await start(() => clock)
    const attempt = await initialize(base)
    clock += 600_001

    expect((await fetch(`${base}${attempt.authorizePath}`)).status).toBe(410)
    const approval = await fetch(`${base}/dsh/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ authorize_id: attempt.authorizeId, state: attempt.state, action: 'approve' }),
    })
    expect(approval.status).toBe(410)
  })
})
