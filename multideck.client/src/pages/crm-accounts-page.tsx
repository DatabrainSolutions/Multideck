import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react"
import { ArrowRight, Building2, LoaderCircle, Plus, RefreshCw, Search, Sparkles } from "lucide-react"
import { toast } from "sonner"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { CustomerAvatar } from "@/components/multideck/customer-components"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useLanguage } from "@/i18n/language-provider"
import { createCustomer, getCustomerReference, listCustomers, type ApiCustomer, type CreateCustomerInput, type CustomerReference } from "@/lib/customer-api"

const emptyAccount = (orgTypeId = ""): CreateCustomerInput => ({
  name: "", orgTypeId, addressLine1: null, townCity: null, postZipCode: null, countryCode: null,
  contactFirstName: null, contactLastName: null, contactEmail: null,
})

export function CrmAccountsPage({ navigate }: { navigate: (path: string) => void }) {
  const { language, t } = useLanguage()
  const [accounts, setAccounts] = useState<ApiCustomer[]>([])
  const [query, setQuery] = useState("")
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [reloadToken, setReloadToken] = useState(0)
  const [dexterOpen, setDexterOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [reference, setReference] = useState<CustomerReference | null>(null)
  const [draft, setDraft] = useState<CreateCustomerInput>(emptyAccount())

  useEffect(() => {
    let active = true
    setState("loading")
    listCustomers(undefined, { forceRefresh: reloadToken > 0 })
      .then((data) => { if (active) { setAccounts(data); setState("ready") } })
      .catch((error) => { console.error("Accounts could not be loaded.", error); if (active) setState("error") })
    return () => { active = false }
  }, [reloadToken])

  useEffect(() => {
    getCustomerReference().then((data) => {
      setReference(data)
      setDraft((current) => current.orgTypeId ? current : { ...current, orgTypeId: data.organisationTypes[0]?.id ?? "" })
    }).catch((error) => console.error("Account reference data could not be loaded.", error))
  }, [])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return !term ? accounts : accounts.filter((account) => [account.name, account.location, account.industry, account.ownerName, account.relationshipStatus].some((value) => value?.toLowerCase().includes(term)))
  }, [accounts, query])
  const needsAttention = accounts.filter((account) => account.nextActionDueAt && new Date(account.nextActionDueAt) <= new Date()).length
  const contactTotal = accounts.reduce((total, account) => total + account.contactCount, 0)
  const marketingOptIns = accounts.filter((account) => account.marketingOptIn).length
  const unassignedAccounts = accounts.filter((account) => !account.ownerId).length
  const healthyAccounts = accounts.filter((account) => account.healthScore !== null && account.healthScore >= 70).length

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setCreateError(null)
    try {
      const account = await createCustomer(draft)
      toast.success(t("Account created"))
      setCreateOpen(false)
      setDraft(emptyAccount(reference?.organisationTypes[0]?.id))
      setReloadToken((value) => value + 1)
      navigate(`/crm/accounts/${account.id}`)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : t("The account could not be created. Check the details and try again."))
    } finally {
      setCreating(false)
    }
  }

  function update<K extends keyof CreateCustomerInput>(key: K, value: CreateCustomerInput[K]) {
    setDraft((current) => ({ ...current, [key]: value }))
  }

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t("Accounts")} className="md-page md-page-stack-compact">
      <header className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-center">
        <div className="min-w-0"><div className="flex flex-wrap items-baseline gap-x-3 gap-y-1"><h1 className="text-[22px] font-medium leading-tight text-[var(--md-ink)]">{t("Accounts")}</h1><p className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Customer management")}</p></div><p className="mt-1 max-w-[900px] text-[12px] leading-5 text-[var(--md-text)]">{t("Customer organisations, relationship health, contacts and the next work that matters.")}</p></div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => setDexterOpen(true)} className="h-10 rounded-[var(--md-radius-lg)]">
            <Sparkles className="size-4" strokeWidth={1.4} />{t("Ask Dexter")}
          </Button>
          <Button type="button" onClick={() => { setCreateError(null); setCreateOpen(true) }} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] text-[var(--md-accent-ink)] active:scale-[0.96] motion-reduce:transform-none">
            <Plus className="size-4" strokeWidth={1.5} />{t("New account")}
          </Button>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
        {[
          [t("Total accounts"), accounts.length, t("all customer organisations")],
          [t("Contacts"), contactTotal, t("recorded contacts")],
          [t("Needs attention"), needsAttention, t("need attention now")],
          [t("Marketing opted in"), marketingOptIns, t("with marketing consent")],
          [t("Unassigned"), unassignedAccounts, t("without an assigned owner")],
          [t("Healthy accounts"), healthyAccounts, t("health score 70 or above")],
        ].map(([label, value, detail]) => (
          <Surface key={String(label)} padding="none" className="h-[44px] min-w-0 rounded-[var(--md-radius-lg)] px-3 py-1.5">
            <div className="flex h-full min-w-0 items-center gap-2.5">
              <p className="shrink-0 text-[19px] font-medium leading-none tabular-nums text-[var(--md-ink)]" data-i18n-skip dir="ltr">
                {new Intl.NumberFormat(language).format(Number(value))}
              </p>
              <div className="min-w-0">
                <p className="truncate text-[10.5px] font-medium leading-[13px] text-[var(--md-text)]">{label}</p>
                <p className="truncate text-[9px] leading-[11px] text-[var(--md-subtle)]">{detail}</p>
              </div>
            </div>
          </Surface>
        ))}
      </div>

      <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t("Account directory")}</h2>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Open an account to see its contacts, recent emails and latest updates.")}</p>
          </div>
          <label className="relative block w-full sm:max-w-[320px]">
            <Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search accounts…")} aria-label={t("Search accounts")} className="h-10 rounded-[var(--md-radius-lg)] bg-white/62 ps-9 text-[16px] sm:text-[14px]" />
          </label>
        </div>

        {state === "loading" ? <RecordState icon={<LoaderCircle className="size-5 animate-spin" />} title={t("Loading accounts…")} /> : null}
        {state === "error" ? <RecordState icon={<RefreshCw className="size-5" />} title={t("Accounts could not be loaded.")} detail={t("Check your connection and try again.")} action={<Button variant="outline" onClick={() => setReloadToken((value) => value + 1)}>{t("Try again")}</Button>} /> : null}
        {state === "ready" && !filtered.length ? <RecordState icon={<Building2 className="size-5" />} title={query ? t("No accounts match this search.") : t("No accounts yet.")} detail={query ? t("Try a customer name, location, owner or relationship status.") : t("Create the first account to keep contacts and customer work together.")} action={!query ? <Button onClick={() => setCreateOpen(true)}>{t("New account")}</Button> : undefined} /> : null}
        {state === "ready" && filtered.length ? (
          <div className="overflow-x-auto md-scrollbar">
            <Table className="min-w-[820px]">
              <TableHeader><TableRow>
                <TableHead>{t("Account")}</TableHead><TableHead>{t("Relationship")}</TableHead><TableHead>{t("Owner")}</TableHead><TableHead>{t("Last contact")}</TableHead><TableHead>{t("Contacts")}</TableHead><TableHead>{t("Marketing")}</TableHead><TableHead className="w-12"><span className="sr-only">{t("Open")}</span></TableHead>
              </TableRow></TableHeader>
              <TableBody>{filtered.map((account) => (
                <TableRow key={account.id} className="group cursor-pointer focus-within:bg-[var(--md-surface-soft)] hover:bg-[var(--md-surface-soft)]" onClick={() => navigate(`/crm/accounts/${account.id}`)}>
                  <TableCell><button type="button" className="flex min-h-11 w-full items-center gap-3 text-start focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]" onClick={() => navigate(`/crm/accounts/${account.id}`)}>
                    <CustomerAvatar initials={account.initials} tone="teal" /><span className="min-w-0"><span className="block truncate text-[14px] font-medium text-[var(--md-ink)]">{account.name}</span><span className="mt-0.5 block truncate text-[12px] text-[var(--md-text)]">{[account.industry, account.location].filter(Boolean).join(" · ") || t("No location recorded")}</span></span>
                  </button></TableCell>
                  <TableCell><StatusPill tone={account.healthScore != null && account.healthScore < 50 ? "amber" : "neutral"}>{humanize(account.relationshipStatus || account.status)}</StatusPill></TableCell>
                  <TableCell className="text-[13px] text-[var(--md-text)]">{account.ownerName || t("Unassigned")}</TableCell>
                  <TableCell className="text-[13px] tabular-nums text-[var(--md-text)]">{relativeDate(account.lastContactAt, t)}</TableCell>
                  <TableCell className="text-[13px] tabular-nums text-[var(--md-ink)]">{account.contactCount}</TableCell>
                  <TableCell><StatusPill tone={account.marketingOptIn ? "green" : "neutral"}>{t(account.marketingOptIn ? "Opted in" : "Opted out")}</StatusPill></TableCell>
                  <TableCell><ArrowRight className="size-4 text-[var(--md-subtle)] transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none" strokeWidth={1.4} /></TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        ) : null}
      </Surface>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-h-[88vh] overflow-y-auto border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[600px]">
          <DialogHeader className="text-start"><DialogTitle>{t("New account")}</DialogTitle><DialogDescription>{t("Start with the organisation and one useful contact. You can add commercial detail after saving.")}</DialogDescription></DialogHeader>
          <form className="grid gap-4" onSubmit={create}>
            <Field label={t("Account name")} required value={draft.name} onChange={(value) => update("name", value)} />
            <label className="grid gap-1.5 text-start text-[13px] font-medium text-[var(--md-ink)]"><span>{t("Organisation type")} *</span><select required value={draft.orgTypeId} onChange={(event) => update("orgTypeId", event.target.value)} className="h-10 rounded-[var(--md-radius-md)] bg-white/68 px-3 text-[16px] shadow-[var(--md-shadow-line)] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] sm:text-[14px]">{reference?.organisationTypes.map((type) => <option key={type.id} value={type.id}>{type.name}</option>)}</select></label>
            <Field label={t("Address line 1")} value={draft.addressLine1 ?? ""} onChange={(value) => update("addressLine1", value || null)} />
            <div className="grid gap-4 sm:grid-cols-3"><Field label={t("Town or city")} value={draft.townCity ?? ""} onChange={(value) => update("townCity", value || null)} /><Field label={t("Postcode")} value={draft.postZipCode ?? ""} onChange={(value) => update("postZipCode", value || null)} /><Field label={t("Country code")} value={draft.countryCode ?? ""} onChange={(value) => update("countryCode", value || null)} /></div>
            <div className="mt-1 border-t border-[var(--md-line)] pt-4"><p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Primary contact (optional)")}</p></div>
            <div className="grid gap-4 sm:grid-cols-2"><Field label={t("First name")} value={draft.contactFirstName ?? ""} onChange={(value) => update("contactFirstName", value || null)} /><Field label={t("Last name")} value={draft.contactLastName ?? ""} onChange={(value) => update("contactLastName", value || null)} /></div>
            <Field label={t("Email")} type="email" value={draft.contactEmail ?? ""} onChange={(value) => update("contactEmail", value || null)} />
            {createError ? <p role="alert" className="text-[13px] text-[var(--md-red)]">{createError}</p> : null}
            <DialogFooter><Button type="button" variant="outline" disabled={creating} onClick={() => setCreateOpen(false)}>{t("Cancel")}</Button><Button type="submit" disabled={creating || !draft.orgTypeId}>{creating ? <LoaderCircle className="size-4 animate-spin" /> : null}{t(creating ? "Creating account…" : "Create account")}</Button></DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </DexterDockedPage>
  )
}

function RecordState({ icon, title, detail, action }: { icon: ReactNode; title: string; detail?: string; action?: ReactNode }) {
  return <div className="grid min-h-[260px] place-items-center border-t border-[var(--md-line)] px-6 py-10 text-center"><div className="max-w-sm"><span className="mx-auto grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-accent)]">{icon}</span><p className="mt-4 text-[14px] font-medium text-[var(--md-ink)]">{title}</p>{detail ? <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{detail}</p> : null}{action ? <div className="mt-4">{action}</div> : null}</div></div>
}

function Field({ label, value, onChange, required, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return <label className="grid gap-1.5 text-start text-[13px] font-medium text-[var(--md-ink)]"><span>{label}{required ? " *" : ""}</span><Input dir={type === "email" ? "ltr" : "auto"} type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-[var(--md-radius-md)] bg-white/68 text-[16px] shadow-[var(--md-shadow-line)] sm:text-[14px]" /></label>
}

function humanize(value: string | null | undefined) { return value ? value.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()) : "—" }
function relativeDate(value: string | null, t: (value: string) => string) {
  if (!value) return t("Never")
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)
  if (days <= 0) return t("Today")
  if (days === 1) return t("Yesterday")
  if (days < 30) return `${days} ${t("days ago")}`
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
}
