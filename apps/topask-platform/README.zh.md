# @topask/platform

[English](README.md) | 中文

TopAsk 的公开平台。它提供账户 Provider 需要的授权页、登录后的账号概览、用量与充值页，以及同源的账户 API 反向代理。运营管理后台是另一个独立部署。

## 概要

平台是独立的 Node 程序，不是 Cordis 应用，也不是 `dsh` profile。它拥有公开的 `platformOrigin`：账户客户端在该 origin 打开 `/dsh/authorize` 与 `/dsh/authorized`，账号设置链接指向 `/usage` 与 `/top_up`，`/auth-api/**` 与 `/api/**` 被代理到 `@topask/api`。授权页由服务端渲染，不带脚本，并使用严格的内容安全策略；登录后的页面运行一个同源脚本。

## 路由

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/dsh/authorize?authorize_id=…` | 根据账户 API 的内部登录尝试记录渲染授权页 |
| `POST` | `/dsh/authorize` | 允许或取消一次登录尝试；允许后重定向到 Host 的回环回调 |
| `GET` | `/dsh/authorized?locale=…&login_source=…` | 完成页；桌面端登录会打开 `dsh://open` |
| `GET` | `/` | 登录后的账号概览 |
| `GET` | `/usage` | 钱包余额与尚未接入的用量入口 |
| `GET` | `/top_up` | 钱包余额与尚未接入的充值入口 |
| `GET` | `/assets/app.js` | 登录后页面使用的同源脚本 |
| `GET` | `/healthz` | 存活探针 |
| `*` | `/auth-api/**`、`/api/**` | 反向代理到 `@topask/api` |

## 配置

| 变量 | 必填 | 含义 |
|---|---|---|
| `TOPASK_PLATFORM_ORIGIN` | 是 | 浏览器与账户 Provider 使用的公开 origin；HTTPS，开发时可用回环 HTTP |
| `TOPASK_API_URL` | 是 | 内部 `@topask/api` origin |
| `TOPASK_INTERNAL_TOKEN` | 是 | 访问账户 API 内部端点时携带的共享密钥 |
| `TOPASK_PLATFORM_PORT` | 否 | 监听端口；默认 `8791`，`0` 表示由系统分配 |
| `TOPASK_PLATFORM_HOST` | 否 | 监听地址；默认 `127.0.0.1` |

## 内嵌模式

Desktop 在 `WebContentsView` 中加载 `/usage` 与 `/top_up`，并在账户 Provider 配置了 `embeddedPageDist` 时附加 `dist`。preload 暴露 `window.dsh`，包含 `displayMode: 'embedded'`、`getAuthToken()` 与 `getLocale()`。页面脚本从该桥接读取账户 token，并通过同源代理调用 `/auth-api/v0/users/current` 与 `/api/v0/users/get_user_summary`；token 不会进入 URL，内部 token 也不会到达浏览器。普通 Web 标签页目前没有平台会话，会显示未登录提示。

## 本地运行

在两个终端分别启动账户 API 与平台：

```sh
pnpm run dev:api
pnpm run dev:platform
```

`pnpm run dev:platform` 会加载已提交的 `.env.development`；进程环境变量的值优先。平台监听 `http://127.0.0.1:8791`，并代理到 `http://127.0.0.1:8790` 的 API。

## 安全

授权页使用 `default-src 'none'`、仅内联样式，表单动作只允许本 origin 与 Host 的回环回调。登录后的页面只允许一个同源脚本与同源请求。`/internal/**` 不会被代理，因此共享的内部 token 只存在于平台与账户 API 之间。完成页的 `dsh://open` 操作只用于聚焦桌面应用。

## 已知限制与后续工作

- 普通 Web 标签页没有平台会话；只有 Desktop 的内嵌桥接会提供账户 token。
- 用量明细、支付渠道与钱包写入尚未实现；页面只展示当前钱包余额与明确的空状态。
- 运营管理后台、其 OIDC 登录与管理 API 是另一个独立项目。
