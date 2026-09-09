import type { LanguageCode } from "./languages"

const britishToAmerican: Record<string, string> = {
  behaviour: "behavior",
  Behaviour: "Behavior",
  colour: "color",
  Colour: "Color",
  licence: "license",
  Licence: "License",
  signalling: "signaling",
  favourite: "favorite",
  organised: "organized",
  organisation: "organization",
  Organisation: "Organization",
  organisations: "organizations",
  Organisations: "Organizations",
}

export function translateText(text: string, language: LanguageCode) {
  if (language === "en-GB" || text.trim().length === 0) return text

  return Object.entries(britishToAmerican).reduce(
    (current, [source, replacement]) => current.replaceAll(source, replacement),
    text,
  )
}
