/** Square-edge geometry supplied by both brand surfaces. */
export interface TopAskMarkProps {
  /** Requested square edge in pixels. */
  size: number
  /** Host class preserving the surrounding mark geometry. */
  className?: string | undefined
}

/**
 * Render the TopAsk speech-bubble monogram in the current text color.
 * @param props - requested square edge and the host's optional mark class.
 * @returns the TopAsk mark.
 */
export function TopAskMark({ size, className }: TopAskMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <rect x="2.5" y="2.5" width="19" height="16.5" rx="5" fill="currentColor" opacity="0.14" />
      <path d="M7.8 19 6.2 22.2l4.2-2.6" fill="currentColor" opacity="0.14" />
      <path d="M8 8.1h8M12 8.1v7.4" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
      <circle cx="17.4" cy="6.2" r="1.15" fill="currentColor" />
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
