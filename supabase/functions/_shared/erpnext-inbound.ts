import { erpNextOrigin, erpNextRequest } from "./erpnext.ts"
import { accountingDecimal } from "./accounting-readback.ts"
import { compareErpNextReadback } from "./erpnext-readback.ts"
import type { CanonicalFinanceExport } from "./accounting-providers.ts"

const object = (value: unknown): Record<string, any> => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, any> : {}
const version = (value: unknown) => typeof value === "string" && /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d{1,6})?$/.test(value) ? value.replace("T", " ").slice(0, 19) + "." + (value.split(".")[1] || "").padEnd(6, "0") : null

/** Pure comparison of current provider state, never trusting webhook financial fields. */
export function evaluateErpNextInbound(event: Record<string, any>, reference: Record<string, any> | null, document: unknown) {
  const actual = object(document)
  const review = (message: string, details?: unknown) => ({ outcome: "review", message, details })
  if (actual.name !== event.ACCIWH_ExternalID || actual.doctype !== event.ACCIWH_ExternalObjectType || actual.company !== event.ACCIWH_ExternalCompany) {
    return review("ERPNext returned a different document identity or company.")
  }
  const receivedVersion = version(event.ACCIWH_ExternalModifiedAt)
  const currentVersion = version(actual.modified)
  if (!receivedVersion || !currentVersion || currentVersion < receivedVersion) return { outcome: "retry", message: "ERPNext has not returned a verifiable current document version." }
  // Late delivery reads current state, so it cannot revert newer local evidence.
  if (!reference) return review("This ERPNext record has no unique linked Multideck transaction. Review it before importing or posting anything.")
  if (reference.ACCIER_SyncStatusCode !== "synced") return { outcome: "retry", message: "The linked Multideck delivery has not completed verification." }
  const retained = object(reference.ACCIER_LastPayloadJSON)
  const canonical = object(retained.multideckCanonicalExport)
  if (canonical.providerCode !== "erpnext" || canonical.externalCompany !== event.ACCIWH_ExternalCompany || canonical.localId !== reference.ACCIER_LocalID || canonical.localTable !== reference.ACCIER_LocalTable || !Array.isArray(canonical.lines) || !Array.isArray(canonical.allocations)) {
    return review("This earlier delivery has no complete approved comparison snapshot. It requires a reviewed reconciliation.")
  }
  if (!["FIN_Documents", "FIN_CashTransactions"].includes(canonical.localTable)) return review("This record type has no supported delivery comparison.")
  const comparison = compareErpNextReadback(canonical as CanonicalFinanceExport, actual, event.ACCIWH_ExternalID, 1)
  if (comparison.status !== "matched") return review("ERPNext differs from the approved Multideck transaction. Review the incoming change.", comparison)
  // Settlement is a separate lifecycle. A delivery match must not silently
  // acknowledge a provider-side payment/write-off that changed outstanding.
  if (canonical.localTable === "FIN_Documents" && (accountingDecimal(actual.outstanding_amount) === null || accountingDecimal(retained.outstanding_amount) === null || accountingDecimal(actual.outstanding_amount) !== accountingDecimal(retained.outstanding_amount))) {
    return review("ERPNext outstanding balance changed. Reconcile the payment or adjustment with Multideck.")
  }
  return { outcome: "matched", message: "Current ERPNext document matches the retained approved delivery. Ledger and balance reconciliation remain separate.", referenceId: reference.ACCIER_ID, expectedPayload: retained, providerModified: actual.modified, comparison }
}

export async function processErpNextInbound(admin: any, read = async (type: string, name: string) => {
  const payload = await erpNextRequest<{ data?: unknown }>(`/api/resource/${encodeURIComponent(type)}/${encodeURIComponent(name)}`, { exactNumbers: true })
  return payload.data
}) {
  const claimed = await admin.rpc("multideck_erpnext_claim_inbound", { p_limit: 5 })
  if (claimed.error || !Array.isArray(claimed.data)) throw new Error("Incoming ERPNext changes could not be claimed")
  return await Promise.all(claimed.data.map(async (event: Record<string, any>) => {
    let result: Record<string, unknown>
    let reviewedSite: string | null = null
    try {
      const connection = await admin.from("ACCI_Connections").select("ACCIC_StatusCode,ACCIC_ProviderCode,ACCIC_ExternalTenantName,ACCIC_LegalEntityID,ACCIC_SettingsJSON").eq("ACCIC_ID", event.ACCIWH_ConnectionID).maybeSingle()
      if (connection.error) throw new Error("Connection read failed")
      const c = connection.data
      reviewedSite = c?.ACCIC_SettingsJSON?.partySync?.siteOrigin ?? null
      const entity = c ? await admin.from("cmp_LegalEntities").select("Company_ID,LegalEntity_IsActive").eq("LegalEntity_ID", c.ACCIC_LegalEntityID).maybeSingle() : null
      if (entity?.error) throw new Error("Entity read failed")
      // The shared transport has one tenant secret: bind it to the explicitly
      // reviewed site before reading confidential provider records.
      if (!c || c.ACCIC_StatusCode !== "active" || c.ACCIC_ProviderCode !== "erpnext" || c.ACCIC_ExternalTenantName !== event.ACCIWH_ExternalCompany || !entity?.data?.LegalEntity_IsActive || !entity.data.Company_ID || c.ACCIC_SettingsJSON?.partySync?.siteOrigin !== erpNextOrigin()) {
        result = { outcome: "review", message: "The ERPNext company, legal entity or reviewed site is not active and bound to this connection." }
      } else {
        const refs = await admin.from("ACCI_ExternalRefs").select("*").eq("ACCIER_ConnectionID", event.ACCIWH_ConnectionID).eq("ACCIER_ExternalObjectType", event.ACCIWH_ExternalObjectType).eq("ACCIER_ExternalID", event.ACCIWH_ExternalID).limit(2)
        if (refs.error) throw new Error("Reference read failed")
        if (!["Sales Invoice", "Purchase Invoice", "Payment Entry"].includes(event.ACCIWH_ExternalObjectType)) {
          result = { outcome: "review", message: "The ERPNext bank account changed. Review its mapping and controls in Finance setup." }
        } else {
          result = evaluateErpNextInbound(event, refs.data?.length === 1 ? refs.data[0] : null, await read(event.ACCIWH_ExternalObjectType, event.ACCIWH_ExternalID))
        }
      }
    } catch {
      result = { outcome: "retry", message: "ERPNext incoming change could not be checked. The retained event will be retried." }
    }
    if (new TextEncoder().encode(JSON.stringify(result)).byteLength > 120_000) {
      result = { outcome: "review", message: "The provider evidence exceeds the automatic comparison limit. Review the retained event and transaction." }
    }
    const finished = await admin.rpc("multideck_erpnext_finish_inbound", { p_id: event.ACCIWH_ID, p_token: event.ACCIWH_LeaseToken, p_result: { ...result, reviewedSite } })
    if (finished.error) throw new Error("Incoming ERPNext result could not be retained")
    return { receiptId: event.ACCIWH_ID, completed: finished.data === true }
  }))
}
