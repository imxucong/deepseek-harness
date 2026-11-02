/** Browser script for the signed-in platform pages. */
export const PLATFORM_SCRIPT: string = String.raw`(() => {
  'use strict'
  const english = {
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
    titles: { home: 'Account overview', usage: 'Usage', 'top-up': 'Top up' },
    descriptions: {
      home: 'Review your TopAsk account, wallet balance, and usage entry points.',
      usage: 'Review your wallet balance; request-level usage detail is not connected yet.',
      'top-up': 'Review your current balance; online top-up is not connected yet.',
    },
  }
  const bridge = window.dsh
  const embedded = bridge !== undefined && bridge !== null && bridge.displayMode === 'embedded'
  let locale = 'zh'
  if (embedded) {
    try {
      locale = bridge.getLocale().toLowerCase().indexOf('en') === 0 ? 'en' : 'zh'
    } catch (error) {
      locale = 'zh'
    }
  }
  const section = document.body.dataset.section || 'home'
  const setText = (selector, value) => {
    document.querySelectorAll(selector).forEach((element) => { element.textContent = value })
  }
  const setI18n = (key, value) => {
    document.querySelectorAll('[data-i18n="' + key + '"]').forEach((element) => { element.textContent = value })
  }
  if (locale === 'en') {
    document.documentElement.lang = 'en'
    const keys = ['navHome', 'navUsage', 'navTopUp', 'account', 'balance', 'bonus', 'loading', 'openFromApp',
      'quickUsage', 'quickTopUp', 'usageEmpty', 'usageEmptyDescription', 'topUpEmpty', 'topUpEmptyDescription']
    keys.forEach((key) => { setI18n(key, english[key]) })
    setI18n('title', english.titles[section] || english.titles.home)
    setI18n('description', english.descriptions[section] || english.descriptions.home)
    document.title = (english.titles[section] || english.titles.home) + ' · TopAsk'
  }
  const showNote = (message) => {
    const element = document.querySelector('[data-session-note]')
    if (element === null) return
    element.textContent = message
    element.hidden = false
  }
  if (!embedded) {
    document.body.dataset.state = 'signed-out'
    setText('[data-account-name]', locale === 'en' ? english.signedOut : '未登录')
    showNote(locale === 'en' ? english.openFromApp : '请从 TopAsk 桌面端打开此页面，或在应用内登录后再试。')
    return
  }
  let token
  try {
    token = bridge.getAuthToken()
  } catch (error) {
    token = undefined
  }
  if (typeof token !== 'string' || token.length === 0) {
    document.body.dataset.state = 'unavailable'
    setText('[data-account-name]', locale === 'en' ? english.unavailable : '账号信息暂不可用')
    showNote(locale === 'en' ? english.openFromApp : '账号信息暂不可用，请重新登录后再试。')
    return
  }
  const headers = { 'x-dsh-auth-token': token }
  const readEnvelope = (url) => fetch(url, { headers: headers }).then((response) => {
    if (!response.ok) return Promise.reject(response.status)
    return response.json()
  })
  Promise.all([
    readEnvelope('/auth-api/v0/users/current'),
    readEnvelope('/api/v0/users/get_user_summary'),
  ]).then((results) => {
    const profile = results[0] && results[0].data ? results[0].data.biz_data : null
    const summary = results[1] && results[1].data ? results[1].data.biz_data : null
    const name = profile && profile.id_profile && profile.id_profile.name ? profile.id_profile.name : ''
    const email = profile && profile.email ? profile.email : ''
    const wallets = summary && Array.isArray(summary.normal_wallets) ? summary.normal_wallets : []
    const bonuses = summary && Array.isArray(summary.bonus_wallets) ? summary.bonus_wallets : []
    const balance = wallets.length > 0 && wallets[0].balance ? wallets[0].balance : '0.00'
    const bonus = bonuses.length > 0 && bonuses[0].balance ? bonuses[0].balance : '0.00'
    document.body.dataset.state = 'ready'
    setText('[data-account-name]', name)
    setText('[data-account-email]', email)
    setText('[data-balance]', balance)
    setText('[data-bonus]', bonus)
    const initial = Array.from(name)[0] || 'T'
    document.querySelectorAll('[data-account-initial]').forEach((element) => { element.textContent = initial })
  }).catch(() => {
    document.body.dataset.state = 'unavailable'
    setText('[data-account-name]', locale === 'en' ? english.unavailable : '账号信息暂不可用')
    showNote(locale === 'en' ? english.openFromApp : '账号信息暂不可用，请重新登录后再试。')
  })
})()`
