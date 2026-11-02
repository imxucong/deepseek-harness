/** Browser-page and proxy behavior of the TopAsk platform. */
import { createServer, type Server } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import type { Config } from '../src/config.ts'
import { createPlatformServer } from '../src/server.ts'

const internalToken = 'test-internal-token'
const attempt = {
  authorizeId: 'attempt-1',
  state: 'state-1',
  locale: 'zh_CN',
  loginSource: 'desktop',
  expiresAt: Date.now() + 60_000,
  user: { name: 'TopAsk Dev', email: 'dev@topask.local' },
}

const servers: Server[] = []

function listen(server: Server): Promise<string> {
  servers.push(server)
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      if (typeof address !== 'object' || address === null) throw new Error('test server has no address')
      resolve(`http://127.0.0.1:${address.port}`)
    })
  })
}

function bodyOf(req: import('node:http').IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []
    req.on('data', (chunk: Buffer) => { chunks.push(chunk) })
    req.on('end', () => { resolve(Buffer.concat(chunks).toString('utf8')) })
    req.on('error', reject)
  })
}

function envelope(bizData: unknown): string {
  return JSON.stringify({ code: 0, data: { biz_code: 0, biz_data: bizData } })
}

async function start(stubDecision = { redirect: 'http://127.0.0.1:43111/oauth/callback?code=code-1&state=state-1' }): Promise<{
  platform: string
  api: string
}> {
  const api = createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1')
    if (url.pathname.startsWith('/internal/')) {
      if (req.headers['x-topask-internal-token'] !== internalToken) {
        res.writeHead(401, { 'content-type': 'application/json' }).end('{"error":"unauthorized"}')
        return
      }
    }
    if (req.method === 'GET' && url.pathname === `/internal/attempts/${attempt.authorizeId}`) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(attempt))
      return
    }
    if (req.method === 'POST' && url.pathname === `/internal/attempts/${attempt.authorizeId}/decision`) {
      void bodyOf(req).then((body) => {
        const value = JSON.parse(body) as { action: string; state: string }
        if (value.state !== attempt.state) {
          res.writeHead(400, { 'content-type': 'application/json' }).end('{"error":"state-mismatch"}')
          return
        }
        res.writeHead(200, { 'content-type': 'application/json' })
          .end(JSON.stringify(value.action === 'approve' ? stubDecision : { redirect: null }))
      })
      return
    }
    if (req.method === 'GET' && url.pathname === '/api/v0/users/get_user_summary') {
      res.writeHead(200, { 'content-type': 'application/json' })
        .end(envelope({ normal_wallets: [{ currency: 'CNY', balance: '12.34' }], bonus_wallets: [] }))
      return
    }
    if (req.method === 'GET' && url.pathname === '/auth-api/v0/users/current') {
      res.writeHead(200, { 'content-type': 'application/json' })
        .end(envelope({ id: 'dev-user', email: 'dev@topask.local', id_profile: { name: 'TopAsk Dev', picture: null } }))
      return
    }
    res.writeHead(404, { 'content-type': 'text/plain' }).end('not found')
  })
  const apiOrigin = await listen(api)
  const config: Config = {
    platformOrigin: 'http://127.0.0.1:8791',
    host: '127.0.0.1',
    port: 0,
    apiUrl: apiOrigin,
    internalToken,
  }
  return { platform: await listen(createPlatformServer(config)), api: apiOrigin }
}

afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((done) => { server.close(() => { done() }) })))
})

describe('authorization pages', () => {
  it('renders the consent page from the account API', async () => {
    const { platform } = await start()
    const response = await fetch(`${platform}/dsh/authorize?authorize_id=${attempt.authorizeId}`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-security-policy')).toContain("form-action 'self'")
    const html = await response.text()
    expect(html).toContain('允许登录 TopAsk')
    expect(html).toContain('TopAsk Dev')
    expect(html).toContain('action="/dsh/authorize"')
  })

  it('reports a missing attempt', async () => {
    const { platform } = await start()
    const response = await fetch(`${platform}/dsh/authorize?authorize_id=missing`)
    expect(response.status).toBe(404)
    expect(await response.text()).toContain('登录请求不存在')
  })

  it('redirects to the Host callback after approval', async () => {
    const { platform } = await start()
    const response = await fetch(`${platform}/dsh/authorize`, {
      method: 'POST',
      redirect: 'manual',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        authorize_id: attempt.authorizeId, state: attempt.state, action: 'approve', locale: 'zh_CN',
      }),
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('http://127.0.0.1:43111/oauth/callback?code=code-1&state=state-1')
  })

  it('renders cancellation and state failures', async () => {
    const { platform } = await start()
    const denied = await fetch(`${platform}/dsh/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        authorize_id: attempt.authorizeId, state: attempt.state, action: 'deny', locale: 'zh_CN',
      }),
    })
    expect(denied.status).toBe(200)
    expect(await denied.text()).toContain('已取消登录')

    const mismatched = await fetch(`${platform}/dsh/authorize`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        authorize_id: attempt.authorizeId, state: 'wrong', action: 'approve', locale: 'zh_CN',
      }),
    })
    expect(mismatched.status).toBe(400)
    expect(await mismatched.text()).toContain('登录状态不匹配')
  })

  it('renders the completion page in both languages', async () => {
    const { platform } = await start()
    const desktop = await (await fetch(`${platform}/dsh/authorized?locale=zh_CN&login_source=desktop`)).text()
    expect(desktop).toContain('登录成功')
    expect(desktop).toContain('href="dsh://open"')
    const web = await (await fetch(`${platform}/dsh/authorized?locale=en_US&login_source=web`)).text()
    expect(web).toContain('Signed in')
    expect(web).not.toContain('dsh://open')
  })
})

describe('signed-in platform', () => {
  it('renders the home, usage, and top-up surfaces', async () => {
    const { platform } = await start()
    for (const path of ['/', '/usage', '/top_up']) {
      const response = await fetch(`${platform}${path}`)
      expect(response.status).toBe(200)
      expect(response.headers.get('content-security-policy')).toContain("script-src 'self'")
      const html = await response.text()
      expect(html).toContain('TopAsk Platform')
      expect(html).toContain('src="/assets/app.js"')
    }
    expect(await (await fetch(`${platform}/?locale=en_US`)).text()).toContain('Account overview')
  })

  it('serves the browser script', async () => {
    const { platform } = await start()
    const response = await fetch(`${platform}/assets/app.js`)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toContain('text/javascript')
    expect(await response.text()).toContain('x-dsh-auth-token')
  })

  it('proxies account reads and never exposes internal endpoints', async () => {
    const { platform } = await start()
    const summary = await fetch(`${platform}/api/v0/users/get_user_summary`, {
      headers: { 'x-dsh-auth-token': 'token' },
    })
    expect(summary.status).toBe(200)
    expect(await summary.text()).toContain('12.34')
    expect((await fetch(`${platform}/internal/attempts/${attempt.authorizeId}`)).status).toBe(404)
  })
})
