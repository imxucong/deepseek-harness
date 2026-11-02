# @topask/admin

English | [中文](README.zh.md)

TopAsk's operator console. It signs operators in through OIDC/SSO on its own domain and acts as the BFF for the account API's `/admin-api/**` endpoints: users, grants, devices, login attempts, wallets, bonuses, and the operator audit log.

## Summary

The console is a standalone Node program, not a Cordis application and not a `dsh` profile. Pages are server-rendered with no client script and a strict content security policy. The BFF holds the shared admin token and the operator identity, so neither reaches the browser. A loopback-only development login signs in one configured identity without an identity provider; production uses OIDC.

## Routes

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/login` | Sign-in page with the configured provider mode |
| `GET` | `/auth/login` | Start the OIDC authorization-code flow with state, nonce, and PKCE |
| `GET` | `/auth/callback` | Verify the state, exchange the code, verify the ID token, and set the session |
| `POST` | `/auth/dev-login` | Loopback development sign-in |
| `POST` | `/auth/logout` | Clear the operator session |
| `GET` | `/` | Overview counts and recent operator actions |
| `GET` | `/users` | Search and page users |
| `GET` | `/users/:id` | User detail with wallet and grants |
| `POST` | `/users/:id/disabled` | Disable or re-enable an account |
| `GET` | `/grants` | Search and page grants |
| `POST` | `/grants/:tokenHash/revoke` | Revoke one grant |
| `GET` | `/devices` | Page recorded devices |
| `GET` | `/attempts` | Page sign-in attempts |
| `GET` | `/wallets` | Page wallets |
| `GET` | `/wallets/:userId` | Wallet detail and bonus ledger |
| `POST` | `/wallets/:userId/balance` | Set the normal balance |
| `POST` | `/wallets/:userId/bonuses` | Grant a bonus notice |
| `GET` | `/audit` | Page operator actions |
| `GET` | `/healthz` | Liveness probe |

## Configuration

| Variable | Required | Meaning |
|---|---|---|
| `TOPASK_ADMIN_ORIGIN` | yes | Public console origin; HTTPS, or loopback HTTP for development |
| `TOPASK_API_URL` | yes | Internal `@topask/api` origin |
| `TOPASK_ADMIN_TOKEN` | yes | Shared secret presented on the API's admin endpoints |
| `TOPASK_ADMIN_SESSION_SECRET` | yes | HMAC key for session and OIDC state cookies; at least 32 characters |
| `TOPASK_ADMIN_OIDC_ISSUER` | OIDC | Provider issuer used for discovery |
| `TOPASK_ADMIN_OIDC_CLIENT_ID` | OIDC | OIDC client id |
| `TOPASK_ADMIN_OIDC_CLIENT_SECRET` | OIDC | OIDC client secret |
| `TOPASK_ADMIN_OIDC_SCOPES` | no | Requested scopes; `openid email profile` by default |
| `TOPASK_ADMIN_OIDC_REDIRECT_URI` | no | Callback URL; `$TOPASK_ADMIN_ORIGIN/auth/callback` by default |
| `TOPASK_ADMIN_ALLOWED_SUBJECTS` | OIDC | Comma-separated OIDC subjects allowed to operate the console |
| `TOPASK_ADMIN_ALLOWED_EMAILS` | OIDC | Comma-separated operator emails allowed to operate the console |
| `TOPASK_ADMIN_SESSION_HOURS` | no | Session lifetime; `8` by default |
| `TOPASK_ADMIN_DEV_LOGIN` | no | `1` enables the loopback development login |
| `TOPASK_ADMIN_DEV_OPERATOR_SUBJECT`, `_EMAIL`, `_NAME` | no | Development identity; defaults to `dev-operator`, `ops@topask.local`, `TopAsk Operator` |
| `TOPASK_ADMIN_PORT`, `TOPASK_ADMIN_HOST` | no | Listen port and address; `8792` and `127.0.0.1` by default |

## Security

OIDC uses the authorization-code flow with state, nonce, and S256 PKCE; the ID token is verified against the provider's JWKS for issuer, audience, nonce, and expiry. The allowlist is checked after verification. The session is an HMAC-signed `HttpOnly` `SameSite=Lax` cookie; every state-changing form carries a session-bound CSRF token and rejects a foreign origin. Pages run no script and allow only inline styles and same-origin form actions. The admin token and operator identity stay in the BFF. The development login is refused unless the console origin is loopback HTTP, so it cannot be enabled on a public deployment.

## Run locally

Start the account API and the console in two terminals:

```sh
pnpm run dev:api
pnpm run dev:admin
```

`pnpm run dev:admin` loads the committed `.env.development`, which enables the loopback development login and signs in `ops@topask.local`. Open `http://127.0.0.1:8792` and choose the development sign-in. Production deployments configure the OIDC variables and the operator allowlist instead.

## Known Limitations and Deferred Work

- Operators share one allowlist; there are no roles, scopes, or per-section permissions yet.
- The audit log records console mutations, not read access or operator sign-in events.
- Wallet adjustments are immediate and unversioned; there is no reconciliation or payment provider.
- The console UI is Chinese-only.
