import type { MailboxFolder } from "@/lib/inbox-contract"

export type MailboxLabelTone = {
  backgroundColor: string
  foregroundColor: string
}

// Gmail user labels can be left on the provider default. These restrained,
// opaque colours give those labels a durable identity without inheriting the
// current Multideck accent or appearance.
const fallbackLabelBackgrounds = [
  "#D9E8FF",
  "#E7DEFF",
  "#FFDCE5",
  "#FFE2CE",
  "#FFF0B8",
  "#D5F0DF",
  "#CFEFEE",
  "#DDE5EA",
] as const

const darkLabelInk = "#17211F"
const lightLabelInk = "#FFFFFF"

function hexChannel(value: string, offset: number) {
  return Number.parseInt(value.slice(offset, offset + 2), 16) / 255
}

function linearChannel(value: number) {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
}

function relativeLuminance(colour: string) {
  const red = linearChannel(hexChannel(colour, 1))
  const green = linearChannel(hexChannel(colour, 3))
  const blue = linearChannel(hexChannel(colour, 5))
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue
}

export function labelColourContrast(foreground: string, background: string) {
  const light = Math.max(relativeLuminance(foreground), relativeLuminance(background))
  const dark = Math.min(relativeLuminance(foreground), relativeLuminance(background))
  return (light + 0.05) / (dark + 0.05)
}

function readableForeground(background: string, preferred: string | null) {
  if (preferred && labelColourContrast(preferred, background) >= 4.5) return preferred
  return labelColourContrast(darkLabelInk, background) >= labelColourContrast(lightLabelInk, background)
    ? darkLabelInk
    : lightLabelInk
}

function stableLabelIndex(value: string) {
  let hash = 2166136261
  for (const character of value.normalize("NFKC")) {
    hash ^= character.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16777619)
  }
  return Math.abs(hash) % fallbackLabelBackgrounds.length
}

/**
 * Returns an opaque colour pair that does not depend on Multideck's light,
 * dark or accent theme. Provider colours remain authoritative when readable;
 * uncoloured Gmail labels receive a stable, accessible identity of their own.
 */
export function mailboxLabelTone(folder: Pick<MailboxFolder, "displayName" | "backgroundColor" | "textColor">): MailboxLabelTone {
  const backgroundColor = folder.backgroundColor
    ?? fallbackLabelBackgrounds[stableLabelIndex(folder.displayName)]
  return {
    backgroundColor,
    foregroundColor: readableForeground(backgroundColor, folder.textColor),
  }
}
