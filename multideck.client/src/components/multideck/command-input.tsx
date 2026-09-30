import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Search } from "@/components/icons/hugeicons"
import { Input } from "@/components/ui/input"
import { ShortcutKeys } from "@/components/multideck/keyboard-shortcut-keys"
import { useLanguage } from "@/i18n/language-provider"
import { registerAppSearch } from "@/lib/app-commands"
import { globalSearchMatchHint, globalSearchSources, rankGlobalSearchResults, type GlobalSearchResult } from "@/lib/global-search"
import { bindingAriaKeyshortcuts } from "@/lib/keyboard-shortcut-binding"
import { useShortcutBinding } from "@/lib/keyboard-shortcuts"
import { cn } from "@/lib/utils"

export function CommandInput({ placeholder = "Search records across Multideck…", className, onNavigate }: {
  placeholder?: string
  className?: string
  onNavigate?: (path: string) => void
}) {
  const { t } = useLanguage()
  const [query, setQuery] = useState("")
  const [open, setOpen] = useState(false)
  const [completedQuery, setCompletedQuery] = useState("")
  const [results, setResults] = useState<GlobalSearchResult[]>([])
  const [pending, setPending] = useState(0)
  const [failed, setFailed] = useState(0)
  const [activeIndex, setActiveIndex] = useState(0)
  const [retry, setRetry] = useState(0)
  const rootRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const searchShortcut = useShortcutBinding("search.focus")
  const searchQuery = query.trim()
  const rankedResults = useMemo(() => rankGlobalSearchResults(results, searchQuery), [results, searchQuery])
  const ready = completedQuery === searchQuery
  const hasQuery = searchQuery.length >= 2

  const focusSearch = useCallback(() => {
    setOpen(true)
    inputRef.current?.focus({ preventScroll: true })
    inputRef.current?.select()
  }, [])
  useEffect(() => registerAppSearch(focusSearch), [focusSearch])

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [])

  useEffect(() => {
    if (!open || !hasQuery) return
    let current = true
    const timer = window.setTimeout(() => {
      setResults([])
      setPending(globalSearchSources.length)
      setFailed(0)
      setCompletedQuery(searchQuery)
      for (const source of globalSearchSources) {
        void source.search(searchQuery).then((items) => {
          if (current) setResults((previous) => [...previous, ...items])
        }).catch((error) => {
          console.error(`${source.name} search failed`, error)
          if (current) setFailed((count) => count + 1)
        }).finally(() => {
          if (current) setPending((count) => count - 1)
        })
      }
    }, 300)
    return () => { current = false; window.clearTimeout(timer) }
  }, [hasQuery, open, retry, searchQuery])

  function select(item: GlobalSearchResult) {
    setQuery("")
    setOpen(false)
    onNavigate?.(item.path)
  }

  return (
    <div ref={rootRef} className={cn("md-command-input relative min-w-0 w-full", className)}>
      <Search className="pointer-events-none absolute start-3 top-[18px] size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.2} />
      <Input
        ref={inputRef}
        role="combobox"
        aria-label="Search Multideck records"
        aria-autocomplete="list"
        aria-expanded={open && Boolean(searchQuery)}
        aria-controls="multideck-command-results"
        aria-activedescendant={open && ready && rankedResults[activeIndex] ? `multideck-search-${activeIndex}` : undefined}
        aria-keyshortcuts={bindingAriaKeyshortcuts(searchShortcut)}
        className="h-9 rounded-[var(--md-radius-lg)] border-0 bg-white/70 ps-9 pe-3 text-base md:pe-16 md:text-[13px] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
        placeholder={placeholder}
        value={query}
        onFocus={() => setOpen(true)}
        onChange={(event) => { setQuery(event.target.value); setActiveIndex(0); setOpen(true) }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            if (open) setOpen(false)
            else if (query) setQuery("")
            else event.currentTarget.blur()
            return
          }
          if (!open || !rankedResults.length || !ready) return
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault()
            setActiveIndex((index) => (index + (event.key === "ArrowDown" ? 1 : -1) + rankedResults.length) % rankedResults.length)
          } else if (event.key === "Enter") {
            event.preventDefault()
            select(rankedResults[activeIndex] ?? rankedResults[0])
          }
        }}
      />
      <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 end-2 my-auto hidden h-fit md:flex items-center">
        <ShortcutKeys binding={searchShortcut} keyClassName="bg-[var(--md-surface-tint)]" emptyLabel="" />
      </span>
      {open && searchQuery ? (
        <div id="multideck-command-results" role="listbox" aria-label="Search results" className="absolute inset-x-0 top-[calc(100%+8px)] z-50 max-h-[min(460px,65dvh)] overflow-y-auto overscroll-contain rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1.5 shadow-[var(--md-shadow-lift)] ring-1 ring-[var(--md-line)]">
          {!hasQuery ? (
            <p className="px-3 py-4 text-center text-[12px] text-[var(--md-text)]">{t("Enter at least two characters to search records.")}</p>
          ) : !ready || (pending > 0 && !rankedResults.length) ? (
            <p className="px-3 py-4 text-center text-[12px] text-[var(--md-text)]" role="status">{t("Searching records…")}</p>
          ) : (
            <>
              {rankedResults.map((item, index) => (
                <button key={item.key} id={`multideck-search-${index}`} type="button" role="option" aria-selected={index === activeIndex} onMouseEnter={() => setActiveIndex(index)} onClick={() => select(item)}
                  className={cn("grid w-full grid-cols-[minmax(0,1fr)_auto] items-start gap-3 rounded-[var(--md-radius-lg)] px-3 py-2.5 text-start transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a20)]", index === activeIndex ? "bg-[var(--md-hover)]" : "hover:bg-[var(--md-hover)]")}>
                  <span className="min-w-0">
                    <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip>{item.title}</span>
                    <span className="mt-0.5 block truncate text-[12px] text-[var(--md-text)]" data-i18n-skip>{item.detail}</span>
                    {item.meta ? <span className="mt-0.5 block truncate text-[11px] text-[var(--md-subtle)]" data-i18n-skip>{item.meta}</span> : null}
                    {globalSearchMatchHint(item, searchQuery) ? <span className="mt-0.5 block truncate text-[11px] text-[var(--md-accent)]">{t("Match in")}: <span data-i18n-skip>{globalSearchMatchHint(item, searchQuery)}</span></span> : null}
                  </span>
                  <span className="rounded-full bg-[var(--md-surface-tint)] px-2 py-0.5 text-[10px] text-[var(--md-text)]">{t(item.area)}</span>
                </button>
              ))}
              {!rankedResults.length && pending === 0 ? <p className="px-3 py-4 text-center text-[12px] text-[var(--md-text)]">{t(failed ? "No matches in the areas searched. Try again to check the others." : "No match here. Finance, tasks and reports have their own searches.")}</p> : null}
              {pending > 0 && rankedResults.length ? <p className="px-3 py-2 text-[11px] text-[var(--md-subtle)]" role="status">{t("Searching other areas…")}</p> : null}
              {failed > 0 && pending === 0 ? <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] text-[var(--md-text)]" role="status"><span>{t("Some areas could not be searched.")}</span><button type="button" className="font-medium text-[var(--md-accent)] underline underline-offset-2" onClick={() => setRetry((value) => value + 1)}>{t("Retry")}</button></div> : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  )
}
