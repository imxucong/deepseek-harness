# @topask/dsh-topask

[English](README.md) | 中文

TopAsk 面向 DeepSeek Harness 的白标层。一个包承担两个角色：

- **组合层**——`dsh.bundle.patch` 指向 `cordis.patch.yml`，禁用官方品牌行，并把本包作为 TopAsk 品牌行插入。
- **浏览器品牌插件**——`dsh.client` 声明填充通用品牌槽位的 Web 客户端 bundle。

`dsh-base` 与 `dsh-web-app` 中的 DeepSeek 内核行保持不变：模型路由、账号、工具、持久化、沙箱策略与遥测都沿用已发布的组合。

## 改动内容

| 表面 | 槽位 / 机制 | 结果 |
|---|---|---|
| 侧边栏标识 | `sidebar.brand.mark` | TopAsk 对话气泡字标 |
| 侧边栏名称 | `sidebar.brand.name` | `TopAsk` 字标 |
| 会话首页 | `conversation.hero.brand.mark` | TopAsk 字标 |
| 文档标题 | `DSH_CLIENT_TITLE` 构建值 | `TopAsk` |
| Favicon 与 manifest | `apps/web/public/`，经 `product/sync-web-assets.sh` | TopAsk 资源 |
| 桌面外壳 | Desktop profile bundle（`apps/desktop/src/project-manager.ts`） | 同样的侧边栏与首页占位；桌面菜单、关于、欢迎页与托盘文案来自 `apps/desktop/src/locale.ts` |

官方 `@deepseek-ai/dsh-client-ui-brand-official` 行被禁用，因此官方标识不会与这些占位实现同时注册。

## 构建

```sh
pnpm --filter @topask/dsh-topask run build
```

`tsc -p` 把 Node 半边输出到 `lib/types`，随后 `tsdown` 生成 `lib/index.js` 与 `lib/client.js`。客户端 bundle 是模块表产物：它对 React 的 import 通过 shell 的平台表解析，而不是通过 Node 解析。构建会先清空 `lib/`，避免被删除的源文件留下陈旧 bundle。

## 安装到 profile

profile 依赖本包，并在 `dsh.profile.bundles` 中把它放在最后：

```sh
DSH_HOME="${DSH_HOME:-$HOME/.topask}" pnpm dsh --profile topask \
  --from-default-profile web --dump-config
DSH_HOME="${DSH_HOME:-$HOME/.topask}" pnpm dsh plugin --profile topask \
  add "link:$PWD/product/dsh-topask"
```

`product/init-profile.sh` 会执行这两步并校验组合后的配置树。

## 自定义

- 品牌名称与标识几何：`src/client/Brand.tsx`。
- 组合：`cordis.patch.yml`。
- 展示元数据：`locale/en.json`、`locale/zh.json`。
- 产品标题：`product/build.sh` 使用的 `DSH_CLIENT_TITLE` 值。

## 已知限制

- Web 文档标题是构建期值；修改后需要重新构建客户端产物。
- `TopAsk` 作为专有名词渲染，而不是翻译字符串。若把本包移动到 `packages/client` 下，它会进入 `verify-client-ui-i18n` 的检查范围，届时需要使用 locale 字典。
- 桌面产品名、app id、产物名、协议 scheme 与图标归 `apps/desktop` 所有。Desktop profile 会包含本 bundle 以提供 Web 客户端品牌，而打包标识仍留在 `apps/desktop`。
- 打包 Desktop 需要把本包加入其运行时包集；开发 profile 会自动链接它。
- 本层假设使用 `web` profile。headless、SDK 或 ACP profile 没有可填充的浏览器品牌槽位，但挂载该组合层是无害的。
