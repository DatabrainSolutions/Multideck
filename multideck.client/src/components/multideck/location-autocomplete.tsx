import { useEffect, useId, useRef, useState } from "react"
import { MapPin, Search } from "@/components/icons/hugeicons"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { Input } from "@/components/ui/input"
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover"
import { useLanguage } from "@/i18n/language-provider"
import { searchEventLocations, type LocationSuggestion } from "@/lib/event-location-search"
import { cn } from "@/lib/utils"

/** An editable location, with optional public place suggestions. Selection is never required. */
export function LocationAutocomplete({ value, onChange, error, autoFocus = false, search = searchEventLocations }: {
  value: string
  onChange: (value: string) => void
  error?: string
  autoFocus?: boolean
  search?: (query: string, signal: AbortSignal) => Promise<LocationSuggestion[]>
}) {
  const { t } = useLanguage()
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const chosen = useRef(value)
  const cache = useRef(new Map<string, LocationSuggestion[]>())
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<LocationSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const [active, setActive] = useState(-1)
  const [retry, setRetry] = useState(0)
  const query = value.trim()
  const visible = open && query.length >= 3

  useEffect(() => {
    if (!visible) { setLoading(false); return }
    const controller = new AbortController()
    const cached = cache.current.get(query.toLocaleLowerCase())
    setFailed(false)
    setItems(cached ?? [])
    setLoading(!cached)
    if (cached) return () => controller.abort()
    const timer = window.setTimeout(() => {
      search(query, controller.signal).then(results => {
        if (controller.signal.aborted) return
        if (cache.current.size >= 30) cache.current.delete(cache.current.keys().next().value!)
        cache.current.set(query.toLocaleLowerCase(), results)
        setItems(results)
      }).catch(() => { if (!controller.signal.aborted) setFailed(true) })
        .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    }, 400)
    return () => { controller.abort(); window.clearTimeout(timer) }
  }, [query, value, visible, search, retry])

  useEffect(() => {
    if (active >= 0) document.getElementById(`${id}-option-${active}`)?.scrollIntoView({ block: "nearest" })
  }, [active, id])

  const choose = (next: string) => {
    chosen.current = next
    onChange(next)
    setOpen(false)
    setActive(-1)
    setItems([])
    input.current?.focus()
  }

  return <div className="grid min-w-0 gap-1.5">
    <label htmlFor={id} className="text-[12px] font-medium text-[var(--md-ink)]">{t("Location")}</label>
    <Popover open={visible} onOpenChange={next => { setOpen(next); if (!next) setActive(-1) }}>
      <PopoverAnchor asChild>
        <div className="relative">
          <MapPin className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.6} aria-hidden="true" />
          <Input ref={input} id={id} autoFocus={autoFocus} value={value} maxLength={240} autoComplete="off" spellCheck={false}
            className="ps-9" placeholder={t("Place, address or postcode")}
            role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={visible ? `${id}-list` : undefined}
            aria-activedescendant={visible && active >= 0 ? `${id}-option-${active}` : undefined}
            aria-invalid={Boolean(error)} aria-describedby={`${id}-hint${error ? ` ${id}-error` : ""}`}
            onChange={event => { onChange(event.target.value); chosen.current = ""; setItems([]); setActive(-1); setOpen(true) }}
            onFocus={() => { if (value !== chosen.current) setOpen(true) }}
            onKeyDown={event => {
              if (event.nativeEvent.isComposing) return
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                if (query.length < 3) return
                event.preventDefault(); setOpen(true)
                setActive(current => event.key === "ArrowDown" ? Math.min(items.length, current + 1) : Math.max(0, current < 0 ? items.length : current - 1))
              } else if (event.key === "Enter" && visible) {
                event.preventDefault(); event.stopPropagation()
                choose(active >= 0 && active < items.length ? items[active].value : value)
              } else if (event.key === "Escape" && visible) {
                event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1)
              } else if (event.key === "Tab") { setOpen(false); setActive(-1) }
            }} />
        </div>
      </PopoverAnchor>
      <PopoverContent align="start" sideOffset={5} className="w-[var(--radix-popover-trigger-width)] min-w-0 gap-0 p-1"
        onOpenAutoFocus={event => event.preventDefault()} onCloseAutoFocus={event => event.preventDefault()}
        onInteractOutside={event => { if (event.target === input.current) event.preventDefault() }}
        onEscapeKeyDown={event => { event.preventDefault(); setOpen(false) }}>
        <div id={`${id}-list`} role="listbox" aria-label={t("Location suggestions")} className="max-h-[min(280px,40vh)] overflow-y-auto overscroll-contain">
          {items.map((item, index) => <button key={item.id} id={`${id}-option-${index}`} type="button" role="option" aria-selected={active === index} tabIndex={-1}
            className={cn("flex min-h-12 w-full items-start gap-2.5 rounded-[var(--md-radius-md)] px-2.5 py-2 text-start hover:bg-[var(--md-surface-tint)]", active === index && "bg-[var(--md-surface-tint)]")}
            onPointerDown={event => event.preventDefault()} onPointerMove={() => setActive(index)} onClick={() => choose(item.value)}>
            <MapPin className="mt-0.5 size-4 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.5} aria-hidden="true" />
            <span className="grid min-w-0 gap-0.5"><span className="text-[13px] font-medium text-[var(--md-ink)]" dir="auto">{item.label}</span>
              {item.detail ? <span className="text-[11px] leading-4 text-[var(--md-subtle)] [overflow-wrap:anywhere]" dir="auto">{item.detail}</span> : null}</span>
          </button>)}
          <button id={`${id}-option-${items.length}`} type="button" role="option" aria-selected={active === items.length} tabIndex={-1}
            className={cn("flex min-h-10 w-full items-center gap-2.5 rounded-[var(--md-radius-md)] px-2.5 py-2 text-start text-[12px] text-[var(--md-text)] hover:bg-[var(--md-surface-tint)]", active === items.length && "bg-[var(--md-surface-tint)]")}
            onPointerDown={event => event.preventDefault()} onPointerMove={() => setActive(items.length)} onClick={() => choose(value)}>
            <Search className="size-4 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.5} aria-hidden="true" />
            <span className="truncate">{t("Use")} “{value}”</span>
          </button>
        </div>
        <div className="flex min-h-9 items-center justify-between gap-3 px-2.5 py-2 text-[10px] leading-4 text-[var(--md-subtle)]">
          <span role="status" className="flex min-w-0 items-center gap-2">
            {loading ? <><DotGridLoader decorative size="sm" className="scale-75" />{t("Finding places…")}</> : failed ? t("Search unavailable. Your text is ready to use.") : !items.length ? t("No matches. You can use your own location.") : t("Choose a place or keep your text.")}
          </span>
          {failed ? <button type="button" className="shrink-0 text-[var(--md-ink)] underline underline-offset-2" onClick={() => setRetry(current => current + 1)}>{t("Retry")}</button> :
            <a className="shrink-0 underline-offset-2 hover:underline" href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">© OpenStreetMap</a>}
        </div>
      </PopoverContent>
    </Popover>
    <p id={`${id}-hint`} className="text-[11px] leading-4 text-[var(--md-subtle)]">{t("Search anywhere, or enter your own location.")}</p>
    {error ? <p id={`${id}-error`} className="text-[12px] text-[var(--md-red)]">{error}</p> : null}
  </div>
}
