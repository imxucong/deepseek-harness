# @topask/api

[English](README.md) | 中文

TopAsk 的后台服务。它实现随包发布的 DeepSeek 账户 Provider 已经在使用的账户协议，因此 TopAsk 构建无需改动客户端传输即可对接本服务完成登录。

## 概要

本服务是独立的 Node 程序，不是 Cordis 应用，也不是 `dsh` profile。它监听 HTTP，用 SQLite 保存账户与授权，并暴露下面列出的 Platform 兼容端点。开发构建只登录一个固定身份；接入真实身份源时只需替换授权页。

## 端点

| 方法 | 路径 | 用途 |
|---|---|---|
| `POST` | `/auth-api/v0/dsh/auth_init` | 发起一次浏览器登录尝试并返回授权地址 |
| `GET` | `/dsh/authorize` | 浏览器授权页 |
| `POST` | `/dsh/authorize` | 允许或取消一次登录尝试 |
| `POST` | `/auth-api/v0/dsh/auth_exchange` | 校验 PKCE 并签发账户 token |
| `POST` | `/auth-api/v0/dsh/auth_cancel` | 放弃一次登录尝试 |
| `GET` | `/dsh/authorized` | 浏览器完成页 |
| `GET` | `/auth-api/v0/users/current` | 读取已登录资料 |
| `GET` | `/api/v0/users/get_user_summary` | 读取充值与赠金钱包 |
| `GET` | `/api/v0/users/get_unnotified_bonuses` | 读取未展示的赠金通知 |
| `POST` | `/api/v0/users/ack_bonus_notified` | 确认一条通知已展示 |
| `POST` | `/auth-api/v0/users/logout` | 吊销请求携带的 token |
| `GET` | `/healthz` | 存活探针 |

成功响应为 `{ "code": 0, "data": { "biz_code": 0, "biz_data": … } }`。`biz_code` 非零表示业务失败，客户端按协议错误提示。无效或过期的 `x-dsh-auth-token` 返回 HTTP 401，客户端据此认定账号已退出。响应体不超过 65,536 字节，且这些端点不使用重定向。

## 浏览器页面

浏览器页面共用一套响应式外壳：左侧白色内容区显示 TopAsk 标识，右侧深色品牌区显示产品标语。授权页展示配置的开发身份，并把允许或取消提交到 `/dsh/authorize`。`/dsh/authorized` 读取 `locale` 与 `login_source`：桌面端登录会渲染“打开应用”操作并打开 `dsh://open`，Web 登录只保留提示信息。授权页使用 `auth_init` 记录的语言，`auth_exchange` 返回的 `authorized_url` 会带上该语言。

## 配置

| 变量 | 必填 | 含义 |
|---|---|---|
| `TOPASK_API_ORIGIN` | 是 | 浏览器访问的公开 origin；HTTPS，开发时可用回环 HTTP |
| `TOPASK_API_PORT` | 否 | 监听端口；默认 `8790`，`0` 表示由系统分配 |
| `TOPASK_API_HOST` | 否 | 监听地址；默认 `127.0.0.1` |
| `TOPASK_API_DATA_DIR` | 否 | SQLite 目录；默认 `.topask-api` |
| `TOPASK_API_ATTEMPT_TTL_SECONDS` | 否 | 登录尝试有效期；默认 `600` |
| `TOPASK_API_TOKEN_TTL_DAYS` | 否 | 签发 token 有效期；默认 `30` |
| `TOPASK_API_DEV_USER_ID`、`_EMAIL`、`_NAME`、`_PICTURE` | 否 | 授权页使用的开发身份 |

在仓库内运行：

```sh
TOPASK_API_ORIGIN=http://127.0.0.1:8790 pnpm --filter @topask/api start
```

在仓库根目录执行 `pnpm run dev:api` 会以监听模式在 `http://127.0.0.1:8790` 启动本服务。开发入口会用已提交的 `.env.development` 补齐未设置的变量，进程环境变量的值优先。

数据库文件为 `$TOPASK_API_DATA_DIR/account.sqlite`，保存用户、设备、登录尝试与 token 哈希；明文 token 不落盘，退出登录会删除对应授权。

## 接入 profile

在客户端提供独立的 TopAsk 登录入口之前，先在 profile 补丁里把现有账户 Provider 指向本服务：

```yaml
- id: deepseek-account
  config:
    platformOrigin: http://127.0.0.1:8790
    allowLoopbackHttp: true
    desktopPlatform: !!js "ctx.get('profileContext')?.name === 'desktop' && ['darwin', 'win32'].includes(process.platform) ? process.platform : null"
```

补丁会整体替换该行 config，请保留随包发布的 `desktopPlatform` 行。

模型请求仍指向配置的推理来源，因此在模型网关上线前请保留 API-key 模型路由。账户 token 只在 `inferenceOrigin` 与签发方一致时才会被使用。

## 安全

授权端点只接受带显式端口的回环回调地址，且路径必须是已知的 `/oauth/callback`。授权码一次性使用，绑定一个回调地址与 PKCE challenge，并随登录尝试过期。服务不记录 token；面向浏览器的页面带有严格的内容安全策略。授权表单先提交到本服务，再重定向到 Host 位于另一个端口的回环回调，`form-action` 也会校验该跳转，因此策略允许向任意端口的回环主机提交表单。

## 已知限制与后续工作

- 身份源目前只有开发用户，尚无密码、短信或 OIDC 登录。
- 钱包余额固定为零，赠金通知恒为空。
- token 没有刷新端点，客户端在 HTTP 401 后重新登录。
- 同时提供 DeepSeek 与 TopAsk 两个登录入口的客户端 Provider 拆分不在本包范围内。
- 浏览器页面提供中文与英文；其他客户端语言使用英文。
