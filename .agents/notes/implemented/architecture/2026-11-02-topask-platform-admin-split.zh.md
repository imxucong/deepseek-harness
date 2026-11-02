# Agent Note: TopAsk 公开平台与运营后台拆分

Status: implemented

[English](2026-11-02-topask-platform-admin-split.md) | 中文

## 问题

账户客户端会在配置的 platform origin 上访问浏览器页面：登录使用 `/dsh/authorize` 与 `/dsh/authorized`，账号链接与 Desktop 内嵌页使用 `/usage` 与 `/top_up`。`@topask/api` 把这些页面和 JSON 协议放在同一个服务里，也没有承载登录后账号页面的位置。运营后台是另一个产品，拥有 OIDC、独立域名和管理数据；把它并入同一服务会让匿名授权页与管理员会话混在一起。

## 决策

`@topask/platform` 拥有公开的 platform origin。它通过账户 API 的内部端点读取登录尝试事实并渲染授权页，提供 `/`、`/usage`、`/top_up`，用一个同源脚本读取 Desktop 桥接的 token，并把 `/auth-api/**` 与 `/api/**` 代理到 `@topask/api`；`/internal/**` 永远不会被代理。

`@topask/api` 保留 Platform 兼容的 JSON 协议，并增加受 token 保护的内部登录尝试端点。它仍是 SQLite 的唯一所有者，包括钱包、赠金账本与运营审计；平台和运营后台都不直接读数据库。

授权页留在 platform origin，并保持零脚本与 `default-src 'none'`。`@topask/admin` 是独立域名上的独立应用。它通过 OIDC/SSO 登录运营人员，把共享 admin token 保留在 BFF 中，并调用账户 API 的 `/admin-api/**` 端点管理用户、授权、设备、登录尝试、钱包、赠金与审计。它不能承载授权页，因为客户端要求配置的 platform origin 与固定的授权路径。

## 备选方案

**把浏览器页面留在账户 API。** 这样不需要第二个进程，但 API 会混合匿名 HTML、JSON 协议与未来的登录后界面，并且无法在不削弱授权页的前提下为登录后页面启用脚本策略。

**所有页面都由运营后台域名提供。** 客户端会校验 `platformOrigin` 以及 `/dsh/authorize`、`/dsh/authorized` 路径，因此独立 admin 域名无法在不修改账户协议与来源校验的情况下承载它们。

**平台与运营后台合并为一个应用。** 两者的认证、CSRF、Cookie 与内容安全边界不同。只有平台需要共享的公开 origin，运营后台有意独立。

## 后果

开发时需要运行三个进程（`dev:api`、`dev:platform` 与 `dev:admin`），共享服务 token。平台页面依赖 Desktop 桥接获取账户 token；普通 Web 标签页目前没有平台会话。用量明细与支付仍然推迟。运营后台增加了 OIDC 与管理 API，而不触碰授权页面或客户端协议。钱包调整与账号停用立即生效；目前没有支付渠道或角色划分。
