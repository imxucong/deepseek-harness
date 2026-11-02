# @topask/api

English | [中文](README.zh.md)

TopAsk's backend service. It implements the account protocol the shipped DeepSeek account provider already speaks, so a TopAsk build can authenticate against this service without changing the client transport.

## Summary

The service is a standalone Node program, not a Cordis application and not a `dsh` profile. It listens on HTTP, keeps accounts and grants in SQLite, and exposes the Platform-compatible endpoints listed below. Development builds sign in one configured identity; a real identity source replaces only the authorize page.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/auth-api/v0/dsh/auth_init` | Start a browser sign-in attempt and return its authorization URL |
| `GET` | `/dsh/authorize` | Browser approval page |
| `POST` | `/dsh/authorize` | Approve or cancel one attempt |
| `POST` | `/auth-api/v0/dsh/auth_exchange` | Verify PKCE and issue an account token |
| `POST` | `/auth-api/v0/dsh/auth_cancel` | Abandon one attempt |
| `GET` | `/dsh/authorized` | Browser completion page |
| `GET` | `/auth-api/v0/users/current` | Read the signed-in profile |
| `GET` | `/api/v0/users/get_user_summary` | Read recharge and bonus wallets |
| `GET` | `/api/v0/users/get_unnotified_bonuses` | Read pending bonus notices |
| `POST` | `/api/v0/users/ack_bonus_notified` | Acknowledge one notice |
| `POST` | `/auth-api/v0/users/logout` | Revoke the presented token |
| `GET` | `/healthz` | Liveness probe |

Success responses carry `{ "code": 0, "data": { "biz_code": 0, "biz_data": … } }`. A non-zero `biz_code` is a business failure the client reports as a protocol error. An invalid or expired `x-dsh-auth-token` returns HTTP 401, which the client treats as a signed-out account. Responses stay below 65,536 bytes and never redirect.

## Browser pages

Browser pages share one responsive shell: a white content pane with the TopAsk mark and a dark branded pane carrying the product tagline. The consent page shows the configured development identity and posts approve or deny to `/dsh/authorize`. `/dsh/authorized` reads `locale` and `login_source`; a desktop login renders an **Open app** action that opens `dsh://open`, while a web login leaves the page informational. The consent page uses the locale recorded by `auth_init`, and `auth_exchange` returns an `authorized_url` carrying that locale.

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `TOPASK_API_ORIGIN` | yes | Public origin browsers use; HTTPS, or loopback HTTP for development |
| `TOPASK_API_PORT` | no | Listen port; `8790` by default, `0` requests an OS-assigned port |
| `TOPASK_API_HOST` | no | Listen address; `127.0.0.1` by default |
| `TOPASK_API_DATA_DIR` | no | SQLite directory; `.topask-api` by default |
| `TOPASK_API_ATTEMPT_TTL_SECONDS` | no | Sign-in attempt lifetime; `600` by default |
| `TOPASK_API_TOKEN_TTL_DAYS` | no | Issued token lifetime; `30` by default |
| `TOPASK_API_DEV_USER_ID`, `_EMAIL`, `_NAME`, `_PICTURE` | no | Development identity the authorize page signs in |

Run it from the repository:

```sh
TOPASK_API_ORIGIN=http://127.0.0.1:8790 pnpm --filter @topask/api start
```

From the repository root, `pnpm run dev:api` runs the service in watch mode on `http://127.0.0.1:8790`. The development entry fills unset variables from the committed `.env.development`; process environment values take precedence.

The database file is `$TOPASK_API_DATA_DIR/account.sqlite`. It stores users, devices, sign-in attempts, and token hashes; raw tokens are never stored. Logout deletes the presented grant.

## Connect a profile

Until the client offers a separate TopAsk sign-in entry, point the existing account provider at this service in a profile patch:

```yaml
- id: deepseek-account
  config:
    platformOrigin: http://127.0.0.1:8790
    allowLoopbackHttp: true
    desktopPlatform: !!js "ctx.get('profileContext')?.name === 'desktop' && ['darwin', 'win32'].includes(process.platform) ? process.platform : null"
```

A patch replaces the row's whole config, so keep the shipped `desktopPlatform` line.

Model requests still target the configured inference origin, so keep an API-key model route until the model gateway ships. The account token is accepted only when `inferenceOrigin` matches the issuer that issued it.

## Security

The authorize endpoint accepts only loopback callback URIs with an explicit port and a known `/oauth/callback` path. An authorization code is single-use, bound to one redirect URI and PKCE challenge, and expires with its attempt. The service logs no tokens, and the only browser-facing pages carry a restrictive content security policy. The approval form posts here and then redirects to the Host's loopback callback on another port, which `form-action` also checks, so the policy allows form submissions to loopback hosts on any port.

## Known Limitations and Deferred Work

- The only identity source is the development user; there is no password, SMS, or OIDC sign-in yet.
- Wallet balances are fixed at zero and bonus notices are always empty.
- Tokens have no refresh endpoint; the client re-authenticates after HTTP 401.
- The client-side provider split that offers both DeepSeek and TopAsk sign-in is not part of this package.
- Browser pages are available in Chinese and English; other client locales use English.
