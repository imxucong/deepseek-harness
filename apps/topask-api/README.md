# @topask/api

English | [中文](README.zh.md)

TopAsk's account protocol service. It implements the account protocol the shipped DeepSeek account provider already speaks, so a TopAsk build can authenticate against this service without changing the client transport.

## Summary

The service is a standalone Node program, not a Cordis application and not a `dsh` profile. It listens on HTTP, keeps accounts and grants in SQLite, and exposes the Platform-compatible endpoints listed below. Development builds sign in one configured identity; a real identity source replaces only the platform's authorize page. Browser pages live in `@topask/platform` at the configured platform origin, so this service returns JSON only.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth-api/v0/dsh/auth_init` | Start a browser sign-in attempt and return its authorization URL |
| `POST` | `/auth-api/v0/dsh/auth_exchange` | Verify PKCE and issue an account token |
| `POST` | `/auth-api/v0/dsh/auth_cancel` | Abandon one attempt |
| `GET` | `/auth-api/v0/users/current` | Read the signed-in profile |
| `GET` | `/api/v0/users/get_user_summary` | Read recharge and bonus wallets |
| `GET` | `/api/v0/users/get_unnotified_bonuses` | Read pending bonus notices |
| `POST` | `/api/v0/users/ack_bonus_notified` | Acknowledge one notice |
| `POST` | `/auth-api/v0/users/logout` | Revoke the presented token |
| `GET` | `/healthz` | Liveness probe |

Success responses carry `{ "code": 0, "data": { "biz_code": 0, "biz_data": … } }`. A non-zero `biz_code` is a business failure the client reports as a protocol error. An invalid or expired `x-dsh-auth-token` returns HTTP 401, which the client treats as a signed-out account. Responses stay below 65,536 bytes and never redirect.

### Internal endpoints

The platform app reads and completes one attempt through these endpoints. Both require `x-topask-internal-token` and are closed to other callers.

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/internal/attempts/:authorizeId` | Read the identity, state, and expiry the consent page renders |
| `POST` | `/internal/attempts/:authorizeId/decision` | Approve (returning the Host callback redirect) or deny one attempt |

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `TOPASK_PLATFORM_ORIGIN` | yes | Public platform origin browsers and the account provider use; HTTPS, or loopback HTTP for development |
| `TOPASK_INTERNAL_TOKEN` | yes | Shared secret the platform app presents on internal endpoints |
| `TOPASK_API_PORT` | no | Listen port; `8790` by default, `0` requests an OS-assigned port |
| `TOPASK_API_HOST` | no | Listen address; `127.0.0.1` by default |
| `TOPASK_API_DATA_DIR` | no | SQLite directory; `.topask-api` by default |
| `TOPASK_API_ATTEMPT_TTL_SECONDS` | no | Sign-in attempt lifetime; `600` by default |
| `TOPASK_API_TOKEN_TTL_DAYS` | no | Issued token lifetime; `30` by default |
| `TOPASK_API_DEV_USER_ID`, `_EMAIL`, `_NAME`, `_PICTURE` | no | Development identity the authorize page signs in |

Run it from the repository:

```sh
TOPASK_PLATFORM_ORIGIN=http://127.0.0.1:8791 TOPASK_INTERNAL_TOKEN=development pnpm --filter @topask/api start
```

From the repository root, `pnpm run dev:api` runs the service in watch mode with the committed `.env.development` defaults; process environment values take precedence.

The database file is `$TOPASK_API_DATA_DIR/account.sqlite`. It stores users, devices, sign-in attempts, and token hashes; raw tokens are never stored. Logout deletes the presented grant.

## Connect a profile

The platform app and the account provider share one origin:

```yaml
- id: deepseek-account
  config:
    platformOrigin: http://127.0.0.1:8791
    allowLoopbackHttp: true
    desktopPlatform: !!js "ctx.get('profileContext')?.name === 'desktop' && ['darwin', 'win32'].includes(process.platform) ? process.platform : null"
```

A patch replaces the row's whole config, so keep the shipped `desktopPlatform` line.

Model requests still target the configured inference origin, so keep an API-key model route until the model gateway ships. The account token is accepted only when `inferenceOrigin` matches the issuer that issued it.

## Security

The API accepts only loopback callback URIs with an explicit port and a known `/oauth/callback` path. An authorization code is single-use, bound to one redirect URI and PKCE challenge, and expires with its attempt. The service logs no tokens. The platform app renders the consent page and posts decisions here with the internal token; that token never reaches a browser. The platform's authorize page carries a restrictive content security policy and submits its form to the platform origin, which redirects to the Host's loopback callback on another port.

## Known Limitations and Deferred Work

- The only identity source is the development user; there is no password, SMS, or OIDC sign-in yet.
- Wallet balances are fixed at zero and bonus notices are always empty.
- Tokens have no refresh endpoint; the client re-authenticates after HTTP 401.
- The client-side provider split that offers both DeepSeek and TopAsk sign-in is not part of this package.
- Browser pages, platform home, usage, and top-up live in `@topask/platform`, not here.
