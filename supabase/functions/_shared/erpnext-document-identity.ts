import { HttpError } from "./backend.ts"
import { erpNextCreate, erpNextList } from "./erpnext.ts"

/** Provider uniqueness closes the lost-create-response and concurrent retry gap. */
export async function ensureErpNextDocument(input: { externalCompany: string; localTable: string; localId: string; typeCode: string }, doctype: string, payload: Record<string, unknown>) {
  const tenant = Deno.env.get("SUPABASE_URL")
  if (!tenant) throw new HttpError(503, "The accounting tenant identity is unavailable.")
  const bytes = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify([tenant, input.externalCompany, input.localTable, input.localId, input.typeCode])))
  const key = Array.from(new Uint8Array(bytes), byte => byte.toString(16).padStart(2, "0")).join("")
  const fields = await erpNextList("Custom Field", ["dt", "fieldname", "fieldtype", "unique"], [["dt", "=", doctype], ["fieldname", "=", "custom_multideck_document_key"]])
  if (fields.length !== 1 || fields[0].fieldtype !== "Data" || Number(fields[0].unique) !== 1) {
    throw new HttpError(409, "Install the unique Multideck document identity field in ERPNext before exporting this document type.")
  }
  const recover = async () => {
    const records = await erpNextList(doctype, ["name", "company", "custom_multideck_document_key"], [["custom_multideck_document_key", "=", key]])
    if (records.length > 1 || records.some(record => record.company !== input.externalCompany || record.custom_multideck_document_key !== key || typeof record.name !== "string" || !record.name)) {
      throw new HttpError(409, "ERPNext has conflicting Multideck document identities. Review the connection before retrying.")
    }
    return records[0]?.name as string | undefined
  }
  const existing = await recover()
  if (existing) return { externalId: existing, key }
  try {
    const created = await erpNextCreate(doctype, { ...payload, custom_multideck_document_key: key })
    return { externalId: String(created.name), key }
  } catch (error) {
    // If POST committed but its reply was lost, locate the unique persisted
    // identity. The caller still verifies all approved fields before submit.
    const recovered = await recover()
    if (recovered) return { externalId: recovered, key }
    throw error
  }
}
