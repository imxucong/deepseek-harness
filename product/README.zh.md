# TopAsk 产品组合

[English](README.md) | 中文

TopAsk 以白标组合的方式打包在已发布的 DeepSeek Harness 包之上。Harness 保持为依赖；TopAsk 只交付一个改变品牌展示、保留 DeepSeek 内核的组合层。

## 分层

| 层 | 归属 | TopAsk 改动 |
|---|---|---|
| Harness 包 | `@deepseek-ai/dsh-*` | 不变 |
| 已发布的 profile 组合 | `@deepseek-ai/dsh-base`、`@deepseek-ai/dsh-web-app` | 不变 |
| TopAsk 组合层 | `product/dsh-topask` | 禁用官方品牌行，插入 TopAsk 行 |
| TopAsk 客户端插件 | `product/dsh-topask/src/client` | 填充侧边栏与首页品牌槽位 |
| 产品 profile | `$DSH_HOME/profiles/topask` | 将 TopAsk 组合层追加到最后 |
| 桌面 profile | `$DSH_HOME/profiles/desktop` | 应用 bundle 列表包含 TopAsk；开发 profile 会把该包链接进插件解析根目录 |
| 品牌素材 | `product/assets/` | TopAsk logo 源文件与生成的图标素材 |
| Web 资源 | `apps/web/public` | TopAsk favicon 与 manifest |

## 快速开始

```sh
pnpm install
product/build.sh
product/sync-web-assets.sh
product/init-profile.sh
product/run.sh
```

`product/run.sh` 使用 `DSH_HOME=~/.topask` 在默认端口启动 Web profile，因此 TopAsk 数据不会与个人的 `~/.dsh` 混用。

如需传递 Web 参数，在 profile 名之后追加：

```sh
product/run.sh topask --port 8080 --no-open
```

## 保留的 DeepSeek 部分

该组合保留已发布的模型路由、DeepSeek 账号、凭据、工具、会话持久化、沙箱策略与遥测。TopAsk 增加品牌层与第二个账号 Provider 行（`topask-account`），它使用同一套 Platform 协议对接 TopAsk 账号服务；随包发布的 DeepSeek 行仍然挂载，两个登录入口都可使用。TopAsk 不是模型提供方分叉。

后续如需替换模型路由，在 `product/dsh-topask/cordis.patch.yml` 中 patch `agent-default-model` 与 `llm-pi-ai`；这与当前品牌层是相互独立的产品决策。

## 文件

| 路径 | 用途 |
|---|---|
| `dsh-topask/` | 组合层 + 浏览器品牌包 |
| `assets/` | TopAsk logo 源文件与 Desktop 图标壳模板 |
| `apply-logo.mjs` | 生成 favicon、Desktop 图标、欢迎页 lockup 与安装器素材 |
| `build.sh` | 构建 harness 产物与 TopAsk 包 |
| `init-profile.sh` | 创建 profile、链接组合层、校验组合 |
| `run.sh` | 以隔离的 Harness home 启动 profile |
| `sync-web-assets.sh` | 复制 favicon 并更新 Web manifest |

## 分发

`product/dsh-topask` 在开发期是 `private` 并通过路径安装。要通过 registry 分发：

1. 移除 `private: true` 并设置发布 `version`。
2. 运行 `pnpm --filter @topask/dsh-topask run build`。
3. 发布到你的 registry。
4. 使用 `dsh plugin --profile topask add @topask/dsh-topask@<version>` 安装到 profile。

发布包携带预构建的 `lib/index.js`、`lib/client.js`、`cordis.patch.yml` 与 locale 元数据，因此使用方不需要 TypeScript 工具链。

## 品牌素材

`product/assets/topask-logo.svg` 是主 logo。`product/apply-logo.mjs` 会把内部引用内联成浏览器可渲染的路径，从 `product/assets/desktop-icon*.svg` 写出 Desktop 图标壳，并重新生成 Web favicon、Desktop PNG、欢迎页 lockup 与安装器素材。

修改 logo 或上游图标壳后：

```sh
node product/apply-logo.mjs
product/sync-web-assets.sh
pnpm --dir apps/desktop run render:tray-icon
pnpm --filter @deepseek-ai/dsh-web-frontend run render:app-icons
DSH_CLIENT_TITLE=TopAsk pnpm run build
```

## 跟进上游

TopAsk 的差异现在分为两层。组合与品牌素材仍位于 `product/`、生成的 Web app 图标以及 `pnpm-workspace.yaml` 条目；分叉级品牌名修改位于 `apps/desktop`（locale、开发 bundle、electron-builder 展示名、欢迎页品牌素材）以及拥有首启、账号、插件安全与文档预览文案的客户端 locale 字典。把这些修改集中维护，并在上游 locale 变更后重新套用；组合层仍然只是 bundle/profile。

## 仍带 DeepSeek 品牌的面

产品名已在 Web 外壳、首启引导、预览说明、插件安全文案，以及 Desktop 菜单、关于面板、欢迎页与托盘中统一为 TopAsk。以下表面有意保留 DeepSeek：

| 表面 | 归属 | 说明 |
|---|---|---|
| DeepSeek 账号 onboarding | `packages/client/ui-settings-account/src/client/locales.ts` | 文案为“登录 DeepSeek 账号”；内核继续使用 DeepSeek 账号时保留 |
| 官方 provider onboarding | `packages/client/ui-settings-models/src/client/locales.ts` | 配置官方 DeepSeek provider；内核继续使用 DeepSeek 模型路由时保留 |
| 发布更新源 | `apps/desktop/publishing/` | 更新源仍为上游 channel，直到 TopAsk 自己的发布基础设施就绪；产物文件名已为 `topask-*` |

locale registry 会拒绝同一 namespace 与 locale 的第二次注册，因此产品名直接在归属 locale 字典中修改，而不是由 TopAsk 包覆盖。上游 locale 变更后需要重新套用这些分叉修改。

## 桌面端与打包

Desktop 产品名与身份已是 TopAsk：electron-builder 使用 `productName: 'TopAsk'` 和本地 unsigned 构建 app id `com.topask.app`，协议展示名为 TopAsk，开发 bundle 为 `TopAsk Dev.app`，菜单、关于、欢迎页与托盘文案均为 TopAsk。打包流程会在 dsh family 旁构建并打包 `product/dsh-topask`，并从 `app.asar` 解包，因此打包构建会加载 TopAsk bundle；开发 profile 则把同一包链接到插件解析根目录。品牌图标、托盘、欢迎页与安装器素材由 `product/apply-logo.mjs` 从 `product/assets/topask-logo.svg` 生成。还剩一项打包工作：

1. 将自动更新源指向 TopAsk 自己的发布基础设施；产物文件名已为 `topask-*`。

## 品牌与许可证

DeepSeek Harness 使用 MIT 许可证；再分发构建中保留版权与许可声明。不要将 `DeepSeek Harness` 商标用作产品名。按照 `BRAND_GUIDELINES.zh.md` 的说明，将关系描述为“基于 DeepSeek Harness 构建”或“基于 DSH 构建”。
