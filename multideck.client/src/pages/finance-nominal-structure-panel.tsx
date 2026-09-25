import { useCallback, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { SettingsPanel } from "@/components/multideck/settings-components"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import { useLanguage } from "@/i18n/language-provider"
import { chargeMappingCutoverAction, createNominalGroup, getChargeMappingCutovers, getNominalStructure, mapChargeNominals, saveChargeCatalogueItem, type ChargeApplicability, type ChargeCatalogueItem, type ChargeMappingCutover, type NominalGroup, type NominalStructure } from "@/lib/finance-ledger-api"
import type { FinanceAdministration } from "@/lib/finance-subledger-api"

type GroupDraft = { code: string; name: string; kind: "cost" | "revenue"; actualAccountId: string; accruedAccountId: string; controlAccountId: string }
const blankGroup = (): GroupDraft => ({ code: "", name: "", kind: "cost", actualAccountId: "", accruedAccountId: "", controlAccountId: "" })
const message = (error: unknown) => error instanceof Error ? error.message : "Nominal structure could not be loaded."
const directions = ["import", "export", "cross_trade", "other"] as const
const modes = ["air", "sea", "road", "mix", "other"] as const
const kinds = ["quote", "booking"] as const
const categories = ["freight", "origin", "destination", "terminal", "haulage", "documentation", "customs", "fuel", "security", "peak", "storage", "warehouse", "insurance", "other"]
type Scope = { recordKind: ChargeApplicability["record_kind"]; direction: ChargeApplicability["direction"]; mode: ChargeApplicability["mode"] }
type ChargeDraft = { id?: string; version: number; code: string; name: string; description: string; category: string; side: string; active: boolean; applicability: Scope[] }
const scopeKey = (scope: Scope) => `${scope.recordKind}:${scope.direction}:${scope.mode}`
const allScopes = (): Scope[] => kinds.flatMap(recordKind => directions.flatMap(direction => modes.map(mode => ({ recordKind, direction, mode }))))

/** Page-local finance setup workflow; groups are saved separately from chart drafts. */
export function FinanceNominalStructurePanel({ entityId, accounts, chartDirty }: {
  entityId: string; accounts: FinanceAdministration["nominalAccounts"]; chartDirty: boolean
}) {
  const { t } = useLanguage()
  const [data, setData] = useState<NominalStructure | null>(null)
  const [cutovers, setCutovers] = useState<ChargeMappingCutover[]>([])
  const [effectiveDate, setEffectiveDate] = useState("")
  const [cutoverReview, setCutoverReview] = useState<{ action: "approve" | "activate"; id: string } | null>(null)
  const [error, setError] = useState("")
  const [notice, setNotice] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [group, setGroup] = useState<GroupDraft | null>(null)
  const [chargeDraft, setChargeDraft] = useState<ChargeDraft | null>(null)
  const [chargeId, setChargeId] = useState("")
  const [costId, setCostId] = useState("")
  const [revenueId, setRevenueId] = useState("")
  const request = useRef(0)
  const load = useCallback(async () => {
    const version = ++request.current
    setLoading(true); setError("")
    try {
      const [result, existingCutovers] = await Promise.all([getNominalStructure(entityId), getChargeMappingCutovers(entityId)])
      if (version === request.current) {
        setData(result); setCutovers(existingCutovers); setChargeId(""); setCostId(""); setRevenueId("")
      }
    } catch (err) { if (version === request.current) setError(message(err)) }
    finally { if (version === request.current) setLoading(false) }
  }, [entityId])
  useEffect(() => { void load(); return () => { request.current++ } }, [load])
  const scopedAccounts = accounts.filter(account => account.FINNom_LegalEntityID === entityId)
  const accountById = new Map(scopedAccounts.map(account => [account.FINNom_ID, account]))
  const groupById = new Map(data?.groups.map(item => [item.id, item]) ?? [])
  const usedAccounts = new Set(data?.members.map(member => member.account_id) ?? [])
  const accountName = (id: string | undefined) => {
    const account = id ? accountById.get(id) : null
    return account ? `${account.FINNom_Code} · ${account.FINNom_Name}${account.FINNom_IsActive ? "" : ` (${t("inactive")})`}` : t("Account unavailable")
  }
  const memberName = (id: string, role: "actual" | "accrued") => accountName(data?.members.find(member => member.group_id === id && member.role === role)?.account_id)
  const chooseCharge = (id: string) => {
    const mapping = data?.chargeMappings.find(row => row.charge_id === id)
    setChargeId(id); setCostId(mapping?.cost_group_id ?? ""); setRevenueId(mapping?.revenue_group_id ?? ""); setNotice("")
  }
  const editable = Boolean(data) && !loading && !busy && !chartDirty && !error
  const saveGroup = async () => {
    if (!group || !editable) return
    setBusy(true); setError(""); setNotice("")
    try { await createNominalGroup(entityId, group); setGroup(null); setNotice(t("Group saved. This does not activate the posting transition.")); await load() }
    catch (err) { setError(message(err)) }
    finally { setBusy(false) }
  }
  const saveMapping = async () => {
    if (!chargeId || !editable) return
    setBusy(true); setError(""); setNotice("")
    try {
      await mapChargeNominals(entityId, { chargeId, costGroupId: costId || null, revenueGroupId: revenueId || null, version: data?.chargeMappings.find(row => row.charge_id === chargeId)?.version ?? 0 })
      setNotice(t("Charge mapping saved. Existing postings have not changed.")); await load()
    } catch (err) { setError(message(err)) }
    finally { setBusy(false) }
  }
  const runCutover = async (action: "propose" | "approve" | "activate", id?: string) => {
    if (!editable) return
    setBusy(true); setError(""); setNotice("")
    try {
      await chargeMappingCutoverAction(entityId, action, action === "propose" ? { effectiveDate } : { id })
      setCutoverReview(null)
      setNotice(t(action === "propose" ? "Cutover plan saved for independent review." : action === "approve" ? "Cutover plan approved. Activation is still required." : "Charge mapping cutover activated for documents dated on or after the effective date."))
      await load()
    } catch (err) { setError(message(err)) }
    finally { setBusy(false) }
  }
  const columns: DataTableColumn<NominalGroup>[] = [
    { id: "code", label: t("Group code"), width: 145, cell: row => row.code },
    { id: "name", label: t("Group name"), width: 200, cell: row => row.name },
    { id: "kind", label: t("P&L section"), width: 100, cell: row => t(row.kind === "cost" ? "Costs" : "Revenue") },
    { id: "actual", label: t("Actual nominal"), width: 250, cell: row => memberName(row.id, "actual") },
    { id: "accrued", label: t("Accrued nominal"), width: 250, cell: row => memberName(row.id, "accrued") },
    { id: "control", label: t("BS control"), width: 250, cell: row => accountName(row.control_account_id) },
  ]
  const profitAccounts = scopedAccounts.filter(account => account.FINNom_IsActive && !account.FINNom_IsControlAccount && !usedAccounts.has(account.FINNom_ID) &&
    (group?.kind === "revenue" ? account.FINNom_ReportCategoryCode === "income" : ["direct_cost", "expense"].includes(account.FINNom_ReportCategoryCode ?? "")))
  const controlAccounts = scopedAccounts.filter(account => account.FINNom_IsActive && account.FINNom_IsControlAccount && account.FINNom_ReportCategoryCode === (group?.kind === "revenue" ? "asset" : "liability"))
  const mapping = data?.chargeMappings.find(row => row.charge_id === chargeId)
  const mappingChanged = costId !== (mapping?.cost_group_id ?? "") || revenueId !== (mapping?.revenue_group_id ?? "")
  const activeCutover = cutovers.find(item => item.status === "active")
  const pendingCutover = cutovers.find(item => item.status === "approved" || item.status === "proposed")
  const editCharge = (row?: ChargeCatalogueItem) => {
    setError(""); setNotice("")
    setChargeDraft(row ? {
      id: row.RATECharge_ID, version: row.RATECharge_Version, code: row.RATECharge_Code, name: row.RATECharge_Name,
      description: row.RATECharge_Description ?? "", category: row.RATECharge_CategoryCode,
      side: row.RATECharge_DefaultApplicabilityCode, active: row.RATECharge_IsActive,
      applicability: row.RATECharge_ScopeConfigured
        ? (data?.applicability.filter(scope => scope.charge_id === row.RATECharge_ID).map(scope => ({ recordKind: scope.record_kind, direction: scope.direction, mode: scope.mode })) ?? [])
        : allScopes(),
    } : { version: 0, code: "", name: "", description: "", category: "other", side: "both", active: true, applicability: [] })
  }
  const saveCharge = async () => {
    if (!chargeDraft || !editable) return
    setBusy(true); setError(""); setNotice("")
    try {
      await saveChargeCatalogueItem(entityId, chargeDraft)
      setChargeDraft(null); setNotice(t("Charge code saved.")); await load()
    } catch (err) { setError(message(err)) }
    finally { setBusy(false) }
  }
  const chargeColumns: DataTableColumn<ChargeCatalogueItem>[] = [
    { id: "code", label: t("Code"), width: 125, cell: row => row.RATECharge_Code },
    { id: "name", label: t("Charge"), width: 210, cell: row => row.RATECharge_Name },
    { id: "category", label: t("Category"), width: 125, cell: row => t(row.RATECharge_CategoryCode) },
    { id: "scope", label: t("Quote / booking types"), width: 330, cell: row => row.RATECharge_ScopeConfigured
      ? <div className="space-y-1">{kinds.map(kind => {
          const entries = data?.applicability.filter(scope => scope.charge_id === row.RATECharge_ID && scope.record_kind === kind) ?? []
          return <p key={kind}><span className="font-medium">{t(kind === "quote" ? "Quotes" : "Bookings")}:</span> {entries.length ? directions.flatMap(direction => {
            const selected = modes.filter(mode => entries.some(scope => scope.direction === direction && scope.mode === mode))
            return selected.length ? [`${t(direction === "cross_trade" ? "Cross trade" : direction)} (${selected.map(mode => t(mode)).join(", ")})`] : []
          }).join(" · ") : t("None")}</p>
        })}</div>
      : t("All directions and modes (legacy)") },
    { id: "status", label: t("Status"), width: 90, cell: row => t(row.RATECharge_IsActive ? "Active" : "Inactive") },
    { id: "cost", label: t("Cost nominal"), width: 180, cell: row => {
      const id = data?.chargeMappings.find(item => item.charge_id === row.RATECharge_ID)?.cost_group_id
      return id ? memberName(id, "actual") : t("Not mapped")
    } },
    { id: "revenue", label: t("Revenue nominal"), width: 180, cell: row => {
      const id = data?.chargeMappings.find(item => item.charge_id === row.RATECharge_ID)?.revenue_group_id
      return id ? memberName(id, "actual") : t("Not mapped")
    } },
    { id: "actions", label: t("Manage"), width: 100, cell: row => <Button variant="outline" size="sm" disabled={!editable} onClick={() => editCharge(row)}>{t("Edit")}</Button> },
  ]
  return <SettingsPanel title={t("Actual and accrued nominal structure")} description={t("P&L groups hold actual and outstanding accrued accounts. Balance-sheet controls remain separate. Group headers cannot receive postings.")}>
    <div className="space-y-4 p-4">
      <p className="text-[12px] text-[var(--md-subtle)]">{t("Preparation only: saving groups and mappings does not switch existing transactions to the new model.")}</p>
      {chartDirty ? <p role="status" className="text-[13px] text-[var(--md-amber)]">{t("Save or discard chart changes before configuring nominal relationships.")}</p> : null}
      {error ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-[13px] text-[var(--md-red)]"><span>{t(error)}</span><Button variant="outline" disabled={loading || busy} onClick={() => void load()}>{t("Reload structure")}</Button></div> : null}
      {notice ? <p role="status" className="text-[13px] text-[var(--md-green)]">{notice}</p> : null}
      {loading && !data ? <DotGridLoader size="sm" label="Loading nominal structure" /> : data ? <>
        <section aria-labelledby="charge-catalogue-heading" className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 id="charge-catalogue-heading" className="text-[14px] font-medium">{t("Charge catalogue")}</h3><p className="text-[12px] text-[var(--md-subtle)]">{t("Manage codes and where they apply. Cost and revenue nominals resolve through the Multideck groups below.")}</p></div><Button variant="outline" disabled={!editable} onClick={() => editCharge()}>{t("Add charge code")}</Button></div>
          <DataTable columns={chargeColumns} rows={data.chargeCodes} getRowKey={row => row.RATECharge_ID} ariaLabel={t("Charge catalogue")} minimumWidth={1350}
            emptyState={<p>{t("No charge codes configured.")}</p>} />
        </section>
        <DataTable columns={columns} rows={data.groups} getRowKey={row => row.id} ariaLabel={t("Nominal groups")} minimumWidth={950}
          toolbarOptions={<Button variant="outline" disabled={!editable} onClick={() => { setGroup(blankGroup()); setNotice("") }}>{t("Add nominal group")}</Button>}
          emptyState={<p>{t("No groups configured. Save the required actual, accrued and control accounts in the chart, then add a group.")}</p>} />
        <section aria-labelledby="charge-nominal-heading" className="space-y-3 border-t border-[var(--md-line)] pt-4">
          <h3 id="charge-nominal-heading" className="text-[14px] font-medium">{t("Charge-code accounting relationships")}</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="space-y-1"><label htmlFor="structure-charge" className="text-[12px]">{t("Charge code")}</label><Select value={chargeId} onValueChange={chooseCharge} disabled={!editable}><SelectTrigger id="structure-charge"><SelectValue placeholder={t("Choose charge code")} /></SelectTrigger><SelectContent>{data.chargeCodes.filter(row => row.RATECharge_IsActive).map(row => <SelectItem key={row.RATECharge_ID} value={row.RATECharge_ID}>{row.RATECharge_Code} · {row.RATECharge_Name}</SelectItem>)}</SelectContent></Select></div>
            {(["cost", "revenue"] as const).map(kind => <div key={kind} className="space-y-1"><label htmlFor={`structure-${kind}`} className="text-[12px]">{t(kind === "cost" ? "Cost group" : "Revenue group")}</label><Select value={(kind === "cost" ? costId : revenueId) || "none"} onValueChange={value => (kind === "cost" ? setCostId : setRevenueId)(value === "none" ? "" : value)} disabled={!editable || !chargeId}><SelectTrigger id={`structure-${kind}`}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">{t("Not configured")}</SelectItem>{data.groups.filter(row => row.kind === kind).map(row => <SelectItem key={row.id} value={row.id}>{row.code} · {row.name}</SelectItem>)}</SelectContent></Select></div>)}
          </div>
          {[costId, revenueId].filter(Boolean).map(id => <p key={id} className="text-[12px] text-[var(--md-text)]">{groupById.get(id)?.name}: {t("Actual")} {memberName(id, "actual")} · {t("Accrued")} {memberName(id, "accrued")} · {t("BS control")} {accountName(groupById.get(id)?.control_account_id)}</p>)}
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-[12px] text-[var(--md-subtle)]">{t("Each required direction needs a mapping. Missing accounts must be resolved before posting.")}</p><Button disabled={!editable || !chargeId || (!costId && !revenueId) || !mappingChanged} onClick={() => void saveMapping()}>{t("Save charge mapping")}</Button></div>
        </section>
        <section aria-labelledby="mapping-cutover-heading" className="space-y-3 border-t border-[var(--md-line)] pt-4">
          <h3 id="mapping-cutover-heading" className="text-[14px] font-medium">{t("Charge mapping cutover")}</h3>
          <p className="text-[12px] text-[var(--md-text)]">{t("A second finance operator reviews the saved relationships before activation. Charge-linked documents dated from the cutover must use the mapped actual nominal; their chosen account and mapping version remain on the posted document.")}</p>
          {activeCutover ? <p role="status" className="text-[13px] text-[var(--md-green)]">{t("Active from")} <span data-i18n-skip>{activeCutover.effective_date}</span> · {Object.keys(activeCutover.mapping_snapshot).length} {t("charge mappings in the approved plan")}</p> : pendingCutover ? <div className="flex flex-wrap items-center justify-between gap-3 text-[13px]"><p>{t(pendingCutover.status === "proposed" ? "Awaiting independent approval" : "Approved, awaiting activation")} · <span data-i18n-skip>{pendingCutover.effective_date}</span> · {Object.keys(pendingCutover.mapping_snapshot).length} {t("mapped charges")}</p><Button variant="outline" disabled={!editable} onClick={() => setCutoverReview({ action: pendingCutover.status === "proposed" ? "approve" : "activate", id: pendingCutover.id })}>{t(pendingCutover.status === "proposed" ? "Review and approve" : "Review and activate")}</Button></div> : <div className="flex flex-wrap items-end gap-3"><label className="space-y-1 text-[12px]">{t("Effective accounting date")}<Input type="date" value={effectiveDate} disabled={!editable} onChange={event => setEffectiveDate(event.target.value)} /></label><Button variant="outline" disabled={!editable || !effectiveDate || !data.chargeMappings.length} onClick={() => void runCutover("propose")}>{t("Propose cutover")}</Button></div>}
          <p className="text-[12px] text-[var(--md-subtle)]">{t("Existing postings are never remapped. Activation stops if charge documents have already posted on or after the proposed date.")}</p>
        </section>
      </> : null}
    </div>
    <Dialog open={group !== null} onOpenChange={open => { if (!open && !busy) setGroup(null) }}><DialogContent><DialogHeader><DialogTitle>{t("Add nominal group")}</DialogTitle><DialogDescription>{t("Choose saved accounts for one P&L category. Account membership is retained permanently to protect historical reporting.")}</DialogDescription></DialogHeader>
      {group ? <div className="grid gap-3">
        {error ? <div role="alert" className="space-y-2 text-[13px] text-[var(--md-red)]"><p>{t(error)}</p><Button variant="outline" disabled={loading || busy} onClick={() => void load()}>{t("Reload structure")}</Button></div> : null}
        <div className="grid grid-cols-2 gap-3"><label className="space-y-1 text-[12px]">{t("Group code")}<Input maxLength={80} value={group.code} disabled={busy} onChange={event => setGroup({ ...group, code: event.target.value })} /></label><label className="space-y-1 text-[12px]">{t("Group name")}<Input maxLength={180} value={group.name} disabled={busy} onChange={event => setGroup({ ...group, name: event.target.value })} /></label></div>
        <div className="space-y-1"><label htmlFor="group-kind" className="text-[12px]">{t("P&L section")}</label><Select value={group.kind} disabled={busy} onValueChange={value => setGroup({ ...group, kind: value as "cost" | "revenue", actualAccountId: "", accruedAccountId: "", controlAccountId: "" })}><SelectTrigger id="group-kind"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="cost">{t("Costs")}</SelectItem><SelectItem value="revenue">{t("Revenue")}</SelectItem></SelectContent></Select></div>
        {(["actualAccountId", "accruedAccountId", "controlAccountId"] as const).map(field => <div key={field} className="space-y-1"><label htmlFor={`group-${field}`} className="text-[12px]">{t(field === "actualAccountId" ? "Actual nominal" : field === "accruedAccountId" ? "Accrued nominal" : "BS control")}</label><Select value={group[field]} disabled={busy} onValueChange={value => setGroup({ ...group, [field]: value })}><SelectTrigger id={`group-${field}`}><SelectValue placeholder={t("Choose account")} /></SelectTrigger><SelectContent>{(field === "controlAccountId" ? controlAccounts : profitAccounts.filter(account => account.FINNom_ID !== group[field === "actualAccountId" ? "accruedAccountId" : "actualAccountId"])).map(account => <SelectItem key={account.FINNom_ID} value={account.FINNom_ID}>{account.FINNom_Code} · {account.FINNom_Name}</SelectItem>)}</SelectContent></Select></div>)}
        <p className="text-[12px] text-[var(--md-subtle)]">{t("Only active accounts with the correct P&L or balance-sheet classification are offered. Create missing accounts in the chart first.")}</p>
      </div> : null}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setGroup(null)}>{t("Cancel")}</Button><Button disabled={!editable || !group || !Object.values(group).every(value => value.trim())} onClick={() => void saveGroup()}>{t("Save group")}</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={cutoverReview !== null} onOpenChange={open => { if (!open && !busy) setCutoverReview(null) }}><DialogContent><DialogHeader><DialogTitle>{t(cutoverReview?.action === "activate" ? "Activate charge mapping cutover" : "Approve charge mapping cutover")}</DialogTitle><DialogDescription>{t("Review the effective date and saved mappings before continuing. The service rechecks the current chart and requires a second finance operator.")}</DialogDescription></DialogHeader>
      {cutoverReview ? <p className="text-[13px]">{t("Effective from")} <span data-i18n-skip>{cutovers.find(row => row.id === cutoverReview.id)?.effective_date}</span> · {Object.keys(cutovers.find(row => row.id === cutoverReview.id)?.mapping_snapshot ?? {}).length} {t("mapped charges")}</p> : null}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setCutoverReview(null)}>{t("Cancel")}</Button><Button disabled={!editable || !cutoverReview} onClick={() => { if (cutoverReview) void runCutover(cutoverReview.action, cutoverReview.id) }}>{t(cutoverReview?.action === "activate" ? "Activate cutover" : "Approve plan")}</Button></DialogFooter>
    </DialogContent></Dialog>
    <Dialog open={chargeDraft !== null} onOpenChange={open => { if (!open && !busy) setChargeDraft(null) }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[760px]"><DialogHeader><DialogTitle>{t(chargeDraft?.id ? "Edit charge code" : "Add charge code")}</DialogTitle><DialogDescription>{t("Select the quote and booking combinations where this charge can be used. Existing codes remain available everywhere until their scope is saved.")}</DialogDescription></DialogHeader>
      {chargeDraft ? <div className="space-y-4">
        {error ? <p role="alert" className="text-[13px] text-[var(--md-red)]">{t(error)}</p> : null}
        <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-[12px]">{t("Code")}<Input maxLength={80} value={chargeDraft.code} disabled={busy} onChange={event => setChargeDraft({ ...chargeDraft, code: event.target.value.toUpperCase() })} /></label><label className="space-y-1 text-[12px]">{t("Name")}<Input maxLength={180} value={chargeDraft.name} disabled={busy} onChange={event => setChargeDraft({ ...chargeDraft, name: event.target.value })} /></label></div>
        <label className="block space-y-1 text-[12px]">{t("Description")}<Input value={chargeDraft.description} disabled={busy} onChange={event => setChargeDraft({ ...chargeDraft, description: event.target.value })} /></label>
        <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-1"><label htmlFor="charge-category" className="text-[12px]">{t("Category")}</label><Select value={chargeDraft.category} disabled={busy} onValueChange={value => setChargeDraft({ ...chargeDraft, category: value })}><SelectTrigger id="charge-category"><SelectValue /></SelectTrigger><SelectContent>{categories.map(value => <SelectItem key={value} value={value}>{t(value.charAt(0).toUpperCase() + value.slice(1))}</SelectItem>)}</SelectContent></Select></div><div className="space-y-1"><label htmlFor="charge-side" className="text-[12px]">{t("Financial side")}</label><Select value={chargeDraft.side} disabled={busy} onValueChange={value => setChargeDraft({ ...chargeDraft, side: value })}><SelectTrigger id="charge-side"><SelectValue /></SelectTrigger><SelectContent>{["both", "buy", "sell", "pass_through"].map(value => <SelectItem key={value} value={value}>{t(value === "buy" ? "Cost" : value === "sell" ? "Revenue" : value === "pass_through" ? "Pass through" : "Both")}</SelectItem>)}</SelectContent></Select></div></div>
        <label className="flex items-center gap-2 text-[13px]"><Checkbox checked={chargeDraft.active} disabled={busy} onCheckedChange={checked => setChargeDraft({ ...chargeDraft, active: checked === true })} />{t("Active")}</label>
        {kinds.map(recordKind => <section key={recordKind} className="space-y-2 border-t border-[var(--md-line)] pt-3"><h4 className="text-[13px] font-medium">{t(recordKind === "quote" ? "Quotes" : "Bookings")}</h4><div className="overflow-x-auto"><table className="w-full min-w-[540px] text-[12px]"><thead><tr><th className="py-2 text-start">{t("Direction")}</th>{modes.map(mode => <th key={mode} className="py-2 text-center font-medium">{t(mode.charAt(0).toUpperCase() + mode.slice(1))}</th>)}</tr></thead><tbody>{directions.map(direction => <tr key={direction} className="border-t border-[var(--md-line)]"><th className="py-2 text-start font-medium">{t(direction === "cross_trade" ? "Cross trade" : direction.charAt(0).toUpperCase() + direction.slice(1))}</th>{modes.map(mode => { const scope = { recordKind, direction, mode }; const checked = chargeDraft.applicability.some(item => scopeKey(item) === scopeKey(scope)); return <td key={mode} className="py-2 text-center"><Checkbox aria-label={`${recordKind} ${direction} ${mode}`} checked={checked} disabled={busy} onCheckedChange={value => setChargeDraft({ ...chargeDraft, applicability: value === true ? [...chargeDraft.applicability, scope] : chargeDraft.applicability.filter(item => scopeKey(item) !== scopeKey(scope)) })} className="mx-auto" /></td> })}</tr>)}</tbody></table></div></section>)}
      </div> : null}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => setChargeDraft(null)}>{t("Cancel")}</Button><Button disabled={!editable || !chargeDraft?.code.trim() || !chargeDraft?.name.trim() || !chargeDraft.applicability.length} onClick={() => void saveCharge()}>{t("Save charge code")}</Button></DialogFooter>
    </DialogContent></Dialog>
  </SettingsPanel>
}
