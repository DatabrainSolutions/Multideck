export const PERIOD_DOMAINS = ["documents", "allocations", "journal_lines", "tax_lines", "trial_balance", "controls"] as const
export type PeriodDomain = typeof PERIOD_DOMAINS[number]
export type EvidenceRecord = { identity: string; values: Record<string, string | number | boolean | null>; sourceId: string; sourceVersion?: string | null }
export type DomainEvidence = { complete: boolean; pages: number; count: number; hash: string; rows: EvidenceRecord[] }
export type PeriodEvidence = { providerCode: string; company: string; entityId: string; periodId: string; currency: string; from: string; to: string; cutoff: string; checkpoint: string; mappingRevision: string; domains: Record<PeriodDomain, DomainEvidence> }
export type PeriodDifference = { domain: PeriodDomain; identity: string; kind: "missing_provider" | "external_only" | "conflict" | "changed" | "duplicate_local" | "duplicate_provider"; local: EvidenceRecord | null; provider: EvidenceRecord | null; common: Record<string, unknown> | null }

const shaPattern = /^[a-f0-9]{64}$/
const isoDate = /^\d{4}-\d{2}-\d{2}$/

function same(value: unknown, other: unknown): boolean {
  const canonical = (item: unknown): string => JSON.stringify(item, Object.keys((item && typeof item === "object" ? item : {}) as object).sort())
  return canonical(value) === canonical(other)
}

function index(rows: EvidenceRecord[]) {
  const result = new Map<string, EvidenceRecord>(), duplicates = new Set<string>()
  for (const row of rows) {
    if (!row.identity || !row.sourceId || !row.values || typeof row.values !== "object" || Array.isArray(row.values)) throw new Error("Reconciliation evidence contains an invalid record.")
    if (result.has(row.identity)) duplicates.add(row.identity)
    else result.set(row.identity, row)
  }
  return { result, duplicates }
}

export function compareFinancePeriod(local: PeriodEvidence, provider: PeriodEvidence, commonSnapshots: Record<string, Record<string, unknown>> = {}) {
  const issues: string[] = []
  const differences: PeriodDifference[] = []
  if (!local || !provider || local.entityId !== provider.entityId || local.periodId !== provider.periodId || local.company !== provider.company || local.providerCode !== provider.providerCode ||
    local.currency !== provider.currency || local.from !== provider.from || local.to !== provider.to || !isoDate.test(local.from) || !isoDate.test(local.to) || local.from > local.to ||
    !local.cutoff || local.cutoff !== provider.cutoff || !local.checkpoint || !provider.checkpoint || !local.mappingRevision || local.mappingRevision !== provider.mappingRevision) {
    issues.push("The entity, provider company, period, currency, cut-off, checkpoint or mapping revision is incomplete or inconsistent.")
  }
  for (const domain of PERIOD_DOMAINS) {
    const left = local?.domains?.[domain], right = provider?.domains?.[domain]
    if (!left || !right || !left.complete || !right.complete || !Number.isSafeInteger(left.pages) || !Number.isSafeInteger(right.pages) || left.pages < 1 || right.pages < 1 ||
      !Number.isSafeInteger(left.count) || !Number.isSafeInteger(right.count) || left.count !== left.rows?.length || right.count !== right.rows?.length ||
      !shaPattern.test(left.hash || "") || !shaPattern.test(right.hash || "")) {
      issues.push(`${domain} has a missing, partial or invalid read.`)
      continue
    }
    const a = index(left.rows), b = index(right.rows)
    for (const identity of a.duplicates) differences.push({ domain, identity, kind: "duplicate_local", local: a.result.get(identity) ?? null, provider: b.result.get(identity) ?? null, common: null })
    for (const identity of b.duplicates) differences.push({ domain, identity, kind: "duplicate_provider", local: a.result.get(identity) ?? null, provider: b.result.get(identity) ?? null, common: null })
    for (const identity of new Set([...a.result.keys(), ...b.result.keys()])) {
      if (a.duplicates.has(identity) || b.duplicates.has(identity)) continue
      const localRow = a.result.get(identity) ?? null, providerRow = b.result.get(identity) ?? null
      if (localRow && providerRow && same(localRow.values, providerRow.values)) continue
      const common = commonSnapshots[`${domain}:${identity}`] ?? null
      let kind: PeriodDifference["kind"]
      if (!providerRow) kind = "missing_provider"
      else if (!localRow) kind = "external_only"
      else if (common && !same(localRow.values, common) && !same(providerRow.values, common)) kind = "conflict"
      else if (common && same(localRow.values, common)) kind = "external_only"
      else kind = "changed"
      differences.push({ domain, identity, kind, local: localRow, provider: providerRow, common })
    }
  }
  return { status: issues.length ? "incomplete" as const : differences.length ? "differences" as const : "verified" as const, issues, differences,
    counts: Object.fromEntries(PERIOD_DOMAINS.map(domain => [domain, { local: local.domains?.[domain]?.count ?? null, provider: provider.domains?.[domain]?.count ?? null }])) }
}

export async function evidenceHash(value: unknown): Promise<string> {
  const encoded = new TextEncoder().encode(JSON.stringify(value))
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", encoded))].map(byte => byte.toString(16).padStart(2, "0")).join("")
}
