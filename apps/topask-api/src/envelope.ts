/** Platform-compatible response envelope and bounded JSON responses. */
import type { ServerResponse } from 'node:http'

/** Largest response body the account client accepts. */
export const MAX_RESPONSE_BYTES = 65_536

/** Successful platform envelope; `biz_code` carries a domain outcome. */
export interface ProtocolEnvelope {
  readonly code: 0
  readonly data: { readonly biz_code: number; readonly biz_data: unknown }
}

/** Encode one successful business payload. @param bizData - payload the client reads. @returns the wire envelope. */
export function success(bizData: unknown): ProtocolEnvelope {
  return { code: 0, data: { biz_code: 0, biz_data: bizData } }
}

/** Encode one business failure the client reports as a protocol error.
 * @param bizCode - non-zero domain outcome.
 * @returns the wire envelope.
 */
export function failure(bizCode: number): ProtocolEnvelope {
  return { code: 0, data: { biz_code: bizCode, biz_data: null } }
}

function write(res: ServerResponse, status: number, body: Buffer, contentType: string,
  headers: Readonly<Record<string, string>> = {}): void {
  res.writeHead(status, {
    'content-type': contentType,
    'content-length': String(body.byteLength),
    'cache-control': 'no-store',
    ...headers,
  })
  res.end(body)
}

/**
 * Write one JSON response and refuse a body above the client's limit.
 * @param res - response owning the socket.
 * @param status - HTTP status.
 * @param value - JSON-serializable value.
 */
export function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = Buffer.from(JSON.stringify(value))
  if (body.byteLength > MAX_RESPONSE_BYTES) throw new RangeError('topask-api: response exceeds the client limit')
  write(res, status, body, 'application/json; charset=utf-8')
}
