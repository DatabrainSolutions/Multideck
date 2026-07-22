import { useEffect, useState } from "react"
import { LoaderCircle, Mail, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react"
import { CustomerAvatar } from "@/components/multideck/customer-components"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { useLanguage } from "@/i18n/language-provider"
import { getCustomer, type ApiCustomerDetail } from "@/lib/customer-api"
import { getWarehousePortalReference, inviteWarehousePortalUser, listWarehousePortalUsers, revokeWarehousePortalUser, updateWarehousePortalUser, type WarehousePortalReference, type WarehousePortalUser } from "@/lib/warehouse-api"

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

      <CustomerWarehouseAccess customerId={customer.id} />

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

export function CustomerWarehouseAccess({
  customerId,
  selfService = false,
  currentUserEmail,
}: {
  customerId: string
  selfService?: boolean
  currentUserEmail?: string | null
}) {
  const { t } = useLanguage()
  const [reference, setReference] = useState<WarehousePortalReference | null>(null)
  const [users, setUsers] = useState<WarehousePortalUser[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [editing, setEditing] = useState<WarehousePortalUser | null>(null)
  const [displayName, setDisplayName] = useState("")
  const [email, setEmail] = useState("")
  const [roleCode, setRoleCode] = useState("warehouse_operator")
  const [facilityIds, setFacilityIds] = useState<string[]>([])
  const [saving, setSaving] = useState(false)

  async function refresh() {
    setError(null)
    try {
      const [nextReference, nextUsers] = await Promise.all([getWarehousePortalReference(), listWarehousePortalUsers(customerId)])
      setReference(nextReference)
      setUsers(nextUsers)
    } catch (cause) {
      setUsers([])
      setError(cause instanceof Error ? cause.message : String(cause))
    }
  }

  useEffect(() => { void refresh() }, [customerId]) // eslint-disable-line react-hooks/exhaustive-deps

  function showInvite() {
    setEditing(null); setDisplayName(""); setEmail(""); setRoleCode("warehouse_operator")
    setFacilityIds(reference?.facilities.map((facility) => facility.id) ?? [])
    setOpen(true); setError(null)
  }

  function showEdit(user: WarehousePortalUser) {
    setEditing(user); setDisplayName(user.displayName); setEmail(user.email); setRoleCode(user.roleCode); setFacilityIds(user.facilityIds); setOpen(true); setError(null)
  }

  function toggleFacility(id: string) {
    setFacilityIds((current) => current.includes(id) ? current.filter((value) => value !== id) : [...current, id])
  }

  async function save() {
    if (!editing && !email.trim()) return
    setSaving(true); setError(null)
    try {
      if (editing) {
        await updateWarehousePortalUser(customerId, editing.id, { roleCode, facilityIds })
        toast.success(t("Customer access updated"))
      } else {
        await inviteWarehousePortalUser({ customerOrgId: customerId, email: email.trim(), displayName: displayName.trim() || null, roleCode, facilityIds })
        toast.success(t("Customer invitation sent"))
      }
      setOpen(false); await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setSaving(false) }
  }

  async function revoke(user: WarehousePortalUser) {
    if (!window.confirm(t("Revoke warehouse access for this user?"))) return
    try {
      await revokeWarehousePortalUser(customerId, user.id)
      toast.success(t("Customer access revoked")); await refresh()
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) }
  }

  const roleName = (code: string) => reference?.roles.find((role) => role.code === code)?.name ?? code
  const isCurrentUser = (user: WarehousePortalUser) =>
    Boolean(selfService && currentUserEmail && user.email.trim().toLowerCase() === currentUserEmail.trim().toLowerCase())
  return <>
    <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-[var(--md-accent)]" /><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t(selfService ? "Organisation users" : "Warehouse customer access")}</h2></div><p className="mt-1 text-[12px] text-[var(--md-text)]">{t(selfService ? "Invite colleagues and choose what they can do in your organisation’s warehouse workspace." : "Invite customer users and control what they can do in their warehouse portal.")}</p></div>
        <Button type="button" onClick={showInvite} disabled={!reference?.facilities.length} className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3 text-white"><Plus className="size-4" />{t("Invite user")}</Button>
      </div>
      {error && !open ? <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-3 text-[12px] text-[var(--md-red)]">{error}</p> : null}
      {users === null ? <div className="grid min-h-24 place-items-center border-t border-[rgba(11,20,19,0.06)]"><LoaderCircle className="size-4 animate-spin text-[var(--md-accent)]" /></div> : users.length ? users.map((user) => <div key={user.id} className="flex flex-col gap-3 border-t border-[rgba(11,20,19,0.06)] px-5 py-4 sm:flex-row sm:items-center">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-white/58 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><Mail className="size-4" /></span>
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{user.displayName}</p>{isCurrentUser(user) ? <StatusPill tone="neutral">{t("You")}</StatusPill> : null}</div><p dir="ltr" className="truncate text-start text-[12px] text-[var(--md-text)]">{user.email}</p></div>
        <StatusPill tone={user.status === "active" ? "green" : "amber"}>{t(user.status)}</StatusPill>
        <p className="min-w-[190px] text-[12px] text-[var(--md-text)]">{t(roleName(user.roleCode))}</p>
        {!isCurrentUser(user) ? <div className="flex gap-1"><Button type="button" variant="ghost" onClick={() => showEdit(user)} className="h-9 rounded-[var(--md-radius-lg)]">{t("Edit access")}</Button><Button type="button" variant="ghost" size="icon" aria-label={t("Revoke access")} onClick={() => void revoke(user)} className="size-9 rounded-[var(--md-radius-lg)] text-[var(--md-red)]"><Trash2 className="size-4" /></Button></div> : null}
      </div>) : <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-6 text-[13px] text-[var(--md-text)]">{t("No customer users have warehouse access yet.")}</p>}
    </Surface>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="border-0 bg-[var(--md-surface)] sm:max-w-[560px]">
      <DialogHeader><DialogTitle>{t(editing ? "Edit warehouse access" : "Invite customer user")}</DialogTitle><DialogDescription>{t(editing && selfService ? "Change this user’s role. Warehouse access is inherited from the organisation." : editing ? "Change this user’s role and warehouse access." : "They will receive an email invitation to the customer warehouse portal.")}</DialogDescription></DialogHeader>
      <div className="grid gap-4 py-2">
        {!editing ? <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">{t("Name")}<Input dir="auto" value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 shadow-[var(--md-shadow-line)]" /></label><label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">{t("Email")}<Input dir="ltr" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 text-start shadow-[var(--md-shadow-line)]" /></label></div> : <p dir="ltr" className="text-start text-[13px] text-[var(--md-text)]">{editing.email}</p>}
        <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">{t("Role")}<Select value={roleCode} onValueChange={setRoleCode}><SelectTrigger className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 shadow-[var(--md-shadow-line)]"><SelectValue /></SelectTrigger><SelectContent>{reference?.roles.map((role) => <SelectItem key={role.code} value={role.code}><span>{t(role.name)}</span></SelectItem>)}</SelectContent></Select><span className="font-normal leading-5 text-[var(--md-subtle)]">{t(reference?.roles.find((role) => role.code === roleCode)?.description ?? "")}</span></label>
        {selfService ? <div className="rounded-[var(--md-radius-lg)] bg-white/48 px-3 py-3 text-[12px] leading-5 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">{t("Users inherit access to the warehouses assigned to this organisation. Only your warehouse provider can change those assignments.")}</div> : <div><p className="text-[12px] font-medium text-[var(--md-text)]">{t("Warehouses")}</p><div className="mt-2 grid gap-2 rounded-[var(--md-radius-xl)] bg-white/36 p-3 shadow-[var(--md-shadow-line)] sm:grid-cols-2">{reference?.facilities.map((facility) => { const selected = facilityIds.includes(facility.id); return <button key={facility.id} type="button" aria-pressed={selected} onClick={() => toggleFacility(facility.id)} className={`rounded-[var(--md-radius-lg)] px-3 py-2 text-start text-[12px] shadow-[var(--md-shadow-line)] ${selected ? "bg-[rgba(14,125,116,0.11)] text-[var(--md-accent)]" : "bg-white/58 text-[var(--md-text)]"}`}><span dir="ltr" className="font-medium">{facility.code}</span><span className="ms-2">{facility.name}</span></button> })}</div></div>}
        {error ? <p className="rounded-[var(--md-radius-lg)] bg-[rgba(185,28,28,0.07)] px-3 py-2 text-[12px] text-[var(--md-red)]">{error}</p> : null}
      </div>
      <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("Cancel")}</Button><Button type="button" disabled={saving || facilityIds.length === 0 || (!editing && !email.trim())} onClick={() => void save()} className="bg-[var(--md-accent)] text-white">{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}{t(editing ? "Save access" : "Send invitation")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>
}

function Metric({ label, value }: { label: string; value: string }) { return <Surface className="rounded-[var(--md-radius-xl)]" padding="md"><p className="text-[13px] text-[var(--md-text)]">{label}</p><p className="mt-4 text-[28px] font-medium text-[var(--md-ink)]">{value}</p></Surface> }
function PanelTitle({ title, meta }: { title: string; meta?: string }) { return <div className="flex items-center justify-between gap-3 px-5 py-4"><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{title}</h2>{meta ? <span className="text-[13px] text-[var(--md-text)]">{meta}</span> : null}</div> }
function EmptyRow({ text }: { text: string }) { return <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-5 text-[13px] text-[var(--md-text)]">{text}</p> }
function CustomerLoadState({ message, onRetry }: { message: string; onRetry: () => void }) { const { t } = useLanguage(); return <div className="md-page"><Surface className="grid min-h-[300px] place-items-center rounded-[var(--md-radius-xl)]" padding="lg"><div className="text-center"><p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Customer data is unavailable")}</p><p className="mt-2 text-[13px] text-[var(--md-text)]">{message}</p><Button variant="outline" className="mt-4" onClick={onRetry}><RefreshCw className="size-4" />{t("Try again")}</Button></div></Surface></div> }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) }
