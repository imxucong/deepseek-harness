import { useId } from 'react'

/** Square-edge geometry supplied by both brand surfaces. */
export interface TopAskMarkProps {
  /** Requested square edge in pixels. */
  size: number
  /** Host class preserving the surrounding mark geometry. */
  className?: string | undefined
}

/** TopAsk master-mark outline, shared with the shipped application artwork. */
const BUBBLE_PATH = 'M 643 222 C 846 221 1014 329 1048 502 C 1080 656 1047 789 951 881 '
  + 'C 868 961 728 990 558 955 C 484 940 466 942 391 973 C 345 994 295 1020 261 1006 '
  + 'C 226 992 246 966 270 920 C 293 876 301 844 287 813 C 272 780 238 751 222 698 '
  + 'C 194 612 194 535 225 450 C 288 300 446 222 643 222 Z'

/**
 * Render the TopAsk speech-bubble mark using the product's blue-purple gradient.
 * @param props - requested square edge and the host's optional mark class.
 * @returns the TopAsk mark.
 */
export function TopAskMark({ size, className }: TopAskMarkProps) {
  const id = useId().replaceAll(/[^a-zA-Z0-9_-]/gu, '')
  const bodyId = `${id}-body`
  const eyeId = `${id}-eye`
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 1254 1254"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <defs>
        <linearGradient id={bodyId} x1="17%" y1="8%" x2="94%" y2="92%">
          <stop offset="0%" stopColor="#25E3F8" />
          <stop offset="30%" stopColor="#209EFD" />
          <stop offset="65%" stopColor="#295BFD" />
          <stop offset="100%" stopColor="#7952FD" />
        </linearGradient>
        <linearGradient id={eyeId} x1="15%" y1="0%" x2="85%" y2="100%">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="68%" stopColor="#F9FBFF" />
          <stop offset="100%" stopColor="#DDEBFF" />
        </linearGradient>
      </defs>
      <path d={BUBBLE_PATH} fill={`url(#${bodyId})`} />
      <ellipse cx="512" cy="615" rx="60" ry="83" fill={`url(#${eyeId})`} />
      <ellipse cx="781" cy="618" rx="55" ry="81" fill={`url(#${eyeId})`} />
    </svg>
  )
}

/**
 * Render the sidebar brand mark at the shell's requested edge.
 * @param props.size - requested square edge in pixels.
 * @returns the TopAsk mark.
 */
export function TopAskSidebarMark({ size }: { size: number }) {
  return <TopAskMark size={size} />
}

/**
 * Render the conversation-hero brand mark with the host's mark class.
 * @param props.size - requested square edge in pixels.
 * @param props.className - host class preserving the hero geometry.
 * @returns the TopAsk mark.
 */
export function TopAskHeroMark({ size, className }: { size: number; className?: string | undefined }) {
  return <TopAskMark size={size} className={className} />
}

/**
 * Render the sidebar brand name.
 * @returns the TopAsk wordmark.
 */
export function TopAskBrandName() {
  return (
    <span
      style={{
        fontFamily: 'var(--dsw-font-family-brand)',
        fontWeight: 600,
        fontSize: 15,
        letterSpacing: '-0.01em',
        lineHeight: 1,
      }}
    >
      TopAsk
    </span>
  )
}
