import {
  authenticate,
  body,
  corsHeaders,
  currentInternalUser,
  failure,
  HttpError,
  json,
  normalize,
  requirePermission,
  routeParts,
} from "../_shared/backend.ts"
import { refreshOfsiList } from "../_shared/screening-ingest.ts"

async function listStatus(admin: any) {
  const { data, error } = await admin.rpc("cmp_screening_list_status")
  if (error) throw new HttpError(500, error.message)
  return data
}

function checkSummary(row: any) {
  return {
    id: row.ScreeningCheck_ID,
    subjectName: row.ScreeningCheck_SubjectName,
    country: row.ScreeningCheck_Country,
    orgId: row.ScreeningCheck_OrgID,
    outcome: row.ScreeningCheck_OutcomeCode,
    matchCount: row.ScreeningCheck_MatchCount,
    totalCount: row.ScreeningCheck_MatchCount ?? 0,
    listStale: row.ScreeningCheck_ListStale,
    listAgeHours: row.ScreeningCheck_ListAgeHours == null ? null : Number(row.ScreeningCheck_ListAgeHours),
    createdAt: row.ScreeningCheck_CreatedAt,
  }
}

async function listChecks(admin: any, companyId: string, orgId?: string | null) {
  const since = new Date()
  since.setMonth(since.getMonth() - 3)
  let query = admin
    .from("CMP_ScreeningChecks")
    .select("ScreeningCheck_ID,ScreeningCheck_SubjectName,ScreeningCheck_Country,ScreeningCheck_OrgID,ScreeningCheck_OutcomeCode,ScreeningCheck_MatchCount,ScreeningCheck_ListStale,ScreeningCheck_ListAgeHours,ScreeningCheck_CreatedAt")
    .eq("ScreeningCheck_CompanyID", companyId)
    .gte("ScreeningCheck_CreatedAt", since.toISOString())
    .order("ScreeningCheck_CreatedAt", { ascending: false })
    .limit(500)
  if (orgId) query = query.eq("ScreeningCheck_OrgID", orgId)
  const { data, error } = await query
  if (error) throw new HttpError(500, error.message)
  return (data ?? []).map(checkSummary)
}

async function checkDetail(admin: any, companyId: string, checkId: string) {
  const { data: check, error } = await admin
    .from("CMP_ScreeningChecks")
    .select("*")
    .eq("ScreeningCheck_CompanyID", companyId)
    .eq("ScreeningCheck_ID", checkId)
    .maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!check) throw new HttpError(404, "That screening result is not available.")
  const { data: matches, error: matchError } = await admin
    .from("CMP_ScreeningMatches")
    .select("ScreeningMatch_ID,ScreeningMatch_GroupId,ScreeningMatch_ListedName,ScreeningMatch_MatchKind,ScreeningMatch_Score,ScreeningMatch_Regime,ScreeningMatch_GroupType,ScreeningMatch_ListedOn,ScreeningMatch_UkRef,ScreeningMatch_Country,ScreeningMatch_ListingNotes")
    .eq("ScreeningMatch_CheckID", checkId)
    .order("ScreeningMatch_Score", { ascending: false })
    .limit(10000)
  if (matchError) throw new HttpError(500, matchError.message)
  return {
    ...checkSummary(check),
    matches: (matches ?? []).map((match: any) => ({
      id: match.ScreeningMatch_ID,
      groupId: match.ScreeningMatch_GroupId,
      listedName: match.ScreeningMatch_ListedName,
      matchKind: match.ScreeningMatch_MatchKind,
      score: Number(match.ScreeningMatch_Score),
      regime: match.ScreeningMatch_Regime,
      groupType: match.ScreeningMatch_GroupType,
      listedOn: match.ScreeningMatch_ListedOn,
      ukRef: match.ScreeningMatch_UkRef,
      country: match.ScreeningMatch_Country,
      listingNotes: match.ScreeningMatch_ListingNotes ?? null,
    })),
  }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    const { admin, user } = await authenticate(request)
    const current = await currentInternalUser(admin, user)
    const parts = routeParts(request, "screening")
    const companyId = current.Company_ID
    if (!companyId) throw new HttpError(403, "Your account is not linked to a Multideck company.")

    if (request.method === "GET" && parts[0] === "checks" && parts[1]) {
      await requirePermission(admin, current.User_ID, "Screening.Read")
      return json(request, await checkDetail(admin, companyId, parts[1]))
    }

    if (request.method === "GET") {
      await requirePermission(admin, current.User_ID, "Screening.Read")
      const orgId = new URL(request.url).searchParams.get("orgId")
      const [list, checks] = await Promise.all([
        listStatus(admin),
        listChecks(admin, companyId, orgId),
      ])
      return json(request, { list, checks })
    }

    if (request.method === "POST" && parts[0] === "refresh") {
      await requirePermission(admin, current.User_ID, "Screening.Write")
      const result = await refreshOfsiList(admin)
      if (result.status === "failed") throw new HttpError(502, result.message)
      return json(request, { list: await listStatus(admin), refresh: result })
    }

    if (request.method === "POST" && (parts[0] === "checks" || parts.length === 0)) {
      await requirePermission(admin, current.User_ID, "Screening.Write")
      const payload = await body<Record<string, unknown>>(request)
      const subjectName = normalize(payload.subjectName ?? payload.name)
      if (!subjectName) throw new HttpError(400, "Enter a party name to screen.")
      const { data, error } = await admin.rpc("cmp_run_screening_check", {
        p_company_id: companyId,
        p_user_id: current.User_ID,
        p_subject_name: subjectName,
        p_country: normalize(payload.country),
        p_org_id: normalize(payload.orgId),
      })
      if (error) throw new HttpError(error.code === "22023" ? 400 : 500, error.message)
      return json(request, data, 201)
    }

    throw new HttpError(405, "Method not allowed.")
  } catch (error) {
    return failure(request, error)
  }
})
