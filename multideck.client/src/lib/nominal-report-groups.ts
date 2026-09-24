export type ProfitLossAccount = {
  accountId: string; accountCode: string; accountName: string; category: string; amount: number
}
type ReportGroup = { id: string; legal_entity_id: string; code: string; name: string; kind: "cost" | "revenue" }
type ReportMember = { account_id: string; group_id: string; role: "actual" | "accrued" }
export type GroupedProfitLoss = {
  groups: Array<{ id: string; code: string; name: string; actual: number; accrued: number; total: number; accounts: Array<ProfitLossAccount & { role: "actual" | "accrued" }> }>
  ungrouped: ProfitLossAccount[]
  total: number
}

// The report supplies signed profit contributions, not lifetime job balances.
// Group period movements without reclassifying unmapped or historical accounts.
export function groupProfitLoss(entityId: string, rows: ProfitLossAccount[], groups: ReportGroup[], members: ReportMember[], reportedTotal: number): GroupedProfitLoss {
  const units = (value: number) => {
    const scaled = Math.round(value * 10000)
    if (!Number.isFinite(value) || !Number.isSafeInteger(scaled)) throw new Error("The grouped report amount exceeds the supported precision.")
    return BigInt(scaled)
  }
  const amount = (value: bigint) => {
    const scaled = Number(value)
    if (!Number.isSafeInteger(scaled)) throw new Error("The grouped report total exceeds the supported precision.")
    return scaled / 10000
  }
  const groupById = new Map(groups.map(group => [group.id, group]))
  if (groupById.size !== groups.length || groups.some(group => group.legal_entity_id !== entityId)) throw new Error("Nominal groups do not match the report's legal entity.")
  const memberByAccount = new Map<string, ReportMember>()
  const roles = new Set<string>()
  for (const member of members) {
    const key = `${member.group_id}:${member.role}`
    if (!groupById.has(member.group_id) || memberByAccount.has(member.account_id) || roles.has(key) || !["actual", "accrued"].includes(member.role)) throw new Error("Nominal group membership is inconsistent. Review the nominal setup.")
    roles.add(key); memberByAccount.set(member.account_id, member)
  }
  if (groups.some(group => !roles.has(`${group.id}:actual`) || !roles.has(`${group.id}:accrued`))) throw new Error("Each nominal group needs an actual and an accrued account.")
  const result: GroupedProfitLoss = { groups: [], ungrouped: [], total: 0 }
  const buckets = new Map<string, { actual: bigint; accrued: bigint; accounts: GroupedProfitLoss["groups"][number]["accounts"] }>()
  const seen = new Set<string>()
  let total = 0n
  for (const row of rows) {
    if (seen.has(row.accountId) || !["income", "direct_cost", "expense", "finance"].includes(row.category)) throw new Error("The P&L contains duplicate accounts or a balance-sheet account.")
    seen.add(row.accountId)
    const value = units(row.amount)
    total += value
    const member = memberByAccount.get(row.accountId)
    if (!member) { result.ungrouped.push(row); continue }
    const group = groupById.get(member.group_id)!
    if (group.kind === "revenue" ? row.category !== "income" : !["direct_cost", "expense"].includes(row.category)) throw new Error("A nominal group's P&L classification has changed. Review the nominal setup.")
    const bucket = buckets.get(group.id) ?? { actual: 0n, accrued: 0n, accounts: [] }
    bucket[member.role] += value
    bucket.accounts.push({ ...row, role: member.role })
    buckets.set(group.id, bucket)
  }
  if (total !== units(reportedTotal)) throw new Error("The grouped P&L does not reconcile to the ledger report total.")
  result.groups = groups.filter(group => buckets.has(group.id)).map(group => {
    const bucket = buckets.get(group.id)!
    return { id: group.id, code: group.code, name: group.name, actual: amount(bucket.actual), accrued: amount(bucket.accrued), total: amount(bucket.actual + bucket.accrued), accounts: bucket.accounts }
  })
  result.total = amount(total)
  return result
}
