/** Increment whenever calculation semantics or reference selection changes.
 * Historic results retain their original versions and are never rewritten. */
export const CALCULATION_VERSION = "2026-09-15.70"
export const PRECISION_POLICY = "estimate-exact-rational-half-up-2dp-v1"

export function calculationUsesCurrentRules(result: { version?: unknown; precisionPolicy?: unknown } | null | undefined): boolean {
  return result?.version === CALCULATION_VERSION && result?.precisionPolicy === PRECISION_POLICY
}
