import { erpNextOrigin } from "./erpnext.ts"
import { fetchErpNextPeriod } from "./finance-erpnext-period.mts"
import { compareFinancePeriod, evidenceHash, PERIOD_DOMAINS, type PeriodEvidence } from "./finance-period-comparison.mts"
import { projectFinancePeriod } from "./finance-period-projection.mts"
import { hyperExtConfigured, hyperExtStatus, hyperExtRequest, parseHyperExtNominals } from "./hyperext.ts"

function checked(result: any, message: string) { if (result.error) throw new Error(`${message}: ${result.error.message}`); return result.data }
function incompleteEvidence(snapshot: any, connection: any, cutoff: string, mappingRevision: string): PeriodEvidence {
  const domains = Object.fromEntries(PERIOD_DOMAINS.map(domain => [domain, { complete: false, pages: 0, count: 0, hash: "0".repeat(64), rows: [] }])) as PeriodEvidence["domains"]
  return { providerCode: connection.ACCIC_ProviderCode, company: connection.ACCIC_ExternalTenantName, entityId: snapshot.entityId, periodId: snapshot.periodId,
    currency: snapshot.currency, from: snapshot.from, to: snapshot.to, cutoff, checkpoint: "unavailable", mappingRevision, domains }
}
function commonFrom(evidence: any) {
  const snapshots: Record<string, Record<string, unknown>> = {}
  for (const domain of PERIOD_DOMAINS) {
    const left = evidence?.sources?.local?.domains?.[domain]?.rows, right = evidence?.sources?.provider?.domains?.[domain]?.rows
    if (!Array.isArray(left) || !Array.isArray(right)) continue
    const provider = new Map(right.map((row: any) => [row.identity, row.values]))
    for (const row of left) if (provider.has(row.identity) && JSON.stringify(row.values) === JSON.stringify(provider.get(row.identity))) snapshots[`${domain}:${row.identity}`] = row.values
  }
  return snapshots
}

/** Keeps provider reads separate from the native ledger. No provider write occurs. */
export async function runFinancePeriodComparison(admin: any, actorId: string, entityId: string, periodId: string, connection: any) {
  const connectionId = connection.ACCIC_ID
  const cutoff = new Date().toISOString()
  const first = checked(await admin.rpc("multideck_finance_period_local_snapshot", { p_actor: actorId, p_entity: entityId, p_period: periodId, p_connection: connectionId }), "Local finance snapshot failed")
  const baselineHash = await evidenceHash(first)
  const mappingRevision = await evidenceHash({ accountMappings: first.accountMappings, taxMappings: first.taxMappings, partyMappings: first.partyMappings, banks: first.banks, connectionUpdatedAt: first.connectionUpdatedAt })
  let providerRaw: any = null, providerError: string | null = null, providerMetadata: Record<string, unknown> = {}
  try {
    if (connection.ACCIC_ProviderCode === "erpnext") {
      if (connection.ACCIC_SettingsJSON?.partySync?.siteOrigin !== erpNextOrigin()) throw new Error("The ERPNext Company is not bound to the reviewed site origin.")
      providerRaw = await fetchErpNextPeriod(connection.ACCIC_ExternalTenantName, first.to)
      providerMetadata = { siteOrigin: providerRaw.siteOrigin, counts: providerRaw.counts, checkpoint: providerRaw.checkpoint }
    } else if (connection.ACCIC_ProviderCode === "sage_50") {
      if (!hyperExtConfigured()) throw new Error("The tenant HyperExt Sage 50 connector is not configured.")
      const status = await hyperExtStatus()
      if (!status.sdoStatusOk || !status.odbcStatusOk || !status.companyName || status.companyName !== connection.ACCIC_ExternalTenantName || !status.sageVersion || !status.apiVersion) throw new Error("Sage 50 company, version, SDO or ODBC readiness could not be verified.")
      const nominals = parseHyperExtNominals(await hyperExtRequest("/api/nominal/"))
      providerMetadata = { status, nominalCount: nominals.length, nominalHash: await evidenceHash(nominals) }
      providerError = "HyperExt company and nominal reads succeeded, but this connector has no verified complete journal, allocation, tax and trial-balance paging contract. Period reconciliation remains incomplete."
    } else throw new Error("This accounting provider has no period reconciliation adapter.")
  } catch (error) { providerError = error instanceof Error ? error.message : "Provider period evidence could not be read." }
  const second = checked(await admin.rpc("multideck_finance_period_local_snapshot", { p_actor: actorId, p_entity: entityId, p_period: periodId, p_connection: connectionId }), "Local finance recheck failed")
  if (await evidenceHash(second) !== baselineHash) providerError = `${providerError ? `${providerError} ` : ""}Multideck accounting records changed during the provider read.`
  let local: PeriodEvidence, provider: PeriodEvidence, projectionWarnings: string[] = []
  if (!providerError && providerRaw) {
    try { const projected = await projectFinancePeriod(second, providerRaw, cutoff); local = projected.local; provider = projected.provider; projectionWarnings = projected.warnings }
    catch (error) { providerError = error instanceof Error ? error.message : "Provider accounting evidence could not be compared." }
  }
  if (providerError || !providerRaw) {
    local = incompleteEvidence(second, connection, cutoff, mappingRevision)
    provider = incompleteEvidence(second, connection, cutoff, mappingRevision)
  }
  const previous = checked(await admin.from("ACCI_PeriodReconciliationRuns").select("evidence").eq("legal_entity_id", entityId).eq("period_id", periodId).eq("connection_id", connectionId).eq("status", "verified").order("completed_at", { ascending: false }).limit(1).maybeSingle(), "Prior reconciliation read failed")
  const comparison = compareFinancePeriod(local!, provider!, commonFrom(previous?.evidence))
  if (providerError) comparison.issues.push(providerError)
  if (projectionWarnings.length) comparison.issues.push(...projectionWarnings)
  const status = comparison.issues.length ? "incomplete" : comparison.status
  const final = { ...comparison, status }
  const sourceHash = await evidenceHash({ local, provider })
  const result = checked(await admin.rpc("multideck_finance_period_record_run", { p_actor: actorId, p_entity: entityId, p_period: periodId, p_connection: connectionId,
    p_payload: { providerCode: connection.ACCIC_ProviderCode, company: connection.ACCIC_ExternalTenantName, currency: second.currency, from: second.from, to: second.to,
      cutoff, checkpoint: provider?.checkpoint || "unavailable", mappingRevision, localHash: baselineHash, providerHash: providerRaw ? await evidenceHash(providerRaw) : "0".repeat(64),
      sources: { local, provider }, comparison: final, evidence: { sources: { local, provider }, rawLocal: second, sourceHash, providerMetadata, providerError } } }), "Reconciliation run could not be retained")
  return { ...result, comparison: final, providerMetadata }
}
