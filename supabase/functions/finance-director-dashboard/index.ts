import {
  authenticate,
  corsHeaders,
  currentInternalUser,
  failure,
  HttpError,
  json,
  requirePermission,
  routeParts,
} from "../_shared/backend.ts"

const permission = "Finance.Director.Dashboard.View"
const isoDate = (value: string | null) => value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ? value : null
const today = () => new Date().toISOString().slice(0, 10)

type LegalEntityRow = {
  LegalEntity_ID: string
  LegalEntity_Name: string
  LegalEntity_BaseCurrencyCodeSnapshot: string | null
  LegalEntity_IsDefault: boolean | null
}

async function legalEntities(admin: any, companyId: string) {
  const { data, error } = await admin.from("cmp_LegalEntities")
    .select("LegalEntity_ID,LegalEntity_Name,LegalEntity_BaseCurrencyCodeSnapshot,LegalEntity_IsDefault")
    .eq("Company_ID", companyId).eq("LegalEntity_IsActive", true)
    .order("LegalEntity_IsDefault", { ascending: false }).order("LegalEntity_Name").limit(100)
  if (error) throw new HttpError(500, error.message)
  return (data ?? []) as LegalEntityRow[]
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    if (request.method !== "GET") throw new HttpError(405, "The finance dashboard is read-only.")
    const { admin, user } = await authenticate(request)
    const current = await currentInternalUser(admin, user)
    await requirePermission(admin, current.User_ID, permission)
    const parts = routeParts(request, "finance-director-dashboard")
    if (parts.length) throw new HttpError(404, "That finance dashboard view does not exist.")

    const url = new URL(request.url)
    const entities = await legalEntities(admin, current.Company_ID)
    const options = entities.map((entity) => ({
      id: entity.LegalEntity_ID,
      name: entity.LegalEntity_Name,
      currency: entity.LegalEntity_BaseCurrencyCodeSnapshot?.toUpperCase() ?? null,
    }))
    const requested = url.searchParams.get("entityId")
    const entity = requested ? entities.find((item) => item.LegalEntity_ID === requested) : entities[0]
    if (requested && !entity) throw new HttpError(403, "That legal entity is outside this workspace.")
    if (!entity) return json(request, { legalEntities: options, dashboard: null })

    const asOf = isoDate(url.searchParams.get("asOf")) ?? today()
    const from = isoDate(url.searchParams.get("from"))
    const to = isoDate(url.searchParams.get("to"))
    if (!from || !to) throw new HttpError(400, "Choose a reporting period.")

    const { data, error } = await admin.rpc("multideck_finance_director_dashboard", {
      p_company_id: current.Company_ID,
      p_user_id: current.User_ID,
      p_legal_entity_id: entity.LegalEntity_ID,
      p_from_date: from,
      p_to_date: to,
      p_as_of: asOf,
    })
    if (error) throw new HttpError(error.code === "42501" ? 403 : error.code === "22023" ? 400 : 500, error.code === "42501" || error.code === "22023" ? error.message : "The finance dashboard could not be loaded.")
    return json(request, { legalEntities: options, dashboard: data })
  } catch (error) {
    return failure(request, error)
  }
})
