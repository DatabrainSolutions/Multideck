import type { GlAccount, JournalLine } from "./finance-ledger-api"

export function parseJournalCsv(text: string, delimiter: "," | ";" | "\t" = ","): Array<{ number: number; values: string[] }> {
  if (![",", ";", "\t"].includes(delimiter)) throw new Error("Choose comma, semicolon or tab as the file separator.")
  const rows: Array<{ number: number; values: string[] }> = []
  let values: string[] = [], value = "", quoted = false, closed = false
  const cell = () => { values.push(value); value = ""; closed = false }
  const row = () => { cell(); rows.push({ number: rows.length + 1, values }); values = [] }
  text = text.replace(/^\uFEFF/, "")
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { value += '"'; i++ } else { quoted = false; closed = true }
      } else value += c
    } else if (c === delimiter) cell()
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row() }
    else if (c === '"' && !value && !closed) quoted = true
    else {
      if (closed || c === '"') throw new Error("The CSV contains invalid quotation marks.")
      value += c
    }
  }
  if (quoted) throw new Error("The CSV contains an unclosed quoted value.")
  if (value || values.length || closed) row()
  return rows
}

export function journalLinesFromRows(rows: Array<{ number: number; values: string[] }>, accounts: GlAccount[]): JournalLine[] {
  const populated = rows.filter(row => row.values.some(value => value.trim()))
  if (!populated.length) throw new Error("The file is empty.")
  const headers = populated[0].values.map(value => value.trim().toLowerCase())
  const accountColumns = headers.flatMap((value, i) => ["account", "account code", "nominal code"].includes(value) ? [i] : [])
  const debitColumns = headers.flatMap((value, i) => value === "debit" ? [i] : [])
  const creditColumns = headers.flatMap((value, i) => value === "credit" ? [i] : [])
  if (accountColumns.length !== 1 || debitColumns.length !== 1 || creditColumns.length !== 1) throw new Error("Use one Account code, Debit and Credit column in the first row.")
  const data = populated.slice(1)
  if (data.length < 2 || data.length > 200) throw new Error("Import between 2 and 200 journal lines.")
  const amount = (value: string, number: number) => {
    const result = value.trim() || "0"
    if (!/^\d{1,12}(\.\d{1,4})?$/.test(result)) throw new Error(`Row ${number}: use non-negative amounts with a decimal point and at most four decimal places, without currency symbols or thousands separators.`)
    return result
  }
  return data.map(row => {
    const code = (row.values[accountColumns[0]] ?? "").trim()
    const matches = accounts.filter(account => account.FINNom_Code.toLowerCase() === code.toLowerCase())
    if (matches.length !== 1) throw new Error(`Row ${row.number}: account code "${code}" is unknown or ambiguous in this legal entity.`)
    const account = matches[0]
    if (!account.FINNom_IsActive || !account.FINNom_AllowManualPosting || account.FINNom_IsControlAccount) throw new Error(`Row ${row.number}: account ${code} does not allow manual journals.`)
    const debit = amount(row.values[debitColumns[0]] ?? "", row.number)
    const credit = amount(row.values[creditColumns[0]] ?? "", row.number)
    if ((Number(debit) > 0) === (Number(credit) > 0)) throw new Error(`Row ${row.number}: enter either a debit or a credit, not both.`)
    return { accountId: account.FINNom_ID, description: account.FINNom_Name, debit, credit }
  })
}

export async function importJournalFile(file: File, accounts: GlAccount[]): Promise<JournalLine[]> {
  if (file.size > 5 * 1024 * 1024) throw new Error("Choose a file of 5 MB or smaller.")
  const extension = file.name.split(".").pop()?.toLowerCase()
  if (extension === "csv") return journalLinesFromRows(parseJournalCsv(await file.text()), accounts)
  if (extension === "xlsx") {
    const { readFinanceWorkbookRows } = await import("./finance-document-excel")
    return journalLinesFromRows(await readFinanceWorkbookRows(file, true), accounts)
  }
  throw new Error("Choose an Excel .xlsx file or a comma-separated .csv file.")
}
