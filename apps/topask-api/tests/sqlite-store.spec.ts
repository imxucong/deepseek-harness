/** SQLite persistence behind the account API. */
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { openSqliteStore } from '../src/store-sqlite.ts'
import type { Store } from '../src/store.ts'

const directories: string[] = []
const stores: Store[] = []

async function opened(): Promise<Store> {
  const directory = mkdtempSync(join(tmpdir(), 'topask-api-'))
  directories.push(directory)
  const store = await openSqliteStore(join(directory, 'account.sqlite'))
  stores.push(store)
  return store
}

afterEach(() => {
  for (const store of stores.splice(0)) store.close()
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})

describe('sqlite store', () => {
  it('stores attempts, one-time codes, and grants', async () => {
    const store = await opened()
    store.upsertUser({ id: 'u1', email: 'u1@example.test', name: 'User One', picture: null })
    expect(store.findUser('u1')).toMatchObject({ id: 'u1', email: 'u1@example.test' })

    store.createAttempt({
      authorizeId: 'a1', state: 's1', codeChallenge: 'c1', redirectUri: 'http://127.0.0.1:1/oauth/callback',
      locale: 'zh_CN', loginSource: 'web', userId: 'u1', expiresAt: 2_000,
    })
    expect(store.approveAttempt('a1', 'hash', 1_000)).toBe(true)
    expect(store.approveAttempt('a1', 'other', 1_000)).toBe(false)
    expect(store.findAttemptByCode('hash', 1_000)).toMatchObject({ authorizeId: 'a1', userId: 'u1' })
    expect(store.findAttemptByCode('hash', 3_000)).toBeUndefined()

    expect(store.consumeAttempt('a1', 1_000)).toBe(true)
    expect(store.consumeAttempt('a1', 1_000)).toBe(false)
    expect(store.findAttemptByCode('hash', 1_000)).toBeUndefined()

    store.putDevice({ id: 'd1', model: 'darwin-arm64', osVersion: 'Darwin 25' }, 1_000)
    store.createGrant({ tokenHash: 't1', userId: 'u1', deviceId: 'd1', expiresAt: 2_000 })
    expect(store.findGrant('t1', 1_500)).toMatchObject({ userId: 'u1', deviceId: 'd1' })
    expect(store.findGrant('t1', 2_500)).toBeUndefined()

    store.deleteGrant('t1')
    expect(store.findGrant('t1', 1_500)).toBeUndefined()
  })
})
