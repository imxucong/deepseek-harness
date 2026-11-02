/** Development entry: fill unset configuration from the committed defaults, then start the service. */
import { fileURLToPath } from 'node:url'

process.loadEnvFile(fileURLToPath(new URL('../.env.development', import.meta.url)))
void import('./index.ts').catch((error: unknown) => {
  console.error(error)
  process.exitCode = 1
})
