/** Process entry: load configuration, open persistence, and serve the account API. */
import { mkdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { loadConfig } from './config.ts'
import { createApiServer } from './server.ts'
import { openSqliteStore } from './store-sqlite.ts'

async function main(): Promise<void> {
  const config = loadConfig()
  const dataDir = resolve(config.dataDir)
  mkdirSync(dataDir, { recursive: true, mode: 0o700 })
  const store = await openSqliteStore(join(dataDir, 'account.sqlite'))
  const server = createApiServer({ config, store })
  await new Promise<void>((ready, fail) => {
    server.once('error', fail)
    server.listen(config.port, config.host, ready)
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : config.port
  console.log(`topask-api: listening on http://${config.host}:${port} (platform ${config.platformOrigin})`)

  let closing = false
  const shutdown = (): void => {
    if (closing) return
    closing = true
    server.close(() => { store.close() })
    server.closeAllConnections()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

await main()
