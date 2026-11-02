/** Signed-in platform pages: account overview, usage, and top-up. */
import { escapeHtml } from './html.ts'
import type { PageLocale } from './locale.ts'

/** One signed-in platform section. */
export type PlatformSection = 'home' | 'usage' | 'top-up'

interface Copy {
  readonly lang: 'zh-CN' | 'en'
  readonly navHome: string
  readonly navUsage: string
  readonly navTopUp: string
  readonly account: string
  readonly balance: string
  readonly bonus: string
  readonly loading: string
  readonly signedOut: string
  readonly unavailable: string
  readonly openFromApp: string
  readonly quickUsage: string
  readonly quickTopUp: string
  readonly usageEmpty: string
  readonly usageEmptyDescription: string
  readonly topUpEmpty: string
  readonly topUpEmptyDescription: string
  readonly title: Readonly<Record<PlatformSection, string>>
  readonly description: Readonly<Record<PlatformSection, string>>
}

const COPY: Readonly<Record<PageLocale, Copy>> = {
  zh: {
    lang: 'zh-CN',
    navHome: '首页',
    navUsage: '用量',
    navTopUp: '充值',
    account: '账号',
    balance: '账户余额',
    bonus: '赠金',
    loading: '加载中…',
    signedOut: '未登录',
    unavailable: '账号信息暂不可用',
    openFromApp: '请从 TopAsk 桌面端打开此页面，或在应用内登录后再试。',
    quickUsage: '查看用量',
    quickTopUp: '去充值',
    usageEmpty: '用量明细暂未接入',
    usageEmptyDescription: '开发模式只提供钱包余额，请求级用量将在模型网关上线后补齐。',
    topUpEmpty: '充值暂未接入',
    topUpEmptyDescription: '开发模式不提供支付渠道，余额与赠金由后续的钱包服务管理。',
    title: { home: '账号概览', usage: '用量', 'top-up': '充值' },
    description: {
      home: '查看你的 TopAsk 账号、钱包余额与用量入口。',
      usage: '查看钱包余额；请求级用量明细尚未接入。',
      'top-up': '查看当前余额；在线充值尚未接入。',
    },
  },
  en: {
    lang: 'en',
    navHome: 'Home',
    navUsage: 'Usage',
    navTopUp: 'Top up',
    account: 'Account',
    balance: 'Balance',
    bonus: 'Bonus',
    loading: 'Loading…',
    signedOut: 'Signed out',
    unavailable: 'Account unavailable',
    openFromApp: 'Open this page from the TopAsk desktop app, or sign in from the app and try again.',
    quickUsage: 'View usage',
    quickTopUp: 'Top up',
    usageEmpty: 'Usage detail is not connected yet',
    usageEmptyDescription: 'The development build exposes wallet balances only; request-level usage arrives with the model gateway.',
    topUpEmpty: 'Top-up is not connected yet',
    topUpEmptyDescription: 'The development build has no payment channel; a wallet service will own balances and bonuses.',
    title: { home: 'Account overview', usage: 'Usage', 'top-up': 'Top up' },
    description: {
      home: 'Review your TopAsk account, wallet balance, and usage entry points.',
      usage: 'Review your wallet balance; request-level usage detail is not connected yet.',
      'top-up': 'Review your current balance; online top-up is not connected yet.',
    },
  },
}

const MARK_PATH = 'M 643 222 C 846 221 1014 329 1048 502 C 1080 656 1047 789 951 881 '
  + 'C 868 961 728 990 558 955 C 484 940 466 942 391 973 C 345 994 295 1020 261 1006 '
  + 'C 226 992 246 966 270 920 C 293 876 301 844 287 813 C 272 780 238 751 222 698 '
  + 'C 194 612 194 535 225 450 C 288 300 446 222 643 222 Z'

const MARK = '<svg class="mark" viewBox="0 0 1254 1254" aria-hidden="true" focusable="false">'
  + '<defs><linearGradient id="topask-mark-body" x1="17%" y1="8%" x2="94%" y2="92%">'
  + '<stop offset="0" stop-color="#25E3F8"/><stop offset=".3" stop-color="#209EFD"/>'
  + '<stop offset=".65" stop-color="#295BFD"/><stop offset="1" stop-color="#7952FD"/></linearGradient>'
  + '<linearGradient id="topask-mark-eye" x1="15%" y1="0" x2="85%" y2="100%">'
  + '<stop offset="0" stop-color="#FFFFFF"/><stop offset=".68" stop-color="#F9FBFF"/>'
  + '<stop offset="1" stop-color="#DDEBFF"/></linearGradient></defs>'
  + `<path d="${MARK_PATH}" fill="url(#topask-mark-body)"/>`
  + '<ellipse cx="512" cy="615" rx="60" ry="83" fill="url(#topask-mark-eye)"/>'
  + '<ellipse cx="781" cy="618" rx="55" ry="81" fill="url(#topask-mark-eye)"/></svg>'

const STYLE = `
*,*::before,*::after{box-sizing:border-box}
body{margin:0;background:#f7f8fb;color:#111318;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif}
a{color:inherit}
.topbar{position:sticky;top:0;z-index:10;border-bottom:1px solid #e8e9ef;background:rgba(255,255,255,.92);
backdrop-filter:saturate(180%) blur(14px)}
.topbar-inner{display:flex;align-items:center;gap:28px;max-width:1120px;margin:0 auto;padding:0 24px;height:64px}
.brand{display:flex;align-items:center;gap:8px;text-decoration:none;line-height:1;flex:none}
.mark{display:block;width:24px;height:24px}
.wordmark{font-family:"Montserrat","Avenir Next","SF Pro Display",-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
font-size:18px;font-weight:600;letter-spacing:-.02em}
.badge{padding:3px 4px 2px;border:1px solid #d5d8df;border-radius:3px;color:#767b87;font-size:8.5px;font-weight:700;
letter-spacing:.16em;transform:translateY(1px)}
.nav{display:flex;align-items:center;gap:4px;flex:1}
.nav a{padding:8px 12px;border-radius:8px;color:#6b707c;font-size:14px;text-decoration:none;transition:background-color .18s ease,color .18s ease}
.nav a:hover{background:#f3f4f8;color:#111318}
.nav a[aria-current=page]{background:#eef0f6;color:#111318;font-weight:500}
.account-chip{display:flex;align-items:center;gap:9px;min-width:0}
.avatar{display:grid;place-items:center;flex:none;width:32px;height:32px;border-radius:50%;
background:linear-gradient(135deg,#25E3F8,#209EFD 38%,#295BFD 70%,#7952FD);color:#fff;font-size:13px;font-weight:600}
.account-copy{display:flex;flex-direction:column;min-width:0;line-height:1.25;text-align:right}
.account-name,.account-email{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.account-name{font-size:13px;font-weight:600}
.account-email{font-size:11.5px;color:#8a8f9a}
.main{max-width:1120px;margin:0 auto;padding:52px 24px 72px}
.heading{max-width:640px}
.eyebrow{display:flex;align-items:center;gap:7px;margin:0 0 12px;color:#8a8f9a;font-size:11px;font-weight:600;
letter-spacing:.14em;text-transform:uppercase}
.eyebrow::before{content:"";width:5px;height:5px;border-radius:50%;background:linear-gradient(135deg,#209EFD,#7952FD)}
h1{margin:0 0 10px;font-size:clamp(26px,3vw,34px);font-weight:600;line-height:1.25;letter-spacing:-.02em}
.lede{max-width:52ch;margin:0;color:#6b707c;font-size:14.5px;line-height:1.75}
.session-note{margin:18px 0 0;padding:12px 14px;border:1px solid #ecd9b6;border-radius:12px;background:#fff9ed;
color:#8a6520;font-size:13px;line-height:1.6}
.grid{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:16px;margin-top:36px}
.card{grid-column:span 6;padding:24px;border:1px solid #e8e9ef;border-radius:16px;background:#fff;
box-shadow:0 1px 2px rgba(17,19,24,.03)}
.card-label{color:#8a8f9a;font-size:12px;font-weight:500;letter-spacing:.02em}
.account-line{display:flex;align-items:center;gap:14px;margin-top:20px;min-width:0}
.account-line-copy{display:flex;flex-direction:column;min-width:0}
.avatar.large{width:48px;height:48px;font-size:19px}
.account-line .account-name{font-size:16px}
.account-line .account-email{font-size:13px;text-align:left;margin-top:3px}
.balance{display:flex;align-items:baseline;gap:8px;margin-top:20px;font-size:34px;font-weight:600;letter-spacing:-.02em}
.currency{color:#8a8f9a;font-size:13px;font-weight:500;letter-spacing:0}
.bonus{display:flex;justify-content:space-between;margin-top:14px;padding-top:14px;border-top:1px solid #eef0f4;
color:#6b707c;font-size:13px}
.quick{grid-column:span 12;display:flex;gap:10px;flex-wrap:wrap}
.primary-link,.secondary-link{display:inline-flex;align-items:center;justify-content:center;height:42px;padding:0 20px;
border-radius:10px;font-size:14px;font-weight:500;text-decoration:none;transition:background-color .18s ease,color .18s ease}
.primary-link{background:#131418;color:#fff}
.primary-link:hover{background:#000}
.secondary-link{border:1px solid #dcdee5;background:#fff;color:#3f434c}
.secondary-link:hover{background:#f5f6f9}
.empty-card{grid-column:span 12;display:flex;flex-direction:column;align-items:flex-start;gap:6px;
border:1px dashed #d8dbe3;box-shadow:none;background:#fff;padding:32px}
.empty-dot{width:34px;height:34px;border-radius:10px;margin-bottom:8px;
background:linear-gradient(135deg,#25E3F8,#209EFD 38%,#295BFD 70%,#7952FD);opacity:.16}
.empty-card h2{margin:0;font-size:16px;font-weight:600}
.empty-card p{max-width:56ch;margin:0;color:#6b707c;font-size:13.5px;line-height:1.7}
.footer{max-width:1120px;margin:0 auto;padding:0 24px 32px;color:#a0a5af;font-size:12px}
.primary-link:focus-visible,.secondary-link:focus-visible,.nav a:focus-visible,a.brand:focus-visible{
outline:2px solid #295BFD;outline-offset:3px}
@media (max-width:820px){
.topbar-inner{gap:14px;padding:0 16px}
.badge{display:none}
.nav{justify-content:flex-end}
.nav a{padding:7px 9px;font-size:13px}
.account-email{display:none}
.main{padding:36px 16px 56px}
.card{grid-column:span 12}
.footer{padding:0 16px 28px}
}
@media (max-width:520px){
.wordmark{display:none}
.nav{gap:2px}
.quick{flex-direction:column}
.primary-link,.secondary-link{width:100%}
}
`

function sectionContent(section: PlatformSection, copy: Copy): string {
  const wallet = '<article class="card"><div class="card-label" data-i18n="balance">' + escapeHtml(copy.balance) + '</div>'
    + '<div class="balance"><span data-balance>--</span><span class="currency">CNY</span></div>'
    + `<div class="bonus"><span data-i18n="bonus">${escapeHtml(copy.bonus)}</span><span data-bonus>--</span></div></article>`
  if (section === 'home') {
    const account = '<article class="card"><div class="card-label" data-i18n="account">' + escapeHtml(copy.account) + '</div>'
      + '<div class="account-line"><span class="avatar large" data-account-initial aria-hidden="true">T</span>'
      + '<span class="account-line-copy"><span class="account-name" data-account-name>'
      + `<span data-i18n="loading">${escapeHtml(copy.loading)}</span></span>`
      + '<span class="account-email" data-account-email></span></span></div></article>'
    const quick = '<div class="quick">'
      + `<a class="primary-link" href="/usage" data-i18n="quickUsage">${escapeHtml(copy.quickUsage)}</a>`
      + `<a class="secondary-link" href="/top_up" data-i18n="quickTopUp">${escapeHtml(copy.quickTopUp)}</a></div>`
    return account + wallet + quick
  }
  const empty = section === 'usage'
    ? `<article class="empty-card"><span class="empty-dot" aria-hidden="true"></span><h2 data-i18n="usageEmpty">${escapeHtml(copy.usageEmpty)}</h2><p data-i18n="usageEmptyDescription">${escapeHtml(copy.usageEmptyDescription)}</p></article>`
    : `<article class="empty-card"><span class="empty-dot" aria-hidden="true"></span><h2 data-i18n="topUpEmpty">${escapeHtml(copy.topUpEmpty)}</h2><p data-i18n="topUpEmptyDescription">${escapeHtml(copy.topUpEmptyDescription)}</p></article>`
  return wallet + empty
}

/**
 * Render one signed-in platform page.
 * @param section - which platform section to present.
 * @param locale - server-rendered language; the client script may switch it.
 * @param dist - optional embedded deployment selector passed by Desktop.
 * @returns a complete HTML document.
 */
export function platformPage(section: PlatformSection, locale: PageLocale, dist: string): string {
  const copy = COPY[locale]
  const content = sectionContent(section, copy)

  const nav = (href: string, key: 'home' | 'usage' | 'top-up', label: string): string => {
    const current = key === section ? ' aria-current="page"' : ''
    return `<a href="${href}" data-i18n="nav${key === 'top-up' ? 'TopUp' : key === 'usage' ? 'Usage' : 'Home'}"${current}>${escapeHtml(label)}</a>`
  }
  return `<!doctype html><html lang="${copy.lang}"><head><meta charset="utf-8">`
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="color-scheme" content="light">'
    + `<meta name="topask-dist" content="${escapeHtml(dist)}">`
    + `<title>${escapeHtml(copy.title[section])} · TopAsk</title><style>${STYLE}</style></head>`
    + `<body data-section="${section}" data-state="loading">`
    + '<header class="topbar"><div class="topbar-inner">'
    + `<a class="brand" href="/">${MARK}<span class="wordmark">TopAsk</span><span class="badge">PLATFORM</span></a>`
    + `<nav class="nav">${nav('/', 'home', copy.navHome)}${nav('/usage', 'usage', copy.navUsage)}${nav('/top_up', 'top-up', copy.navTopUp)}</nav>`
    + '<div class="account-chip"><span class="avatar" data-account-initial aria-hidden="true">T</span>'
    + '<span class="account-copy"><span class="account-name" data-account-name>'
    + `<span data-i18n="loading">${escapeHtml(copy.loading)}</span></span>`
    + '<span class="account-email" data-account-email></span></span></div>'
    + '</div></header>'
    + '<main class="main"><div class="heading">'
    + '<p class="eyebrow">TopAsk Platform</p>'
    + `<h1 data-i18n="title">${escapeHtml(copy.title[section])}</h1>`
    + `<p class="lede" data-i18n="description">${escapeHtml(copy.description[section])}</p>`
    + `<p class="session-note" data-session-note data-i18n="openFromApp" hidden>${escapeHtml(copy.openFromApp)}</p>`
    + `</div><section class="grid">${content}</section></main>`
    + '<footer class="footer">TopAsk Platform</footer>'
    + '<script src="/assets/app.js" defer></script></body></html>'
}
