// Shared comparison rules for accounting adapters. No implicit monetary tolerance:
// a provider rounding difference needs review, never a silently accepted write-off.
export function accountingDecimal(value: unknown): bigint | null {
  if (typeof value !== "number" && typeof value !== "string") return null
  if (typeof value === "number" && !Number.isFinite(value)) return null
  const text = String(value)
  if (text.length > 80) return null
  const match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text)
  if (!match) return null
  const exponent = Number(match[4] ?? 0)
  if (!Number.isSafeInteger(exponent) || Math.abs(exponent) > 30) return null
  const fraction = match[3] ?? ""
  const shift = 9 + exponent - fraction.length
  let digits = BigInt(match[2] + fraction)
  if (shift < 0) {
    const divisor = 10n ** BigInt(-shift)
    if (digits % divisor !== 0n) return null
    digits /= divisor
  } else digits *= 10n ** BigInt(shift)
  return match[1] ? -digits : digits
}

export type AccountingDifference = { field: string; expected: unknown; actual: unknown }

export function accountingComparison() {
  const differences: AccountingDifference[] = []
  const record = (field: string, expected: unknown, actual: unknown) => {
    differences.push({ field, expected: expected ?? null, actual: actual ?? null })
  }
  return {
    differences,
    text(field: string, expected: unknown, actual: unknown) {
      if (typeof expected !== "string" || !expected || actual !== expected) record(field, expected, actual)
    },
    decimal(field: string, expected: unknown, actual: unknown) {
      const left = accountingDecimal(expected)
      const right = accountingDecimal(actual)
      if (left === null || right === null || left !== right) record(field, expected, actual)
    },
    record,
  }
}
