/** Account persistence contracts and the in-memory implementation used by tests. */

/** One account identity. */
export interface UserRecord {
  readonly id: string
  readonly email: string
  readonly name: string
  readonly picture: string | null
}

/** One device that completed a sign-in. */
export interface DeviceRecord {
  readonly id: string
  readonly model: string
  readonly osVersion: string
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
}

/** Persistence the account API needs; implementations own storage only. */
export interface Store {
  /** Insert or replace one identity. @param user - account record. */
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
  /** Revoke one token. @param tokenHash - token digest. */
  deleteGrant(tokenHash: string): void
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

  upsertUser(user: UserRecord): void { this.users.set(user.id, user) }
  findUser(id: string): UserRecord | undefined { return this.users.get(id) }
  putDevice(device: DeviceRecord): void { this.devices.set(device.id, device) }
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
  createGrant(grant: GrantRecord): void { this.grants.set(grant.tokenHash, grant) }
  findGrant(tokenHash: string, now: number): GrantRecord | undefined {
    const grant = this.grants.get(tokenHash)
    return grant === undefined || grant.expiresAt <= now ? undefined : grant
  }
  deleteGrant(tokenHash: string): void { this.grants.delete(tokenHash) }
  close(): void { this.users.clear(); this.devices.clear(); this.attempts.clear(); this.grants.clear() }
}

function withoutCode(attempt: MemoryAttempt): AttemptRecord {
  const { codeHash: _codeHash, consumed: _consumed, ...record } = attempt
  return record
}
