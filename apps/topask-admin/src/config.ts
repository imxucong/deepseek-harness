/** Validated operator console configuration resolved once before the server listens. */

/** OIDC provider settings for operator sign-in. */
export interface OidcConfig {
  readonly issuer: string
  readonly clientId: string
  readonly clientSecret: string
  readonly scopes: string
  readonly redirectUri: string
}

/** Explicit operator identity used by the loopback development login. */
export interface DevOperator {
  readonly subject: string
  readonly email: string
  readonly name: string
}

/** Operator console configuration; every deployment-varying value is validated here. */
export interface Config {
  /** Public origin the operator browser uses. */
  readonly origin: string
  /** Listen address. */
  readonly host: string
  /** Listen port; zero requests an OS-assigned port. */
  readonly port: number
  /** Internal account API origin. */
  readonly apiUrl: string
  /** Shared secret presented on the account API's admin endpoints. */
  readonly adminToken: string
  /** HMAC key for session and OIDC state cookies. */
  readonly sessionSecret: string
  /** Session lifetime in milliseconds. */
  readonly sessionTtlMs: number
  /** OIDC settings; absent only when the loopback development login is enabled. */
  readonly oidc?: OidcConfig
  /** OIDC subjects allowed to operate the console. */
  readonly allowedSubjects: ReadonlySet<string>
  /** OIDC emails allowed to operate the console, lowercased. */
  readonly allowedEmails: ReadonlySet<string>
  /** Whether the explicit loopback development login is enabled. */
  readonly devLogin: boolean
  /** Identity the development login signs in. */
  readonly devOperator?: DevOperator
}

function required(env: NodeJS.ProcessEnv, name: string): string {
  const value = env[name]?.trim()
  if (value === undefined || value === '') throw new Error(`topask-admin: ${name} is required`)
  return value
}

function integer(env: NodeJS.ProcessEnv, name: string, fallback: number, min: number, max: number): number {
  const raw = env[name]?.trim()
  const value = raw === undefined || raw === '' ? fallback : Number(raw)
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new Error(`topask-admin: ${name} must be an integer from ${min} through ${max}`)
  }
  return value
}

function list(env: NodeJS.ProcessEnv, name: string): ReadonlySet<string> {
  return new Set((env[name] ?? '').split(',').map(value => value.trim()).filter(value => value !== ''))
}

function emails(env: NodeJS.ProcessEnv, name: string): ReadonlySet<string> {
  return new Set([...list(env, name)].map(value => value.toLowerCase()))
}

/**
 * Validate one public origin: HTTPS, or loopback HTTP for development only.
 * @param value - configured origin.
 * @returns normalized origin without a trailing slash.
 */
export function publicOrigin(value: string): string {
  const url = new URL(value)
  const loopback = isLoopback(url.hostname)
  if (url.username !== '' || url.password !== '' || url.pathname !== '/' || url.search !== '' || url.hash !== ''
    || !(url.protocol === 'https:' || (loopback && url.protocol === 'http:'))) {
    throw new Error('topask-admin: TOPASK_ADMIN_ORIGIN must be an HTTPS origin, or loopback HTTP for development')
  }
  return url.origin
}

function isLoopback(hostname: string): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(hostname)
}

function internalUrl(value: string): string {
  const url = new URL(value)
  if (!['http:', 'https:'].includes(url.protocol) || url.username !== '' || url.password !== ''
    || url.pathname !== '/' || url.search !== '' || url.hash !== '') {
    throw new Error('topask-admin: TOPASK_API_URL must be an HTTP(S) origin without credentials, path, query or fragment')
  }
  return url.origin
}

function oidcOf(env: NodeJS.ProcessEnv, origin: string): OidcConfig | undefined {
  const issuer = env.TOPASK_ADMIN_OIDC_ISSUER?.trim()
  if (issuer === undefined || issuer === '') return undefined
  const url = new URL(issuer)
  if (url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '') {
    throw new Error('topask-admin: TOPASK_ADMIN_OIDC_ISSUER must be an origin or path without credentials, query or fragment')
  }
  const redirectUri = env.TOPASK_ADMIN_OIDC_REDIRECT_URI?.trim() || `${origin}/auth/callback`
  const redirect = new URL(redirectUri)
  if (redirect.origin !== origin || redirect.username !== '' || redirect.password !== ''
    || redirect.search !== '' || redirect.hash !== '') {
    throw new Error('topask-admin: TOPASK_ADMIN_OIDC_REDIRECT_URI must be on TOPASK_ADMIN_ORIGIN without query or fragment')
  }
  return {
    issuer,
    clientId: required(env, 'TOPASK_ADMIN_OIDC_CLIENT_ID'),
    clientSecret: required(env, 'TOPASK_ADMIN_OIDC_CLIENT_SECRET'),
    scopes: env.TOPASK_ADMIN_OIDC_SCOPES?.trim() || 'openid email profile',
    redirectUri,
  }
}

/**
 * Read configuration from the process environment.
 * @param env - environment map; defaults to the process environment.
 * @returns validated configuration.
 * @throws when a required value is absent, malformed, or the development login is not loopback-only.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const origin = publicOrigin(required(env, 'TOPASK_ADMIN_ORIGIN'))
  const devLogin = env.TOPASK_ADMIN_DEV_LOGIN?.trim() === '1'
  if (devLogin) {
    const url = new URL(origin)
    if (!isLoopback(url.hostname) || url.protocol !== 'http:') {
      throw new Error('topask-admin: TOPASK_ADMIN_DEV_LOGIN is only allowed on a loopback HTTP origin')
    }
  }
  const oidc = oidcOf(env, origin)
  if (!devLogin && oidc === undefined) {
    throw new Error('topask-admin: configure OIDC or enable TOPASK_ADMIN_DEV_LOGIN for loopback development')
  }
  const allowedSubjects = list(env, 'TOPASK_ADMIN_ALLOWED_SUBJECTS')
  const allowedEmails = emails(env, 'TOPASK_ADMIN_ALLOWED_EMAILS')
  if (!devLogin && allowedSubjects.size === 0 && allowedEmails.size === 0) {
    throw new Error('topask-admin: configure TOPASK_ADMIN_ALLOWED_SUBJECTS or TOPASK_ADMIN_ALLOWED_EMAILS')
  }
  const devOperator: DevOperator | undefined = devLogin
    ? {
      subject: env.TOPASK_ADMIN_DEV_OPERATOR_SUBJECT?.trim() || 'dev-operator',
      email: env.TOPASK_ADMIN_DEV_OPERATOR_EMAIL?.trim() || 'ops@topask.local',
      name: env.TOPASK_ADMIN_DEV_OPERATOR_NAME?.trim() || 'TopAsk Operator',
    }
    : undefined
  return {
    origin,
    host: env.TOPASK_ADMIN_HOST?.trim() || '127.0.0.1',
    port: integer(env, 'TOPASK_ADMIN_PORT', 8792, 0, 65_535),
    apiUrl: internalUrl(required(env, 'TOPASK_API_URL')),
    adminToken: required(env, 'TOPASK_ADMIN_TOKEN'),
    sessionSecret: (() => {
      const secret = required(env, 'TOPASK_ADMIN_SESSION_SECRET')
      if (secret.length < 32) throw new Error('topask-admin: TOPASK_ADMIN_SESSION_SECRET must be at least 32 characters')
      return secret
    })(),
    sessionTtlMs: integer(env, 'TOPASK_ADMIN_SESSION_HOURS', 8, 1, 24 * 30) * 3_600_000,
    ...(oidc === undefined ? {} : { oidc }),
    allowedSubjects,
    allowedEmails,
    devLogin,
    ...(devOperator === undefined ? {} : { devOperator }),
  }
}

/**
 * Whether one authenticated identity may operate the console.
 * @param config - validated configuration.
 * @param subject - OIDC subject.
 * @param email - OIDC email or subject fallback.
 * @returns true when the identity is the development operator or an allowlisted operator.
 */
export function operatorAllowed(config: Config, subject: string, email: string): boolean {
  if (config.devLogin && config.devOperator?.subject === subject) return true
  return config.allowedSubjects.has(subject) || config.allowedEmails.has(email.toLowerCase())
}
