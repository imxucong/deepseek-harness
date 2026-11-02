/** SQLite persistence for issued accounts, sign-in attempts, and tokens. */
import type { DatabaseSync } from 'node:sqlite'
import type { AttemptRecord, DeviceRecord, GrantRecord, Store, UserRecord } from './store.ts'

function text(row: Record<string, unknown>, key: string): string {
  const value = row[key]
  if (typeof value !== 'string') throw new Error(`topask-api: stored ${key} is not text`)
  return value
}

function integer(row: Record<string, unknown>, key: string): number {
  const value = row[key]
  if (typeof value === 'number') return value
  if (typeof value === 'bigint') return Number(value)
  throw new Error(`topask-api: stored ${key} is not an integer`)
}

function attempt(row: Record<string, unknown>): AttemptRecord {
  return {
    authorizeId: text(row, 'authorize_id'),
    state: text(row, 'state'),
    codeChallenge: text(row, 'code_challenge'),
    redirectUri: text(row, 'redirect_uri'),
    locale: text(row, 'locale'),
    loginSource: text(row, 'login_source'),
    userId: text(row, 'user_id'),
    expiresAt: integer(row, 'expires_at'),
  }
}

class SqliteStore implements Store {
  constructor(private readonly db: DatabaseSync) {
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, picture TEXT
      );
      CREATE TABLE IF NOT EXISTS devices (
        id TEXT PRIMARY KEY, model TEXT NOT NULL, os_version TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS attempts (
        authorize_id TEXT PRIMARY KEY, state TEXT NOT NULL, code_challenge TEXT NOT NULL,
        redirect_uri TEXT NOT NULL, locale TEXT NOT NULL, login_source TEXT NOT NULL,
        user_id TEXT NOT NULL, expires_at INTEGER NOT NULL, code_hash TEXT,
        consumed INTEGER NOT NULL DEFAULT 0
      );
      CREATE INDEX IF NOT EXISTS attempts_code_hash ON attempts(code_hash);
      CREATE TABLE IF NOT EXISTS grants (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL, expires_at INTEGER NOT NULL
      );
    `)
  }

  upsertUser(user: UserRecord): void {
    this.db.prepare('INSERT INTO users(id, email, name, picture) VALUES(?, ?, ?, ?) '
      + 'ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture')
      .run(user.id, user.email, user.name, user.picture)
  }

  findUser(id: string): UserRecord | undefined {
    const row = this.db.prepare('SELECT id, email, name, picture FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined
    if (row === undefined) return undefined
    const picture = row.picture
    return {
      id: text(row, 'id'), email: text(row, 'email'), name: text(row, 'name'),
      picture: typeof picture === 'string' ? picture : null,
    }
  }

  putDevice(device: DeviceRecord, now: number): void {
    this.db.prepare('INSERT INTO devices(id, model, os_version, created_at) VALUES(?, ?, ?, ?) '
      + 'ON CONFLICT(id) DO UPDATE SET model = excluded.model, os_version = excluded.os_version, created_at = excluded.created_at')
      .run(device.id, device.model, device.osVersion, now)
  }

  createAttempt(record: AttemptRecord): void {
    this.db.prepare('INSERT INTO attempts(authorize_id, state, code_challenge, redirect_uri, locale, login_source, user_id, expires_at) '
      + 'VALUES(?, ?, ?, ?, ?, ?, ?, ?)')
      .run(record.authorizeId, record.state, record.codeChallenge, record.redirectUri, record.locale,
        record.loginSource, record.userId, record.expiresAt)
  }

  findAttempt(authorizeId: string): AttemptRecord | undefined {
    const row = this.db.prepare('SELECT * FROM attempts WHERE authorize_id = ?').get(authorizeId) as Record<string, unknown> | undefined
    return row === undefined ? undefined : attempt(row)
  }

  approveAttempt(authorizeId: string, codeHash: string, now: number): boolean {
    const result = this.db.prepare('UPDATE attempts SET code_hash = ? WHERE authorize_id = ? AND code_hash IS NULL '
      + 'AND consumed = 0 AND expires_at > ?').run(codeHash, authorizeId, now)
    return Number(result.changes) === 1
  }

  findAttemptByCode(codeHash: string, now: number): AttemptRecord | undefined {
    const row = this.db.prepare('SELECT * FROM attempts WHERE code_hash = ? AND consumed = 0 AND expires_at > ?')
      .get(codeHash, now) as Record<string, unknown> | undefined
    return row === undefined ? undefined : attempt(row)
  }

  consumeAttempt(authorizeId: string, now: number): boolean {
    const result = this.db.prepare('UPDATE attempts SET consumed = 1 WHERE authorize_id = ? AND consumed = 0 AND expires_at > ?')
      .run(authorizeId, now)
    return Number(result.changes) === 1
  }

  cancelAttempt(authorizeId: string): void {
    this.db.prepare('DELETE FROM attempts WHERE authorize_id = ?').run(authorizeId)
  }

  createGrant(record: GrantRecord): void {
    this.db.prepare('INSERT INTO grants(token_hash, user_id, device_id, expires_at) VALUES(?, ?, ?, ?)')
      .run(record.tokenHash, record.userId, record.deviceId, record.expiresAt)
  }

  findGrant(tokenHash: string, now: number): GrantRecord | undefined {
    const row = this.db.prepare('SELECT token_hash, user_id, device_id, expires_at FROM grants WHERE token_hash = ? AND expires_at > ?')
      .get(tokenHash, now) as Record<string, unknown> | undefined
    if (row === undefined) return undefined
    return {
      tokenHash: text(row, 'token_hash'), userId: text(row, 'user_id'),
      deviceId: text(row, 'device_id'), expiresAt: integer(row, 'expires_at'),
    }
  }

  deleteGrant(tokenHash: string): void {
    this.db.prepare('DELETE FROM grants WHERE token_hash = ?').run(tokenHash)
  }

  close(): void { this.db.close() }
}

/**
 * Open the SQLite-backed store, creating the database file when absent.
 * @param file - database path.
 * @returns the store; the caller closes it with the server.
 */
export async function openSqliteStore(file: string): Promise<Store> {
  const { DatabaseSync } = await import('node:sqlite')
  return new SqliteStore(new DatabaseSync(file))
}
