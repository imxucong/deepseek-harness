/** SQLite persistence for issued accounts, sign-in attempts, tokens, wallets, and operator audit. */
import { randomUUID } from 'node:crypto'
import type { DatabaseSync } from 'node:sqlite'
import type {
  AdminAttemptRecord, AdminGrantRecord, AdminOverview, AttemptPage, AttemptRecord, AuditPage,
  AuditRecord, BonusRecord, DevicePage, DeviceRecord, GrantPage, GrantRecord, PageQuery, Store,
  UserPage, UserRecord, WalletPage, WalletRecord,
} from './store.ts'

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

function boolean(row: Record<string, unknown>, key: string): boolean {
  return integer(row, key) === 1
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

function user(row: Record<string, unknown>): UserRecord {
  const picture = row.picture
  return {
    id: text(row, 'id'), email: text(row, 'email'), name: text(row, 'name'),
    picture: typeof picture === 'string' ? picture : null,
    disabled: boolean(row, 'disabled'),
  }
}

function grant(row: Record<string, unknown>): GrantRecord {
  return {
    tokenHash: text(row, 'token_hash'), userId: text(row, 'user_id'),
    deviceId: text(row, 'device_id'), expiresAt: integer(row, 'expires_at'),
    createdAt: integer(row, 'created_at'),
  }
}

function wallet(row: Record<string, unknown> | undefined, userId: string): WalletRecord {
  if (row === undefined) return { userId, currency: 'CNY', balanceCents: 0, bonusCents: 0, updatedAt: 0 }
  return {
    userId, currency: 'CNY', balanceCents: integer(row, 'balance_cents'),
    bonusCents: integer(row, 'bonus_cents'), updatedAt: integer(row, 'updated_at'),
  }
}

function bonus(row: Record<string, unknown>): BonusRecord {
  return {
    orderId: text(row, 'order_id'), userId: text(row, 'user_id'), amountCents: integer(row, 'amount_cents'),
    currency: 'CNY', title: text(row, 'title'), message: text(row, 'message'),
    expiresAt: integer(row, 'expires_at'), notified: boolean(row, 'notified'), createdAt: integer(row, 'created_at'),
  }
}

const SCHEMA = `
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY, email TEXT NOT NULL, name TEXT NOT NULL, picture TEXT,
    disabled INTEGER NOT NULL DEFAULT 0
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
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, device_id TEXT NOT NULL,
    expires_at INTEGER NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS grants_user_id ON grants(user_id);
  CREATE TABLE IF NOT EXISTS wallets (
    user_id TEXT PRIMARY KEY, currency TEXT NOT NULL,
    balance_cents INTEGER NOT NULL DEFAULT 0, bonus_cents INTEGER NOT NULL DEFAULT 0,
    updated_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS bonus_ledger (
    order_id TEXT PRIMARY KEY, user_id TEXT NOT NULL, amount_cents INTEGER NOT NULL,
    currency TEXT NOT NULL, title TEXT NOT NULL, message TEXT NOT NULL,
    expires_at INTEGER NOT NULL, notified INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS bonus_ledger_user_id ON bonus_ledger(user_id);
  CREATE TABLE IF NOT EXISTS admin_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT, actor_subject TEXT NOT NULL, actor_email TEXT NOT NULL,
    action TEXT NOT NULL, target TEXT NOT NULL, details TEXT NOT NULL, created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS admin_audit_created_at ON admin_audit(created_at);
`

function tableExists(db: DatabaseSync, name: string): boolean {
  return db.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").get(name) !== undefined
}

function columns(db: DatabaseSync, table: string): ReadonlySet<string> {
  const rows = db.prepare(`PRAGMA table_info(${table})`).all() as readonly Record<string, unknown>[]
  return new Set(rows.map(row => text(row, 'name')))
}

function migrate(db: DatabaseSync): void {
  const version = Number((db.prepare('PRAGMA user_version').get() as { user_version?: number | bigint } | undefined)?.user_version ?? 0)
  if (version > 2) throw new Error(`topask-api: database schema ${version} is newer than this build`)
  if (!tableExists(db, 'users')) {
    db.exec(SCHEMA)
    db.exec('PRAGMA user_version = 2')
    return
  }
  if (!columns(db, 'users').has('disabled')) {
    db.exec('ALTER TABLE users ADD COLUMN disabled INTEGER NOT NULL DEFAULT 0')
  }
  if (!columns(db, 'grants').has('created_at')) {
    db.exec('ALTER TABLE grants ADD COLUMN created_at INTEGER NOT NULL DEFAULT 0')
  }
  db.exec(SCHEMA)
  db.exec('PRAGMA user_version = 2')
}

/** Build the `WHERE` clause and parameters for a text search across the given columns. */
function search(query: string, aliases: readonly string[]): { where: string; params: readonly string[] } {
  if (query === '') return { where: '', params: [] }
  const pattern = `%${query}%`
  return {
    where: `WHERE ${aliases.map(alias => `${alias} LIKE ?`).join(' OR ')}`,
    params: aliases.map(() => pattern),
  }
}

class SqliteStore implements Store {
  constructor(private readonly db: DatabaseSync) {
    db.exec('PRAGMA journal_mode = WAL')
    migrate(db)
  }

  upsertUser(record: UserRecord): void {
    this.db.prepare('INSERT INTO users(id, email, name, picture, disabled) VALUES(?, ?, ?, ?, 0) '
      + 'ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture')
      .run(record.id, record.email, record.name, record.picture)
  }

  findUser(id: string): UserRecord | undefined {
    const row = this.db.prepare('SELECT id, email, name, picture, disabled FROM users WHERE id = ?').get(id) as Record<string, unknown> | undefined
    return row === undefined ? undefined : user(row)
  }

  setUserDisabled(id: string, disabled: boolean): boolean {
    const result = this.db.prepare('UPDATE users SET disabled = ? WHERE id = ?').run(disabled ? 1 : 0, id)
    return Number(result.changes) === 1
  }

  listUsers(page: PageQuery): UserPage {
    const { where, params } = search(page.query, ['id', 'email', 'name'])
    const total = Number((this.db.prepare(`SELECT COUNT(*) AS count FROM users ${where}`).get(...params) as { count: number | bigint }).count)
    const rows = this.db.prepare(`SELECT id, email, name, picture, disabled FROM users ${where} `
      + 'ORDER BY email LIMIT ? OFFSET ?').all(...params, page.limit, page.offset) as readonly Record<string, unknown>[]
    return { users: rows.map(user), total }
  }

  putDevice(device: DeviceRecord, now: number): void {
    this.db.prepare('INSERT INTO devices(id, model, os_version, created_at) VALUES(?, ?, ?, ?) '
      + 'ON CONFLICT(id) DO UPDATE SET model = excluded.model, os_version = excluded.os_version')
      .run(device.id, device.model, device.osVersion, device.createdAt ?? now)
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
    this.db.prepare('INSERT INTO grants(token_hash, user_id, device_id, expires_at, created_at) VALUES(?, ?, ?, ?, ?)')
      .run(record.tokenHash, record.userId, record.deviceId, record.expiresAt, record.createdAt ?? Date.now())
  }

  findGrant(tokenHash: string, now: number): GrantRecord | undefined {
    const row = this.db.prepare('SELECT token_hash, user_id, device_id, expires_at, created_at FROM grants '
      + 'WHERE token_hash = ? AND expires_at > ?').get(tokenHash, now) as Record<string, unknown> | undefined
    return row === undefined ? undefined : grant(row)
  }

  deleteGrant(tokenHash: string): boolean {
    return Number(this.db.prepare('DELETE FROM grants WHERE token_hash = ?').run(tokenHash).changes) === 1
  }

  listGrants(page: PageQuery): GrantPage {
    const { where, params } = search(page.query, ['g.token_hash', 'g.user_id', 'u.email', 'u.name'])
    const total = Number((this.db.prepare(`SELECT COUNT(*) AS count FROM grants g LEFT JOIN users u ON u.id = g.user_id ${where}`)
      .get(...params) as { count: number | bigint }).count)
    const rows = this.db.prepare('SELECT g.token_hash, g.user_id, g.device_id, g.expires_at, g.created_at, '
      + `u.email, u.name FROM grants g LEFT JOIN users u ON u.id = g.user_id ${where} `
      + 'ORDER BY g.created_at DESC LIMIT ? OFFSET ?').all(...params, page.limit, page.offset) as readonly Record<string, unknown>[]
    const grants: AdminGrantRecord[] = rows.map(row => ({ ...grant(row), email: text(row, 'email'), name: text(row, 'name') }))
    return { grants, total }
  }

  listDevices(page: PageQuery): DevicePage {
    const { where, params } = search(page.query, ['id', 'model', 'os_version'])
    const total = Number((this.db.prepare(`SELECT COUNT(*) AS count FROM devices ${where}`).get(...params) as { count: number | bigint }).count)
    const rows = this.db.prepare(`SELECT id, model, os_version, created_at FROM devices ${where} `
      + 'ORDER BY created_at DESC LIMIT ? OFFSET ?').all(...params, page.limit, page.offset) as readonly Record<string, unknown>[]
    const devices: DeviceRecord[] = rows.map(row => ({
      id: text(row, 'id'), model: text(row, 'model'), osVersion: text(row, 'os_version'), createdAt: integer(row, 'created_at'),
    }))
    return { devices, total }
  }

  listAttempts(page: PageQuery): AttemptPage {
    const { where, params } = search(page.query, ['a.authorize_id', 'a.user_id', 'u.email', 'u.name'])
    const total = Number((this.db.prepare(`SELECT COUNT(*) AS count FROM attempts a LEFT JOIN users u ON u.id = a.user_id ${where}`)
      .get(...params) as { count: number | bigint }).count)
    const rows = this.db.prepare('SELECT a.*, u.email, u.name FROM attempts a LEFT JOIN users u ON u.id = a.user_id '
      + `${where} ORDER BY a.expires_at DESC LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset) as readonly Record<string, unknown>[]
    const attempts: AdminAttemptRecord[] = rows.map(row => ({
      ...attempt(row),
      status: row.consumed === 1 || row.consumed === 1n ? 'exchanged' : row.code_hash === null ? 'pending' : 'approved',
    }))
    return { attempts, total }
  }

  listWallets(page: PageQuery): WalletPage {
    const { where, params } = search(page.query, ['w.user_id', 'u.email', 'u.name'])
    const total = Number((this.db.prepare(`SELECT COUNT(*) AS count FROM wallets w LEFT JOIN users u ON u.id = w.user_id ${where}`)
      .get(...params) as { count: number | bigint }).count)
    const rows = this.db.prepare('SELECT w.* FROM wallets w LEFT JOIN users u ON u.id = w.user_id '
      + `${where} ORDER BY w.user_id LIMIT ? OFFSET ?`).all(...params, page.limit, page.offset) as readonly Record<string, unknown>[]
    const wallets = rows.map(row => wallet(row, text(row, 'user_id')))
    return { wallets, total }
  }

  overview(): AdminOverview {
    const count = (sql: string): number => Number((this.db.prepare(sql).get() as { count: number | bigint }).count)
    return {
      users: count('SELECT COUNT(*) AS count FROM users'),
      disabledUsers: count('SELECT COUNT(*) AS count FROM users WHERE disabled = 1'),
      grants: count('SELECT COUNT(*) AS count FROM grants'),
      devices: count('SELECT COUNT(*) AS count FROM devices'),
      attempts: count('SELECT COUNT(*) AS count FROM attempts'),
    }
  }

  getWallet(userId: string): WalletRecord {
    const row = this.db.prepare('SELECT * FROM wallets WHERE user_id = ?').get(userId) as Record<string, unknown> | undefined
    return wallet(row, userId)
  }

  setWalletBalance(userId: string, balanceCents: number, now: number): WalletRecord {
    this.db.prepare('INSERT INTO wallets(user_id, currency, balance_cents, bonus_cents, updated_at) VALUES(?, ?, ?, 0, ?) '
      + 'ON CONFLICT(user_id) DO UPDATE SET balance_cents = excluded.balance_cents, updated_at = excluded.updated_at')
      .run(userId, 'CNY', balanceCents, now)
    return this.getWallet(userId)
  }

  addBonus(userId: string, amountCents: number, title: string, message: string, expiresAt: number, now: number): BonusRecord {
    const record: BonusRecord = {
      orderId: randomUUID(), userId, amountCents, currency: 'CNY', title, message, expiresAt, notified: false, createdAt: now,
    }
    this.db.exec('BEGIN')
    try {
      this.db.prepare('INSERT INTO bonus_ledger(order_id, user_id, amount_cents, currency, title, message, expires_at, notified, created_at) '
        + 'VALUES(?, ?, ?, ?, ?, ?, ?, 0, ?)')
        .run(record.orderId, userId, amountCents, 'CNY', title, message, expiresAt, now)
      this.db.prepare('INSERT INTO wallets(user_id, currency, balance_cents, bonus_cents, updated_at) VALUES(?, ?, 0, ?, ?) '
        + 'ON CONFLICT(user_id) DO UPDATE SET bonus_cents = bonus_cents + excluded.bonus_cents, updated_at = excluded.updated_at')
        .run(userId, 'CNY', amountCents, now)
      this.db.exec('COMMIT')
    } catch (error) {
      this.db.exec('ROLLBACK')
      throw error
    }
    return record
  }

  listBonuses(userId: string): readonly BonusRecord[] {
    const rows = this.db.prepare('SELECT * FROM bonus_ledger WHERE user_id = ? ORDER BY created_at').all(userId) as readonly Record<string, unknown>[]
    return rows.map(bonus)
  }

  ackBonus(orderId: string, userId: string): boolean {
    return Number(this.db.prepare('UPDATE bonus_ledger SET notified = 1 WHERE order_id = ? AND user_id = ?').run(orderId, userId).changes) === 1
  }

  appendAudit(entry: Omit<AuditRecord, 'id'>): void {
    this.db.prepare('INSERT INTO admin_audit(actor_subject, actor_email, action, target, details, created_at) VALUES(?, ?, ?, ?, ?, ?)')
      .run(entry.actorSubject, entry.actorEmail, entry.action, entry.target, entry.details, entry.createdAt)
  }

  listAudit(page: PageQuery): AuditPage {
    const { where, params } = search(page.query, ['actor_email', 'action', 'target', 'details'])
    const total = Number((this.db.prepare(`SELECT COUNT(*) AS count FROM admin_audit ${where}`).get(...params) as { count: number | bigint }).count)
    const rows = this.db.prepare(`SELECT * FROM admin_audit ${where} ORDER BY id DESC LIMIT ? OFFSET ?`)
      .all(...params, page.limit, page.offset) as readonly Record<string, unknown>[]
    const entries: AuditRecord[] = rows.map(row => ({
      id: integer(row, 'id'), actorSubject: text(row, 'actor_subject'), actorEmail: text(row, 'actor_email'),
      action: text(row, 'action'), target: text(row, 'target'), details: text(row, 'details'),
      createdAt: integer(row, 'created_at'),
    }))
    return { entries, total }
  }

  close(): void { this.db.close() }
}

/**
 * Open the SQLite-backed store, creating or migrating the database file when absent.
 * @param file - database path.
 * @returns the store; the caller closes it with the server.
 */
export async function openSqliteStore(file: string): Promise<Store> {
  const { DatabaseSync } = await import('node:sqlite')
  return new SqliteStore(new DatabaseSync(file))
}
