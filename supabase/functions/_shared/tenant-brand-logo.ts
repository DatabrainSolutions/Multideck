/**
 * Some design exports wrap individual logo shapes in navigation-only anchors.
 * Removing those wrappers leaves the artwork unchanged and prevents navigation.
 * Only plain href-only anchors qualify: styled/transformed/interactive anchors
 * stay untouched so the caller's existing SVG safety checks can reject them.
 * This is a preprocessing step, not a replacement for SVG validation.
 */
export function removeNonVisualSvgLinks(svg: string): string {
  const anchors = svg.match(/<a\b[^>]*>/gi) ?? []
  const plainAnchor = /^<a\s+(?:xlink:)?href\s*=\s*(?:"[^"<>&]*"|'[^'<>&]*')\s*>$/i
  if (!anchors.length || anchors.some((tag) => !plainAnchor.test(tag))) return svg
  return svg.replace(/<a\b[^>]*>/gi, "").replace(/<\/a\s*>/gi, "")
}
