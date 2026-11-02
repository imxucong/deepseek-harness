# @topask/platform

English | [中文](README.zh.md)

TopAsk's public platform surface. It serves the authorization pages the account provider expects, the signed-in account overview, usage, and top-up pages, and the same-origin account API proxy. The operator admin console is a separate deployment.

## Summary

The platform is a standalone Node program, not a Cordis application and not a `dsh` profile. It owns the public `platformOrigin`: the account client opens `/dsh/authorize` and `/dsh/authorized` there, the account settings links point at `/usage` and `/top_up`, and `/auth-api/**` plus `/api/**` are proxied to `@topask/api`. Authorization pages are server-rendered with no script and a strict content security policy; signed-in pages run one same-origin script.

## Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/dsh/authorize?authorize_id=…` | Consent page rendered from the account API's internal attempt record |
| `POST` | `/dsh/authorize` | Approve or deny an attempt; approval redirects to the Host's loopback callback |
| `GET` | `/dsh/authorized?locale=…&login_source=…` | Completion page; a desktop login opens `dsh://open` |
| `GET` | `/` | Signed-in account overview |
| `GET` | `/usage` | Wallet balance and the deferred usage entry |
| `GET` | `/top_up` | Wallet balance and the deferred top-up entry |
| `GET` | `/assets/app.js` | Same-origin script for the signed-in pages |
| `GET` | `/healthz` | Liveness probe |
| `*` | `/auth-api/**`, `/api/**` | Proxied to `@topask/api` |

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `TOPASK_PLATFORM_ORIGIN` | yes | Public origin browsers and the account provider use; HTTPS, or loopback HTTP for development |
| `TOPASK_API_URL` | yes | Internal `@topask/api` origin |
| `TOPASK_INTERNAL_TOKEN` | yes | Shared secret presented on the account API's internal endpoints |
| `TOPASK_PLATFORM_PORT` | no | Listen port; `8791` by default, `0` requests an OS-assigned port |
| `TOPASK_PLATFORM_HOST` | no | Listen address; `127.0.0.1` by default |

## Embedded mode

Desktop loads `/usage` and `/top_up` in a `WebContentsView` and appends `dist` when the account provider configures `embeddedPageDist`. The preload exposes `window.dsh` with `displayMode: 'embedded'`, `getAuthToken()`, and `getLocale()`. The page script reads the account token from that bridge and calls `/auth-api/v0/users/current` and `/api/v0/users/get_user_summary` through the same-origin proxy; the token never reaches the URL or the internal token. A plain Web tab has no platform session yet and renders the signed-out note.

## Run locally

Start the account API and the platform in two terminals:

```sh
pnpm run dev:api
pnpm run dev:platform
```

`pnpm run dev:platform` loads the committed `.env.development`; process environment values take precedence. The platform listens on `http://127.0.0.1:8791` and proxies to the API on `http://127.0.0.1:8790`.

## Security

Authorization pages use `default-src 'none'`, inline styles only, and a form action limited to this origin and the Host's loopback callback. Signed-in pages allow one same-origin script and same-origin fetches only. `/internal/**` is never proxied, so the shared internal token stays between the platform and the account API. The completion page's `dsh://open` action only focuses the desktop app.

## Known Limitations and Deferred Work

- A plain Web tab has no platform session; only Desktop's embedded bridge supplies an account token.
- Usage detail, payment channels, and wallet mutation are not implemented; the pages show the current wallet balance and declared empty states.
- The operator admin console, its OIDC login, and its management APIs are a separate project.
