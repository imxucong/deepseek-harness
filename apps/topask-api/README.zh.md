# @topask/api

[English](README.md) | 中文

TopAsk 的账户协议服务。它实现随包发布的 DeepSeek 账户 Provider 已经在使用的账户协议，因此 TopAsk 构建无需改动客户端传输即可对接本服务完成登录。

## 概要

本服务是独立的 Node 程序，不是 Cordis 应用，也不是 `dsh` profile。它监听 HTTP，用 SQLite 保存账户、授权、钱包与运营审计，并暴露下面列出的 Platform 兼容端点。开发构建只登录一个固定身份；接入真实身份源时只需替换平台的授权页。浏览器页面位于配置的 platform origin 上的 `@topask/platform`，因此本服务只返回 JSON。运营后台通过 `@topask/admin` 访问 `/admin-api/**`。

## 端点

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/auth-api/v0/dsh/auth_init` | 发起一次浏览器登录尝试并返回授权地址 |
| `POST` | `/auth-api/v0/dsh/auth_exchange` | 校验 PKCE 并签发账户 token |
| `POST` | `/auth-api/v0/dsh/auth_cancel` | 放弃一次登录尝试 |
| `GET` | `/auth-api/v0/users/current` | 读取已登录资料 |
| `GET` | `/api/v0/users/get_user_summary` | 读取充值与赠金钱包 |
| `GET` | `/api/v0/users/get_unnotified_bonuses` | 读取未展示的赠金通知 |
| `POST` | `/api/v0/users/ack_bonus_notified` | 确认一条通知已展示 |
| `POST` | `/auth-api/v0/users/logout` | 吊销请求携带的 token |
| `GET` | `/healthz` | 存活探针 |

成功响应为 `{ "code": 0, "data": { "biz_code": 0, "biz_data": … } }`。`biz_code` 非零表示业务失败，客户端按协议错误提示。无效或过期的 `x-dsh-auth-token` 返回 HTTP 401，客户端据此认定账号已退出。响应体不超过 65,536 字节，且这些端点不使用重定向。

### 内部端点

平台应用通过以下端点读取并完成一次登录尝试。两者都要求 `x-topask-internal-token`，不对其他调用方开放。

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/internal/attempts/:authorizeId` | 读取授权页展示的身份、状态与过期时间 |
| `POST` | `/internal/attempts/:authorizeId/decision` | 允许（返回 Host 回调地址）或取消一次登录尝试 |

### 运营端点

运营后台在 OIDC 会话内调用这些端点。每个请求都要求 `x-topask-admin-token` 以及运营身份头 `x-topask-operator-subject` 与 `x-topask-operator-email`；写操作会追加一条审计记录。停用账号会阻止新的登录，并拒绝该账号已有的授权。

| 方法 | 路径 | 用途 |
|---|---|---|
| `GET` | `/admin-api/overview` | 用户、授权、设备与登录尝试计数 |
| `GET` | `/admin-api/users` | 搜索并分页用户 |
| `GET` | `/admin-api/users/:id` | 单个用户及其钱包与赠金 |
| `POST` | `/admin-api/users/:id/disabled` | 停用或恢复一个账号 |
| `GET` | `/admin-api/grants` | 搜索并分页授权 |
| `DELETE` | `/admin-api/grants/:tokenHash` | 吊销一条授权 |
| `GET` | `/admin-api/devices` | 分页设备记录 |
| `GET` | `/admin-api/attempts` | 分页登录尝试及其状态 |
| `GET` | `/admin-api/wallets` | 分页钱包 |
| `GET` | `/admin-api/wallets/:userId` | 单个钱包与赠金账本 |
| `POST` | `/admin-api/wallets/:userId/balance` | 设置普通余额 |
| `POST` | `/admin-api/wallets/:userId/bonuses` | 发放赠金通知并累加赠金总额 |
| `GET` | `/admin-api/audit` | 分页运营操作 |

## 配置

| 变量 | 必填 | 含义 |
|---|---|---|
| `TOPASK_PLATFORM_ORIGIN` | 是 | 浏览器与账户 Provider 使用的公开 platform origin；HTTPS，开发时可用回环 HTTP |
| `TOPASK_INTERNAL_TOKEN` | 是 | 平台应用访问内部端点时携带的共享密钥 |
| `TOPASK_ADMIN_TOKEN` | 是 | 运营后台 BFF 访问管理端点时携带的共享密钥 |
| `TOPASK_API_PORT` | 否 | 监听端口；默认 `8790`，`0` 表示由系统分配 |
| `TOPASK_API_HOST` | 否 | 监听地址；默认 `127.0.0.1` |
| `TOPASK_API_DATA_DIR` | 否 | SQLite 目录；默认 `.topask-api` |
| `TOPASK_API_ATTEMPT_TTL_SECONDS` | 否 | 登录尝试有效期；默认 `600` |
| `TOPASK_API_TOKEN_TTL_DAYS` | 否 | 签发 token 有效期；默认 `30` |
| `TOPASK_API_DEV_USER_ID`、`_EMAIL`、`_NAME`、`_PICTURE` | 否 | 授权页使用的开发身份 |

在仓库内运行：

```sh
TOPASK_PLATFORM_ORIGIN=http://127.0.0.1:8791 TOPASK_INTERNAL_TOKEN=development TOPASK_ADMIN_TOKEN=development pnpm --filter @topask/api start
```

在仓库根目录执行 `pnpm run dev:api` 会以监听模式启动本服务，并加载已提交的 `.env.development` 默认值；进程环境变量的值优先。

数据库文件为 `$TOPASK_API_DATA_DIR/account.sqlite`，保存用户、设备、登录尝试、token 哈希、钱包、赠金与运营审计；明文 token 不落盘，退出登录会删除对应授权。schema 使用 `PRAGMA user_version`（当前为 2）；打开旧数据库会补充停用标记、授权创建时间，以及钱包、赠金账本与审计表。

## 接入 profile

平台应用与账户 Provider 共用一个 origin：

```yaml
- id: deepseek-account
  config:
    platformOrigin: http://127.0.0.1:8791
    allowLoopbackHttp: true
    desktopPlatform: !!js "ctx.get('profileContext')?.name === 'desktop' && ['darwin', 'win32'].includes(process.platform) ? process.platform : null"
```

补丁会整体替换该行 config，请保留随包发布的 `desktopPlatform` 行。

模型请求仍指向配置的推理来源，因此在模型网关上线前请保留 API-key 模型路由。账户 token 只在 `inferenceOrigin` 与签发方一致时才会被使用。

## 安全

API 只接受带显式端口的回环回调地址，且路径必须是已知的 `/oauth/callback`。授权码一次性使用，绑定一个回调地址与 PKCE challenge，并随登录尝试过期。服务不记录 token。平台应用渲染授权页，并携带内部 token 把决定提交到这里；该 token 不会进入浏览器。平台授权页带有严格的内容安全策略，表单提交到 platform origin，再由其重定向到 Host 位于另一个端口的回环回调。管理请求要求独立的 admin token 与运营身份；停用账号会阻止新的登录尝试并拒绝其已有授权，每次写操作都会追加审计记录。

## 已知限制与后续工作

- 身份源目前只有开发用户，尚无密码、短信或 OIDC 登录。
- 钱包余额与赠金通知由运营后台通过管理 API 维护；目前没有支付渠道。
- token 没有刷新端点，客户端在 HTTP 401 后重新登录。
- 同时提供 DeepSeek 与 TopAsk 两个登录入口的客户端 Provider 拆分不在本包范围内。
- 浏览器页面、平台首页、用量与充值位于 `@topask/platform`，不在本包内。
