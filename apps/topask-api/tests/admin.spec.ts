/** Operator admin API behavior: identity, user control, grants, wallets, and audit. */
import type { Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { hashSecret } from '../src/auth.ts'
import type { Config } from '../src/config.ts'
import { createApiServer } from '../src/server.ts'
import { MemoryStore } from '../src/store.ts'

const config: Config = {
  platformOrigin: 'http://127.0.0.1:8791',
  internalToken: 'internal-token',
  adminToken: 'admin-token',
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

const adminHeaders = {
  'x-topask-admin-token': config.adminToken,
  'x-topask-operator-subject': 'operator-1',
  'x-topask-operator-email': 'ops@topask.local',
}

const servers: Server[] = []

async function start(): Promise<{ base: string; store: MemoryStore }> {
  const store = new MemoryStore()
  const server = createApiServer({ config, store })
  servers.push(server)
  await new Promise<void>((ready) => { server.listen(0, '127.0.0.1', ready) })
  const address = server.address()
  if (typeof address !== 'object' || address === null) throw new Error('test server has no address')
  return { base: `http://127.0.0.1:${address.port}`, store }
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((done) => { server.close(() => { done() }) })))
})

async function admin(base: string, path: string,
  init: { method?: string; body?: string; headers?: Record<string, string> } = {}): Promise<Response> {
  return await fetch(`${base}/admin-api/${path}`, {
    headers: { ...adminHeaders, ...init.headers },
    ...(init.method === undefined ? {} : { method: init.method }),
    ...(init.body === undefined ? {} : { body: init.body }),
  })
}

function seed(store: MemoryStore): void {
  store.upsertUser(config.identity.user)
}

describe('operator admin API', () => {
  it('requires the admin token and an operator identity', async () => {
    const { base } = await start()
    expect((await fetch(`${base}/admin-api/overview`)).status).toBe(401)
    expect((await fetch(`${base}/admin-api/overview`, {
      headers: { 'x-topask-admin-token': config.adminToken },
    })).status).toBe(401)
    expect((await admin(base, 'overview')).status).toBe(200)
  })

  it('lists and disables users, blocking sign-in and existing grants', async () => {
    const { base, store } = await start()
    seed(store)
    store.createGrant({ tokenHash: hashSecret('token'), userId: 'dev-user', deviceId: 'd1', expiresAt: Date.now() + 60_000 })

    const listed = await admin(base, 'users?q=dev')
    expect(await listed.json()).toMatchObject({ users: [{ id: 'dev-user', disabled: false }], total: 1 })

    const disabled = await admin(base, 'users/dev-user/disabled', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ disabled: true }),
    })
    expect(disabled.status).toBe(200)
    expect(await (await admin(base, 'users')).json()).toMatchObject({ users: [{ disabled: true }] })
    expect(await (await admin(base, 'overview')).json()).toMatchObject({ disabledUsers: 1 })

    const init = await fetch(`${base}/auth-api/v0/dsh/auth_init`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        code_challenge: 'challenge',
        code_challenge_method: 'S256',
        state: 'state-1',
        redirect_uri: 'http://127.0.0.1:43111/oauth/callback',
      }),
    })
    const initBody = await init.json() as { data: { biz_code: number } }
    expect(initBody.data.biz_code).toBe(3)

    expect((await fetch(`${base}/api/v0/users/get_user_summary`, {
      headers: { 'x-dsh-auth-token': 'token' },
    })).status).toBe(401)

    const audit = await (await admin(base, 'audit')).json() as { entries: { action: string; actorEmail: string }[] }
    expect(audit.entries[0]).toMatchObject({ action: 'user.disable', actorEmail: 'ops@topask.local' })
  })

  it('revokes grants and records the action', async () => {
    const { base, store } = await start()
    seed(store)
    const tokenHash = hashSecret('token')
    store.createGrant({ tokenHash, userId: 'dev-user', deviceId: 'd1', expiresAt: Date.now() + 60_000 })
    const response = await admin(base, `grants/${encodeURIComponent(tokenHash)}`, { method: 'DELETE' })
    expect(response.status).toBe(200)
    expect(store.findGrant(tokenHash, Date.now())).toBeUndefined()
    const audit = await (await admin(base, 'audit')).json() as { entries: { action: string }[] }
    expect(audit.entries[0]?.action).toBe('grant.revoke')
  })

  it('sets balances, grants bonuses, and reflects them through the account API', async () => {
    const { base, store } = await start()
    seed(store)
    store.createGrant({ tokenHash: hashSecret('token'), userId: 'dev-user', deviceId: 'd1', expiresAt: Date.now() + 60_000 })

    const balance = await admin(base, 'wallets/dev-user/balance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ balance: '12.34' }),
    })
    expect(balance.status).toBe(200)
    const bonus = await admin(base, 'wallets/dev-user/bonuses', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ amount: '5.00', title: 'Welcome', message: 'Welcome to TopAsk' }),
    })
    expect(bonus.status).toBe(200)

    const summary = await (await fetch(`${base}/api/v0/users/get_user_summary`, {
      headers: { 'x-dsh-auth-token': 'token' },
    })).json() as {
      data: {
        biz_data: {
          normal_wallets: { currency: string; balance: string }[]
          bonus_wallets: { currency: string; balance: string }[]
        }
      }
    }
    expect(summary.data.biz_data).toMatchObject({
      normal_wallets: [{ currency: 'CNY', balance: '12.34' }],
      bonus_wallets: [{ currency: 'CNY', balance: '5.00' }],
    })

    const bonuses = await (await fetch(`${base}/api/v0/users/get_unnotified_bonuses`, {
      headers: { 'x-dsh-auth-token': 'token' },
    })).json() as { data: { biz_data: { order_id: string; amount: string; msg: string }[] } }
    expect(bonuses.data.biz_data).toHaveLength(1)
    expect(bonuses.data.biz_data[0]).toMatchObject({ amount: '5.00', msg: 'Welcome to TopAsk' })

    const orderId = bonuses.data.biz_data[0]?.order_id
    if (orderId === undefined) throw new Error('bonus has no order id')
    await fetch(`${base}/api/v0/users/ack_bonus_notified`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-dsh-auth-token': 'token' },
      body: JSON.stringify({ order_id: orderId }),
    })
    const after = await (await fetch(`${base}/api/v0/users/get_unnotified_bonuses`, {
      headers: { 'x-dsh-auth-token': 'token' },
    })).json() as { data: { biz_data: unknown[] } }
    expect(after.data.biz_data).toEqual([])

    const audit = await (await admin(base, 'audit')).json() as { entries: { action: string }[] }
    expect(audit.entries.map(entry => entry.action)).toEqual(expect.arrayContaining(['wallet.balance', 'bonus.grant']))
  })
})
