import { useEffect, useState, type ReactNode } from "react"
import { Download, FileText, Health, LoaderCircle, Mail, Plus, RefreshCw, ShieldCheck, Trash2 } from "@/components/icons/hugeicons"
import { CustomerAvatar } from "@/components/multideck/customer-components"
import { MarketingOptInControl } from "@/components/multideck/marketing-opt-in-control"
import { MultiSelectMenu } from "@/components/multideck/multi-select-menu"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { toast } from "sonner"
import { useLanguage } from "@/i18n/language-provider"
import { getCustomer, getCustomerDocumentUrl, listCustomerDocuments, type ApiCustomerDetail, type ApiCustomerDocument, type ApiCustomerDocumentListing } from "@/lib/customer-api"
import { setMarketingOptIn, type MarketingConsentRecordType } from "@/lib/marketing-consent-api"
import { getWarehousePortalReference, inviteWarehousePortalUser, listWarehousePortalUsers, revokeWarehousePortalUser, sendWarehousePortalAccessLink, updateWarehousePortalUser, type WarehousePortalReference, type WarehousePortalUser } from "@/lib/warehouse"

export function CustomerDetailPage({ customerId }: { customerId: string }) {
  const [customer, setCustomer] = useState<ApiCustomerDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [documentListing, setDocumentListing] = useState<ApiCustomerDocumentListing | null>(null)
  const [documentsError, setDocumentsError] = useState<string | null>(null)
  const [documentsLoading, setDocumentsLoading] = useState(true)
  const [reloadToken, setReloadToken] = useState(0)
  const { t } = useLanguage()

  useEffect(() => {
    let active = true
    setCustomer(null)
    setError(null)
    setDocumentListing(null)
    setDocumentsError(null)
    setDocumentsLoading(true)
    getCustomer(customerId)
      .then((data) => active && setCustomer(data))
      .catch((loadError) => active && setError(loadError instanceof Error ? loadError.message : t("Unable to load this customer. Check your connection and try again.")))
    listCustomerDocuments(customerId)
      .then((listing) => active && setDocumentListing(listing))
      .catch((loadError) => active && setDocumentsError(loadError instanceof Error ? loadError.message : t("Customer documents are unavailable.")))
      .finally(() => active && setDocumentsLoading(false))
    return () => { active = false }
  }, [customerId, reloadToken, t])

  if (error) return <div className="md-page md-page-stack">
    <section>
      <h1 className="text-[24px] font-medium text-[var(--md-ink)]">{documentListing?.customer.name || t("Customer documents")}</h1>
      <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{t("The customer profile is temporarily unavailable. Supabase documents remain available below.")}</p>
    </section>
    <CustomerLoadState message={error} onRetry={() => setReloadToken((value) => value + 1)} />
    <CustomerDocuments customerId={customerId} documents={documentListing?.documents ?? []} loading={documentsLoading} error={documentsError} />
  </div>
  if (!customer) return <div className="md-page grid min-h-[360px] place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /></div>

  async function changeMarketingOptIn(recordType: MarketingConsentRecordType, recordId: string, optedIn: boolean) {
    try {
      const result = await setMarketingOptIn(recordType, recordId, optedIn)
      setCustomer((current) => {
        if (!current) return current
        if (recordType === "customer") return {
          ...current,
          marketingOptIn: result.marketingOptIn,
          marketingConsentSource: result.marketingConsentSource,
          marketingConsentUpdatedAt: result.marketingConsentUpdatedAt,
        }
        return {
          ...current,
          contacts: current.contacts.map((contact) => contact.id === recordId ? {
            ...contact,
            consentMarketing: result.marketingOptIn,
            marketingConsentSource: result.marketingConsentSource,
            marketingConsentUpdatedAt: result.marketingConsentUpdatedAt,
          } : contact),
        }
      })
      toast.success(t(optedIn ? "Marketing opt-in recorded" : "Marketing opt-out recorded"))
    } catch (cause) {
      toast.error(cause instanceof Error ? cause.message : t("Marketing consent could not be updated."))
      throw cause
    }
  }

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
        <Metric label={t("Account health")} value={customer.healthScore == null ? "—" : `${Math.round(customer.healthScore)}%`} icon={<Health className="size-3.5" strokeWidth={1.4} aria-hidden="true" />} />
      </div>

      {customer.summary ? <Surface className="rounded-[var(--md-radius-xl)]" padding="lg"><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t("Account summary")}</h2><p className="mt-3 text-[14px] leading-6 text-[var(--md-text)]">{customer.summary}</p></Surface> : null}

      <CustomerWarehouseAccess customerId={customer.id} />

      <div className="md-panel-grid xl:grid-cols-[minmax(0,1fr)_380px]">
        <div className="md-panel-column">
          <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
            <PanelTitle title={t("Active shipments")} meta={String(customer.activeShipments.length)} />
            {customer.activeShipments.length ? customer.activeShipments.map((shipment) => <div key={shipment.id} className="grid grid-cols-[minmax(110px,150px)_1fr_auto] gap-4 border-t border-[rgba(11,20,19,0.06)] px-5 py-4"><p className="text-[13px] font-medium text-[var(--md-text)]">{shipment.reference}</p><div className="min-w-0"><p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{shipment.route || t("Route not recorded")}</p><p className="mt-1 text-[12px] text-[var(--md-text)]">{[shipment.mode, shipment.status, shipment.eta ? `${t("ETA")} ${formatDate(shipment.eta)}` : null].filter(Boolean).join(" · ")}</p></div>{shipment.openExceptionCount ? <StatusPill tone="amber">{shipment.openExceptionCount} {t("exceptions")}</StatusPill> : <StatusPill tone="green">{t("On track")}</StatusPill>}</div>) : <EmptyRow text={t("No active shipments are recorded for this customer.")} />}
          </Surface>
          <CustomerDocuments customerId={customer.id} documents={documentListing?.documents ?? []} loading={documentsLoading} error={documentsError} />
          <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
            <PanelTitle title={t("Activity")} meta={t("Latest")} />
            {customer.activities.length ? customer.activities.map((activity) => <div key={activity.id} className="border-t border-[rgba(11,20,19,0.06)] px-5 py-4"><div className="flex items-center justify-between gap-4"><p className="text-[14px] font-medium text-[var(--md-ink)]">{activity.subject}</p><p className="shrink-0 text-[12px] text-[var(--md-text)]">{formatDate(activity.occurredAt)}</p></div>{activity.summary ? <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{activity.summary}</p> : null}</div>) : <EmptyRow text={t("No account activity has been recorded yet.")} />}
          </Surface>
        </div>
        <div className="md-panel-column">
          <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
            <PanelTitle title={t("Contacts")} meta={String(customer.contacts.length)} />
            {customer.contacts.length ? customer.contacts.map((contact) => <div key={contact.id} className="border-t border-[rgba(11,20,19,0.06)] px-5 py-4"><div className="flex gap-3"><CustomerAvatar initials={contact.initials || "?"} tone="blue" /><div className="min-w-0 flex-1"><p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{contact.name || t("Unnamed contact")}</p><p className="truncate text-[12px] text-[var(--md-text)]">{contact.role || t("No role recorded")}</p>{contact.email ? <a className="mt-1 block truncate text-[12px] text-[var(--md-accent)]" href={`mailto:${contact.email}`}>{contact.email}</a> : null}</div></div><MarketingOptInControl compact className="mt-3 pt-3 shadow-[var(--md-stroke-top)]" checked={contact.consentMarketing} source={contact.marketingConsentSource} updatedAt={contact.marketingConsentUpdatedAt} onCheckedChange={(optedIn) => changeMarketingOptIn("contact", contact.id, optedIn)} /></div>) : <EmptyRow text={t("No contacts are recorded for this customer.")} />}
          </Surface>
          <Surface className="rounded-[var(--md-radius-xl)]" padding="none"><PanelTitle title={t("Account")} /><div className="px-5 py-4 shadow-[var(--md-stroke-top)]"><MarketingOptInControl checked={Boolean(customer.marketingOptIn)} source={customer.marketingConsentSource} updatedAt={customer.marketingConsentUpdatedAt} onCheckedChange={(optedIn) => changeMarketingOptIn("customer", customer.id, optedIn)} /></div>{accountFacts.length ? <div className="px-5 pb-5">{accountFacts.map(([label, value]) => <div key={label} className="grid grid-cols-[120px_1fr] gap-4 border-t border-[rgba(11,20,19,0.06)] py-3"><p className="text-[13px] text-[var(--md-text)]">{label}</p><p className="text-right text-[13px] font-medium text-[var(--md-ink)]">{value}</p></div>)}</div> : <EmptyRow text={t("No additional account details are recorded.")} />}</Surface>
        </div>
      </div>
    </div>
  )
}

function CustomerDocuments({ customerId, documents, loading = false, error = null }: { customerId: string; documents: ApiCustomerDocument[]; loading?: boolean; error?: string | null }) {
  const { t } = useLanguage()
  const [openingId, setOpeningId] = useState<string | null>(null)

  async function openDocument(document: ApiCustomerDocument) {
    const pendingWindow = window.open("about:blank", "_blank")
    if (pendingWindow) pendingWindow.opener = null
    setOpeningId(document.id)
    try {
      const access = await getCustomerDocumentUrl(customerId, document.id)
      if (pendingWindow) pendingWindow.location.replace(access.url)
      else window.location.assign(access.url)
    } catch (cause) {
      pendingWindow?.close()
      toast.error(t("Unable to open this document. Check your connection and try again."), {
        description: cause instanceof Error ? cause.message : undefined,
      })
    } finally {
      setOpeningId(null)
    }
  }

  return <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
    <PanelTitle title={t("Documents")} meta={String(documents.length)} />
    {loading ? <div className="grid min-h-24 place-items-center border-t border-[rgba(11,20,19,0.06)]"><LoaderCircle className="size-4 animate-spin text-[var(--md-accent)]" /></div> : error ? <p role="alert" className="border-t border-[rgba(11,20,19,0.06)] px-5 py-4 text-[13px] text-[var(--md-red)]">{error}</p> : documents.length ? documents.map((document) => {
      const pending = document.status === "pending_review" || document.safetyStatus === "unscanned"
      return <div key={document.id} className="flex flex-col gap-3 border-t border-[rgba(11,20,19,0.06)] px-5 py-4 sm:flex-row sm:items-center">
        <span className="grid size-10 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-white/58 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><FileText className="size-4" /></span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-medium text-[var(--md-ink)]" title={document.fileName}>{document.fileName}</p>
          <p className="mt-1 text-[12px] text-[var(--md-text)]">{[document.mimeType, formatBytes(document.fileSizeBytes), formatDate(document.createdAt)].filter(Boolean).join(" · ")}</p>
        </div>
        <StatusPill tone={pending ? "amber" : "green"}>{t(pending ? "Pending review" : "Available")}</StatusPill>
        <Button type="button" variant="outline" className="h-9 rounded-[var(--md-radius-lg)]" disabled={openingId === document.id} onClick={() => void openDocument(document)}>
          {openingId === document.id ? <LoaderCircle className="size-4 animate-spin" /> : <Download className="size-4" />}
          {t("Open")}
        </Button>
      </div>
    }) : <EmptyRow text={t("No customer documents have been saved yet.")} />}
  </Surface>
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
  const [sendingAccessLinkUserId, setSendingAccessLinkUserId] = useState<string | null>(null)

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

  async function sendAccessLink(user: WarehousePortalUser) {
    setSendingAccessLinkUserId(user.id); setError(null)
    try {
      await sendWarehousePortalAccessLink(customerId, user.id)
      toast.success(t("Access link sent"), { description: user.email })
    } catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)) } finally { setSendingAccessLinkUserId(null) }
  }

  const roleName = (code: string) => reference?.roles.find((role) => role.code === code)?.name ?? code
  const isCurrentUser = (user: WarehousePortalUser) =>
    Boolean(selfService && currentUserEmail && user.email.trim().toLowerCase() === currentUserEmail.trim().toLowerCase())
  return <>
    <Surface className="overflow-hidden rounded-[var(--md-radius-xl)]" padding="none">
      <div className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="flex items-center gap-2"><ShieldCheck className="size-4 text-[var(--md-accent)]" /><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{t(selfService ? "Organisation users" : "Warehouse customer access")}</h2></div><p className="mt-1 text-[12px] text-[var(--md-text)]">{t(selfService ? "Invite colleagues and choose what they can do in your organisation’s warehouse workspace." : "Invite customer users and control what they can do in their warehouse portal.")}</p></div>
        <Button type="button" onClick={showInvite} disabled={!reference?.facilities.length} className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3 text-[var(--md-accent-ink)]"><Plus className="size-4" />{t("Invite user")}</Button>
      </div>
      {error && !open ? <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-3 text-[12px] text-[var(--md-red)]">{error}</p> : null}
      {users === null ? <div className="grid min-h-24 place-items-center border-t border-[rgba(11,20,19,0.06)]"><LoaderCircle className="size-4 animate-spin text-[var(--md-accent)]" /></div> : users.length ? users.map((user) => <div key={user.id} className="flex flex-col gap-3 border-t border-[rgba(11,20,19,0.06)] px-5 py-4 sm:flex-row sm:items-center">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-white/58 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><Mail className="size-4" /></span>
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{user.displayName}</p>{isCurrentUser(user) ? <StatusPill tone="neutral">{t("You")}</StatusPill> : null}</div><p dir="ltr" className="truncate text-start text-[12px] text-[var(--md-text)]">{user.email}</p></div>
        <StatusPill tone={user.status === "active" ? "green" : "amber"}>{t(user.status)}</StatusPill>
        <p className="min-w-[190px] text-[12px] text-[var(--md-text)]">{t(roleName(user.roleCode))}</p>
        {!isCurrentUser(user) ? <div className="flex flex-wrap gap-1">{!user.lastLoginAt ? <Button type="button" variant="ghost" disabled={sendingAccessLinkUserId === user.id} onClick={() => void sendAccessLink(user)} className="h-9 rounded-[var(--md-radius-lg)]">{sendingAccessLinkUserId === user.id ? <LoaderCircle className="size-4 animate-spin" /> : <Mail className="size-4" />}{t("Send access link")}</Button> : null}<Button type="button" variant="ghost" onClick={() => showEdit(user)} className="h-9 rounded-[var(--md-radius-lg)]">{t("Edit access")}</Button><Button type="button" variant="ghost" size="icon" aria-label={t("Revoke access")} onClick={() => void revoke(user)} className="size-9 rounded-[var(--md-radius-lg)] text-[var(--md-red)]"><Trash2 className="size-4" /></Button></div> : null}
      </div>) : <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-6 text-[13px] text-[var(--md-text)]">{t("No customer users have warehouse access yet.")}</p>}
    </Surface>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="border-0 bg-[var(--md-surface)] sm:max-w-[560px]">
      <DialogHeader><DialogTitle>{t(editing ? "Edit warehouse access" : "Invite customer user")}</DialogTitle><DialogDescription>{t(editing && selfService ? "Change this user’s role. Warehouse access is inherited from the organisation." : editing ? "Change this user’s role and warehouse access." : "They will receive an email invitation to the customer warehouse portal.")}</DialogDescription></DialogHeader>
      <div className="grid gap-4 py-2">
        {!editing ? <div className="grid gap-3 sm:grid-cols-2"><label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">{t("Name")}<Input dir="auto" value={displayName} onChange={(event) => setDisplayName(event.target.value)} className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 shadow-[var(--md-shadow-line)]" /></label><label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">{t("Email")}<Input dir="ltr" type="email" value={email} onChange={(event) => setEmail(event.target.value)} className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 text-start shadow-[var(--md-shadow-line)]" /></label></div> : <p dir="ltr" className="text-start text-[13px] text-[var(--md-text)]">{editing.email}</p>}
        <label className="grid gap-1.5 text-[12px] font-medium text-[var(--md-text)]">{t("Role")}<Select value={roleCode} onValueChange={setRoleCode}><SelectTrigger className="h-10 rounded-[var(--md-radius-lg)] border-0 bg-white/68 shadow-[var(--md-shadow-line)]"><SelectValue /></SelectTrigger><SelectContent>{reference?.roles.map((role) => <SelectItem key={role.code} value={role.code}><span>{t(role.name)}</span></SelectItem>)}</SelectContent></Select><span className="font-normal leading-5 text-[var(--md-subtle)]">{t(reference?.roles.find((role) => role.code === roleCode)?.description ?? "")}</span></label>
        {selfService ? <div className="rounded-[var(--md-radius-lg)] bg-white/48 px-3 py-3 text-[12px] leading-5 text-[var(--md-text)] shadow-[var(--md-shadow-line)]">{t("Users inherit access to the warehouses assigned to this organisation. Only your warehouse provider can change those assignments.")}</div> : <div><p className="text-[12px] font-medium text-[var(--md-text)]">{t("Warehouses")}</p><MultiSelectMenu value={facilityIds} options={reference?.facilities.map((facility) => ({ value: facility.id, label: `${facility.code} · ${facility.name}` })) ?? []} onValueChange={setFacilityIds} placeholder="Select warehouses" label="Warehouses" className="mt-2 h-10 rounded-[var(--md-radius-lg)] bg-white/68 px-3 text-[12px]" /></div>}
        {error ? <p className="rounded-[var(--md-radius-lg)] bg-[rgba(185,28,28,0.07)] px-3 py-2 text-[12px] text-[var(--md-red)]">{error}</p> : null}
      </div>
      <DialogFooter><Button type="button" variant="ghost" onClick={() => setOpen(false)}>{t("Cancel")}</Button><Button type="button" disabled={saving || facilityIds.length === 0 || (!editing && !email.trim())} onClick={() => void save()} className="bg-[var(--md-accent)] text-[var(--md-accent-ink)]">{saving ? <LoaderCircle className="size-4 animate-spin" /> : null}{t(editing ? "Save access" : "Send invitation")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </>
}

function Metric({ label, value, icon }: { label: string; value: string; icon?: ReactNode }) { return <Surface className="rounded-[var(--md-radius-xl)]" padding="md"><p className="flex items-center gap-1.5 text-[13px] text-[var(--md-text)]">{icon}{label}</p><p className="mt-4 text-[28px] font-medium text-[var(--md-ink)]">{value}</p></Surface> }
function PanelTitle({ title, meta }: { title: string; meta?: string }) { return <div className="flex items-center justify-between gap-3 px-5 py-4"><h2 className="text-[15px] font-medium text-[var(--md-ink)]">{title}</h2>{meta ? <span className="text-[13px] text-[var(--md-text)]">{meta}</span> : null}</div> }
function EmptyRow({ text }: { text: string }) { return <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-5 text-[13px] text-[var(--md-text)]">{text}</p> }
function CustomerLoadState({ message, onRetry }: { message: string; onRetry: () => void }) { const { t } = useLanguage(); return <Surface className="grid min-h-[220px] place-items-center rounded-[var(--md-radius-xl)]" padding="lg"><div className="text-center"><p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Customer data is unavailable")}</p><p className="mt-2 text-[13px] text-[var(--md-text)]">{message}</p><Button variant="outline" className="mt-4" onClick={onRetry}><RefreshCw className="size-4" />{t("Try again")}</Button></div></Surface> }
function formatDate(value: string) { return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value)) }
function formatBytes(value: number) { if (!Number.isFinite(value) || value <= 0) return null; if (value < 1024) return `${value} B`; if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`; return `${(value / (1024 * 1024)).toFixed(1)} MB` }
