import { createContext, startTransition, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { defaultLanguage, getLanguageOption, isLanguageCode, type LanguageCode } from "./languages"
import { translateText } from "./translate"

const storageKey = "multideck.language"
const translatableAttributes = ["aria-label", "placeholder", "title", "alt"] as const
const skippedTags = new Set(["CODE", "PRE", "SCRIPT", "STYLE", "TEXTAREA", "NOSCRIPT"])
const textSources = new WeakMap<Text, string>()

type LanguageContextValue = {
  language: LanguageCode
  setLanguage: (language: LanguageCode) => void
  direction: "ltr" | "rtl"
  languageLabel: string
  t: (text: string) => string
}

const LanguageContext = createContext<LanguageContextValue | null>(null)

function readStoredLanguage(): LanguageCode {
  if (typeof window === "undefined") return defaultLanguage
  const stored = window.localStorage.getItem(storageKey)
  return isLanguageCode(stored) ? stored : defaultLanguage
}

function shouldSkipNode(node: Node) {
  const parent = node.parentElement
  if (!parent) return true
  if (skippedTags.has(parent.tagName)) return true
  return Boolean(parent.closest("[data-i18n-skip]"))
}

function localizeTextNode(node: Text, language: LanguageCode) {
  if (shouldSkipNode(node)) return
  const current = node.nodeValue ?? ""
  const previousSource = textSources.get(node)
  const source = previousSource && current === translateText(previousSource, language) ? previousSource : current
  if (!source.trim()) return
  textSources.set(node, source)

  const next = translateText(source, language)
  if (node.nodeValue !== next) node.nodeValue = next
}

function localizeAttributes(element: Element, language: LanguageCode) {
  if (skippedTags.has(element.tagName) || element.closest("[data-i18n-skip]")) return

  for (const attribute of translatableAttributes) {
    const value = element.getAttribute(attribute)
    if (!value?.trim()) continue

    const sourceAttribute = `data-md-i18n-source-${attribute}`
    const previousSource = element.getAttribute(sourceAttribute)
    const source = previousSource && value === translateText(previousSource, language) ? previousSource : value
    element.setAttribute(sourceAttribute, source)

    const next = translateText(source, language)
    if (value !== next) element.setAttribute(attribute, next)
  }
}

function localizeTree(root: ParentNode, language: LanguageCode) {
  if (root instanceof Element) localizeAttributes(root, language)

  const textWalker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let textNode = textWalker.nextNode()
  while (textNode) {
    localizeTextNode(textNode as Text, language)
    textNode = textWalker.nextNode()
  }

  const elementRoot = root instanceof Element ? root : root instanceof Document ? root.documentElement : root
  elementRoot.querySelectorAll?.("*").forEach((element) => localizeAttributes(element, language))
}

function useDocumentLanguage(language: LanguageCode) {
  useEffect(() => {
    const option = getLanguageOption(language)
    document.documentElement.lang = language
    document.documentElement.dir = option.direction
    document.documentElement.dataset.language = language
    window.localStorage.setItem(storageKey, language)
  }, [language])
}

function useDomLocalization(language: LanguageCode) {
  const previousLanguageRef = useRef<LanguageCode | null>(null)

  useEffect(() => {
    const previousLanguage = previousLanguageRef.current
    previousLanguageRef.current = language

    if (language === defaultLanguage) {
      if (previousLanguage && previousLanguage !== defaultLanguage) {
        localizeTree(document.body, language)
      }
      return
    }

    let frame: number | null = null

    const run = () => {
      frame = null
      localizeTree(document.body, language)
    }

    const schedule = () => {
      if (frame !== null) return
      frame = window.requestAnimationFrame(run)
    }

    schedule()

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "characterData") {
          localizeTextNode(mutation.target as Text, language)
          continue
        }

        if (mutation.type === "attributes" && mutation.target instanceof Element) {
          localizeAttributes(mutation.target, language)
          continue
        }

        mutation.addedNodes.forEach((node) => {
          if (node instanceof Text) localizeTextNode(node, language)
          if (node instanceof Element) localizeTree(node, language)
        })
      }
    })

    observer.observe(document.body, {
      attributes: true,
      attributeFilter: [...translatableAttributes],
      childList: true,
      characterData: true,
      subtree: true,
    })

    return () => {
      observer.disconnect()
      if (frame !== null) window.cancelAnimationFrame(frame)
    }
  }, [language])
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<LanguageCode>(readStoredLanguage)
  const option = getLanguageOption(language)

  useDocumentLanguage(language)
  useDomLocalization(language)

  const setLanguage = useCallback((nextLanguage: LanguageCode) => {
    startTransition(() => setLanguageState(nextLanguage))
  }, [])

  const value = useMemo<LanguageContextValue>(
    () => ({
      language,
      setLanguage,
      direction: option.direction,
      languageLabel: option.label,
      t: (text) => translateText(text, language),
    }),
    [language, option.direction, option.label, setLanguage],
  )

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>
}

export function useLanguage() {
  const context = useContext(LanguageContext)
  if (!context) throw new Error("useLanguage must be used inside LanguageProvider")
  return context
}
