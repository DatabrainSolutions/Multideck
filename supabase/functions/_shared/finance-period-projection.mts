import { evidenceHash, PERIOD_DOMAINS, type DomainEvidence, type EvidenceRecord, type PeriodDomain, type PeriodEvidence } from "./finance-period-comparison.mts"

type AnyRow = Record<string, any>
type RawLocal = { entityId: string; periodId: string; from: string; to: string; currency: string; company: string; providerCode: string; connectionUpdatedAt: string; documents: AnyRow[]; documentLines: AnyRow[]; cash: AnyRow[]; allocations: AnyRow[]; taxes: AnyRow[]; postingLines: AnyRow[]; nominals: AnyRow[]; externalRefs: AnyRow[]; accountMappings: AnyRow[]; taxMappings: AnyRow[]; partyMappings: AnyRow[]; banks: AnyRow[]; journals: AnyRow[]; openingPackages?: AnyRow[] }
type RawProvider = { providerCode: string; company: string; checkpoint: string; details: Record<string, AnyRow[]>; counts: Record<string, { count: number; pages: number; hash: string }> }

const text = (value: unknown) => value == null ? "" : String(value)
function accountingDecimal(value: unknown): bigint | null {
  if (typeof value !== "string" && typeof value !== "number") return null
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(String(value))
  if (!match) return null
  const exponent = Number(match[4] ?? 0)
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 30) return null
  const shift = 9 + exponent - (match[3] ?? "").length
  let digits = BigInt(match[2] + (match[3] ?? ""))
  if (shift < 0) { const divisor = 10n ** BigInt(-shift); if (digits % divisor !== 0n) return null; digits /= divisor }
  else digits *= 10n ** BigInt(shift)
  return match[1] ? -digits : digits
}
function decimal(value: unknown): string {
  const units = accountingDecimal(value)
  if (units === null) throw new Error("Accounting source contains an invalid or overly precise decimal.")
  const abs = units < 0n ? -units : units
  return `${units < 0n ? "-" : ""}${abs / 1_000_000_000n}.${String(abs % 1_000_000_000n).padStart(9, "0")}`
}
function amount(units: bigint) {
  const abs = units < 0n ? -units : units
  return `${units < 0n ? "-" : ""}${abs / 1_000_000_000n}.${String(abs % 1_000_000_000n).padStart(9, "0")}`
}
const units = (value: unknown) => accountingDecimal(value) ?? (() => { throw new Error("Accounting source contains an invalid amount.") })()
const record = (identity: string, values: EvidenceRecord["values"], sourceId: string, sourceVersion: string | null = null): EvidenceRecord => ({ identity, values, sourceId, sourceVersion })

function mapUnique(rows: AnyRow[], key: (row: AnyRow) => string, value: (row: AnyRow) => string, label: string) {
  const result = new Map<string, string>()
  for (const row of rows) {
    const k = key(row), v = value(row)
    if (!k || !v || (result.has(k) && result.get(k) !== v)) throw new Error(`${label} is missing or ambiguous.`)
    result.set(k, v)
  }
  return result
}

export async function projectFinancePeriod(local: RawLocal, provider: RawProvider, cutoff: string) {
  const warnings: string[] = []
  if (local.company !== provider.company || local.providerCode !== provider.providerCode || !local.currency || !local.entityId || !local.periodId || !local.from || !local.to) throw new Error("The accounting source scopes disagree.")
  const refs = mapUnique(local.externalRefs.filter(row => row.status === "synced"), row => `${row.localTable}:${row.localId}`, row => `${row.externalType}:${row.externalId}`, "External transaction identity")
  if (new Set(refs.values()).size !== refs.size) warnings.push("An external transaction identity is linked to more than one local record.")
  const openingGaps = [
    ...local.documents.filter(row => row.openingPackageId).map(row => ({ row, table: "FIN_Documents", expected: ["sl_invoice", "credit_note"].includes(row.type) ? "Sales Invoice" : "Purchase Invoice" })),
    ...local.cash.filter(row => row.openingPackageId).map(row => ({ row, table: "FIN_CashTransactions", expected: "Payment Entry" })),
  ].filter(({ row, table, expected }) => {
    const ref = refs.get(`${table}:${row.id}`)
    if (!ref?.startsWith(`${expected}:`)) return true
    const name = ref.slice(expected.length + 1)
    return !(provider.details[expected] ?? []).some(item => item.name === name && String(item.docstatus) === "1")
  })
  if (openingGaps.length) {
    const examples = openingGaps.slice(0, 8).map(({ row, table, expected }) => `${table === "FIN_Documents" ? "invoice" : "unapplied cash"} ${row.number || "unnumbered"} [${row.id}] (package ${row.openingPackageId}, needs ${expected})`)
    warnings.push(`${openingGaps.length} CargoWise opening subledger records lack a synced, submitted ERPNext readback of the required document type: ${examples.join("; ")}${openingGaps.length > examples.length ? `; and ${openingGaps.length - examples.length} more` : ""}. The opening Journal Entry mirrors GL only. Review opening invoices and payments against the exact company, reconcile their AR/AP/bank postings against the opening journal without double counting, retain each submitted provider identity and readback, then rerun the period comparison. Period parity remains incomplete.`)
  }
  const parties = mapUnique(local.partyMappings.filter(row => ["customer", "supplier", "both"].includes(row.type)), row => `${row.localId}:${row.type}`, row => row.providerId, "Party mapping")
  const accounts = mapUnique(local.accountMappings.filter(row => text(row.localContext).startsWith("nominal:")), row => text(row.localContext).slice(8), row => row.providerAccount, "Nominal mapping")
  const accountReverse = new Map<string, string>()
  for (const [id, external] of accounts) { if (accountReverse.has(external)) warnings.push(`Provider account ${external} maps to more than one local nominal.`); else accountReverse.set(external, id) }
  const nominal = new Map(local.nominals.map(row => [row.id, row]))
  const journalExternal = new Map(local.journals.map(row => [row.id, row.externalId]))
  const openingExternal = new Map((local.openingPackages ?? []).map(row => [row.id, row.mirrorStatus === "matched" && row.readbackHash ? row.externalId : null]))
  const localDocs = new Map(local.documents.map(row => [row.id, row]))
  const providerDocs = [...(provider.details["Sales Invoice"] ?? []), ...(provider.details["Purchase Invoice"] ?? [])]
  const localRows: Record<PeriodDomain, EvidenceRecord[]> = Object.fromEntries(PERIOD_DOMAINS.map(domain => [domain, []])) as Record<PeriodDomain, EvidenceRecord[]>
  const providerRows: Record<PeriodDomain, EvidenceRecord[]> = Object.fromEntries(PERIOD_DOMAINS.map(domain => [domain, []])) as Record<PeriodDomain, EvidenceRecord[]>
  const refFor = (table: string, id: string) => refs.get(`${table}:${id}`) ?? `unexported:${table}:${id}`
  const partyFor = (id: string, type: string) => parties.get(`${id}:${type}`) ?? parties.get(`${id}:both`) ?? (() => { warnings.push(`Party ${id} has no pinned ${type} mapping.`); return `unmapped:${id}` })()
  for (const doc of local.documents) {
    const sales = ["sl_invoice", "credit_note"].includes(doc.type)
    localRows.documents.push(record(refFor("FIN_Documents", doc.id), { status: doc.status === "approved" || doc.status === "submitted" ? "submitted" : doc.status,
      party: partyFor(doc.partyId, sales ? "customer" : "supplier"), currency: doc.currency, date: doc.date,
      net: decimal(doc.net), tax: decimal(doc.tax), gross: decimal(doc.gross), outstanding: decimal(doc.outstanding),
      return: ["credit_note", "debit_note"].includes(doc.type) }, doc.id, doc.updatedAt))
  }
  for (const doc of providerDocs) {
    const sales = doc.doctype === "Sales Invoice"
    providerRows.documents.push(record(`${doc.doctype}:${doc.name}`, { status: String(doc.docstatus) === "1" ? "submitted" : String(doc.docstatus) === "2" ? "cancelled" : "draft",
      party: text(sales ? doc.customer : doc.supplier), currency: text(doc.currency), date: text(doc.posting_date),
      net: decimal(doc.net_total), tax: decimal(doc.total_taxes_and_charges), gross: decimal(doc.grand_total), outstanding: decimal(doc.outstanding_amount),
      return: String(doc.is_return) === "1" }, doc.name, text(doc.modified)))
  }
  for (const cash of local.cash) {
    const identity = refFor("FIN_CashTransactions", cash.id)
    const receipt = cash.type === "customer_receipt"
    localRows.allocations.push(record(`${identity}:payment`, { status: cash.status === "approved" || cash.status === "submitted" ? "submitted" : cash.status,
      type: receipt ? "Receive" : "Pay", party: partyFor(cash.partyId, receipt ? "customer" : "supplier"), currency: cash.currency,
      date: cash.date, amount: decimal(cash.amount), unallocated: decimal(cash.unallocated) }, cash.id, cash.updatedAt))
  }
  for (const allocation of local.allocations) {
    const cash = local.cash.find(row => row.id === allocation.cashId)
    const document = localDocs.get(allocation.documentId)
    if (!cash || !document) { warnings.push(`Cash allocation ${allocation.id} has an unavailable posted source.`); continue }
    const cashRef = refFor("FIN_CashTransactions", cash.id), docRef = refFor("FIN_Documents", document.id)
    localRows.allocations.push(record(`${cashRef}:reference:${docRef}`, { amount: decimal(allocation.amount), status: allocation.status }, allocation.id))
  }
  for (const cash of provider.details["Payment Entry"] ?? []) {
    const identity = `Payment Entry:${cash.name}`
    providerRows.allocations.push(record(`${identity}:payment`, { status: String(cash.docstatus) === "1" ? "submitted" : String(cash.docstatus) === "2" ? "cancelled" : "draft",
      type: text(cash.payment_type), party: text(cash.party), currency: text(cash.paid_to_account_currency || cash.paid_from_account_currency || cash.currency),
      date: text(cash.posting_date), amount: decimal(cash.paid_amount), unallocated: decimal(cash.unallocated_amount) }, cash.name, text(cash.modified)))
    for (const reference of cash.references ?? []) providerRows.allocations.push(record(`${identity}:reference:${reference.reference_doctype}:${reference.reference_name}`,
      { amount: decimal(reference.allocated_amount), status: "allocated" }, text(reference.name || `${cash.name}:${reference.reference_name}`), text(cash.modified)))
    if ((cash.deductions ?? []).length || (cash.taxes ?? []).length) warnings.push(`Payment Entry ${cash.name} has deductions or payment taxes outside the approved cash allocation contract.`)
  }
  for (const tax of local.taxes) {
    const doc = localDocs.get(tax.documentId)
    if (!doc) { warnings.push(`Tax line ${tax.id} has no posted document.`); continue }
    localRows.tax_lines.push(record(`${refFor("FIN_Documents", doc.id)}:tax:${decimal(tax.rate)}:${tax.code}`, { amount: decimal(tax.amount), localAmount: decimal(tax.localAmount) }, tax.id))
  }
  for (const doc of providerDocs) for (const tax of doc.taxes ?? []) {
    providerRows.tax_lines.push(record(`${doc.doctype}:${doc.name}:tax:${decimal(tax.rate)}:${text(tax.description || tax.account_head)}`,
      { amount: decimal(tax.tax_amount), localAmount: decimal(tax.base_tax_amount) }, text(tax.name || `${doc.name}:${tax.idx}`), text(doc.modified)))
  }
  // Provider tax descriptions are often different from local tax codes. A
  // reviewed code mapping is required; absence is incomplete, never a match.
  const taxMap = mapUnique(local.taxMappings, row => `${row.localCode}:${row.direction}`, row => row.providerCode, "Tax mapping")
  localRows.tax_lines = localRows.tax_lines.map(tax => {
    const match = /^(.*):tax:([^:]+):([^:]+)$/.exec(tax.identity)
    if (!match) return tax
    const document = local.documents.find(doc => refFor("FIN_Documents", doc.id) === match[1])
    const direction = document && ["sl_invoice", "credit_note"].includes(document.type) ? "sales" : "purchase"
    const mapped = taxMap.get(`${match[3]}:${direction}`)
    if (!mapped) warnings.push(`Tax code ${match[3]} has no pinned ${direction} mapping.`)
    return { ...tax, identity: `${match[1]}:tax:${match[2]}:${mapped || `unmapped:${match[3]}`}` }
  })
  const localLines = local.postingLines.filter(line => line.periodId === local.periodId)
  const providerLines = (provider.details["GL Entry"] ?? []).filter(line => line.posting_date >= local.from && line.posting_date <= local.to)
  function voucher(line: AnyRow) {
    if (line.sourceTable === "FIN_Journals") return journalExternal.get(line.sourceId) ? `Journal Entry:${journalExternal.get(line.sourceId)}` : `unexported:FIN_Journals:${line.sourceId}`
    if (line.sourceTable === "FIN_OpeningBalancePackages") return openingExternal.get(line.sourceId) ? `Journal Entry:${openingExternal.get(line.sourceId)}` : `unexported:FIN_OpeningBalancePackages:${line.sourceId}`
    return refFor(line.sourceTable, line.sourceId)
  }
  const localOrdinals = new Map<string, number>()
  for (const line of localLines) {
    const account = accounts.get(line.nominalId)
    if (!account) warnings.push(`Nominal ${line.nominalId} has no pinned provider account.`)
    const key = `${voucher(line)}:${account || `unmapped:${line.nominalId}`}`
    const ordinal = (localOrdinals.get(key) ?? 0) + 1; localOrdinals.set(key, ordinal)
    localRows.journal_lines.push(record(`${key}:${ordinal}`, { debit: decimal(line.debit), credit: decimal(line.credit), cancelled: false }, line.id, line.postedAt))
  }
  const providerOrdinals = new Map<string, number>()
  for (const line of providerLines) {
    const account = accountReverse.get(text(line.account))
    if (!account) warnings.push(`ERPNext GL account ${line.account} has no pinned Multideck nominal.`)
    const key = `${line.voucher_type}:${line.voucher_no}:${text(line.account)}`
    const ordinal = (providerOrdinals.get(key) ?? 0) + 1; providerOrdinals.set(key, ordinal)
    providerRows.journal_lines.push(record(`${key}:${ordinal}`, { debit: decimal(line.debit), credit: decimal(line.credit), cancelled: String(line.is_cancelled) === "1" }, line.name, text(line.modified)))
  }
  const trial = (lines: AnyRow[], localSide: boolean) => {
    const totals = new Map<string, { opening: bigint; debit: bigint; credit: bigint }>()
    for (const line of lines) {
      const account = localSide ? accounts.get(line.nominalId) : text(line.account)
      if (!account) { warnings.push(`${localSide ? "Local" : "Provider"} trial balance has an unmapped account.`); continue }
      const values = totals.get(account) ?? { opening: 0n, debit: 0n, credit: 0n }
      const debit = units(line.debit), credit = units(line.credit)
      const date = localSide ? line.periodEnd : line.posting_date
      if (date < local.from) values.opening += debit - credit
      else if (date <= local.to) { values.debit += debit; values.credit += credit }
      totals.set(account, values)
    }
    return [...totals].sort(([a], [b]) => a.localeCompare(b)).map(([account, values]) => record(account,
      { opening: amount(values.opening), debit: amount(values.debit), credit: amount(values.credit), closing: amount(values.opening + values.debit - values.credit) }, account))
  }
  localRows.trial_balance = trial(local.postingLines, true)
  providerRows.trial_balance = trial(provider.details["GL Entry"] ?? [], false)
  const sumBalances = (rows: EvidenceRecord[], predicate: (id: string) => boolean) => rows.filter(row => predicate(row.identity)).reduce((sum, row) => sum + units(row.values.closing), 0n)
  const controlAccounts = { ar: new Set<string>(), ap: new Set<string>(), cash: new Set<string>() }
  for (const [id, n] of nominal) {
    const mapped = accounts.get(id)
    if (!mapped) continue
    if (n.type === "Receivable" || n.control === "receivables") controlAccounts.ar.add(mapped)
    if (n.type === "Payable" || n.control === "payables") controlAccounts.ap.add(mapped)
  }
  for (const bank of local.banks) if (bank.active && bank.nominalId && accounts.get(bank.nominalId)) controlAccounts.cash.add(accounts.get(bank.nominalId)!)
  if (!controlAccounts.ar.size || !controlAccounts.ap.size || !controlAccounts.cash.size) warnings.push("AR, AP or cash control mapping is missing.")
  for (const [side, rows] of [["local", localRows], ["provider", providerRows]] as const) {
    const tb = rows.trial_balance
    for (const [name, set] of Object.entries(controlAccounts) as Array<[keyof typeof controlAccounts, Set<string>]>) {
      rows.controls.push(record(name, { ledger: amount(sumBalances(tb, id => set.has(id))) }, `${side}:${name}`))
    }
    const documents = rows.documents.filter(item => item.values.status === "submitted")
    rows.controls.push(record("ar_open", { amount: amount(documents.filter(item => item.identity.startsWith("Sales Invoice:")).reduce((sum, item) => sum + units(item.values.outstanding), 0n)) }, `${side}:ar_open`))
    rows.controls.push(record("ap_open", { amount: amount(documents.filter(item => item.identity.startsWith("Purchase Invoice:")).reduce((sum, item) => sum + units(item.values.outstanding), 0n)) }, `${side}:ap_open`))
  }
  for (const source of [localRows, providerRows]) {
    const get = (identity: string) => source.controls.find(item => item.identity === identity)?.values
    if (get("ar")?.ledger !== get("ar_open")?.amount || amount(-units(get("ap")?.ledger)) !== get("ap_open")?.amount) warnings.push("AR/AP outstanding does not reconcile to its ledger control.")
  }
  const mappingRevision = await evidenceHash({ accountMappings: local.accountMappings, taxMappings: local.taxMappings, partyMappings: local.partyMappings, banks: local.banks, connectionUpdatedAt: local.connectionUpdatedAt })
  const make = async (side: Record<PeriodDomain, EvidenceRecord[]>, isProvider: boolean): Promise<PeriodEvidence> => {
    const domains = {} as Record<PeriodDomain, DomainEvidence>
    for (const domain of PERIOD_DOMAINS) {
      const rows = side[domain]
      domains[domain] = { complete: warnings.length === 0, pages: isProvider ? Math.max(1, Object.values(provider.counts).reduce((sum, item) => sum + item.pages, 0)) : 1,
        count: rows.length, hash: await evidenceHash(rows), rows }
    }
    return { providerCode: local.providerCode, company: local.company, entityId: local.entityId, periodId: local.periodId, currency: local.currency,
      from: local.from, to: local.to, cutoff, checkpoint: isProvider ? provider.checkpoint : await evidenceHash(local.postingLines), mappingRevision, domains }
  }
  return { local: await make(localRows, false), provider: await make(providerRows, true), warnings, mappingRevision }
}
