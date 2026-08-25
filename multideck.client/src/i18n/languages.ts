export type LanguageCode = "en-GB" | "en-US"

export type LanguageOption = {
  code: LanguageCode
  label: string
  nativeLabel: string
  direction: "ltr" | "rtl"
}

export const languageOptions: LanguageOption[] = [
  { code: "en-GB", label: "English (UK)", nativeLabel: "English (UK)", direction: "ltr" },
  { code: "en-US", label: "English (US)", nativeLabel: "English (US)", direction: "ltr" },
]

export const defaultLanguage: LanguageCode = "en-GB"

export function getLanguageOption(code: LanguageCode) {
  return languageOptions.find((language) => language.code === code) ?? languageOptions[0]
}

export function isLanguageCode(value: string | null): value is LanguageCode {
  return languageOptions.some((language) => language.code === value)
}
