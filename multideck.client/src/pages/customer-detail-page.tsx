import { useEffect, useState } from "react"
import { LoaderCircle, RefreshCw } from "lucide-react"
import { CustomerAvatar } from "@/components/multideck/customer-components"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import { getCustomer, type ApiCustomerDetail } from "@/lib/customer-api"

export function CustomerDetailPage({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<ApiCustomerDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const { t } = useLanguage()

  useEffect(() => {
    let active = true
    setCustomer(null)
    setError(null)
    getCustomer(customerId).then((data) => active && setCustomer(data)).catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : t("We could not load this customer.")))
    return () => { active = false }
  }, [customerId, reloadToken, t])

  if (error) return <CustomerLoadState message={error} onRetry={() => setReloadToken((value) => value + 1)} />
  if (!customer) return <div className="md-page grid min-h-[360px] place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /></div>

  const accountFacts = [
    [t("Segment"), customer.segment],
    [t("Primary mode"), customer.primaryMode],
    [t("Trade lane"), customer.primaryTradeLane],
    [t("Customer since"), formatDate(customer.customerSince)],
  ].filter(([, value]) => value) as [string, string][]

  return (
    <div className="md-page md-page-stack">
      <section className="flex flex-col gap-[var(--md-page-stack-gap)] md:flex-row md:items-center">
        <CustomerAvatar initials={customer.initials} tone="teal" size="lg" />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-[32px] font-medium leading-tight text-[var(--md-ink)]">{customer.name}</h1>
            {customer.tier ? <StatusPill tone="teal">{customer.tier}</StatusPill> : null}
            <StatusPill tone="green">{customer.status}</StatusPill>
          </div>
          <p className="mt-3 text-[14px] text-[var(--md-text)]">{[customer.industry, customer.location].filter(Boolean).join(" · ") || t("No account location recorded")}</p>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={t("Contacts")} value={String(customer.contacts.length)} />
        <Metric label={t("Active shipments")} value={String(customer.activeShipments.length)} />
        <Metric label={t("Open exceptions")} value={String(customer.activeShipments.reduce((total, shipment) => total + shipment.openExceptionCount, 0))} />
        <Metric label={t("Account health")} value={customer.healthScore == null ? "—" : `${Math.round(customer.healthScore)}%`} />
      </div>

      {customer.summary ? <Surface className="rounded-[var(--md-radius-xl)]" padding="lg"><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t("Account summary")}</h2><p className="mt-3 text-[14px] leading-6 text-[var(--md-text)]">{customer.summary}</p></Surface> : null}

      <div className="md-panel-grid xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="md-panel-column">
          <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
            <PanelTitle title={t("Active shipments")} meta={String(customer.activeShipments.length)} />
            {customer.activeShipments.length ? customer.activeShipments.map((shipment) => <div key={shipment.id} className="grid grid-cols-[minmax(110px,150px)_1fr_auto] gap-4 border-t border-[rgba(11,20,19,0.06)] px-5 py-4"><p className="text-[13px] font-medium text-[var(--md-text)]">{shipment.reference}</p><div className="min-w-0"><p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{shipment.route || t("Route not recorded")}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{[shipment.mode, shipment.status, shipment.eta ? `${t("ETA")} ${formatDate(shipment.eta)}` : null].filter(Boolean).join(" · ")}</p></div>{shipment.openExceptionCount ? <StatusPill tone="amber">{shipment.openExceptionCount} {t("exceptions")}</StatusPill> : <StatusPill tone="green">{t("On track")}</StatusPill>}</div>) : <EmptyRow text={t("No active shipments are recorded for this customer.")} />}
          </Surface>
          <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
            <PanelTitle title={t("Activity")} meta={t("Latest")} />
            {customer.activities.length ? customer.activities.map((activity) => <div key={activity.id} className="border-t border-[rgba(11,20,19,0.06)] px-5 py-4"><div className="flex items-center justify-between gap-4"><p className="text-[14px] font-medium text-[var(--md-ink)]">{activity.subject}</p><p className="shrink-0 text-[12px] text-[var(--md-text)]">{formatDate(activity.occurredAt)}</p></div>{activity.summary ? <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{activity.summary}</p> : null}</div>) : <EmptyRow text={t("No account activity has been recorded yet.")} />}
          </Surface>
        </div>
        <div className="md-panel-column">
          <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
            <PanelTitle title={t("Contacts")} meta={String(customer.contacts.length)} />
            {customer.contacts.length ? customer.contacts.map((contact) => <div key={contact.id} className="flex gap-3 border-t border-[rgba(11,20,19,0.06)] px-5 py-4"><CustomerAvatar initials={contact.initials || "?"} tone="blue" /><div className="min-w-0"><p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{contact.name || t("Unnamed contact")}</p><p className="truncate text-[12px] text-[var(--md-text)]">{contact.role || t("No role recorded")}</p>{contact.email ? <a className="mt-1 block truncate text-[12px] text-[var(--md-accent)]" href={`mailto:${contact.email}`}>{contact.email}</a> : null}</div></div>) : <EmptyRow text={t("No contacts are recorded for this customer.")} />}
          </Surface>
          <Surface className="rounded-[var(--md-radius-xl)]" padding="none"><PanelTitle title={t("Account")} />{accountFacts.length ? <div className="px-5 pb-5">{accountFacts.map(([label, value]) => <div key={label} className="grid grid-cols-[120px_1fr] gap-4 border-t border-[rgba(11,20,19,0.06)] py-3"><p className="text-[13px] text-[var(--md-text)]">{label}</p><p className="text-right text-[13px] font-medium text-[var(--md-ink)]">{value}</p></div>)}</div> : <EmptyRow text={t("No additional account details are recorded.")} />}</Surface>
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) { return <Surface className="rounded-[var(--md-radius-xl)]" padding="md"><p className="text-[13px] text-[var(--md-text)]">{label}</p><p className="mt-4 text-[28px] font-medium text-[var(--md-ink)]">{value}</p></Surface> }
function PanelTitle({ title, meta }: { title: string; meta?: string }) { return <div className="flex items-center justify-between gap-3 px-5 py-4"><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{title}</h2>{meta ? <span className="text-[13px] text-[var(--md-text)]">{meta}</span> : null}</div> }
function EmptyRow({ text }: { text: string }) { return <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-5 text-[13px] text-[var(--md-text)]">{text}</p> }
function CustomerLoadState({ message, onRetry }: { message: string; onRetry: () => void }) { const { t } = useLanguage(); return <div className="md-page"><Surface className="grid min-h-[300px] place-items-center rounded-[var(--md-radius-xl)]" padding="lg"><div className="text-center"><p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Customer data is unavailable")}</p><p className="mt-2 text-[13px] text-[var(--md-text)]">{message}</p><Button variant="outline" className="mt-4" onClick={onRetry}><RefreshCw className="size-4" />{t("Try again")}</Button></div></Surface></div> }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) }
