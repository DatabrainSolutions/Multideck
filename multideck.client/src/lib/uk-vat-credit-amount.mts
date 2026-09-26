// Keep the native ledger's four-decimal GBP values exact through operator review.
export const gbpUnits = (value: string): bigint | null => {
  if (!/^(?:0|[1-9][0-9]{0,13})(?:\.[0-9]{1,4})?$/.test(value)) return null
  const [whole, fraction = ""] = value.split(".")
  return BigInt(whole) * 10000n + BigInt(fraction.padEnd(4, "0"))
}

export const validGbpApplicationAmount = (amount: string, available: string): boolean => {
  const amountUnits = gbpUnits(amount.trim())
  const availableUnits = gbpUnits(available)
  return amountUnits !== null && availableUnits !== null && amountUnits > 0n && amountUnits <= availableUnits
}

export const exactGbp = (value: string, formatter: Intl.NumberFormat): string => {
  const [whole, fraction = ""] = value.split(".")
  return formatter.formatToParts(Number(whole)).map((part) =>
    part.type === "fraction" ? fraction.padEnd(4, "0").slice(0, 4) : part.value).join("")
}
