# TopAsk product assembly

English | [中文](README.zh.md)

TopAsk is packaged as a white-label composition over the shipped DeepSeek Harness packages. The harness stays a dependency; TopAsk ships one bundle that changes brand presentation and keeps the DeepSeek kernel.

## Layers

| Layer | Owner | TopAsk change |
|---|---|---|
| Harness packages | `@deepseek-ai/dsh-*` | Unchanged |
| Shipped profile bundles | `@deepseek-ai/dsh-base`, `@deepseek-ai/dsh-web-app` | Unchanged |
| TopAsk bundle | `product/dsh-topask` | Disables the official brand row and inserts the TopAsk row |
| TopAsk client plugin | `product/dsh-topask/src/client` | Fills the sidebar and hero brand slots |
| Product profile | `$DSH_HOME/profiles/topask` | Appends the TopAsk bundle last |
| Desktop profile | `$DSH_HOME/profiles/desktop` | Application bundle list includes TopAsk; the development profile links the package into its plugin root |
| Web assets | `apps/web/public` | TopAsk favicon and manifest |

## Quick start

```sh
pnpm install
product/build.sh
product/sync-web-assets.sh
product/init-profile.sh
product/run.sh
```

`product/run.sh` starts the Web profile on the default port with `DSH_HOME=~/.topask`, so TopAsk data does not mix with a personal `~/.dsh`.

To pass Web flags, append them after the profile name:

```sh
product/run.sh topask --port 8080 --no-open
```

## What stays DeepSeek

The composition keeps the shipped model routes, DeepSeek account, credentials, tools, session persistence, sandbox policy, and telemetry. TopAsk is a brand layer, not a provider fork.

To replace the model route later, patch `agent-default-model` and `llm-pi-ai` in `product/dsh-topask/cordis.patch.yml`; that is a separate product decision from this brand layer.

## Files

| Path | Purpose |
|---|---|
| `dsh-topask/` | The bundle + browser brand package |
| `assets/` | TopAsk favicon sources |
| `build.sh` | Build harness artifacts and the TopAsk package |
| `init-profile.sh` | Create the profile, link the bundle, verify composition |
| `run.sh` | Start the profile with an isolated Harness home |
| `sync-web-assets.sh` | Copy favicons and update the Web manifest |

## Distribution

`product/dsh-topask` is `private` and installed by path while developing. To ship it through a registry:

1. Remove `private: true` and set the release `version`.
2. Run `pnpm --filter @topask/dsh-topask run build`.
3. Publish to your registry.
4. Install it into the profile with `dsh plugin --profile topask add @topask/dsh-topask@<version>`.

The published package carries the prebuilt `lib/index.js`, `lib/client.js`, `cordis.patch.yml`, and locale metadata, so consumers need no TypeScript toolchain.

## Updating upstream

The TopAsk diff now spans two layers. Composition stays in `product/` plus the two Web asset files and the `pnpm-workspace.yaml` entry. Fork-level brand-name edits live in `apps/desktop` (locale, development bundle, electron-builder display name, welcome artwork) and in the client locale dictionaries that own first-run, account, plugin safety, and document-preview copy. Keep those edits grouped and re-apply them after an upstream locale change; the bundle/profile layer remains the only composition change.

## Remaining DeepSeek-branded surfaces

The product name is TopAsk across the Web shell, first-run onboarding, preview notice, plugin safety copy, and Desktop menus, about panel, welcome page, and tray. These remaining surfaces intentionally keep DeepSeek:

| Surface | Owner | Note |
|---|---|---|
| DeepSeek account onboarding | `packages/client/ui-settings-account/src/client/locales.ts` | Says "Sign in to your DeepSeek account"; keep while the kernel uses DeepSeek accounts |
| Official provider onboarding | `packages/client/ui-settings-models/src/client/locales.ts` | Configures the official DeepSeek provider; keep while the kernel uses DeepSeek model routes |
| Desktop icons and artwork | `apps/desktop/resources/` | Still the upstream mark; replace it with TopAsk artwork when final assets are ready |
| Release artifact filenames and update feed | `apps/desktop/scripts/`, `apps/desktop/publishing/` | Artifact names remain `deepseek-harness-*` and the update feed remains the upstream channel until TopAsk release infrastructure exists |

The locale registry rejects a second registration of the same namespace and locale, so the product name is changed in the owning locale dictionaries instead of being overlaid from the TopAsk package. Re-apply those fork edits after an upstream locale change.

## Desktop and packaging

The Desktop product name is TopAsk: electron-builder uses `productName: 'TopAsk'`, the protocol display name is TopAsk, the development bundle is `TopAsk Dev.app`, and menu, about, welcome, and tray copy is TopAsk. The development desktop profile adds `@topask/dsh-topask` to its application bundle list and links the package into the profile's plugin resolution root. Three packaging items remain:

1. Add the private `@topask/dsh-topask` tarball to the Desktop runtime package set; `createRuntimeProjectMetadata` enables the bundle automatically once the package set contains it.
2. Replace `apps/desktop/resources/icon*.svg` and regenerate the PNG and ICO variants.
3. Decide whether release artifact filenames and the update feed move from `deepseek-harness-*` and upstream channels to TopAsk's own infrastructure; the example app id is already `com.topask.app`.

## Brand and license

DeepSeek Harness is MIT licensed; keep the copyright and permission notice in redistributed builds. Do not use the `DeepSeek Harness` trademark as the product name. Describe the relationship as "built on DeepSeek Harness" or "built on DSH" per `BRAND_GUIDELINES.md`.
