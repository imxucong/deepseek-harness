# Agent Note: TopAsk public platform and operator console split

Status: implemented

English | [中文](2026-11-02-topask-platform-admin-split.zh.md)

## Problem

The account client reaches browser surfaces at the configured platform origin: `/dsh/authorize` and `/dsh/authorized` for sign-in, and `/usage` plus `/top_up` for account links and Desktop's embedded view. `@topask/api` served those pages next to its JSON protocol and had no place for the signed-in account surface. The operator console is a different product with OIDC, an independent domain, and management data, so folding it into the same server would mix anonymous authorization pages with administrator sessions.

## Decision

`@topask/platform` owns the public platform origin. It renders the authorization pages from attempt facts read through the account API's internal endpoints, serves `/`, `/usage`, and `/top_up` with one same-origin script that reads the Desktop bridge token, and proxies `/auth-api/**` and `/api/**` to `@topask/api`. `/internal/**` is never proxied.

`@topask/api` keeps the Platform-compatible JSON protocol and adds the token-protected internal attempt endpoints. It owns the SQLite store; neither the platform nor a future console reads the database directly.

The authorization pages stay on the platform origin and remain script-free with `default-src 'none'`. The operator console will be a separate application and domain with OIDC/SSO; it cannot host these pages because the client requires the configured platform origin and the fixed authorization paths.

## Alternatives considered

**Keep browser pages in the account API.** It avoids a second process, but the API then mixes anonymous HTML, JSON protocol, and the future signed-in surface, and cannot give the signed-in pages a script policy without weakening the authorization pages.

**Serve every page from the operator console domain.** The client validates `platformOrigin` and the `/dsh/authorize` and `/dsh/authorized` paths, so an independent admin domain cannot serve them without changing the account protocol and its origin checks.

**One combined platform and admin application.** The two surfaces have different authentication, CSRF, cookie, and content-security boundaries. A shared public origin is required only for the platform; the operator console is deliberately separate.

## Consequences

Development runs two processes (`dev:api` and `dev:platform`) with a shared internal token. The platform pages depend on the Desktop bridge for an account token; a plain Web tab has no platform session yet. Usage detail, payment, and wallet mutation remain deferred. The split lets the operator console add OIDC and management APIs without touching the authorization surface or the client protocol.
