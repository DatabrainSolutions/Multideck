/** Exact rational arithmetic. No IEEE-754 money and no intermediate rounding.
 * Display rounding is explicitly an ESTIMATE policy, not a claim about CDS. */
export class Decimal {
  readonly n: bigint
  readonly d: bigint
  constructor(n: bigint, d = 1n) {
    if (d <= 0n) throw new Error("Invalid decimal denominator")
    const gcd = (a: bigint, b: bigint): bigint => b ? gcd(b, a % b) : a
    const g = gcd(n < 0n ? -n : n, d)
    this.n = n / g; this.d = d / g
  }
  static parse(value: string) {
    if (typeof value !== "string" || !/^-?\d{1,24}(\.\d{1,12})?$/.test(value)) throw new Error("Enter a valid decimal amount (up to 12 decimal places).")
    const [whole, fraction = ""] = value.split(".")
    return new Decimal(BigInt(whole + fraction), 10n ** BigInt(fraction.length))
  }
  add(b: Decimal) { return new Decimal(this.n * b.d + b.n * this.d, this.d * b.d) }
  sub(b: Decimal) { return new Decimal(this.n * b.d - b.n * this.d, this.d * b.d) }
  mul(b: Decimal) { return new Decimal(this.n * b.n, this.d * b.d) }
  div(b: Decimal) {
    if (b.n === 0n) throw new Error("The allocation or conversion denominator is zero.")
    return new Decimal(this.n * b.d * (b.n < 0n ? -1n : 1n), this.d * (b.n < 0n ? -b.n : b.n))
  }
  compare(b: Decimal) { const v = this.n * b.d - b.n * this.d; return v < 0n ? -1 : v > 0n ? 1 : 0 }
  /** Truncate towards zero at an explicit calculation stage, preserving the
   * original rational value. This is not the default display rounding policy. */
  truncate(places: number) {
    if (!Number.isInteger(places) || places < 0 || places > 12) throw new Error("Truncation precision must be an integer between 0 and 12.")
    const scale = 10n ** BigInt(places)
    return new Decimal(this.n * scale / this.d, scale)
  }
  fixed(places = 2) {
    const scale = 10n ** BigInt(places), negative = this.n < 0n
    const numerator = (negative ? -this.n : this.n) * scale
    const rounded = numerator / this.d + (numerator % this.d * 2n >= this.d ? 1n : 0n)
    const digits = rounded.toString().padStart(places + 1, "0")
    return `${negative && rounded !== 0n ? "-" : ""}${places ? `${digits.slice(0, -places)}.${digits.slice(-places)}` : digits}`
  }
  evidence() { return { numerator: this.n.toString(), denominator: this.d.toString() } }
}
export const zero = () => Decimal.parse("0")
export const sum = (values: Decimal[]) => values.reduce((a, b) => a.add(b), zero())

/** Largest remainder, stable item-ID tie break. Display allocations reconcile
 * to the displayed shared cost; exact shares remain the calculation basis. */
export function allocate(total: Decimal, weights: { id: string; value: Decimal }[]) {
  if (!weights.length || weights.some(w => w.value.n < 0n)) throw new Error("Select eligible items with non-negative allocation weights.")
  if (new Set(weights.map(w => w.id)).size !== weights.length) throw new Error("Allocation item references must be unique.")
  if (total.n < 0n) throw new Error("Enter costs as positive amounts and choose addition or deduction.")
  const denominator = sum(weights.map(w => w.value))
  if (denominator.n === 0n) throw new Error("Complete the eligible item values or gross weights before allocating this cost.")
  const rows = weights.map(w => {
    const exact = total.mul(w.value).div(denominator)
    const cents = exact.n * 100n / exact.d
    return { id: w.id, exact, cents, remainder: new Decimal(exact.n * 100n % exact.d, exact.d) }
  })
  let remaining = BigInt(total.fixed(2).replace(".", "")) - rows.reduce((a, b) => a + b.cents, 0n)
  for (const row of [...rows].sort((a, b) => b.remainder.compare(a.remainder) || (a.id < b.id ? -1 : 1))) {
    if (remaining-- > 0n) row.cents++
  }
  return rows.map(row => ({ id: row.id, exact: row.exact, displayed: new Decimal(row.cents, 100n).fixed(2) }))
}
