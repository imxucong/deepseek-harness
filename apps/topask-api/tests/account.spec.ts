/** Protocol behavior of the TopAsk account API. */
import { createHash, randomBytes } from 'node:crypto'
import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import type { Config } from '../src/config.ts'
import type { ProtocolEnvelope } from '../src/envelope.ts'
import { createApiServer } from '../src/server.ts'
import { MemoryStore } from '../src/store.ts'

const platformOrigin = 'http://127.0.0.1:8791'
const internalToken = 'test-internal-token'

const config: Config = {
  platformOrigin,
  internalToken,
  adminToken: 'test-admin-token',
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
  expect(authorizeUrl.origin).toBe(platformOrigin)
  return {
    authorizeId: biz.authorize_id,
    codeVerifier,
    state,
    redirect,
  }
}

async function approve(base: string, attempt: { authorizeId: string; state: string }): Promise<{ code: string; state: string }> {
  const response = await fetch(`${base}/internal/attempts/${encodeURIComponent(attempt.authorizeId)}/decision`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-topask-internal-token': internalToken },
    body: JSON.stringify({ action: 'approve', state: attempt.state }),
  })
  expect(response.status).toBe(200)
  const body = await response.json() as { redirect: string | null }
  if (body.redirect === null) throw new Error('approval returned no redirect')
  const target = new URL(body.redirect)
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

    const approved = await approve(base, attempt)
    expect(approved.state).toBe('state-1')

    const exchanged = await exchange(base, {
      code: approved.code, codeVerifier: attempt.codeVerifier, redirect: attempt.redirect,
    })
    expect(exchanged.data.biz_code).toBe(0)
    const grant = exchanged.data.biz_data as { token: string; authorized_url: string }
    expect(grant.token).toMatch(/^[\x21-\x7e]+$/)
    expect(grant.authorized_url).toBe(`${platformOrigin}/dsh/authorized?locale=zh_CN`)

    const profile = await current(base, grant.token)
    expect(profile.status).toBe(200)
    const profileEnvelope = await json(profile)
    expect(profileEnvelope.data.biz_data).toMatchObject({
      id: 'dev-user', email: 'dev@topask.local', id_profile: { name: 'TopAsk Dev', picture: null },
    })

    const summary = await fetch(`${base}/api/v0/users/get_user_summary`, { headers: { 'x-dsh-auth-token': grant.token } })
    expect((await json(summary)).data.biz_data).toMatchObject({
      normal_wallets: [{ currency: 'CNY', balance: '0.00' }],
      bonus_wallets: [{ currency: 'CNY', balance: '0.00' }],
    })

    const logout = await fetch(`${base}/auth-api/v0/users/logout`, {
      method: 'POST', headers: { 'x-dsh-auth-token': grant.token },
    })
    expect(logout.status).toBe(200)
    expect((await current(base, grant.token)).status).toBe(401)
  })

  it('serves attempts to the platform app only with the internal token', async () => {
    const base = await start()
    const attempt = await initialize(base)

    expect((await fetch(`${base}/internal/attempts/${attempt.authorizeId}`)).status).toBe(401)

    const response = await fetch(`${base}/internal/attempts/${attempt.authorizeId}`, {
      headers: { 'x-topask-internal-token': internalToken },
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toMatchObject({
      authorizeId: attempt.authorizeId,
      state: 'state-1',
      locale: 'zh_CN',
      user: { name: 'TopAsk Dev', email: 'dev@topask.local' },
    })
  })

  it('denies one attempt without issuing a redirect', async () => {
    const base = await start()
    const attempt = await initialize(base)

    const response = await fetch(`${base}/internal/attempts/${attempt.authorizeId}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-topask-internal-token': internalToken },
      body: JSON.stringify({ action: 'deny', state: attempt.state }),
    })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ redirect: null })
    expect((await fetch(`${base}/internal/attempts/${attempt.authorizeId}`, {
      headers: { 'x-topask-internal-token': internalToken },
    })).status).toBe(404)
  })

  it('refuses an internal decision with the wrong state', async () => {
    const base = await start()
    const attempt = await initialize(base)

    const response = await fetch(`${base}/internal/attempts/${attempt.authorizeId}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-topask-internal-token': internalToken },
      body: JSON.stringify({ action: 'approve', state: 'wrong-state' }),
    })
    expect(response.status).toBe(400)
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

    const fetched = await fetch(`${base}/internal/attempts/${attempt.authorizeId}`, {
      headers: { 'x-topask-internal-token': internalToken },
    })
    expect(fetched.status).toBe(200)
    const approval = await fetch(`${base}/internal/attempts/${attempt.authorizeId}/decision`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-topask-internal-token': internalToken },
      body: JSON.stringify({ action: 'approve', state: attempt.state }),
    })
    expect(approval.status).toBe(410)
  })
})
