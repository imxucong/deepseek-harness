/** Account persistence contracts and the in-memory implementation used by tests. */
import { randomUUID } from 'node:crypto'

/** One account identity. */
export interface UserRecord {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly picture: string | null
  /** Whether sign-in and existing grants are blocked; stores default it to false. */
  readonly disabled?: boolean
}

/** One device that completed a sign-in. */
export interface DeviceRecord {
  readonly id: string
  readonly model: string
  readonly osVersion: string
  /** Creation time; stores fill it when absent. */
  readonly createdAt?: number
}

/** One browser sign-in attempt. */
export interface AttemptRecord {
  readonly authorizeId: string
  readonly state: string
  readonly codeChallenge: string
  readonly redirectUri: string
  readonly locale: string
  readonly loginSource: string
  readonly userId: string
  readonly expiresAt: number
}

/** One issued account token, stored by hash. */
export interface GrantRecord {
  readonly tokenHash: string
  readonly userId: string
  readonly deviceId: string
  readonly expiresAt: number
  /** Creation time; stores fill it when absent. */
  readonly createdAt?: number
}

/** One grant with the owner shown by the operator console. */
export interface AdminGrantRecord extends GrantRecord {
  readonly email: string
  readonly name: string
}

/** One attempt with its lifecycle status. */
export interface AdminAttemptRecord extends AttemptRecord {
  readonly status: 'pending' | 'approved' | 'exchanged'
}

/** One wallet balance; `bonusCents` is the granted bonus total. */
export interface WalletRecord {
  readonly userId: string
  readonly currency: 'CNY'
  readonly balanceCents: number
  readonly bonusCents: number
  readonly updatedAt: number
}

/** One granted bonus entry. */
export interface BonusRecord {
  readonly orderId: string
  readonly userId: string
  readonly amountCents: number
  readonly currency: 'CNY'
  readonly title: string
  readonly message: string
  readonly expiresAt: number
  readonly notified: boolean
  readonly createdAt: number
}

/** One operator action recorded for review. */
export interface AuditRecord {
  readonly id: number
  readonly actorSubject: string
  readonly actorEmail: string
  readonly action: string
  readonly target: string
  readonly details: string
  readonly createdAt: number
}

/** One page request shared by admin listings. */
export interface PageQuery {
  readonly query: string
  readonly limit: number
  readonly offset: number
}

/** One page of users. */
export interface UserPage {
  readonly users: readonly UserRecord[]
  readonly total: number
}

/** One page of grants. */
export interface GrantPage {
  readonly grants: readonly AdminGrantRecord[]
  readonly total: number
}

/** One page of devices. */
export interface DevicePage {
  readonly devices: readonly DeviceRecord[]
  readonly total: number
}

/** One page of attempts. */
export interface AttemptPage {
  readonly attempts: readonly AdminAttemptRecord[]
  readonly total: number
}

/** One page of wallets. */
export interface WalletPage {
  readonly wallets: readonly WalletRecord[]
  readonly total: number
}

/** One page of audit entries. */
export interface AuditPage {
  readonly entries: readonly AuditRecord[]
  readonly total: number
}

/** Counts shown by the operator overview. */
export interface AdminOverview {
  readonly users: number
  readonly disabledUsers: number
  readonly grants: number
  readonly devices: number
  readonly attempts: number
}

/** Persistence the account API needs; implementations own storage only. */
export interface Store {
  /** Insert or replace one identity, preserving an existing disabled flag. @param user - account record. */
  upsertUser(user: UserRecord): void
  /** Read one identity. @param id - account id. @returns the record, or undefined. */
  findUser(id: string): UserRecord | undefined
  /** Record one device. @param device - device identity. @param now - epoch milliseconds. */
  putDevice(device: DeviceRecord, now: number): void
  /** Store a new sign-in attempt. @param attempt - attempt record. */
  createAttempt(attempt: AttemptRecord): void
  /** Read an attempt by its authorization id.
   * @param authorizeId - attempt identity.
   * @returns the record, or undefined.
   */
  findAttempt(authorizeId: string): AttemptRecord | undefined
  /** Record the one-time code for an attempt.
   * @param authorizeId - attempt identity.
   * @param codeHash - code digest.
   * @param now - epoch milliseconds.
   * @returns false when the attempt is missing, expired, or already approved.
   */
  approveAttempt(authorizeId: string, codeHash: string, now: number): boolean
  /** Read the unexpired attempt a code belongs to.
   * @param codeHash - code digest.
   * @param now - epoch milliseconds.
   * @returns the record, or undefined.
   */
  findAttemptByCode(codeHash: string, now: number): AttemptRecord | undefined
  /** Consume an attempt's code once.
   * @param authorizeId - attempt identity.
   * @param now - epoch milliseconds.
   * @returns false when the code was already consumed or expired.
   */
  consumeAttempt(authorizeId: string, now: number): boolean
  /** Drop one sign-in attempt. @param authorizeId - attempt identity. */
  cancelAttempt(authorizeId: string): void
  /** Store one issued token by hash. @param grant - grant record. */
  createGrant(grant: GrantRecord): void
  /** Read one live token. @param tokenHash - token digest. @param now - epoch milliseconds. @returns the grant, or undefined. */
  findGrant(tokenHash: string, now: number): GrantRecord | undefined
  /** Revoke one token. @param tokenHash - token digest. @returns true when a grant was removed. */
  deleteGrant(tokenHash: string): boolean
  /** List users for the operator console. @param page - query, limit, and offset. @returns matching users and the total count. */
  listUsers(page: PageQuery): UserPage
  /** Disable or enable one identity. @param id - account id. @param disabled - requested state. @returns true when the user exists. */
  setUserDisabled(id: string, disabled: boolean): boolean
  /** List grants for the operator console. @param page - query, limit, and offset. @returns matching grants and the total count. */
  listGrants(page: PageQuery): GrantPage
  /** List devices for the operator console. @param page - query, limit, and offset. @returns matching devices and the total count. */
  listDevices(page: PageQuery): DevicePage
  /** List attempts for the operator console. @param page - query, limit, and offset. @returns matching attempts and the total count. */
  listAttempts(page: PageQuery): AttemptPage
  /** List wallets for the operator console. @param page - query, limit, and offset. @returns matching wallets and the total count. */
  listWallets(page: PageQuery): WalletPage
  /** Counts shown by the operator overview. @returns account, grant, device, and attempt counts. */
  overview(): AdminOverview
  /** Read one wallet; a missing row reads as zero. @param userId - account id. @returns the wallet. */
  getWallet(userId: string): WalletRecord
  /**
   * Set the normal wallet balance.
   * @param userId - account id.
   * @param balanceCents - new balance in cents.
   * @param now - epoch milliseconds.
   * @returns the updated wallet.
   */
  setWalletBalance(userId: string, balanceCents: number, now: number): WalletRecord
  /**
   * Grant one bonus and add it to the bonus total.
   * @param userId - account id.
   * @param amountCents - granted amount.
   * @param title - notice title.
   * @param message - notice body.
   * @param expiresAt - notice expiry.
   * @param now - epoch milliseconds.
   * @returns the granted entry.
   */
  addBonus(userId: string, amountCents: number, title: string, message: string, expiresAt: number, now: number): BonusRecord
  /** List every granted bonus for one account. @param userId - account id. @returns entries in creation order. */
  listBonuses(userId: string): readonly BonusRecord[]
  /**
   * Mark one bonus notice as displayed.
   * @param orderId - bonus identity.
   * @param userId - owning account.
   * @returns true when the entry exists for that account.
   */
  ackBonus(orderId: string, userId: string): boolean
  /** Append one operator action. @param entry - action without its generated id. */
  appendAudit(entry: Omit<AuditRecord, 'id'>): void
  /** List operator actions. @param page - query, limit, and offset. @returns matching entries and the total count. */
  listAudit(page: PageQuery): AuditPage
  /** Release storage resources. */
  close(): void
}

interface MemoryAttempt extends AttemptRecord {
  codeHash: string | undefined
  consumed: boolean
}

/** Process-local store; tests and `--store memory` development runs use it. */
export class MemoryStore implements Store {
  private readonly users = new Map<string, UserRecord>()
  private readonly devices = new Map<string, DeviceRecord>()
  private readonly attempts = new Map<string, MemoryAttempt>()
  private readonly grants = new Map<string, GrantRecord>()
  private readonly wallets = new Map<string, WalletRecord>()
  private readonly bonuses = new Map<string, BonusRecord>()
  private readonly audit: AuditRecord[] = []
  private nextAuditId = 1

  upsertUser(user: UserRecord): void {
    const existing = this.users.get(user.id)
    this.users.set(user.id, { ...user, disabled: existing?.disabled ?? user.disabled ?? false })
  }

  findUser(id: string): UserRecord | undefined { return this.users.get(id) }

  setUserDisabled(id: string, disabled: boolean): boolean {
    const user = this.users.get(id)
    if (user === undefined) return false
    this.users.set(id, { ...user, disabled })
    return true
  }

  listUsers(page: PageQuery): UserPage {
    const matches = [...this.users.values()]
      .filter(user => matchesText(page.query, user.id, user.email, user.name))
      .sort((left, right) => left.email.localeCompare(right.email))
    return { users: matches.slice(page.offset, page.offset + page.limit), total: matches.length }
  }

  putDevice(device: DeviceRecord, now: number): void {
    this.devices.set(device.id, { ...device, createdAt: device.createdAt ?? now })
  }

  createAttempt(attempt: AttemptRecord): void {
    this.attempts.set(attempt.authorizeId, { ...attempt, codeHash: undefined, consumed: false })
  }

  findAttempt(authorizeId: string): AttemptRecord | undefined {
    const attempt = this.attempts.get(authorizeId)
    return attempt === undefined ? undefined : withoutCode(attempt)
  }

  approveAttempt(authorizeId: string, codeHash: string, now: number): boolean {
    const attempt = this.attempts.get(authorizeId)
    if (attempt === undefined || attempt.consumed || attempt.codeHash !== undefined || attempt.expiresAt <= now) return false
    attempt.codeHash = codeHash
    return true
  }

  findAttemptByCode(codeHash: string, now: number): AttemptRecord | undefined {
    for (const attempt of this.attempts.values()) {
      if (attempt.codeHash === codeHash && !attempt.consumed && attempt.expiresAt > now) return withoutCode(attempt)
    }
    return undefined
  }

  consumeAttempt(authorizeId: string, now: number): boolean {
    const attempt = this.attempts.get(authorizeId)
    if (attempt === undefined || attempt.consumed || attempt.expiresAt <= now) return false
    attempt.consumed = true
    return true
  }

  cancelAttempt(authorizeId: string): void { this.attempts.delete(authorizeId) }

  createGrant(grant: GrantRecord): void {
    this.grants.set(grant.tokenHash, { ...grant, createdAt: grant.createdAt ?? Date.now() })
  }

  findGrant(tokenHash: string, now: number): GrantRecord | undefined {
    const grant = this.grants.get(tokenHash)
    return grant === undefined || grant.expiresAt <= now ? undefined : grant
  }

  deleteGrant(tokenHash: string): boolean { return this.grants.delete(tokenHash) }

  listGrants(page: PageQuery): GrantPage {
    const matches = [...this.grants.values()]
      .map((grant) => {
        const user = this.users.get(grant.userId)
        return { ...grant, email: user?.email ?? '', name: user?.name ?? '' }
      })
      .filter(grant => matchesText(page.query, grant.tokenHash, grant.userId, grant.email, grant.name))
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
    return { grants: matches.slice(page.offset, page.offset + page.limit), total: matches.length }
  }

  listDevices(page: PageQuery): DevicePage {
    const matches = [...this.devices.values()]
      .filter(device => matchesText(page.query, device.id, device.model, device.osVersion))
      .sort((left, right) => (right.createdAt ?? 0) - (left.createdAt ?? 0))
    return { devices: matches.slice(page.offset, page.offset + page.limit), total: matches.length }
  }

  listAttempts(page: PageQuery): AttemptPage {
    const matches = [...this.attempts.values()]
      .map(attempt => ({ ...withoutCode(attempt), status: attemptStatus(attempt) }))
      .filter((attempt) => {
        const user = this.users.get(attempt.userId)
        return matchesText(page.query, attempt.authorizeId, attempt.userId, user?.email ?? '', user?.name ?? '')
      })
      .sort((left, right) => right.expiresAt - left.expiresAt)
    return { attempts: matches.slice(page.offset, page.offset + page.limit), total: matches.length }
  }

  listWallets(page: PageQuery): WalletPage {
    const matches = [...this.wallets.values()]
      .filter((wallet) => {
        const user = this.users.get(wallet.userId)
        return matchesText(page.query, wallet.userId, user?.email ?? '', user?.name ?? '')
      })
      .sort((left, right) => left.userId.localeCompare(right.userId))
    return { wallets: matches.slice(page.offset, page.offset + page.limit), total: matches.length }
  }

  overview(): AdminOverview {
    const users = [...this.users.values()]
    return {
      users: users.length,
      disabledUsers: users.filter(user => user.disabled === true).length,
      grants: this.grants.size,
      devices: this.devices.size,
      attempts: this.attempts.size,
    }
  }

  getWallet(userId: string): WalletRecord {
    return this.wallets.get(userId) ?? { userId, currency: 'CNY', balanceCents: 0, bonusCents: 0, updatedAt: 0 }
  }

  setWalletBalance(userId: string, balanceCents: number, now: number): WalletRecord {
    const current = this.getWallet(userId)
    const updated = { ...current, balanceCents, updatedAt: now }
    this.wallets.set(userId, updated)
    return updated
  }

  addBonus(userId: string, amountCents: number, title: string, message: string, expiresAt: number, now: number): BonusRecord {
    const record: BonusRecord = {
      orderId: randomUUID(), userId, amountCents, currency: 'CNY', title, message, expiresAt, notified: false, createdAt: now,
    }
    this.bonuses.set(record.orderId, record)
    const current = this.getWallet(userId)
    this.wallets.set(userId, { ...current, bonusCents: current.bonusCents + amountCents, updatedAt: now })
    return record
  }

  listBonuses(userId: string): readonly BonusRecord[] {
    return [...this.bonuses.values()]
      .filter(bonus => bonus.userId === userId)
      .sort((left, right) => left.createdAt - right.createdAt)
  }

  ackBonus(orderId: string, userId: string): boolean {
    const bonus = this.bonuses.get(orderId)
    if (bonus === undefined || bonus.userId !== userId) return false
    this.bonuses.set(orderId, { ...bonus, notified: true })
    return true
  }

  appendAudit(entry: Omit<AuditRecord, 'id'>): void {
    this.audit.push({ ...entry, id: this.nextAuditId++ })
  }

  listAudit(page: PageQuery): AuditPage {
    const matches = this.audit
      .filter(entry => matchesText(page.query, entry.actorEmail, entry.action, entry.target, entry.details))
      .sort((left, right) => right.id - left.id)
    return { entries: matches.slice(page.offset, page.offset + page.limit), total: matches.length }
  }

  close(): void {
    this.users.clear()
    this.devices.clear()
    this.attempts.clear()
    this.grants.clear()
    this.wallets.clear()
    this.bonuses.clear()
    this.audit.length = 0
  }
}

function withoutCode(attempt: MemoryAttempt): AttemptRecord {
  const { codeHash: _codeHash, consumed: _consumed, ...record } = attempt
  return record
}

function attemptStatus(attempt: MemoryAttempt): 'pending' | 'approved' | 'exchanged' {
  if (attempt.consumed) return 'exchanged'
  return attempt.codeHash === undefined ? 'pending' : 'approved'
}

function matchesText(query: string, ...values: readonly string[]): boolean {
  if (query === '') return true
  const needle = query.toLowerCase()
  return values.some(value => value.toLowerCase().includes(needle))
}
