import { HttpError } from "./backend.ts"
import { ensureErpNextDocument } from "./erpnext-document-identity.ts"
import { erpNextList, erpNextRequest, erpNextSubmit } from "./erpnext.ts"

export type JournalExport = { id: string; siteOrigin: string; company: string; currency: string; date: string; description: string; lines: Array<{ account: string; debit: string; credit: string; description: string }> }
export class JournalDeliveryError extends Error {
  readonly externalId: string
  constructor(message: string, externalId: string) { super(message); this.externalId = externalId }
}

// Exact four-place integers: never use floating-point tolerances to approve a
// provider's journal amounts. Strings also preserve numeric readback tokens.
export function journalUnits(value: unknown): bigint {
  const match = String(value).match(/^(\d{1,12})(?:\.(\d{1,4})0*)?$/)
  if (!match) throw new HttpError(409, "The accounts system returned an invalid journal amount.")
  return BigInt(match[1]) * 10000n + BigInt((match[2] ?? "").padEnd(4, "0"))
}

export function verifyJournal(document: any, input: JournalExport, submitted: boolean) {
  if (document.company !== input.company || document.posting_date !== input.date || document.voucher_type !== "Journal Entry" || Number(document.docstatus) !== (submitted ? 1 : 0) || Number(document.multi_currency ?? 0) !== 0 || document.accounts?.length !== input.lines.length) throw new HttpError(409, "The ERPNext journal differs from the posted Multideck journal. Review it before retrying.")
  for (let index = 0; index < input.lines.length; index++) {
    const expected = input.lines[index], actual = document.accounts[index]
    if (actual.account !== expected.account || actual.account_currency !== input.currency || Number(actual.exchange_rate) !== 1 || actual.party || actual.reference_name ||
      journalUnits(actual.debit) !== journalUnits(expected.debit) || journalUnits(actual.credit) !== journalUnits(expected.credit) ||
      journalUnits(actual.debit_in_account_currency) !== journalUnits(expected.debit) || journalUnits(actual.credit_in_account_currency) !== journalUnits(expected.credit)) {
      throw new HttpError(409, `ERPNext journal line ${index + 1} does not match Multideck. No replacement journal has been created.`)
    }
  }
}

export async function validateErpNextJournal(input: JournalExport) {
  const debits = input.lines.reduce((sum, line) => sum + journalUnits(line.debit), 0n)
  const credits = input.lines.reduce((sum, line) => sum + journalUnits(line.credit), 0n)
  if (input.lines.length < 2 || debits <= 0n || debits !== credits) throw new HttpError(409, "The journal must balance before accounts system delivery.")
  const companies = await erpNextList("Company", ["name", "default_currency"], [["name", "=", input.company]])
  if (companies.length !== 1 || companies[0].default_currency !== input.currency) throw new HttpError(409, "Review the accounts system company and base currency before delivering this journal.")
  for (const account of new Set(input.lines.map(line => line.account))) {
    const matches = await erpNextList("Account", ["name", "company", "account_currency", "is_group", "disabled", "account_type"], [["name", "=", account]])
    const row = matches[0]
    if (matches.length !== 1 || row.company !== input.company || row.account_currency !== input.currency || Number(row.is_group) !== 0 || Number(row.disabled) !== 0 || ["Receivable", "Payable", "Bank", "Cash"].includes(String(row.account_type))) throw new HttpError(409, `Map ${account} to an active, non-control account in the linked accounts system, using ${input.currency}.`)
  }
}

export async function exportErpNextJournal(input: JournalExport) {
  await validateErpNextJournal(input)
  const payload = { doctype: "Journal Entry", voucher_type: "Journal Entry", company: input.company, posting_date: input.date, multi_currency: 0, user_remark: input.description,
    accounts: input.lines.map(line => ({ account: line.account, account_currency: input.currency, exchange_rate: 1, debit_in_account_currency: line.debit, credit_in_account_currency: line.credit, user_remark: line.description })) }
  const { externalId } = await ensureErpNextDocument({ externalCompany: input.company, localTable: "FIN_Journals", localId: input.id, typeCode: "journal" }, "Journal Entry", payload)
  const read = async () => (await erpNextRequest<{ data: any }>(`/api/resource/Journal%20Entry/${encodeURIComponent(externalId)}`, { exactNumbers: true })).data
  try {
    const before = await read()
    verifyJournal(before, input, Number(before.docstatus) === 1)
    if (Number(before.docstatus) === 0) await erpNextSubmit("Journal Entry", externalId)
    verifyJournal(await read(), input, true)
    return externalId
  } catch (error) { throw new JournalDeliveryError(error instanceof Error ? error.message : "Journal delivery could not be confirmed.", externalId) }
}
