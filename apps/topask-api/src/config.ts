/** Validated deployment choices resolved once before the account API listens. */

/** Fixed identity the development authorize page signs in. */
export interface DevUser {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly picture: string | null
}

/** Account API configuration; every deployment-varying value is validated here. */
export interface Config {
  /** Public platform origin browsers and the account provider use, without a trailing slash. */
  readonly platformOrigin: string
  /** Shared secret the platform app presents on internal endpoints. */
  readonly internalToken: string
  /** Listen address. */
  readonly host: string
  /** Listen port; zero requests an OS-assigned port. */
  readonly port: number
  /** Directory holding the account database. */
  readonly dataDir: string
  /** Lifetime of one browser sign-in attempt. */
  readonly attemptTtlMs: number
  /** Lifetime of one issued account token. */
  readonly tokenTtlMs: number
  /** Identity source for the authorize page. */
  readonly identity: { readonly kind: 'dev'; readonly user: DevUser }
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim()
  if (value === undefined || value === '') throw new Error(`topask-api: ${name} is required`)
  return value
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim()
  const value = raw === undefined || raw === '' ? fallback : Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`topask-api: ${name} must be an integer from ${min} through ${max}`)
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
    throw new Error('topask-api: TOPASK_PLATFORM_ORIGIN must be an HTTPS origin, or loopback HTTP for development')
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
  const identity = env.TOPASK_API_IDENTITY?.trim() || 'dev'
  if (identity !== 'dev') {
    throw new Error('topask-api: TOPASK_API_IDENTITY must be "dev" until another identity source ships')
  }
  return {
    platformOrigin: publicOrigin(required(env, 'TOPASK_PLATFORM_ORIGIN')),
    internalToken: required(env, 'TOPASK_INTERNAL_TOKEN'),
    host: env.TOPASK_API_HOST?.trim() || '127.0.0.1',
    port: integer(env, 'TOPASK_API_PORT', 8790, 0, 65_535),
    dataDir: env.TOPASK_API_DATA_DIR?.trim() || '.topask-api',
    attemptTtlMs: integer(env, 'TOPASK_API_ATTEMPT_TTL_SECONDS', 600, 30, 3600) * 1000,
    tokenTtlMs: integer(env, 'TOPASK_API_TOKEN_TTL_DAYS', 30, 1, 365) * 24 * 60 * 60 * 1000,
    identity: {
      kind: 'dev',
      user: {
        id: env.TOPASK_API_DEV_USER_ID?.trim() || 'topask-dev-user',
        email: env.TOPASK_API_DEV_USER_EMAIL?.trim() || 'dev@topask.local',
        name: env.TOPASK_API_DEV_USER_NAME?.trim() || 'TopAsk Dev',
        picture: env.TOPASK_API_DEV_USER_PICTURE?.trim() || null,
      },
    },
  }
}
