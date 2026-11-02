/** Authenticated Remote operations for account UI consumers. */
import { Context } from '@deepseek-ai/cordis'
import { Remote, RemoteError, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import { accountServiceKey, isRunningAccountTask, type DeepSeekAccount } from '@deepseek-ai/dsh-deepseek-account'
import type {} from '@deepseek-ai/dsh-agent'
import type { AccountBonusBatch, AccountBonusOrderId, AccountClientMetadata, AccountDetails, AccountProviderId, AccountUserId } from '@deepseek-ai/dsh-deepseek-account/types'
import type { AccountView, SignInAttemptId } from './types.ts'

declare module '@deepseek-ai/dsh-typert-protocol' {
  interface RemoteErrorDetailsMap {
    /** The requested account provider is not mounted in this Host. */
    'account/provider-unavailable': { readonly provider: string }
  }
}

/** Account commands and reconnect-safe state stream, addressed by provider. */
export class AccountController extends TypertRemoteService {
  static inject = ['deepseekAccount', 'agents']
  /** @param ctx - Host with at least the DeepSeek account provider mounted. */
  constructor(ctx: Context) { super(ctx, 'accountController', { namespace: 'account' }) }

  /**
   * Resolve one mounted provider.
   * @param provider - client-facing provider identity.
   * @returns the provider service.
   * @throws RemoteError `account/provider-unavailable` when the Host does not mount it.
   */
  private account(provider: AccountProviderId): DeepSeekAccount {
    const service = this.ctx.get(accountServiceKey(provider))
    if (service === undefined) {
      throw new RemoteError('account/provider-unavailable', `account provider "${provider}" is not mounted`, { provider })
    }
    return service
  }

  /**
   * List the providers this Host mounts.
   * @returns provider identities in display order.
   */
  @Remote
  providers(): AccountProviderId[] {
    const candidates: AccountProviderId[] = ['topask', 'deepseek']
    return candidates.filter(provider => this.ctx.get(accountServiceKey(provider)) !== undefined)
  }

  /**
   * Read the safe account projection.
   * @param provider - account backend to read.
   * @returns current account and attempt state.
   */
  @Remote
  getState(provider: AccountProviderId): Promise<AccountView> { return this.account(provider).getState() }
  /**
   * Query display-safe Platform profile data.
   * @param provider - account backend to read.
   * @param client - identity of the requesting UI; the Host derives Platform request headers from it.
   * @returns profile outcome, or null when the account grant is absent or changed.
   */
  @Remote
  getProfile(provider: AccountProviderId, client: AccountClientMetadata): Promise<AccountDetails['profile'] | null> {
    return this.account(provider).getProfile(client)
  }
  /**
   * Query Platform recharge-wallet balances.
   * @param provider - account backend to read.
   * @param client - identity of the requesting UI; the Host derives Platform request headers from it.
   * @returns balance outcome, or null when the account grant is absent or changed.
   */
  @Remote
  getBalance(provider: AccountProviderId, client: AccountClientMetadata): Promise<AccountDetails['balance'] | null> {
    return this.account(provider).getBalance(client)
  }
  /**
   * Query the granted bonuses Platform has not yet recorded as displayed.
   * @param provider - account backend to read.
   * @param client - identity of the requesting UI; its language selects the server-authored message.
   * @returns bonuses with their account, or null when the account grant is absent or changed.
   */
  @Remote
  getUnnotifiedBonuses(provider: AccountProviderId, client: AccountClientMetadata): Promise<AccountBonusBatch | null> {
    return this.account(provider).getUnnotifiedBonuses(client)
  }
  /**
   * Record one displayed bonus as notified for the account it belongs to.
   * @param provider - account backend to write.
   * @param accountId - account the notification was read for.
   * @param orderId - granted bonus order the user saw.
   * @param client - identity of the requesting UI; the Host derives Platform request headers from it.
   * @returns true once Platform records the acknowledgement; false when the account is absent or changed.
   */
  @Remote
  ackBonusNotified(provider: AccountProviderId, accountId: AccountUserId, orderId: AccountBonusOrderId,
    client: AccountClientMetadata): Promise<boolean> {
    return this.account(provider).ackBonusNotified(accountId, orderId, client)
  }
  /**
   * Begin browser sign-in.
   * @param provider - account backend to sign in to.
   * @param client - identity of the requesting UI, captured by a new attempt.
   * @param callbackOrigin - browser-accessible loopback HTTP origin.
   * @param loginSource - initiating UI, used to return from a failed exchange.
   * @returns a new or already-active login attempt.
   */
  @Remote
  startSignIn(provider: AccountProviderId, client: AccountClientMetadata, callbackOrigin: string,
    loginSource: 'web' | 'desktop'): Promise<AccountView> {
    return this.account(provider).startSignIn(client, callbackOrigin, loginSource)
  }
  /**
   * Cancel the named local attempt.
   * @param provider - account backend owning the attempt.
   * @param attemptId - attempt to cancel.
   * @returns settled cancellation or commit state.
   */
  @Remote
  cancelSignIn(provider: AccountProviderId, attemptId: SignInAttemptId): Promise<AccountView> {
    return this.account(provider).cancelSignIn(attemptId)
  }
  /**
   * Inspect the latest logged request providers of running tasks, including tools and retries.
   * @param provider - account backend the caller is signing out from.
   * @returns whether running work has a latest request context on the account route.
   */
  @Remote
  hasRunningAccountTasks(provider: AccountProviderId): boolean {
    // The LLM route does not yet distinguish providers; both share the account route predicate.
    void provider
    return this.ctx.agents.list().some(isRunningAccountTask)
  }
  /**
   * Remove the local account grant and revoke it through Platform in the background, without deleting API keys.
   * @param provider - account backend to sign out from.
   * @param client - identity of the requesting UI, captured for the background revocation retries.
   * @returns state after removing the local account grant.
   */
  @Remote
  signOut(provider: AccountProviderId, client: AccountClientMetadata): Promise<AccountView> {
    return this.account(provider).signOut(client)
  }
  /**
   * Subscribe to credential expiry without replaying prior notifications.
   * @param provider - account backend whose stream this subscriber represents.
   * @param signal - stream lifetime.
   * @returns notifications emitted while subscribed.
   */
  @Remote({ mode: 'stream' })
  async *watchExpiry(provider: AccountProviderId, signal: AbortSignal): AsyncIterable<'session-expired'> {
    // One account is active at a time; the shared event carries no provider identity.
    void provider
    let pending = 0
    let wake: (() => void) | undefined
    const stop = this.ctx.on('deepseek-account/session-expired', () => { pending++; wake?.() })
    const abort = (): void => { wake?.() }
    signal.addEventListener('abort', abort, { once: true })
    try {
      while (!signal.aborted) {
        if (pending > 0) { pending--; yield 'session-expired'; continue }
        await new Promise<void>((resolve) => { wake = resolve })
      }
    } finally {
      stop()
      signal.removeEventListener('abort', abort)
    }
  }
  /**
   * Stream the safe account projection.
   * @param provider - account backend to follow.
   * @param signal - stream lifetime.
   * @returns initial snapshot and subsequent changes.
   */
  @Remote({ mode: 'stream' })
  watch(provider: AccountProviderId, signal: AbortSignal): AsyncIterable<AccountView> {
    return this.account(provider).watch(signal)
  }
}
export default AccountController
