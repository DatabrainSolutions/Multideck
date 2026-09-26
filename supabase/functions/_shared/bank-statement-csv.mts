export type StatementRow = { lineNo: number; date: string; reference: string; description: string; amount: string; balance: string }

function csvRows(source: string): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = "", quoted = false, closed = false
  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quoted) {
      if (char === '"' && source[i + 1] === '"') { cell += '"'; i++ }
      else if (char === '"') { quoted = false; closed = true }
      else cell += char
    } else if (char === '"' && !cell && !closed) quoted = true
    else if (char === ",") { row.push(cell); cell = ""; closed = false }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i++
      row.push(cell); cell = ""; closed = false
      if (row.some(value => value.trim())) rows.push(row)
      row = []
    } else {
      if (closed || char === '"') throw new Error("The statement has invalid CSV quoting.")
      cell += char
    }
  }
  if (quoted) throw new Error("The statement has an unfinished quoted value.")
  row.push(cell)
  if (row.some(value => value.trim())) rows.push(row)
  return rows
}

function money(value: string): string {
  const text = value.trim()
  if (!/^-?(?:0|[1-9]\d{0,13})(?:\.\d{1,4})?$/.test(text)) throw new Error("Statement amounts must be plain decimals with at most four places.")
  const negative = text.startsWith("-")
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".")
  const units = BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"))
  if (units > 999999999999999999n) throw new Error("A statement amount exceeds the ledger limit.")
  return `${negative && units !== 0n ? "-" : ""}${whole}.${fraction.padEnd(4, "0")}`
}

function units(value: string): bigint {
  const negative = value.startsWith("-")
  const [whole, fraction] = (negative ? value.slice(1) : value).split(".")
  const result = BigInt(whole) * 10000n + BigInt(fraction)
  return negative ? -result : result
}

/** A deliberately narrow import format. The server validates all fields and balances. */
export function parseBankStatementCsv(source: string, opening: string, closing: string, dateFrom: string, dateTo: string) {
  if (!source || new TextEncoder().encode(source).byteLength > 1_000_000) throw new Error("Choose a statement CSV smaller than 1 MB.")
  const parsed = csvRows(source.replace(/^\uFEFF/, ""))
  const header = parsed.shift()?.map(value => value.trim().toLowerCase())
  if (!header || header.join(",") !== "date,reference,description,amount,balance") throw new Error("Use the CSV columns date,reference,description,amount,balance in that order.")
  if (!parsed.length || parsed.length > 1000) throw new Error("A statement must contain between 1 and 1,000 lines.")
  const rows: StatementRow[] = []
  let prior = units(money(opening)), previousDate = ""
  for (const [index, values] of parsed.entries()) {
    if (values.length !== 5) throw new Error(`Statement row ${index + 2} has the wrong number of columns.`)
    const [date, reference, description, rawAmount, rawBalance] = values.map(value => value.trim())
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date || date < previousDate) throw new Error(`Statement row ${index + 2} has an invalid or out-of-order date.`)
    if (reference.length > 180 || description.length > 1000 || (!reference && !description)) throw new Error(`Statement row ${index + 2} needs a reference or description within the field limits.`)
    const amount = money(rawAmount), balance = money(rawBalance)
    if (units(amount) === 0n || prior + units(amount) !== units(balance)) throw new Error(`Statement row ${index + 2} does not reconcile to its running balance.`)
    rows.push({ lineNo: index + 1, date, reference, description, amount, balance })
    prior = units(balance); previousDate = date
  }
  if (prior !== units(money(closing))) throw new Error("The statement closing balance does not agree with its final line.")
  for (const value of [dateFrom, dateTo]) if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) throw new Error("Choose valid statement coverage dates.")
  if (dateFrom > rows[0].date || dateTo < rows.at(-1)!.date || dateFrom > dateTo) throw new Error("Statement coverage dates must include every line.")
  return { openingBalance: money(opening), closingBalance: money(closing), dateFrom, dateTo, rows }
}
