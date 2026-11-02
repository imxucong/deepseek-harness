/** Validated platform configuration resolved once before the server listens. */

/** Platform configuration; every deployment-varying value is validated here. */
export interface Config {
  /** Public origin browsers and the account provider use, without a trailing slash. */
  readonly platformOrigin: string
  /** Listen address. */
  readonly host: string
  /** Listen port; zero requests an OS-assigned port. */
  readonly port: number
  /** Internal account API origin this server proxies and calls. */
  readonly apiUrl: string
  /** Shared secret presented on the account API's internal endpoints. */
  readonly internalToken: string
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim()
  if (value === undefined || value === '') throw new Error(`topask-platform: ${name} is required`)
  return value
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim()
  const value = raw === undefined || raw === '' ? fallback : Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`topask-platform: ${name} must be an integer from ${min} through ${max}`)
  }
  return value
}

/**
 * Validate one public origin: HTTPS, or loopback HTTP for development only.
 * @param value - configured origin.
 * @returns normalized origin without a trailing slash.
 */
export function publicOrigin(value: string): string {
  const url = new URL(value)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== ''
    || !(url.protocol === 'https:' || (loopback && url.protocol === 'http:'))) {
    throw new Error('topask-platform: TOPASK_PLATFORM_ORIGIN must be an HTTPS origin, or loopback HTTP for development')
  }
  return url.origin
}

/**
 * Validate the internal account API origin.
 * @param value - configured API base URL.
 * @returns normalized origin without a trailing slash.
 */
function internalUrl(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== ''
    || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error('topask-platform: TOPASK_API_URL must be an HTTP(S) origin without credentials, path, query or fragment')
  }
  return url.origin
}

/**
 * Read configuration from the process environment.
 * @param env - environment map; defaults to the process environment.
 * @returns validated configuration.
 * @throws when a required value is absent or malformed.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return {
    platformOrigin: publicOrigin(required(env, 'TOPASK_PLATFORM_ORIGIN')),
    host: env.TOPASK_PLATFORM_HOST?.trim() || '127.0.0.1',
    port: integer(env, 'TOPASK_PLATFORM_PORT', 8791, 0, 65_535),
    apiUrl: internalUrl(required(env, 'TOPASK_API_URL')),
    internalToken: required(env, 'TOPASK_INTERNAL_TOKEN'),
  }
}
