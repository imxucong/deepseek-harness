/** Native account commands and Gateway state stream; no renderer receives credentials. */
import { randomUUID } from 'node:crypto'
import WebSocket from 'ws'
import { parseRemoteStreamServerMessage, REMOTE_STREAM_MUX_PATH } from '@deepseek-ai/dsh-api-gateway/stream-protocol'
import type { AccountClientMetadata, AccountProviderId, AccountView, SignInAttemptId } from '@deepseek-ai/dsh-deepseek-account/types'

/** Authenticated unary caller shared with native onboarding. */
export type AccountInvoke = (request: { namespace: string; method: string; args: Record<string, unknown> }) => Promise<unknown>

/** Decode the UI-safe state received across HTTP or WebSocket. @param value - wire value. @returns account projection. */
export function accountView(value: unknown): AccountView {
  if (typeof value !== 'object' || value === null || !('status' in value)
    || !['signed-out', 'credential-stored'].includes(String(value.status)) || !('attempt' in value)) {
    throw new Error('desktop account: invalid state')
  }
  if (!('links' in value) || typeof value.links !== 'object' || value.links === null
    || !('usageUrl' in value.links) || typeof value.links.usageUrl !== 'string'
    || !('topUpUrl' in value.links) || typeof value.links.topUpUrl !== 'string') {
    throw new Error('desktop account: invalid platform links')
  }
  validateBrowserDestination(value.links.usageUrl)
  validateBrowserDestination(value.links.topUpUrl)
  const attempt = value.attempt
  if (attempt !== null && (typeof attempt !== 'object' || !('id' in attempt) || typeof attempt.id !== 'string'
    || !('phase' in attempt) || !['initializing', 'waiting-browser', 'exchanging', 'committing', 'succeeded', 'cancelled', 'expired', 'failed'].includes(String(attempt.phase))
    || ('authorizeUrl' in attempt && typeof attempt.authorizeUrl !== 'string')
    || ('expiresAt' in attempt && (typeof attempt.expiresAt !== 'number' || !Number.isFinite(attempt.expiresAt)))
    || ('errorCode' in attempt && !['no-response', 'network', 'protocol', 'expired', 'storage'].includes(String(attempt.errorCode))))) {
    throw new Error('desktop account: invalid attempt')
  }
  if (attempt !== null && 'authorizeUrl' in attempt) {
    validateBrowserDestination(String(attempt.authorizeUrl))
  }
  const parsed = value as AccountView
  return {
    status: parsed.status,
    links: { usageUrl: parsed.links.usageUrl, topUpUrl: parsed.links.topUpUrl },
    attempt: parsed.attempt === null ? null : {
      id: parsed.attempt.id, phase: parsed.attempt.phase,
      ...parsed.attempt.authorizeUrl === undefined ? {} : { authorizeUrl: parsed.attempt.authorizeUrl },
      ...parsed.attempt.expiresAt === undefined ? {} : { expiresAt: parsed.attempt.expiresAt },
      ...parsed.attempt.errorCode === undefined ? {} : { errorCode: parsed.attempt.errorCode },
    },
  }
}

/** Only HTTP loopback or HTTPS destinations can leave the native app. */
function validateBrowserDestination(value: string): void {
  const url = new URL(value)
  const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if (url.username || url.password || !(url.protocol === 'https:' || (loopback && url.protocol === 'http:'))) {
    throw new Error('desktop account: invalid browser destination')
  }
}

/** Native account operations and explicitly owned stream lifetime. */
export interface DesktopAccountBackend {
  /** @returns account providers this Host mounts, in display order. */
  providers(): Promise<AccountProviderId[]>
  /** @param provider - account backend to read. @returns current account snapshot. */
  state(provider: AccountProviderId): Promise<AccountView>
  /**
   * @param client - this window's identity and current language.
   * @param provider - account backend to use.
   * @returns new or already-running login attempt.
   */
  start(client: AccountClientMetadata, provider: AccountProviderId): Promise<AccountView>
  /** @param id - attempt to cancel. @param provider - account backend owning it. @returns cancellation or completed commit state. */
  cancel(id: SignInAttemptId, provider: AccountProviderId): Promise<AccountView>
  /** @param client - this window's identity. @param provider - account backend to sign out from. @returns state after local sign-out. */
  signOut(client: AccountClientMetadata, provider: AccountProviderId): Promise<AccountView>
  /**
   * @param listener - state recipient tagged with its provider.
   * @param failed - stream failure recipient.
   * @param expired - live credential-expiry recipient, tagged with the provider whose expiry stream is open.
   * @param onAnalyticsEnabledChanged - optional Desktop collection-policy recipient; disconnected streams publish false.
   * @returns stream disposer.
   */
  watch(
    listener: (provider: AccountProviderId, state: AccountView) => void, failed: () => void,
    expired: (provider: AccountProviderId) => void,
    onAnalyticsEnabledChanged?: (enabled: boolean) => void,
  ): () => void
}

/** Providers this build can address; an unknown value never reaches the wire. */
function providerList(value: unknown): AccountProviderId[] {
  if (!Array.isArray(value)) throw new Error('desktop account: invalid provider list')
  const providers = value.filter((item): item is AccountProviderId => item === 'deepseek' || item === 'topask')
  return providers.length === 0 ? ['deepseek'] : providers
}

/**
 * Connect native account operations to the standard authenticated Web backend.
 * @param origin - Host Web origin.
 * @param invoke - validated unary RPC caller.
 * @param cookie - Host authentication Cookie header for the account WebSocket.
 * @returns account operations; watch callers own their subscriptions.
 */
export function desktopAccountBackend(origin: string, invoke: AccountInvoke, cookie: string): DesktopAccountBackend {
  const call = async (provider: AccountProviderId, method: string,
    args: Record<string, unknown> = {}): Promise<AccountView> =>
    accountView(await invoke({ namespace: 'account', method, args: { provider, ...args } }))
  const readProviders = async (): Promise<AccountProviderId[]> =>
    providerList(await invoke({ namespace: 'account', method: 'providers', args: {} }))
  return {
    providers: readProviders,
    state: provider => call(provider, 'getState'),
    start: (client, provider) => call(provider, 'startSignIn', { client, callbackOrigin: new URL(origin).origin, loginSource: 'desktop' }),
    cancel: (attemptId, provider) => call(provider, 'cancelSignIn', { attemptId }),
    signOut: (client, provider) => call(provider, 'signOut', { client }),
    watch(listener, failed, expired, onAnalyticsEnabledChanged) {
      let closed = false
      let socket: WebSocket | undefined
      let retry: ReturnType<typeof setTimeout> | undefined
      const connect = (): void => {
        void (async () => {
          const mounted = await readProviders().catch(() => ['deepseek'] as AccountProviderId[])
          if (closed) return
          const url = new URL(REMOTE_STREAM_MUX_PATH, origin)
          url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
          socket = new WebSocket(url, { headers: { cookie, origin }, maxPayload: 65_536 })
          const watches = new Map<string, AccountProviderId>()
          const expiryProvider = mounted[0] ?? 'deepseek'
          const expiryStreamId = randomUUID()
          const analyticsPolicyStreamId = randomUUID()
          socket.on('open', () => {
            if (onAnalyticsEnabledChanged !== undefined) socket?.send(JSON.stringify({ type: 'open', streamId: analyticsPolicyStreamId, endpoint: 'productAnalytics/watchPolicy', payload: { args: {} } }))
            socket?.send(JSON.stringify({ type: 'open', streamId: expiryStreamId, endpoint: 'account/watchExpiry', payload: { args: { provider: expiryProvider } } }))
            for (const provider of mounted) {
              const streamId = randomUUID()
              watches.set(streamId, provider)
              socket?.send(JSON.stringify({ type: 'open', streamId, endpoint: 'account/watch', payload: { args: { provider } } }))
            }
          })
          socket.on('message', (data) => {
            try {
              const bytes = Array.isArray(data) ? Buffer.concat(data) : Buffer.isBuffer(data) ? data : Buffer.from(data)
              const frame = parseRemoteStreamServerMessage(bytes.toString('utf8'))
              if (frame.streamId === analyticsPolicyStreamId) {
                if (frame.type === 'item' && typeof frame.value === 'boolean') onAnalyticsEnabledChanged?.(frame.value)
                else onAnalyticsEnabledChanged?.(false)
                return
              }
              if (frame.streamId === expiryStreamId && frame.type === 'item' && frame.value === 'session-expired') { expired(expiryProvider); return }
              const provider = watches.get(frame.streamId)
              if (provider === undefined) throw new Error('desktop account: unexpected stream')
              if (frame.type === 'item') listener(provider, accountView(frame.value))
              else socket?.close()
            } catch { socket?.close() }
          })
          socket.on('error', () => { socket?.close() })
          socket.on('close', () => { if (!closed) { onAnalyticsEnabledChanged?.(false); failed(); retry = setTimeout(connect, 1000) } })
        })()
      }
      connect()
      return () => { closed = true; onAnalyticsEnabledChanged?.(false); clearTimeout(retry); socket?.close() }
    },
  }
}
