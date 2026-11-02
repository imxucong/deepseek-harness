/** Authorization pages: one branded shell shared by consent, completion, and notices. */
import type { AttemptView } from './api.ts'
import { escapeHtml } from './html.ts'
import type { PageLocale } from './locale.ts'

/** Failure page identity. */
export type NoticeKind =
  | 'missing'
  | 'not-found'
  | 'expired'
  | 'unavailable'
  | 'invalid-confirmation'
  | 'state-mismatch'
  | 'cancelled'

interface Copy {
  readonly lang: 'zh-CN' | 'en'
  readonly tagline: readonly [string, string]
  readonly authorizeEyebrow: string
  readonly authorizeTitle: string
  readonly authorizeDescription: string
  readonly approve: string
  readonly deny: string
  readonly authorizeNote: string
  readonly successTitle: string
  readonly successDesktop: string
  readonly successWeb: string
  readonly openApp: string
  readonly successNote: string
  readonly noticeEyebrow: string
  readonly notices: Readonly<Record<NoticeKind, readonly [string, string]>>
}

const COPY: Readonly<Record<PageLocale, Copy>> = {
  zh: {
    lang: 'zh-CN',
    tagline: ['欢迎对话 TopAsk，', '共探智能上限'],
    authorizeEyebrow: '开发模式',
    authorizeTitle: '允许登录 TopAsk',
    authorizeDescription: '登录后将向应用提供你的账号信息。',
    approve: '允许登录',
    deny: '取消',
    authorizeNote: '登录后请返回应用。',
    successTitle: '登录成功',
    successDesktop: '你可以关闭此页面，返回桌面端继续工作。',
    successWeb: '登录已完成，你可以关闭此页面。',
    openApp: '打开应用',
    successNote: '如果应用没有自动打开，请返回桌面端继续。',
    noticeEyebrow: '提示',
    notices: {
      missing: ['登录请求无效', '缺少登录请求标识，请返回应用重试。'],
      'not-found': ['登录请求不存在', '该登录请求不存在或已失效，请返回应用重新发起登录。'],
      expired: ['登录请求已过期', '请返回应用重新发起登录。'],
      unavailable: ['登录服务暂不可用', '请稍后重试，或返回应用重新发起登录。'],
      'invalid-confirmation': ['无效的登录确认', '请返回应用重新发起登录。'],
      'state-mismatch': ['登录状态不匹配', '请返回应用重新发起登录。'],
      cancelled: ['已取消登录', '你可以关闭此页面。'],
    },
  },
  en: {
    lang: 'en',
    tagline: ['Welcome to TopAsk,', 'explore intelligence'],
    authorizeEyebrow: 'DEVELOPMENT',
    authorizeTitle: 'Sign in to TopAsk',
    authorizeDescription: 'Use the identity below. The app receives your account information after you approve.',
    approve: 'Allow sign-in',
    deny: 'Cancel',
    authorizeNote: 'Return to the app after signing in.',
    successTitle: 'Signed in',
    successDesktop: 'You can close this page and return to the desktop app.',
    successWeb: 'Sign-in is complete. You can close this page.',
    openApp: 'Open app',
    successNote: 'If the app did not open, return to the desktop app.',
    noticeEyebrow: 'NOTICE',
    notices: {
      missing: ['Invalid sign-in request', 'The request is missing its identifier. Return to the app and try again.'],
      'not-found': ['Sign-in request not found', 'This request does not exist or is no longer valid. Return to the app and start again.'],
      expired: ['Sign-in request expired', 'Return to the app and start again.'],
      unavailable: ['Sign-in service unavailable', 'Try again shortly, or return to the app and start again.'],
      'invalid-confirmation': ['Invalid confirmation', 'Return to the app and start again.'],
      'state-mismatch': ['Sign-in state mismatch', 'Return to the app and start again.'],
      cancelled: ['Sign-in cancelled', 'You can close this page.'],
    },
  },
}

/** TopAsk master-mark outline, shared with the shipped application artwork. */
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

const WATERMARK = '<svg class="watermark" viewBox="0 0 1254 1254" aria-hidden="true" focusable="false">'
  + `<path d="${MARK_PATH}" fill="currentColor"/></svg>`

const STYLE = `
*,*::before,*::after{box-sizing:border-box}
html,body{height:100%}
body{margin:0;background:#fff;color:#111318;-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
font-family:-apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang SC","Hiragino Sans GB","Microsoft YaHei","Noto Sans CJK SC",sans-serif}
.shell{min-height:100vh;display:grid;grid-template-columns:minmax(0,1fr) clamp(320px,25vw,440px)}
.content-pane{display:flex;align-items:center;justify-content:center;padding:clamp(40px,7vh,88px) clamp(24px,5vw,64px)}
.content{width:min(100%,320px);margin:0 auto;text-align:center}
.brand{display:flex;justify-content:center;align-items:center;gap:9px;margin-bottom:clamp(52px,9vh,84px);line-height:1}
.mark{display:block;flex:none;width:26px;height:26px}
.wordmark{font-family:"Montserrat","Avenir Next","SF Pro Display",-apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;
font-size:19px;font-weight:600;letter-spacing:-.02em;color:#111318}
.badge{padding:3px 4px 2px;border:1px solid #d5d8df;border-radius:3px;color:#767b87;font-size:9px;font-weight:700;
letter-spacing:.16em;transform:translateY(1px)}
.eyebrow{display:flex;justify-content:center;align-items:center;gap:7px;margin:0 0 14px;color:#8a8f9a;
font-size:11px;font-weight:600;letter-spacing:.14em;text-transform:uppercase}
.eyebrow::before{content:"";width:5px;height:5px;border-radius:50%;background:linear-gradient(135deg,#209EFD,#7952FD)}
h1{margin:0 0 12px;font-size:clamp(24px,2.2vw,28px);font-weight:600;line-height:1.3;letter-spacing:-.02em;color:#111318}
.lede{max-width:34ch;margin:0 auto;color:#6b707c;font-size:14px;line-height:1.75}
.identity{display:flex;align-items:center;gap:12px;margin-top:28px;padding:13px 14px;border:1px solid #e9eaef;
border-radius:12px;background:#f7f8fb;text-align:left}
.avatar{display:grid;place-items:center;flex:none;width:38px;height:38px;border-radius:50%;
background:linear-gradient(135deg,#25E3F8,#209EFD 38%,#295BFD 70%,#7952FD);color:#fff;font-size:15px;font-weight:600}
.identity-copy{display:flex;flex-direction:column;gap:2px;min-width:0}
.identity-name,.identity-email{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.identity-name{color:#111318;font-size:14px;font-weight:600}
.identity-email{color:#7a7f8b;font-size:12.5px}
.actions{display:grid;gap:6px;margin-top:40px}
.primary{display:flex;align-items:center;justify-content:center;width:100%;height:44px;border:0;border-radius:10px;
background:#131418;color:#fff;font:inherit;font-size:15px;font-weight:500;letter-spacing:.01em;text-decoration:none;
cursor:pointer;transition:background-color .18s ease,transform .18s ease,box-shadow .18s ease}
.primary:hover{background:#000;transform:translateY(-1px);box-shadow:0 10px 24px rgba(17,19,24,.16)}
.primary:active{transform:translateY(0);box-shadow:none}
.secondary{width:100%;padding:10px;border:0;border-radius:9px;background:transparent;color:#6b707c;font:inherit;
font-size:14px;cursor:pointer;transition:background-color .18s ease,color .18s ease}
.secondary:hover{background:#f4f5f8;color:#111318}
.primary:focus-visible,.secondary:focus-visible{outline:2px solid #295BFD;outline-offset:3px}
.note{margin:26px 0 0;color:#9a9faa;font-size:12px;line-height:1.6}
.brand-pane{position:relative;display:flex;align-items:center;overflow:hidden;padding:clamp(32px,4.5vw,60px);
background:radial-gradient(130% 95% at 12% 8%,rgba(170,192,224,.34),transparent 60%),
radial-gradient(95% 80% at 92% 82%,rgba(121,82,253,.18),transparent 66%),
radial-gradient(80% 65% at 48% 108%,rgba(20,69,246,.22),transparent 70%),
linear-gradient(152deg,#46516a 0%,#2c3547 52%,#171d29 100%)}
.brand-pane::before{content:"";position:absolute;inset:-12%;transform:rotate(-4deg);filter:blur(18px);
background:linear-gradient(118deg,transparent 6%,rgba(255,255,255,.07) 26%,transparent 46%),
linear-gradient(118deg,transparent 52%,rgba(255,255,255,.05) 66%,transparent 82%)}
.brand-pane::after{content:"";position:absolute;right:-26%;bottom:-32%;width:72%;aspect-ratio:1;border-radius:50%;
background:radial-gradient(circle,rgba(255,255,255,.09),transparent 62%);filter:blur(32px)}
.watermark{position:absolute;right:-18%;bottom:-10%;width:78%;height:auto;color:#fff;opacity:.045;transform:rotate(-8deg)}
.tagline{position:relative;z-index:1;margin:0;color:rgba(255,255,255,.94);font-size:clamp(18px,1.35vw,21px);
font-weight:400;line-height:1.95;letter-spacing:.03em}
.tagline span{display:block}
@media (prefers-reduced-motion:no-preference){
.content>*{animation:rise .6s cubic-bezier(.22,.72,.24,1) both}
.content>*:nth-child(1){animation-delay:.02s}
.content>*:nth-child(2){animation-delay:.07s}
.content>*:nth-child(3){animation-delay:.12s}
.content>*:nth-child(4){animation-delay:.17s}
.content>*:nth-child(5){animation-delay:.22s}
.content>*:nth-child(6){animation-delay:.27s}
.content>*:nth-child(7){animation-delay:.32s}
}
@keyframes rise{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:translateY(0)}}
@media (max-width:820px){
.shell{grid-template-columns:1fr;grid-template-rows:auto 1fr}
.brand-pane{order:-1;min-height:176px;padding:28px clamp(24px,6vw,48px)}
.tagline{font-size:18px;line-height:1.8}
.watermark{right:-8%;bottom:-24%;width:46%}
.content-pane{padding:clamp(36px,8vh,64px) 24px}
.brand{margin-bottom:48px}
}
@media (max-width:420px){h1{font-size:24px}.content{width:100%}}
`

/** Page slots one HTML response fills. */
interface PageOptions {
  readonly locale: PageLocale
  readonly title: string
  readonly description: string
  readonly eyebrow?: string
  readonly content?: string
  readonly actions?: string
  readonly note?: string
}

/**
 * Render one complete authorization page in the shared shell.
 * @param options - locale, copy, and optional content slots.
 * @returns a complete HTML document.
 */
function renderPage(options: PageOptions): string {
  const copy = COPY[options.locale]
  const eyebrow = options.eyebrow === undefined ? '' : `<p class="eyebrow">${options.eyebrow}</p>`
  return `<!doctype html><html lang="${copy.lang}"><head><meta charset="utf-8">`
    + '<meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<meta name="color-scheme" content="light">'
    + `<title>${escapeHtml(options.title)} · TopAsk</title><style>${STYLE}</style></head><body>`
    + '<div class="shell"><main class="content-pane"><div class="content">'
    + `<header class="brand">${MARK}<span class="wordmark">TopAsk</span><span class="badge">ACCOUNT</span></header>`
    + eyebrow
    + `<h1>${escapeHtml(options.title)}</h1><p class="lede">${escapeHtml(options.description)}</p>`
    + (options.content ?? '')
    + (options.actions ?? '')
    + (options.note === undefined ? '' : `<p class="note">${escapeHtml(options.note)}</p>`)
    + '</div></main><aside class="brand-pane" aria-hidden="true">'
    + WATERMARK
    + `<p class="tagline"><span>${escapeHtml(copy.tagline[0])}</span><span>${escapeHtml(copy.tagline[1])}</span></p>`
    + '</aside></div></body></html>'
}

/**
 * Render the account-consent page that approves one browser attempt.
 * @param attempt - attempt facts read from the account API.
 * @param locale - page language.
 * @returns a complete HTML document.
 */
export function authorizePage(attempt: AttemptView, locale: PageLocale): string {
  const copy = COPY[locale]
  const initial = Array.from(attempt.user.name.trim())[0] ?? 'T'
  const content = '<div class="identity">'
    + `<span class="avatar" aria-hidden="true">${escapeHtml(initial)}</span>`
    + `<span class="identity-copy"><span class="identity-name">${escapeHtml(attempt.user.name)}</span>`
    + `<span class="identity-email">${escapeHtml(attempt.user.email)}</span></span></div>`
  const actions = '<form class="actions" method="post" action="/dsh/authorize">'
    + `<input type="hidden" name="authorize_id" value="${escapeHtml(attempt.authorizeId)}">`
    + `<input type="hidden" name="state" value="${escapeHtml(attempt.state)}">`
    + `<input type="hidden" name="locale" value="${locale === 'en' ? 'en_US' : 'zh_CN'}">`
    + `<button class="primary" type="submit" name="action" value="approve">${copy.approve}</button>`
    + `<button class="secondary" type="submit" name="action" value="deny">${copy.deny}</button></form>`
  return renderPage({
    locale,
    eyebrow: copy.authorizeEyebrow,
    title: copy.authorizeTitle,
    description: copy.authorizeDescription,
    content,
    actions,
    note: copy.authorizeNote,
  })
}

/**
 * Render the completion page the browser lands on after exchange.
 * @param locale - page language.
 * @param loginSource - initiating client (`desktop` opens the app protocol).
 * @returns a complete HTML document.
 */
export function authorizedPage(locale: PageLocale, loginSource: string | null): string {
  const copy = COPY[locale]
  const desktop = loginSource === 'desktop'
  const actions = desktop
    ? `<div class="actions"><a class="primary" href="dsh://open">${copy.openApp}</a></div>`
    : ''
  return renderPage({
    locale,
    title: copy.successTitle,
    description: desktop ? copy.successDesktop : copy.successWeb,
    actions,
    ...(desktop ? { note: copy.successNote } : {}),
  })
}

/**
 * Render a failure page.
 * @param kind - which notice to present.
 * @param locale - page language.
 * @returns a complete HTML document.
 */
export function noticePage(kind: NoticeKind, locale: PageLocale): string {
  const copy = COPY[locale]
  const [title, description] = copy.notices[kind]
  return renderPage({ locale, eyebrow: copy.noticeEyebrow, title, description })
}
