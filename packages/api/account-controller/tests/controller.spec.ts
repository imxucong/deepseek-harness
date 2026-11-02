/** Account Remote delegation preserves provider results, failures, and stream lifetime. */
import { Context } from '@deepseek-ai/cordis'
import type { DeepSeekAccount } from '@deepseek-ai/dsh-deepseek-account'
import type { AccountBonusBatch, AccountBonusOrderId, AccountClientMetadata, AccountUserId } from '@deepseek-ai/dsh-deepseek-account/types'
import type { AccountView, SignInAttemptId } from '../src/types.ts'
import { afterEach, expect, it, vi } from 'vitest'
import AccountController from '../src/index.ts'

const roots: Context[] = []
afterEach(async () => { await Promise.all(roots.splice(0).map(ctx => ctx.fiber.dispose())) })
const state: AccountView = { status: 'signed-out', links: { usageUrl: 'https://platform.example/usage', topUpUrl: 'https://platform.example/top_up' }, attempt: null }
const client: AccountClientMetadata = { version: '0.0.0-test', locale: 'zh-CN', timezoneOffsetSeconds: 28_800 }

function fixture() {
  const ctx = new Context()
  roots.push(ctx)
  const provider = {
    getState: vi.fn<DeepSeekAccount['getState']>().mockResolvedValue(state),
    getProfile: vi.fn<DeepSeekAccount['getProfile']>().mockResolvedValue({ status: 'failed' }),
    getBalance: vi.fn<DeepSeekAccount['getBalance']>().mockResolvedValue(null),
    getUnnotifiedBonuses: vi.fn<DeepSeekAccount['getUnnotifiedBonuses']>().mockResolvedValue(null),
    ackBonusNotified: vi.fn<DeepSeekAccount['ackBonusNotified']>().mockResolvedValue(false),
    startSignIn: vi.fn<DeepSeekAccount['startSignIn']>().mockResolvedValue(state),
    cancelSignIn: vi.fn<DeepSeekAccount['cancelSignIn']>().mockResolvedValue(state),
    signOut: vi.fn<DeepSeekAccount['signOut']>().mockResolvedValue(state),
    watch: vi.fn<DeepSeekAccount['watch']>(),
  }
  ctx.provide('deepseekAccount', provider as never)
  return { ctx, provider, controller: new AccountController(ctx) }
}

it('delegates account operations without coupling profile and balance queries', async () => {
  const { provider, controller } = fixture()
  expect(await controller.getState('deepseek')).toBe(state)
  expect(await controller.getProfile('deepseek', client)).toEqual({ status: 'failed' })
  expect(provider.getBalance).not.toHaveBeenCalled()
  expect(await controller.getBalance('deepseek', client)).toBeNull()
  expect(await controller.startSignIn('deepseek', client, 'http://127.0.0.1:8080', 'desktop')).toBe(state)
  expect(provider.startSignIn).toHaveBeenCalledExactlyOnceWith(client, 'http://127.0.0.1:8080', 'desktop')
  const id = 'attempt' as SignInAttemptId
  expect(await controller.cancelSignIn('deepseek', id)).toBe(state)
  expect(provider.cancelSignIn).toHaveBeenCalledExactlyOnceWith(id)
  expect(await controller.signOut('deepseek', client)).toBe(state)
  expect(provider.signOut).toHaveBeenCalledExactlyOnceWith(client)
  const failure = new Error('storage unavailable')
  provider.signOut.mockRejectedValueOnce(failure)
  await expect(controller.signOut('deepseek', client)).rejects.toBe(failure)
})

it('delegates bonus reads and acknowledgements without altering their values', async () => {
  const { provider, controller } = fixture()
  const accountId = 'account' as AccountUserId
  const orderId = 'order' as AccountBonusOrderId
  const batch: AccountBonusBatch = { accountId, bonuses: [{ orderId, expiresAt: '2026-10-21T12:00:00Z', message: '已赠送您 5.00 元 DSH 体验赠金。' }] }
  provider.getUnnotifiedBonuses.mockResolvedValueOnce(batch)
  expect(await controller.getUnnotifiedBonuses('deepseek', client)).toBe(batch)
  expect(provider.getUnnotifiedBonuses).toHaveBeenCalledExactlyOnceWith(client)
  provider.ackBonusNotified.mockResolvedValueOnce(true)
  expect(await controller.ackBonusNotified('deepseek', accountId, orderId, client)).toBe(true)
  expect(provider.ackBonusNotified).toHaveBeenCalledExactlyOnceWith(accountId, orderId, client)
  const failure = new Error('unavailable')
  provider.getUnnotifiedBonuses.mockRejectedValueOnce(failure)
  await expect(controller.getUnnotifiedBonuses('deepseek', client)).rejects.toBe(failure)
})

it('passes the subscriber lifetime to the provider and returns its state stream', async () => {
  const { provider, controller } = fixture()
  const lifetime = new AbortController()
  const stream: AsyncIterable<AccountView> = { async *[Symbol.asyncIterator]() { yield state } }
  provider.watch.mockReturnValue(stream)
  expect(controller.watch('deepseek', lifetime.signal)).toBe(stream)
  expect(provider.watch).toHaveBeenCalledExactlyOnceWith(lifetime.signal)
  const received: AccountView[] = []
  for await (const value of stream) received.push(value)
  expect(received).toEqual([state])
})

it('delivers expiry only to current subscribers and stops on disconnect', async () => {
  const { ctx, controller } = fixture()
  ctx.emit('deepseek-account/session-expired')
  const lifetime = new AbortController()
  const iterator = controller.watchExpiry('deepseek', lifetime.signal)[Symbol.asyncIterator]()
  const first = iterator.next()
  ctx.emit('deepseek-account/session-expired')
  expect(await first).toEqual({ done: false, value: 'session-expired' })
  const next = iterator.next()
  lifetime.abort()
  expect(await next).toEqual({ done: true, value: undefined })
  const reconnect = new AbortController()
  const reopened = controller.watchExpiry('deepseek', reconnect.signal)[Symbol.asyncIterator]().next()
  reconnect.abort()
  expect(await reopened).toEqual({ done: true, value: undefined })
})

it('lists mounted providers and routes each call to its own service', async () => {
  const { ctx, controller } = fixture()
  expect(controller.providers()).toEqual(['deepseek'])
  const topaskState: AccountView = { ...state, status: 'credential-stored' }
  ctx.provide('topaskAccount', { getState: vi.fn().mockResolvedValue(topaskState) } as never)
  expect(controller.providers()).toEqual(['topask', 'deepseek'])
  expect(await controller.getState('topask')).toBe(topaskState)
  expect(await controller.getState('deepseek')).toBe(state)
})

it('refuses a provider this Host does not mount', () => {
  const { controller } = fixture()
  expect(() => controller.getState('topask')).toThrow('account provider "topask" is not mounted')
})
