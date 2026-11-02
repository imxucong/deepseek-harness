/** Shared HTML and JSON response helpers for the platform server. */
import type { ServerResponse } from 'node:http'

/** Largest response body the platform writes. */
export const MAX_RESPONSE_BYTES = 65_536

/**
 * Content policy for authorization pages. The form posts to this origin and the
 * server then redirects to the Host's loopback callback on another port.
 */
export const AUTH_CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; "
  + "form-action 'self' http://127.0.0.1:* http://localhost:* http://[::1]:*"

/** Content policy for signed-in platform pages, which run one same-origin script. */
export const PLATFORM_CONTENT_SECURITY_POLICY = "default-src 'none'; style-src 'unsafe-inline'; "
  + "script-src 'self'; connect-src 'self'; img-src 'self' data:; form-action 'self'"

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
 * Write one HTML response without caching it.
 * @param res - response owning the socket.
 * @param status - HTTP status.
 * @param html - complete document.
 * @param policy - content security policy for this page class.
 */
export function sendHtml(res: ServerResponse, status: number, html: string, policy: string): void {
  const body = Buffer.from(html)
  if (body.byteLength > MAX_RESPONSE_BYTES) throw new RangeError('topask-platform: response exceeds the client limit')
  write(res, status, body, 'text/html; charset=utf-8', { 'content-security-policy': policy })
}

/**
 * Write one JSON response.
 * @param res - response owning the socket.
 * @param status - HTTP status.
 * @param value - JSON-serializable value.
 */
export function sendJson(res: ServerResponse, status: number, value: unknown): void {
  const body = Buffer.from(JSON.stringify(value))
  if (body.byteLength > MAX_RESPONSE_BYTES) throw new RangeError('topask-platform: response exceeds the client limit')
  write(res, status, body, 'application/json; charset=utf-8')
}

/** Escape one value for HTML text and attribute positions. @param value - untrusted text. @returns escaped text. */
export function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}
