/** Only offer navigation when real conversation content remains below the composer. */
export function shouldShowDexterJumpToLatest({ latestBottom, visibleBottom, visibleHeight, remainingScroll }: {
  latestBottom: number | null
  visibleBottom: number
  visibleHeight: number
  remainingScroll: number
}) {
  return latestBottom !== null && visibleHeight > 0 && remainingScroll > 2
    && latestBottom - visibleBottom > Math.max(180, visibleHeight * 0.2)
}
