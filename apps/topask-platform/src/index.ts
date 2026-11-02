/** Process entry: load configuration, start the platform server, and close it on signals. */
import { loadConfig } from './config.ts'
import { createPlatformServer } from './server.ts'

async function main(): Promise<void> {
  const config = loadConfig()
  const server = createPlatformServer(config)
  await new Promise<void>((ready, fail) => {
    server.once('error', fail)
    server.listen(config.port, config.host, ready)
  })
  const address = server.address()
  const port = typeof address === 'object' && address !== null ? address.port : config.port
  console.log(`topask-platform: listening on http://${config.host}:${port} (origin ${config.platformOrigin})`)

  let closing = false
  const shutdown = (): void => {
    if (closing) return
    closing = true
    server.close()
    server.closeAllConnections()
  }
  process.once('SIGINT', shutdown)
  process.once('SIGTERM', shutdown)
}

await main()
