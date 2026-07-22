import { useMemo, useState } from "react"
import { FileText, Search, Ship } from "lucide-react"
import { Input } from "@/components/ui/input"
import { bookings } from "@/data/multideck-data"
import { quoteRegisterRecords } from "@/data/quote-register-data"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

export function CommandInput({
  placeholder = "Ask Multideck or jump to anything...",
  className,
  onNavigate,
}: {
  placeholder?: string
  className?: string
  onNavigate?: (path: string) => void
}) {
  const { t } = useLanguage()
  const [query, setQuery] = useState("")
  const normalizedQuery = query.trim().toLocaleLowerCase()
  const results = useMemo(() => {
    if (!normalizedQuery) return { jobs: [], quotes: [] }

    const matches = (values: readonly string[]) => values.some((value) => value.toLocaleLowerCase().includes(normalizedQuery))
    return {
      jobs: bookings.filter((booking) => matches([booking.id, booking.jobRef, booking.customer, booking.route, booking.carrier, booking.container, booking.invoice, booking.customerRef])).slice(0, 4),
      quotes: quoteRegisterRecords.filter((quote) => matches([quote.reference, quote.customer, quote.origin, quote.destination, quote.carrier, quote.customerPurchaseOrder, quote.shipperReference])).slice(0, 3),
    }
  }, [normalizedQuery])
  const hasResults = results.jobs.length > 0 || results.quotes.length > 0

  function open(path: string) {
    setQuery("")
    onNavigate?.(path)
  }

  return (
    <div className={cn("relative w-full", className)}>
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.2} />
      <Input
        aria-label="Search Multideck"
        aria-expanded={Boolean(normalizedQuery)}
        aria-controls="multideck-command-results"
        className="h-9 rounded-[var(--md-radius-lg)] border-0 bg-white/70 pl-9 pr-16 text-[13px] shadow-[var(--md-shadow-line)] placeholder:text-[var(--md-subtle)] focus-visible:ring-[3px] focus-visible:ring-[rgba(14,125,116,0.14)]"
        placeholder={placeholder}
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") setQuery("")
        }}
      />
      <span className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--md-radius-sm)] bg-[var(--md-surface-tint)] px-2 py-1 text-[11px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
        ⌘ K
      </span>
      {normalizedQuery ? (
        <div id="multideck-command-results" role="listbox" className="absolute inset-x-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-[var(--md-radius-xl)] bg-[rgba(255,255,255,0.98)] p-1.5 shadow-[var(--md-shadow-lift)] ring-1 ring-[rgba(11,20,19,0.08)] backdrop-blur-xl">
          {hasResults ? (
            <>
              {results.jobs.length ? (
                <CommandResultGroup label={t("Jobs")}>
                  {results.jobs.map((booking) => (
                    <CommandResult
                      key={booking.id}
                      icon={<Ship className="size-4" strokeWidth={1.35} />}
                      title={booking.id}
                      badge={booking.status}
                      detail={`${booking.customer} · ${booking.route}`}
                      meta={`${booking.mode} · ${booking.container} · ${booking.carrier} · ${booking.eta}`}
                      onSelect={() => open(`/bookings/${booking.id.toLowerCase()}`)}
                    />
                  ))}
                </CommandResultGroup>
              ) : null}
              {results.quotes.length ? (
                <CommandResultGroup label={t("Quotes")} className={results.jobs.length ? "mt-1.5 border-t border-[rgba(11,20,19,0.07)] pt-1.5" : undefined}>
                  {results.quotes.map((quote) => (
                    <CommandResult
                      key={quote.reference}
                      icon={<FileText className="size-4" strokeWidth={1.35} />}
                      title={quote.reference}
                      badge={quote.status}
                      detail={`${quote.customer} · ${quote.origin} → ${quote.destination}`}
                      meta={`${quote.transportMode} · ${quote.equipmentLoad} · ${quote.carrier} · ${quote.workflowStage}`}
                      onSelect={() => open(`/quotes/${quote.reference.toLowerCase()}`)}
                    />
                  ))}
                </CommandResultGroup>
              ) : null}
            </>
          ) : (
            <p className="px-3 py-4 text-center text-[12px] text-[var(--md-text)]">{t("No jobs or quotes match this search")}</p>
          )}
        </div>
      ) : null}
    </div>
  )
}

function CommandResultGroup({ label, className, children }: { label: string; className?: string; children: React.ReactNode }) {
  return <div className={className}><p className="px-2.5 pb-1 pt-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--md-subtle)]">{label}</p>{children}</div>
}

function CommandResult({ icon, title, badge, detail, meta, onSelect }: { icon: React.ReactNode; title: string; badge: string; detail: string; meta: string; onSelect: () => void }) {
  return (
    <button type="button" role="option" onClick={onSelect} className="grid w-full grid-cols-[32px_minmax(0,1fr)] gap-2.5 rounded-[var(--md-radius-lg)] px-2.5 py-2 text-start transition-colors hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(14,125,116,0.2)]">
      <span className="mt-0.5 grid size-8 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[var(--md-accent)]">{icon}</span>
      <span className="min-w-0">
        <span className="flex items-center gap-2"><span dir="ltr" className="font-mono text-[12px] font-medium text-[var(--md-accent)]">{title}</span><span className="truncate rounded-full bg-[var(--md-surface-tint)] px-2 py-0.5 text-[10px] font-medium text-[var(--md-text)]">{badge}</span></span>
        <span className="mt-0.5 block truncate text-[12px] font-medium text-[var(--md-ink)]">{detail}</span>
        <span className="mt-0.5 block truncate text-[11px] text-[var(--md-text)]">{meta}</span>
      </span>
    </button>
  )
}
