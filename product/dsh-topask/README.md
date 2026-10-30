# @topask/dsh-topask

English | [中文](README.zh.md)

TopAsk's white-label layer for DeepSeek Harness. One package carries two roles:

- **Bundle** — `dsh.bundle.patch` points at `cordis.patch.yml`, which disables the official brand row and inserts this package as the TopAsk brand row.
- **Browser brand plugin** — `dsh.client` declares the Web client bundle that fills the generic brand slots.

The DeepSeek kernel rows in `dsh-base` and `dsh-web-app` stay untouched: model routes, account, tools, persistence, sandbox policy, and telemetry are the shipped composition.

## What it changes

| Surface | Slot / mechanism | Result |
|---|---|---|
| Sidebar mark | `sidebar.brand.mark` | TopAsk speech-bubble monogram |
| Sidebar name | `sidebar.brand.name` | `TopAsk` wordmark |
| Conversation hero | `conversation.hero.brand.mark` | TopAsk monogram |
| Document title | `DSH_CLIENT_TITLE` build value | `TopAsk` |
| Favicon and manifest | `apps/web/public/` via `product/sync-web-assets.sh` | TopAsk assets |
| Desktop shell | Desktop profile bundles (`apps/desktop/src/project-manager.ts`) | Same sidebar and hero occupants; desktop menus, about, welcome, and tray copy come from `apps/desktop/src/locale.ts` |

The official `@deepseek-ai/dsh-client-ui-brand-official` row is disabled so the official mark cannot register beside these occupants.

## Build

```sh
pnpm --filter @topask/dsh-topask run build
```

`tsc -p` emits the node half under `lib/types`, then `tsdown` emits `lib/index.js` and `lib/client.js`. The client bundle is a module-table artifact: its import of React resolves through the shell's platform table, not through Node resolution. The build clears `lib/` first so a removed source file cannot leave a stale bundle behind.

## Install into a profile

The profile depends on this package and lists it last in `dsh.profile.bundles`:

```sh
DSH_HOME="${DSH_HOME:-$HOME/.topask}" pnpm dsh --profile topask \
  --from-default-profile web --dump-config
DSH_HOME="${DSH_HOME:-$HOME/.topask}" pnpm dsh plugin --profile topask \
  add "link:$PWD/product/dsh-topask"
```

`product/init-profile.sh` performs both steps and verifies the composed tree.

## Customize

- Brand name and mark geometry: `src/client/Brand.tsx`.
- Composition: `cordis.patch.yml`.
- Display metadata: `locale/en.json`, `locale/zh.json`.
- Product title: the `DSH_CLIENT_TITLE` value used by `product/build.sh`.

## Known limitations

- The Web document title is a build-time value; changing it requires rebuilding client artifacts.
- `TopAsk` renders as a proper noun rather than a translated string. Moving this package under `packages/client` would bring it into `verify-client-ui-i18n`, which requires locale-owned copy.
- Desktop product name, app id, artifact name, protocol scheme, and icons are owned by `apps/desktop`. The Desktop profile includes this bundle for the Web client brand, while packaging identifiers stay in `apps/desktop`.
- A packaged Desktop build needs this package in its runtime package set; the development profile links it automatically.
- This layer assumes the `web` profile. A headless, SDK, or ACP profile has no browser brand slot to fill, but mounting the bundle is harmless.
