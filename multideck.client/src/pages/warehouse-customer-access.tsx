import { useEffect, useState } from "react"
import { LoaderCircle, Mail, Plus, ShieldCheck, Trash2 } from "@/components/icons/hugeicons"
import { MultiSelectMenu } from "@/components/multideck/multi-select-menu"
import { Pagination } from "@/components/multideck/pagination"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useLanguage } from "@/i18n/language-provider"
import { defaultPaginationPageSize } from "@/lib/pagination"
import { getWarehousePortalReference, inviteWarehousePortalUser, listWarehousePortalUsersPage, revokeWarehousePortalUser, sendWarehousePortalAccessLink, updateWarehousePortalUser, type WarehousePortalReference, type WarehousePortalUser } from "@/lib/warehouse"
import { toast } from "sonner"

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
  const [userTotal, setUserTotal] = useState(0)
  const [userOffset, setUserOffset] = useState(0)
  const [userPageSize, setUserPageSize] = useState(defaultPaginationPageSize)
  const [usersLoading, setUsersLoading] = useState(true)
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
    setUsersLoading(true)
    setError(null)
    try {
      const [nextReference, nextUsers] = await Promise.all([getWarehousePortalReference(), listWarehousePortalUsersPage(customerId, { limit: userPageSize, offset: userOffset })])
      setReference(nextReference)
      setUsers(nextUsers.rows)
      setUserTotal(nextUsers.total)
    } catch (cause) {
      setUsers([])
      setUserTotal(0)
      setError(cause instanceof Error ? cause.message : String(cause))
    } finally {
      setUsersLoading(false)
    }
  }

  useEffect(() => { setUserOffset(0) }, [customerId])
  useEffect(() => { void refresh() }, [customerId, userOffset, userPageSize]) // eslint-disable-line react-hooks/exhaustive-deps

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
      {users === null ? <div className="grid min-h-24 place-items-center border-t border-[rgba(11,20,19,0.06)]"><LoaderCircle className="size-4 animate-spin text-[var(--md-accent)]" /></div> : users.length ? <>{users.map((user) => <div key={user.id} className="flex flex-col gap-3 border-t border-[rgba(11,20,19,0.06)] px-5 py-4 sm:flex-row sm:items-center">
        <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-white/58 text-[var(--md-accent)] shadow-[var(--md-shadow-line)]"><Mail className="size-4" /></span>
        <div className="min-w-0 flex-1"><div className="flex items-center gap-2"><p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{user.displayName}</p>{isCurrentUser(user) ? <StatusPill tone="neutral">{t("You")}</StatusPill> : null}</div><p dir="ltr" className="truncate text-start text-[12px] text-[var(--md-text)]">{user.email}</p></div>
        <StatusPill tone={user.status === "active" ? "green" : "amber"}>{t(user.status)}</StatusPill>
        <p className="min-w-[190px] text-[12px] text-[var(--md-text)]">{t(roleName(user.roleCode))}</p>
        {!isCurrentUser(user) ? <div className="flex flex-wrap gap-1">{!user.lastLoginAt ? <Button type="button" variant="ghost" disabled={sendingAccessLinkUserId === user.id} onClick={() => void sendAccessLink(user)} className="h-9 rounded-[var(--md-radius-lg)]">{sendingAccessLinkUserId === user.id ? <LoaderCircle className="size-4 animate-spin" /> : <Mail className="size-4" />}{t("Send access link")}</Button> : null}<Button type="button" variant="ghost" onClick={() => showEdit(user)} className="h-9 rounded-[var(--md-radius-lg)]">{t("Edit access")}</Button><Button type="button" variant="ghost" size="icon" aria-label={t("Revoke access")} onClick={() => void revoke(user)} className="size-9 rounded-[var(--md-radius-lg)] text-[var(--md-red)]"><Trash2 className="size-4" /></Button></div> : null}
      </div>)}</> : <p className="border-t border-[rgba(11,20,19,0.06)] px-5 py-6 text-[13px] text-[var(--md-text)]">{t("No customer users have warehouse access yet.")}</p>}
      {!error ? <div className="border-t border-[var(--md-line)] p-3"><Pagination page={Math.floor(userOffset / userPageSize) + 1} pageCount={Math.max(1, Math.ceil(userTotal / userPageSize))} totalItems={userTotal} pageSize={userPageSize} onPageSizeChange={setUserPageSize} onPageChange={(page) => setUserOffset((page - 1) * userPageSize)} loading={usersLoading} itemCount={users?.length ?? 0} itemLabel="users" /></div> : null}
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
