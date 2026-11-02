/** Server-rendered operator console pages: shell, listings, details, and forms. */
import type {
  AdminAttempt, AdminAudit, AdminDevice, AdminGrant, AdminOverview, AdminUser, AdminWallet, Listing, UserDetail,
} from './admin-api.ts'
import type { OperatorIdentity } from './session.ts'

/** One sidebar destination. */
type NavKey = 'overview' | 'users' | 'grants' | 'devices' | 'attempts' | 'wallets' | 'audit'

const NAV: readonly { key: NavKey; href: string; label: string }[] = [
  { key: 'overview', href: '/', label: '概览' },
  { key: 'users', href: '/users', label: '用户' },
  { key: 'grants', href: '/grants', label: '令牌' },
  { key: 'devices', href: '/devices', label: '设备' },
  { key: 'attempts', href: '/attempts', label: '登录审计' },
  { key: 'wallets', href: '/wallets', label: '钱包与赠金' },
  { key: 'audit', href: '/audit', label: '操作日志' },
]

const MARK_PATH = 'M 643 222 C 846 221 1014 329 1048 502 C 1080 656 1047 789 951 881 '
  + 'C 868 961 728 990 558 955 C 484 940 466 942 391 973 C 345 994 295 1020 261 1006 '
  + 'C 226 992 246 966 270 920 C 293 876 301 844 287 813 C 272 780 238 751 222 698 '
  + 'C 194 612 194 535 225 450 C 288 300 446 222 643 222 Z'

const MARK = '<svg class="mark" viewBox="0 0 1254 1254" aria-hidden="true" focusable="false">'
  + '<defs><linearGradient id="topask-admin-mark" x1="17%" y1="8%" x2="94%" y2="92%">'
  + '<stop offset="0" stop-color="#25E3F8"/><stop offset=".3" stop-color="#209EFD"/>'
  + '<stop offset=".65" stop-color="#295BFD"/><stop offset="1" stop-color="#7952FD"/></linearGradient>'
  + '<linearGradient id="topask-admin-eye" x1="15%" y1="0" x2="85%" y2="100%">'
  + '<stop offset="0" stop-color="#FFFFFF"/><stop offset=".68" stop-color="#F9FBFF"/>'
  + '<stop offset="1" stop-color="#DDEBFF"/></linearGradient></defs>'
  + `<path d="${MARK_PATH}" fill="url(#topask-admin-mark)"/>`
  + '<ellipse cx="512" cy="615" rx="60" ry="83" fill="url(#topask-admin-eye)"/>'
  + '<ellipse cx="781" cy="618" rx="55" ry="81" fill="url(#topask-admin-eye)"/></svg>'

const STYLE = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:#f4f5f8;color:#17191f;-webkit-font-smoothing:antialiased;
font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif}
a{color:inherit}
.app{min-height:100vh;display:grid;grid-template-columns:232px minmax(0,1fr)}
.sidebar{position:sticky;top:0;height:100vh;display:flex;flex-direction:column;gap:26px;padding:24px 16px;
background:linear-gradient(180deg,#171b24 0%,#10131a 100%);color:#e9ebf2}
.brand{display:flex;align-items:center;gap:8px;padding:0 8px;text-decoration:none;line-height:1}
.mark{display:block;width:24px;height:24px}
.wordmark{font-family:"Montserrat","Avenir Next","SF Pro Display",-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
font-size:18px;font-weight:600;letter-spacing:-.02em}
.badge{padding:3px 4px 2px;border:1px solid rgba(255,255,255,.22);border-radius:3px;color:rgba(255,255,255,.7);
font-size:8.5px;font-weight:700;letter-spacing:.16em;transform:translateY(1px)}
.nav{display:flex;flex-direction:column;gap:2px;flex:1}
.nav a{position:relative;padding:9px 12px;border-radius:8px;color:rgba(233,235,242,.66);font-size:13.5px;text-decoration:none;
transition:background-color .18s ease,color .18s ease}
.nav a:hover{background:rgba(255,255,255,.06);color:#fff}
.nav a[aria-current=page]{background:rgba(255,255,255,.1);color:#fff;font-weight:500}
.nav a[aria-current=page]::before{content:"";position:absolute;left:-16px;top:9px;bottom:9px;width:3px;border-radius:0 3px 3px 0;
background:linear-gradient(180deg,#25E3F8,#7952FD)}
.operator{display:flex;align-items:center;gap:10px;padding:12px 10px;border-radius:10px;background:rgba(255,255,255,.05)}
.operator-copy{display:flex;flex-direction:column;min-width:0;line-height:1.3}
.operator-name{font-size:12.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.operator-email{font-size:11px;color:rgba(233,235,242,.55);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.avatar{display:grid;place-items:center;flex:none;width:30px;height:30px;border-radius:50%;font-size:12px;font-weight:600;
background:linear-gradient(135deg,#25E3F8,#209EFD 38%,#295BFD 70%,#7952FD);color:#fff}
.logout{margin:0}
.logout button{width:100%;padding:8px;border:1px solid rgba(255,255,255,.12);border-radius:8px;background:transparent;
color:rgba(233,235,242,.72);font:inherit;font-size:12px;cursor:pointer;transition:background-color .18s ease}
.logout button:hover{background:rgba(255,255,255,.08);color:#fff}
.content{min-width:0;padding:36px clamp(20px,3vw,44px) 64px}
.page-header{display:flex;align-items:flex-end;justify-content:space-between;gap:20px;margin-bottom:28px}
.eyebrow{display:flex;align-items:center;gap:7px;margin:0 0 8px;color:#8a8f9a;font-size:11px;font-weight:600;
letter-spacing:.14em;text-transform:uppercase}
.eyebrow::before{content:"";width:5px;height:5px;border-radius:50%;background:linear-gradient(135deg,#209EFD,#7952FD)}
h1{margin:0;font-size:clamp(24px,2.4vw,30px);font-weight:600;letter-spacing:-.02em;line-height:1.2}
.lede{margin:8px 0 0;max-width:64ch;color:#6b707c;font-size:13.5px;line-height:1.7}
.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px}
.card{grid-column:span 3;padding:20px;border:1px solid #e6e8ee;border-radius:14px;background:#fff;
box-shadow:0 1px 2px rgba(17,19,24,.03)}
.card.wide{grid-column:span 12}
.card-label{color:#8a8f9a;font-size:11.5px;font-weight:500;letter-spacing:.02em}
.stat{margin-top:12px;font-size:30px;font-weight:600;letter-spacing:-.02em;line-height:1}
.currency{color:#8a8f9a;font-size:13px;font-weight:500}
.stat-sub{margin-top:6px;color:#8a8f9a;font-size:12px}
.section{grid-column:span 12;margin-top:6px}
.section-head{display:flex;align-items:center;justify-content:space-between;gap:12px;margin:0 0 10px}
.section-head h2{margin:0;font-size:14px;font-weight:600}
.panel{border:1px solid #e6e8ee;border-radius:14px;background:#fff;overflow:hidden;box-shadow:0 1px 2px rgba(17,19,24,.03)}
.toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid #eef0f4;flex-wrap:wrap}
.search{display:flex;align-items:center;gap:8px}
.search input{width:min(320px,60vw);height:34px;padding:0 11px;border:1px solid #dcdee5;border-radius:8px;background:#fff;
font:inherit;font-size:13px;color:#17191f}
.search input:focus{outline:2px solid #295BFD;outline-offset:1px;border-color:transparent}
.search button,.btn{height:34px;padding:0 13px;border:1px solid #dcdee5;border-radius:8px;background:#fff;color:#3f434c;
font:inherit;font-size:13px;cursor:pointer}
.search button:hover,.btn:hover{background:#f5f6f9}
.btn.primary{background:#131418;border-color:#131418;color:#fff}
.btn.primary:hover{background:#000}
.btn.danger{color:#b4232b;border-color:#f0cfd1;background:#fff7f7}
.btn.danger:hover{background:#fdeeee}
.table-wrap{overflow-x:auto}
table{width:100%;border-collapse:collapse;font-size:13px}
th{padding:10px 16px;border-bottom:1px solid #eef0f4;background:#fafbfc;color:#8a8f9a;font-size:11px;font-weight:600;
letter-spacing:.04em;text-align:left;white-space:nowrap}
td{padding:12px 16px;border-bottom:1px solid #f1f2f6;vertical-align:middle}
tr:last-child td{border-bottom:0}
tbody tr:hover{background:#fafbfd}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:12px;color:#4b5060}
.muted{color:#8a8f9a}
.ellipsis{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pill{display:inline-flex;align-items:center;padding:3px 8px;border-radius:999px;font-size:11px;font-weight:500;white-space:nowrap}
.pill.ok{background:#e8f7ee;color:#187a42}
.pill.warn{background:#fff4e5;color:#9a5b00}
.pill.bad{background:#fdeeee;color:#b4232b}
.pill.neutral{background:#f1f3f7;color:#5b6070}
.inline{display:inline-flex;align-items:center;gap:8px}
.row-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.empty{padding:40px 16px;text-align:center;color:#8a8f9a;font-size:13px}
.pager{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 16px;border-top:1px solid #eef0f4;
color:#8a8f9a;font-size:12px;flex-wrap:wrap}
.pager a{padding:5px 10px;border:1px solid #dcdee5;border-radius:7px;text-decoration:none;background:#fff}
.detail-grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:14px}
.detail-card{grid-column:span 6;padding:20px;border:1px solid #e6e8ee;border-radius:14px;background:#fff}
.detail-card.full{grid-column:span 12}
.detail-row{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:9px 0;border-bottom:1px solid #f1f2f6;
font-size:13px}
.detail-row:last-child{border-bottom:0}
.detail-row dt{color:#8a8f9a}
.detail-row dd{margin:0;font-weight:500;text-align:right;word-break:break-all}
.form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:14px}
.form-grid label{display:flex;flex-direction:column;gap:6px;color:#5b6070;font-size:12px}
.form-grid label.full{grid-column:1/-1}
.form-grid input,.form-grid textarea{width:100%;padding:9px 11px;border:1px solid #dcdee5;border-radius:8px;background:#fff;
font:inherit;font-size:13px;color:#17191f}
.form-grid textarea{min-height:76px;resize:vertical}
.form-grid input:focus,.form-grid textarea:focus{outline:2px solid #295BFD;outline-offset:1px;border-color:transparent}
.form-actions{grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end}
.alert{margin-bottom:18px;padding:12px 14px;border:1px solid #f0cfd1;border-radius:10px;background:#fff7f7;color:#9d2029;
font-size:13px;line-height:1.6}
.login{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;
background:radial-gradient(120% 90% at 18% 8%,rgba(170,192,224,.3),transparent 60%),
radial-gradient(90% 70% at 90% 90%,rgba(121,82,253,.2),transparent 64%),
linear-gradient(152deg,#46516a 0%,#2c3547 52%,#171d29 100%)}
.login-card{width:min(100%,400px);padding:34px 32px;border-radius:18px;background:#fff;box-shadow:0 24px 70px rgba(5,8,15,.35)}
.login-brand{display:flex;justify-content:center;align-items:center;gap:9px;margin-bottom:26px;line-height:1}
.login h1{margin:0 0 8px;font-size:24px;text-align:center}
.login p{margin:0 0 24px;color:#6b707c;font-size:13.5px;line-height:1.7;text-align:center}
.login .btn.primary{display:flex;align-items:center;justify-content:center;width:100%;height:42px;border-radius:10px;
background:#131418;border:0;color:#fff;font:inherit;font-size:14px;font-weight:500;text-decoration:none;cursor:pointer}
.login .btn.primary:hover{background:#000}
.login-note{margin:18px 0 0;color:#9a9faa;font-size:12px;line-height:1.6;text-align:center}
.login input{width:100%;height:38px;margin-bottom:10px;padding:0 11px;border:1px solid #dcdee5;border-radius:8px;font:inherit}
.centered{min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:#f4f5f8}
.centered-card{width:min(100%,440px);padding:28px;border:1px solid #e6e8ee;border-radius:16px;background:#fff;text-align:center}
.centered-card h1{font-size:22px;margin:0 0 10px}
.centered-card p{margin:0 0 20px;color:#6b707c;font-size:13.5px;line-height:1.7}
@media (max-width:1100px){
.card{grid-column:span 6}
}
@media (max-width:1000px){
.app{grid-template-columns:1fr}
.sidebar{position:static;height:auto;flex-direction:row;align-items:center;gap:14px;padding:12px 16px;overflow-x:auto}
.brand{flex:none}
.nav{flex-direction:row;flex:1;overflow-x:auto}
.nav a{white-space:nowrap}
.nav a[aria-current=page]::before{display:none}
.operator{display:none}
.logout{flex:none}
.content{padding:24px 16px 48px}
}
@media (max-width:680px){
.card{grid-column:span 12}
.detail-card{grid-column:span 12}
.form-grid{grid-template-columns:1fr}
.page-header{align-items:flex-start;flex-direction:column}
}
`

/** Page slots one console shell fills. */
interface ShellOptions {
  readonly title: string
  readonly description?: string
  readonly active: NavKey | null
  readonly operator: OperatorIdentity
  readonly csrf: string
  readonly body: string
  readonly error?: string
}

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

/** @param cents - amount in cents. @returns the decimal currency string. */
export function money(cents: number): string {
  return (cents / 100).toFixed(2)
}

/** @param ms - epoch milliseconds. @returns a stable UTC timestamp. */
export function timestamp(ms: number): string {
  if (ms <= 0) return '—'
  return new Date(ms).toISOString().replace('T', ' ').slice(0, 16) + ' UTC'
}

function avatar(name: string): string {
  return escapeHtml(Array.from(name.trim())[0] ?? 'T')
}

function shell(options: ShellOptions): string {
  const nav = NAV.map(item => `<a href="${item.href}"${item.key === options.active ? ' aria-current="page"' : ''}>${item.label}</a>`).join('')
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="color-scheme" content="light">'
    + `<title>${escapeHtml(options.title)} · TopAsk Admin</title><style>${STYLE}</style></head><body><div class="app">`
    + '<aside class="sidebar">'
    + `<a class="brand" href="/">${MARK}<span class="wordmark">TopAsk</span><span class="badge">ADMIN</span></a>`
    + `<nav class="nav">${nav}</nav>`
    + `<div class="operator"><span class="avatar">${avatar(options.operator.name || options.operator.email)}</span>`
    + `<span class="operator-copy"><span class="operator-name">${escapeHtml(options.operator.name || options.operator.email)}</span>`
    + `<span class="operator-email">${escapeHtml(options.operator.email)}</span></span></div>`
    + '<form class="logout" method="post" action="/auth/logout">'
    + `<input type="hidden" name="_csrf" value="${escapeHtml(options.csrf)}"><button type="submit">退出登录</button></form>`
    + '</aside><main class="content">'
    + `<header class="page-header"><div><p class="eyebrow">TopAsk Admin</p><h1>${escapeHtml(options.title)}</h1>`
    + (options.description === undefined ? '' : `<p class="lede">${escapeHtml(options.description)}</p>`)
    + '</div></header>'
    + (options.error === undefined ? '' : `<div class="alert">${escapeHtml(options.error)}</div>`)
    + options.body
    + '</main></div></body></html>'
}

function pill(text: string, tone: 'ok' | 'warn' | 'bad' | 'neutral'): string {
  return `<span class="pill ${tone}">${escapeHtml(text)}</span>`
}

function pager(path: string, query: string, limit: number, offset: number, total: number): string {
  const from = total === 0 ? 0 : offset + 1
  const to = Math.min(total, offset + limit)
  const link = (next: number, label: string): string => {
    const params = new URLSearchParams()
    if (query !== '') params.set('q', query)
    params.set('limit', String(limit))
    params.set('offset', String(next))
    return `<a href="${path}?${params.toString()}">${label}</a>`
  }
  return '<div class="pager">'
    + `<span>第 ${String(from)}–${String(to)} 条，共 ${String(total)} 条</span>`
    + `<span class="inline">${offset > 0 ? link(Math.max(0, offset - limit), '上一页') : ''}`
    + `${offset + limit < total ? link(offset + limit, '下一页') : ''}</span></div>`
}

function searchForm(action: string, query: string): string {
  return `<form class="search" method="get" action="${action}">`
    + `<input name="q" value="${escapeHtml(query)}" placeholder="搜索 ID、邮箱或名称" autocomplete="off">`
    + '<button type="submit">搜索</button></form>'
}

function csrfField(csrf: string): string {
  return `<input type="hidden" name="_csrf" value="${escapeHtml(csrf)}">`
}

function listing<T>(
  config: {
    title: string
    description: string
    active: NavKey
    operator: OperatorIdentity
    csrf: string
    error?: string
    path: string
    query: string
    limit: number
    offset: number
    page: Listing<T>
    head: readonly string[]
    row: (item: T) => string
    empty: string
  },
): string {
  const rows = config.page.items.map(item => `<tr>${config.row(item)}</tr>`).join('')
  return shell({
    title: config.title,
    description: config.description,
    active: config.active,
    operator: config.operator,
    csrf: config.csrf,
    ...(config.error === undefined ? {} : { error: config.error }),
    body: '<div class="grid"><div class="section"><div class="panel"><div class="toolbar">'
      + searchForm(config.path, config.query)
      + `<span class="muted">共 ${String(config.page.total)} 条</span>`
      + '</div><div class="table-wrap">'
      + (config.page.items.length === 0
        ? `<div class="empty">${escapeHtml(config.empty)}</div>`
        : `<table><thead><tr>${config.head.map(header => `<th>${header}</th>`).join('')}</tr></thead>`
          + `<tbody>${rows}</tbody></table>`)
      + '</div>' + pager(config.path, config.query, config.limit, config.offset, config.page.total)
      + '</div></div></div>',
  })
}

/**
 * Render the login page.
 * @param options - enabled provider mode and resume path.
 * @returns a complete HTML document.
 */
export function loginPage(options: { devLogin: boolean; returnTo: string; error?: string }): string {
  const action = options.devLogin
    ? `<form method="post" action="/auth/dev-login"><input type="hidden" name="returnTo" value="${escapeHtml(options.returnTo)}">`
      + '<button class="btn primary" type="submit">以开发身份进入</button></form>'
    : `<a class="btn primary" href="/auth/login?returnTo=${encodeURIComponent(options.returnTo)}">使用 OIDC 登录</a>`
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<title>登录 · TopAsk Admin</title><style>${STYLE}</style></head><body><main class="login"><div class="login-card">`
    + `<div class="login-brand">${MARK}<span class="wordmark">TopAsk</span><span class="badge">ADMIN</span></div>`
    + '<h1>登录运营后台</h1><p>使用组织身份登录，管理 TopAsk 账号、令牌、登录审计与钱包。</p>'
    + (options.error === undefined ? '' : `<div class="alert">${escapeHtml(options.error)}</div>`)
    + action
    + (options.devLogin ? '<p class="login-note">开发登录仅在回环 HTTP origin 下可用。</p>' : '')
    + '</div></main></body></html>'
}

/** @param message - failure text. @returns a standalone failure page. */
export function failurePage(message: string): string {
  return '<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">'
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + `<title>无法访问 · TopAsk Admin</title><style>${STYLE}</style></head><body><main class="centered"><div class="centered-card">`
    + '<h1>无法访问</h1>'
    + `<p>${escapeHtml(message)}</p>`
    + '<a class="btn" href="/login">返回登录</a>'
    + '</div></main></body></html>'
}

/**
 * Render the overview page.
 * @param options - counts, recent audit entries, operator, and CSRF token.
 * @returns a complete HTML document.
 */
export function overviewPage(options: {
  operator: OperatorIdentity
  csrf: string
  overview: AdminOverview
  audit: Listing<AdminAudit>
  error?: string
}): string {
  const stat = (label: string, value: number, sub: string): string =>
    `<article class="card"><div class="card-label">${escapeHtml(label)}</div>`
    + `<div class="stat">${String(value)}</div><div class="stat-sub">${escapeHtml(sub)}</div></article>`
  const recent = options.audit.items.map(entry => '<tr>'
    + `<td class="muted">${escapeHtml(timestamp(entry.createdAt))}</td>`
    + `<td>${escapeHtml(entry.actorEmail)}</td>`
    + `<td><span class="mono">${escapeHtml(entry.action)}</span></td>`
    + `<td class="ellipsis">${escapeHtml(entry.target)}</td>`
    + '</tr>').join('')
  return shell({
    title: '概览',
    description: '账号、授权与登录活动的实时概况。',
    active: 'overview',
    operator: options.operator,
    csrf: options.csrf,
    ...(options.error === undefined ? {} : { error: options.error }),
    body: '<div class="grid">'
      + stat('用户', options.overview.users, `其中 ${String(options.overview.disabledUsers)} 个已停用`)
      + stat('有效令牌', options.overview.grants, '当前签发的账户授权')
      + stat('设备', options.overview.devices, '完成过登录的设备')
      + stat('登录尝试', options.overview.attempts, '保留中的浏览器登录尝试')
      + '<div class="section"><div class="panel"><div class="toolbar"><strong>最近操作</strong>'
      + '<a class="btn" href="/audit">查看全部</a></div><div class="table-wrap">'
      + (recent === ''
        ? '<div class="empty">暂无操作记录</div>'
        : `<table><thead><tr><th>时间</th><th>操作人</th><th>动作</th><th>目标</th></tr></thead><tbody>${recent}</tbody></table>`)
      + '</div></div></div></div>',
  })
}

/** @param options - page listing inputs. @returns the users page. */
export function usersPage(options: {
  operator: OperatorIdentity
  csrf: string
  page: Listing<AdminUser>
  query: string
  limit: number
  offset: number
  error?: string
}): string {
  return listing({
    title: '用户',
    description: '查看账号状态，停用或恢复登录能力。',
    active: 'users', operator: options.operator, csrf: options.csrf,
    ...(options.error === undefined ? {} : { error: options.error }),
    path: '/users', query: options.query, limit: options.limit, offset: options.offset, page: options.page,
    head: ['用户', '邮箱', '状态', '操作'], empty: '没有匹配的用户',
    row: user => '<td><a href="/users/' + encodeURIComponent(user.id) + '">' + escapeHtml(user.name) + '</a></td>'
      + `<td class="muted">${escapeHtml(user.email)}</td>`
      + `<td>${user.disabled ? pill('已停用', 'bad') : pill('正常', 'ok')}</td>`
      + `<td><div class="row-actions"><a class="btn" href="/users/${encodeURIComponent(user.id)}">详情</a>`
      + `<form method="post" action="/users/${encodeURIComponent(user.id)}/disabled">${csrfField(options.csrf)}`
      + '<input type="hidden" name="returnTo" value="/users">'
      + `<input type="hidden" name="disabled" value="${user.disabled ? 'false' : 'true'}">`
      + `<button class="btn ${user.disabled ? '' : 'danger'}" type="submit">${user.disabled ? '启用' : '停用'}</button></form>`
      + '</div></td>',
  })
}

/** @param options - user detail, grants, and action token. @returns the user detail page. */
export function userPage(options: {
  operator: OperatorIdentity
  csrf: string
  detail: UserDetail
  grants: Listing<AdminGrant>
  error?: string
}): string {
  const user = options.detail.user
  const grantRows = options.grants.items.map(grant => '<tr>'
    + `<td class="mono">${escapeHtml(grant.tokenHash.slice(0, 16))}…</td>`
    + `<td class="mono">${escapeHtml(grant.deviceId)}</td>`
    + `<td class="muted">${escapeHtml(timestamp(grant.createdAt ?? 0))}</td>`
    + `<td class="muted">${escapeHtml(timestamp(grant.expiresAt))}</td>`
    + `<td><form method="post" action="/grants/${encodeURIComponent(grant.tokenHash)}/revoke">${csrfField(options.csrf)}`
    + `<input type="hidden" name="returnTo" value="/users/${encodeURIComponent(user.id)}">`
    + '<button class="btn danger" type="submit">吊销</button></form></td></tr>').join('')
  return shell({
    title: user.name,
    description: '账号状态、钱包与授权。',
    active: 'users',
    operator: options.operator,
    csrf: options.csrf,
    ...(options.error === undefined ? {} : { error: options.error }),
    body: '<div class="detail-grid">'
      + '<article class="detail-card"><div class="card-label">账号</div>'
      + `<div class="detail-row"><dt>ID</dt><dd class="mono">${escapeHtml(user.id)}</dd></div>`
      + `<div class="detail-row"><dt>邮箱</dt><dd>${escapeHtml(user.email)}</dd></div>`
      + `<div class="detail-row"><dt>状态</dt><dd>${user.disabled ? pill('已停用', 'bad') : pill('正常', 'ok')}</dd></div>`
      + `<form method="post" action="/users/${encodeURIComponent(user.id)}/disabled">${csrfField(options.csrf)}`
      + `<input type="hidden" name="returnTo" value="/users/${encodeURIComponent(user.id)}">`
      + `<input type="hidden" name="disabled" value="${user.disabled ? 'false' : 'true'}">`
      + `<button class="btn ${user.disabled ? '' : 'danger'}" style="margin-top:14px" type="submit">${user.disabled ? '恢复账号' : '停用账号'}</button></form>`
      + '</article>'
      + '<article class="detail-card"><div class="card-label">钱包</div>'
      + `<div class="detail-row"><dt>账户余额</dt><dd>${money(options.detail.wallet.balanceCents)} CNY</dd></div>`
      + `<div class="detail-row"><dt>赠金</dt><dd>${money(options.detail.wallet.bonusCents)} CNY</dd></div>`
      + `<div class="detail-row"><dt>更新时间</dt><dd>${escapeHtml(timestamp(options.detail.wallet.updatedAt))}</dd></div>`
      + `<a class="btn" style="margin-top:14px;display:inline-flex" href="/wallets/${encodeURIComponent(user.id)}">管理钱包</a>`
      + '</article>'
      + '<div class="section"><div class="panel"><div class="toolbar"><strong>授权</strong>'
      + `<span class="muted">共 ${String(options.grants.total)} 条</span></div><div class="table-wrap">`
      + (grantRows === ''
        ? '<div class="empty">该账号没有授权</div>'
        : `<table><thead><tr><th>令牌摘要</th><th>设备</th><th>创建</th><th>过期</th><th></th></tr></thead><tbody>${grantRows}</tbody></table>`)
      + '</div></div></div></div>',
  })
}

/** @param options - page listing inputs. @returns the grants page. */
export function grantsPage(options: {
  operator: OperatorIdentity
  csrf: string
  page: Listing<AdminGrant>
  query: string
  limit: number
  offset: number
  error?: string
}): string {
  return listing({
    title: '令牌',
    description: '查看账户授权并吊销不再需要的令牌。',
    active: 'grants', operator: options.operator, csrf: options.csrf,
    ...(options.error === undefined ? {} : { error: options.error }),
    path: '/grants', query: options.query, limit: options.limit, offset: options.offset, page: options.page,
    head: ['令牌摘要', '用户', '设备', '创建', '过期', '操作'], empty: '没有匹配的授权',
    row: grant => `<td class="mono">${escapeHtml(grant.tokenHash.slice(0, 16))}…</td>`
      + `<td><a href="/users/${encodeURIComponent(grant.userId)}">${escapeHtml(grant.name || grant.userId)}</a>`
      + `<div class="muted">${escapeHtml(grant.email)}</div></td>`
      + `<td class="mono">${escapeHtml(grant.deviceId)}</td>`
      + `<td class="muted">${escapeHtml(timestamp(grant.createdAt ?? 0))}</td>`
      + `<td class="muted">${escapeHtml(timestamp(grant.expiresAt))}</td>`
      + `<td><form method="post" action="/grants/${encodeURIComponent(grant.tokenHash)}/revoke">${csrfField(options.csrf)}`
      + '<input type="hidden" name="returnTo" value="/grants">'
      + '<button class="btn danger" type="submit">吊销</button></form></td>',
  })
}

/** @param options - page listing inputs. @returns the devices page. */
export function devicesPage(options: {
  operator: OperatorIdentity
  csrf: string
  page: Listing<AdminDevice>
  query: string
  limit: number
  offset: number
  error?: string
}): string {
  return listing({
    title: '设备',
    description: '完成过登录的设备记录。',
    active: 'devices', operator: options.operator, csrf: options.csrf,
    ...(options.error === undefined ? {} : { error: options.error }),
    path: '/devices', query: options.query, limit: options.limit, offset: options.offset, page: options.page,
    head: ['设备 ID', '型号', '系统', '首次记录'], empty: '没有匹配的设备',
    row: device => `<td class="mono">${escapeHtml(device.id)}</td><td>${escapeHtml(device.model || '—')}</td>`
      + `<td>${escapeHtml(device.osVersion || '—')}</td><td class="muted">${escapeHtml(timestamp(device.createdAt ?? 0))}</td>`,
  })
}

/** @param options - page listing inputs. @returns the attempts page. */
export function attemptsPage(options: {
  operator: OperatorIdentity
  csrf: string
  page: Listing<AdminAttempt>
  query: string
  limit: number
  offset: number
  error?: string
}): string {
  const tone = (status: AdminAttempt['status']): 'ok' | 'warn' | 'neutral' =>
    status === 'exchanged' ? 'ok' : status === 'approved' ? 'warn' : 'neutral'
  return listing({
    title: '登录审计',
    description: '浏览器登录尝试与它们的当前状态。',
    active: 'attempts', operator: options.operator, csrf: options.csrf,
    ...(options.error === undefined ? {} : { error: options.error }),
    path: '/attempts', query: options.query, limit: options.limit, offset: options.offset, page: options.page,
    head: ['尝试 ID', '用户', '语言', '来源', '状态', '过期'], empty: '没有匹配的登录尝试',
    row: attempt => `<td class="mono">${escapeHtml(attempt.authorizeId)}</td>`
      + `<td><a href="/users/${encodeURIComponent(attempt.userId)}">${escapeHtml(attempt.userId)}</a></td>`
      + `<td>${escapeHtml(attempt.locale || '—')}</td><td>${escapeHtml(attempt.loginSource)}</td>`
      + `<td>${pill(attempt.status === 'exchanged' ? '已兑换' : attempt.status === 'approved' ? '已授权' : '等待中', tone(attempt.status))}</td>`
      + `<td class="muted">${escapeHtml(timestamp(attempt.expiresAt))}</td>`,
  })
}

/** @param options - page listing inputs. @returns the wallets page. */
export function walletsPage(options: {
  operator: OperatorIdentity
  csrf: string
  page: Listing<AdminWallet>
  query: string
  limit: number
  offset: number
  error?: string
}): string {
  return listing({
    title: '钱包与赠金',
    description: '调整账户余额，或发放一次性赠金通知。',
    active: 'wallets', operator: options.operator, csrf: options.csrf,
    ...(options.error === undefined ? {} : { error: options.error }),
    path: '/wallets', query: options.query, limit: options.limit, offset: options.offset, page: options.page,
    head: ['用户', '账户余额', '赠金', '更新时间', '操作'], empty: '还没有钱包记录',
    row: wallet => `<td><a href="/wallets/${encodeURIComponent(wallet.userId)}">${escapeHtml(wallet.userId)}</a></td>`
      + `<td>${money(wallet.balanceCents)} CNY</td><td>${money(wallet.bonusCents)} CNY</td>`
      + `<td class="muted">${escapeHtml(timestamp(wallet.updatedAt))}</td>`
      + `<td><a class="btn" href="/wallets/${encodeURIComponent(wallet.userId)}">管理</a></td>`,
  })
}

/** @param options - wallet detail, bonuses, and action token. @returns the wallet detail page. */
export function walletPage(options: {
  operator: OperatorIdentity
  csrf: string
  detail: UserDetail
  error?: string
}): string {
  const user = options.detail.user
  const wallet = options.detail.wallet
  const bonuses = options.detail.bonuses.map(bonus => '<tr>'
    + `<td class="mono">${escapeHtml(bonus.orderId)}</td>`
    + `<td>${money(bonus.amountCents)} CNY</td>`
    + `<td>${escapeHtml(bonus.title)}</td>`
    + `<td class="muted ellipsis">${escapeHtml(bonus.message)}</td>`
    + `<td>${bonus.notified ? pill('已提示', 'neutral') : pill('待提示', 'warn')}</td>`
    + `<td class="muted">${escapeHtml(timestamp(bonus.createdAt))}</td></tr>`).join('')
  return shell({
    title: `钱包 · ${user.name}`,
    description: '调整普通余额，或发放赠金通知。',
    active: 'wallets',
    operator: options.operator,
    csrf: options.csrf,
    ...(options.error === undefined ? {} : { error: options.error }),
    body: '<div class="detail-grid">'
      + '<article class="detail-card"><div class="card-label">当前余额</div>'
      + `<div class="stat" style="margin-top:12px">${money(wallet.balanceCents)} <span class="currency">CNY</span></div>`
      + `<div class="detail-row"><dt>赠金合计</dt><dd>${money(wallet.bonusCents)} CNY</dd></div>`
      + `<div class="detail-row"><dt>更新时间</dt><dd>${escapeHtml(timestamp(wallet.updatedAt))}</dd></div>`
      + '</article>'
      + '<article class="detail-card"><div class="card-label">设置普通余额</div>'
      + `<form method="post" action="/wallets/${encodeURIComponent(user.id)}/balance">${csrfField(options.csrf)}`
      + `<input type="hidden" name="returnTo" value="/wallets/${encodeURIComponent(user.id)}">`
      + '<div class="form-grid"><label class="full">金额（CNY）<input name="balance" inputmode="decimal" '
      + `value="${money(wallet.balanceCents)}" required></label>`
      + '<div class="form-actions"><button class="btn primary" type="submit">保存余额</button></div></div></form>'
      + '</article>'
      + '<article class="detail-card full"><div class="card-label">发放赠金</div>'
      + `<form method="post" action="/wallets/${encodeURIComponent(user.id)}/bonuses">${csrfField(options.csrf)}`
      + `<input type="hidden" name="returnTo" value="/wallets/${encodeURIComponent(user.id)}">`
      + '<div class="form-grid">'
      + '<label>金额（CNY）<input name="amount" inputmode="decimal" placeholder="5.00" required></label>'
      + '<label>有效期（天）<input name="expiresInDays" inputmode="numeric" value="30" required></label>'
      + '<label class="full">标题<input name="title" placeholder="欢迎赠金" required></label>'
      + '<label class="full">通知内容<textarea name="message" placeholder="赠金已到账" required></textarea></label>'
      + '<div class="form-actions"><button class="btn primary" type="submit">发放赠金</button></div></div></form>'
      + '</article>'
      + '<div class="section"><div class="panel"><div class="toolbar"><strong>赠金记录</strong>'
      + `<span class="muted">共 ${String(options.detail.bonuses.length)} 条</span></div><div class="table-wrap">`
      + (bonuses === ''
        ? '<div class="empty">暂无赠金记录</div>'
        : `<table><thead><tr><th>订单</th><th>金额</th><th>标题</th><th>通知</th><th>状态</th><th>时间</th></tr></thead><tbody>${bonuses}</tbody></table>`)
      + '</div></div></div></div>',
  })
}

/** @param options - page listing inputs. @returns the audit page. */
export function auditPage(options: {
  operator: OperatorIdentity
  csrf: string
  page: Listing<AdminAudit>
  query: string
  limit: number
  offset: number
  error?: string
}): string {
  return listing({
    title: '操作日志',
    description: '运营人员对账号、令牌与钱包所做的变更。',
    active: 'audit', operator: options.operator, csrf: options.csrf,
    ...(options.error === undefined ? {} : { error: options.error }),
    path: '/audit', query: options.query, limit: options.limit, offset: options.offset, page: options.page,
    head: ['时间', '操作人', '动作', '目标', '详情'], empty: '暂无操作记录',
    row: entry => `<td class="muted">${escapeHtml(timestamp(entry.createdAt))}</td>`
      + `<td>${escapeHtml(entry.actorEmail)}</td>`
      + `<td><span class="mono">${escapeHtml(entry.action)}</span></td>`
      + `<td class="ellipsis">${escapeHtml(entry.target)}</td>`
      + `<td class="muted ellipsis">${escapeHtml(entry.details)}</td>`,
  })
}
