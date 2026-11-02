# @topask/admin

[English](README.md) | 中文

TopAsk 的运营后台。它通过 OIDC/SSO 在独立域名上登录运营人员，并作为账户 API `/admin-api/**` 端点的 BFF：用户、授权、设备、登录尝试、钱包、赠金与运营审计日志。

## 概要

运营后台是独立的 Node 程序，不是 Cordis 应用，也不是 `dsh` profile。页面由服务端渲染，不带客户端脚本，并使用严格的内容安全策略。BFF 持有共享的 admin token 与运营身份，两者都不会进入浏览器。仅在回环地址可用的开发登录让一个固定身份无需身份提供方即可登录；生产环境使用 OIDC。

## 路由

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/login` | 按配置的登录模式展示登录页 |
| `GET` | `/auth/login` | 启动带 state、nonce 与 PKCE 的 OIDC 授权码流程 |
| `GET` | `/auth/callback` | 校验 state、兑换授权码、校验 ID token 并设置会话 |
| `POST` | `/auth/dev-login` | 回环地址上的开发登录 |
| `POST` | `/auth/logout` | 清除运营会话 |
| `GET` | `/` | 概览计数与最近运营操作 |
| `GET` | `/users` | 搜索并分页用户 |
| `GET` | `/users/:id` | 用户详情、钱包与授权 |
| `POST` | `/users/:id/disabled` | 停用或恢复一个账号 |
| `GET` | `/grants` | 搜索并分页授权 |
| `POST` | `/grants/:tokenHash/revoke` | 吊销一条授权 |
| `GET` | `/devices` | 分页设备记录 |
| `GET` | `/attempts` | 分页登录尝试 |
| `GET` | `/wallets` | 分页钱包 |
| `GET` | `/wallets/:userId` | 钱包详情与赠金账本 |
| `POST` | `/wallets/:userId/balance` | 设置普通余额 |
| `POST` | `/wallets/:userId/bonuses` | 发放赠金通知 |
| `GET` | `/audit` | 分页运营操作 |
| `GET` | `/healthz` | 存活探针 |

## 配置

| 变量 | 必填 | 含义 |
|---|---|---|
| `TOPASK_ADMIN_ORIGIN` | 是 | 公开的后台 origin；HTTPS，开发时可用回环 HTTP |
| `TOPASK_API_URL` | 是 | 内部 `@topask/api` origin |
| `TOPASK_ADMIN_TOKEN` | 是 | 访问 API 管理端点时携带的共享密钥 |
| `TOPASK_ADMIN_SESSION_SECRET` | 是 | 会话与 OIDC state Cookie 的 HMAC 密钥；至少 32 个字符 |
| `TOPASK_ADMIN_OIDC_ISSUER` | OIDC | 用于发现的提供方 issuer |
| `TOPASK_ADMIN_OIDC_CLIENT_ID` | OIDC | OIDC client id |
| `TOPASK_ADMIN_OIDC_CLIENT_SECRET` | OIDC | OIDC client secret |
| `TOPASK_ADMIN_OIDC_SCOPES` | 否 | 请求的 scope；默认 `openid email profile` |
| `TOPASK_ADMIN_OIDC_REDIRECT_URI` | 否 | 回调地址；默认 `$TOPASK_ADMIN_ORIGIN/auth/callback` |
| `TOPASK_ADMIN_ALLOWED_SUBJECTS` | OIDC | 允许运营后台的 OIDC subject，逗号分隔 |
| `TOPASK_ADMIN_ALLOWED_EMAILS` | OIDC | 允许运营后台的邮箱，逗号分隔 |
| `TOPASK_ADMIN_SESSION_HOURS` | 否 | 会话有效期；默认 `8` |
| `TOPASK_ADMIN_DEV_LOGIN` | 否 | `1` 启用回环地址上的开发登录 |
| `TOPASK_ADMIN_DEV_OPERATOR_SUBJECT`、`_EMAIL`、`_NAME` | 否 | 开发身份；默认 `dev-operator`、`ops@topask.local`、`TopAsk Operator` |
| `TOPASK_ADMIN_PORT`、`TOPASK_ADMIN_HOST` | 否 | 监听端口与地址；默认 `8792` 与 `127.0.0.1` |

## 安全

OIDC 使用带 state、nonce 与 S256 PKCE 的授权码流程；ID token 使用提供方 JWKS 校验 issuer、audience、nonce 与过期时间，校验通过后再检查允许列表。会话是 HMAC 签名的 `HttpOnly`、`SameSite=Lax` Cookie；每个写表单都带会话绑定的 CSRF token，并拒绝外部 origin。页面不运行脚本，只允许内联样式与同源表单动作。admin token 与运营身份保留在 BFF 中。开发登录仅在后台 origin 为回环 HTTP 时启用，因此不会出现在公开部署上。

## 本地运行

在两个终端分别启动账户 API 与运营后台：

```sh
pnpm run dev:api
pnpm run dev:admin
```

`pnpm run dev:admin` 会加载已提交的 `.env.development`，启用回环开发登录并以 `ops@topask.local` 登录。打开 `http://127.0.0.1:8792` 并选择开发登录。生产部署改为配置 OIDC 变量与运营允许列表。

## 已知限制与后续工作

- 运营人员共用一份允许列表；目前没有角色、scope 或按页面区分的权限。
- 审计日志记录后台写操作，不记录读取访问或运营登录事件。
- 钱包调整立即生效且没有版本记录；尚无对账或支付渠道。
- 后台界面目前只有中文。
