/** Page language shared by the platform's public pages. */

/** Language one browser page renders. */
export type PageLocale = 'zh' | 'en'

/**
 * Resolve the page language from a Platform locale tag.
 * @param value - locale such as `zh_CN`, `en_US`, an unsupported tag, or an empty string.
 * @returns `zh` for Chinese tags and the missing value, otherwise `en`.
 */
export function localeFrom(value: string | undefined): PageLocale {
  return value === undefined || value.trim() === '' || value.toLowerCase().startsWith('zh') ? 'zh' : 'en'
}
