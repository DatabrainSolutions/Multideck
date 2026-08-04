import { useEffect, useMemo, useState, type ReactNode } from "react"
import { ArrowRight, LoaderCircle, Mail, Plus, RefreshCw, Search, Sparkles, UserRoundCheck, UsersRound } from "lucide-react"
import { ContactCreateDialog } from "@/components/multideck/contact-create-dialog"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { CustomerAvatar } from "@/components/multideck/customer-components"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { useLanguage } from "@/i18n/language-provider"
import { listContacts, listCustomers, type ApiContact, type ApiCustomer } from "@/lib/customer-api"

export function CrmContactsPage({ navigate }: { navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const [contacts, setContacts] = useState<ApiContact[]>([])
  const [accounts, setAccounts] = useState<ApiCustomer[]>([])
  const [query, setQuery] = useState("")
  const [consentFilter, setConsentFilter] = useState<"all" | "opted-in" | "opted-out">("all")
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [reloadToken, setReloadToken] = useState(0)
  const [dexterOpen, setDexterOpen] = useState(false)
  const [createOpen, setCreateOpen] = useState(false)

  useEffect(() => {
    let active = true
    setState("loading")
    Promise.all([
      listContacts(undefined, { forceRefresh: reloadToken > 0 }),
      listCustomers(undefined, { forceRefresh: reloadToken > 0 }),
    ])
      .then(([nextContacts, nextAccounts]) => {
        if (!active) return
        setContacts(nextContacts)
        setAccounts(nextAccounts)
        setState("ready")
      })
      .catch((error) => { console.error("Contacts could not be loaded.", error); if (active) setState("error") })
    return () => { active = false }
  }, [reloadToken])

  const filtered = useMemo(() => {
    const term = query.trim().toLowerCase()
    return contacts.filter((contact) => {
      if (consentFilter === "opted-in" && !contact.consentMarketing) return false
      if (consentFilter === "opted-out" && contact.consentMarketing) return false
      return !term || [contact.name, contact.email, contact.phone, contact.accountName, contact.role, contact.jobTitle, contact.department].some((value) => value?.toLowerCase().includes(term))
    })
  }, [consentFilter, contacts, query])

  const optedIn = contacts.filter((contact) => contact.consentMarketing).length
  const recentlyContacted = contacts.filter((contact) => contact.lastContactAt && Date.now() - new Date(contact.lastContactAt).getTime() < 30 * 86_400_000).length

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={t("Contacts")} className="md-page md-page-stack">
      <header className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div><p className="text-[12px] font-medium text-[var(--md-accent)]">{t("Customer management")}</p><h1 className="mt-1 text-[24px] font-medium leading-tight text-[var(--md-ink)]">{t("Contacts")}</h1><p className="mt-2 max-w-[680px] text-[13px] leading-5 text-[var(--md-text)]">{t("The people behind each account, with communication preferences, consent and recent relationship context.")}</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setDexterOpen(true)} className="h-10 rounded-[var(--md-radius-lg)]"><Sparkles className="size-4" strokeWidth={1.4} />{t("Ask Dexter")}</Button><Button onClick={() => setCreateOpen(true)} className="h-10 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] text-[var(--md-accent-ink)] active:scale-[0.96] motion-reduce:transform-none"><Plus className="size-4" strokeWidth={1.5} />{t("New contact")}</Button></div>
      </header>

      <div className="grid gap-3 sm:grid-cols-3"><ContactStat icon={UsersRound} label={t("Contacts")} value={String(contacts.length)} /><ContactStat icon={UserRoundCheck} label={t("Contacted in 30 days")} value={String(recentlyContacted)} /><ContactStat icon={Mail} label={t("Marketing opted in")} value={String(optedIn)} /></div>

      <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
        <div className="flex flex-col gap-3 px-4 py-4 xl:flex-row xl:items-center xl:justify-between">
          <div><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t("Contact directory")}</h2><p className="mt-1 text-[12px] text-[var(--md-text)]">{t("Open a contact for emails, activity, notes and communication controls.")}</p></div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="flex rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-1 shadow-[var(--md-shadow-line)]" aria-label={t("Marketing consent filter")}>
              {(["all", "opted-in", "opted-out"] as const).map((filter) => <button key={filter} type="button" aria-pressed={consentFilter === filter} onClick={() => setConsentFilter(filter)} className={`min-h-8 rounded-[calc(var(--md-radius-lg)-4px)] px-3 text-[12px] font-medium transition-[background-color,color,box-shadow] duration-150 ${consentFilter === filter ? "bg-white/82 text-[var(--md-ink)] shadow-[var(--md-shadow-line)]" : "text-[var(--md-text)] hover:text-[var(--md-ink)]"}`}>{t(filter === "all" ? "All" : filter === "opted-in" ? "Opted in" : "Opted out")}</button>)}
            </div>
            <label className="relative block w-full sm:w-[300px]"><Search className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} /><Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("Search contacts…")} aria-label={t("Search contacts")} className="h-10 rounded-[var(--md-radius-lg)] bg-white/62 ps-9 text-[16px] sm:text-[14px]" /></label>
          </div>
        </div>

        {state === "loading" ? <ContactState icon={<LoaderCircle className="size-5 animate-spin" />} title={t("Loading contacts…")} /> : null}
        {state === "error" ? <ContactState icon={<RefreshCw className="size-5" />} title={t("Contacts could not be loaded.")} detail={t("Check your connection and try again.")} action={<Button variant="outline" onClick={() => setReloadToken((value) => value + 1)}>{t("Try again")}</Button>} /> : null}
        {state === "ready" && !filtered.length ? <ContactState icon={<UsersRound className="size-5" />} title={query || consentFilter !== "all" ? t("No contacts match these filters.") : t("No contacts yet.")} detail={query || consentFilter !== "all" ? t("Clear a filter or try another name, account or email.") : t("Add the first contact to start a relationship history.")} action={!query && consentFilter === "all" ? <Button onClick={() => setCreateOpen(true)}>{t("New contact")}</Button> : undefined} /> : null}
        {state === "ready" && filtered.length ? <div className="overflow-x-auto md-scrollbar"><Table className="min-w-[860px]"><TableHeader><TableRow><TableHead>{t("Contact")}</TableHead><TableHead>{t("Account")}</TableHead><TableHead>{t("Role")}</TableHead><TableHead>{t("Preference")}</TableHead><TableHead>{t("Last contact")}</TableHead><TableHead>{t("Marketing")}</TableHead><TableHead className="w-12"><span className="sr-only">{t("Open")}</span></TableHead></TableRow></TableHeader><TableBody>{filtered.map((contact) => <TableRow key={contact.id} className="group cursor-pointer focus-within:bg-[var(--md-surface-soft)] hover:bg-[var(--md-surface-soft)]" onClick={() => navigate(`/crm/contacts/${contact.id}`)}>
          <TableCell><button type="button" className="flex min-h-11 w-full items-center gap-3 text-start focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]" onClick={() => navigate(`/crm/contacts/${contact.id}`)}><CustomerAvatar initials={contact.initials} tone="blue" /><span className="min-w-0"><span className="block truncate text-[14px] font-medium text-[var(--md-ink)]">{contact.name}</span><span dir="ltr" className="mt-0.5 block truncate text-start text-[12px] text-[var(--md-text)]">{contact.email || t("No email recorded")}</span></span></button></TableCell>
          <TableCell className="text-[13px] font-medium text-[var(--md-ink)]">{contact.accountName}</TableCell><TableCell className="text-[13px] text-[var(--md-text)]">{contact.jobTitle || contact.role || t("Not recorded")}</TableCell><TableCell className="text-[13px] text-[var(--md-text)]">{humanize(contact.preferredChannel) || t("Not recorded")}</TableCell><TableCell className="text-[13px] tabular-nums text-[var(--md-text)]">{relativeDate(contact.lastContactAt, t)}</TableCell><TableCell><StatusPill tone={contact.consentMarketing ? "green" : "neutral"}>{t(contact.consentMarketing ? "Opted in" : "Opted out")}</StatusPill></TableCell><TableCell><ArrowRight className="size-4 text-[var(--md-subtle)] transition-transform duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transition-none" strokeWidth={1.4} /></TableCell>
        </TableRow>)}</TableBody></Table></div> : null}
      </Surface>

      <ContactCreateDialog open={createOpen} onOpenChange={setCreateOpen} accounts={accounts} onCreated={(contact) => { setReloadToken((value) => value + 1); navigate(`/crm/contacts/${contact.id}`) }} />
    </DexterDockedPage>
  )
}

function ContactStat({ icon: Icon, label, value }: { icon: typeof UsersRound; label: string; value: string }) { return <Surface padding="md" className="rounded-[var(--md-radius-xl)]"><div className="flex items-center justify-between gap-4"><div><p className="text-[12px] text-[var(--md-text)]">{label}</p><p className="mt-2 text-[24px] font-medium tabular-nums text-[var(--md-ink)]">{value}</p></div><span className="grid size-9 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-accent)]"><Icon className="size-4" strokeWidth={1.4} /></span></div></Surface> }
function ContactState({ icon, title, detail, action }: { icon: ReactNode; title: string; detail?: string; action?: ReactNode }) { return <div className="grid min-h-[260px] place-items-center border-t border-[var(--md-line)] px-6 py-10 text-center"><div className="max-w-sm"><span className="mx-auto grid size-10 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] text-[var(--md-accent)]">{icon}</span><p className="mt-4 text-[14px] font-medium text-[var(--md-ink)]">{title}</p>{detail ? <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{detail}</p> : null}{action ? <div className="mt-4">{action}</div> : null}</div></div> }
function humanize(value: string | null) { return value ? value.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()) : "" }
function relativeDate(value: string | null, t: (value: string) => string) { if (!value) return t("Never"); const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000); if (days <= 0) return t("Today"); if (days === 1) return t("Yesterday"); if (days < 30) return `${days} ${t("days ago")}`; return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) }
