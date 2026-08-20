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
import { refreshUksl } from "../_shared/screening-ingest.ts"

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
    includeSimilar: Boolean(row.ScreeningCheck_IncludeSimilar),
    sourceArea: row.ScreeningCheck_SourceArea ?? "manual",
    sourceRecordId: row.ScreeningCheck_SourceRecordID ?? null,
    sourceLabel: row.ScreeningCheck_SourceLabel ?? null,
    subjectRole: row.ScreeningCheck_SubjectRole ?? "party",
    decisionCode: row.ScreeningCheck_DecisionCode ?? "review_required",
    decisionNote: row.ScreeningCheck_DecisionNote ?? null,
    decisionAt: row.ScreeningCheck_DecidedAt ?? null,
    rescreenDueAt: row.ScreeningCheck_RescreenDueAt ?? null,
    createdAt: row.ScreeningCheck_CreatedAt,
  }
}

async function listChecks(admin: any, companyId: string, orgId?: string | null) {
  const since = new Date()
  since.setMonth(since.getMonth() - 3)
  let query = admin
    .from("CMP_ScreeningChecks")
    .select("ScreeningCheck_ID,ScreeningCheck_SubjectName,ScreeningCheck_Country,ScreeningCheck_OrgID,ScreeningCheck_OutcomeCode,ScreeningCheck_MatchCount,ScreeningCheck_ListStale,ScreeningCheck_ListAgeHours,ScreeningCheck_IncludeSimilar,ScreeningCheck_SourceArea,ScreeningCheck_SourceRecordID,ScreeningCheck_SourceLabel,ScreeningCheck_SubjectRole,ScreeningCheck_DecisionCode,ScreeningCheck_DecisionNote,ScreeningCheck_DecidedAt,ScreeningCheck_RescreenDueAt,ScreeningCheck_CreatedAt")
    .eq("ScreeningCheck_CompanyID", companyId)
    .gte("ScreeningCheck_CreatedAt", since.toISOString())
    .order("ScreeningCheck_CreatedAt", { ascending: false })
    .limit(500)
  if (orgId) query = query.eq("ScreeningCheck_OrgID", orgId)
  const { data, error } = await query
  if (error) throw new HttpError(500, error.message)
  return (data ?? []).map(checkSummary)
}

async function listReportChecks(admin: any, companyId: string) {
  const columns = "ScreeningCheck_ID,ScreeningCheck_SubjectName,ScreeningCheck_Country,ScreeningCheck_OrgID,ScreeningCheck_OutcomeCode,ScreeningCheck_MatchCount,ScreeningCheck_ListStale,ScreeningCheck_ListAgeHours,ScreeningCheck_IncludeSimilar,ScreeningCheck_SourceArea,ScreeningCheck_SourceRecordID,ScreeningCheck_SourceLabel,ScreeningCheck_SubjectRole,ScreeningCheck_DecisionCode,ScreeningCheck_DecisionNote,ScreeningCheck_DecidedAt,ScreeningCheck_RescreenDueAt,ScreeningCheck_CreatedAt"
  const pageSize = 1000
  const rows: any[] = []
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await admin
      .from("CMP_ScreeningChecks")
      .select(columns)
      .eq("ScreeningCheck_CompanyID", companyId)
      .order("ScreeningCheck_CreatedAt", { ascending: false })
      .range(offset, offset + pageSize - 1)
    if (error) throw new HttpError(500, error.message)
    rows.push(...(data ?? []))
    if (!data || data.length < pageSize) break
  }
  return rows.map(checkSummary)
}

function controlReport(checks: ReturnType<typeof checkSummary>[]) {
  const summary = {
    screened: checks.length,
    automaticClear: 0,
    manualClear: 0,
    reviewRequired: 0,
    sanctioned: 0,
    unavailable: 0,
    nextRescreenDueAt: null as string | null,
  }
  for (const check of checks) {
    if (check.decisionCode === "automatic_clear") summary.automaticClear += 1
    if (check.decisionCode === "manual_clean") summary.manualClear += 1
    if (check.decisionCode === "review_required") summary.reviewRequired += 1
    if (check.decisionCode === "sanctioned") summary.sanctioned += 1
    if (check.decisionCode === "unavailable") summary.unavailable += 1
    if (check.rescreenDueAt && (!summary.nextRescreenDueAt || check.rescreenDueAt < summary.nextRescreenDueAt)) summary.nextRescreenDueAt = check.rescreenDueAt
  }
  return summary
}

function csvValue(value: unknown) {
  const text = value == null ? "" : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

function csvReport(checks: ReturnType<typeof checkSummary>[], report: ReturnType<typeof controlReport>) {
  const rows = [
    ["Multideck party screening report"],
    ["Generated at", new Date().toISOString()],
    ["Check source", "UK Sanctions List - FCDO snapshot held in this tenant workspace"],
    ["Matching criteria", "Exact normalized names; similar names only where the reviewer chose the 82% trigram and word-similarity check"],
    ["Screened", report.screened],
    ["Automatic clear", report.automaticClear],
    ["Manual clear", report.manualClear],
    ["Review required", report.reviewRequired],
    ["Sanctioned", report.sanctioned],
    ["Unavailable/stale", report.unavailable],
    [],
    ["Subject", "Country", "Role", "Workflow area", "Workflow reference", "Outcome", "Decision", "Clear route", "Similar-name search", "Matches", "Screened at", "Decision at", "Rescreen due", "Decision note"],
    ...checks.map((check) => [
      check.subjectName, check.country, check.subjectRole, check.sourceArea, check.sourceLabel || check.sourceRecordId,
      check.outcome, check.decisionCode,
      check.decisionCode === "automatic_clear" ? "Automatic" : check.decisionCode === "manual_clean" ? "Manual" : "",
      check.includeSimilar ? "Included" : "Exact only", check.matchCount, check.createdAt, check.decisionAt, check.rescreenDueAt, check.decisionNote,
    ]),
  ]
  return rows.map((row) => row.map(csvValue).join(",")).join("\r\n")
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

    if (request.method === "GET" && parts[0] === "report") {
      await requirePermission(admin, current.User_ID, "Screening.Read")
      const checks = await listReportChecks(admin, companyId)
      const report = controlReport(checks)
      if (new URL(request.url).searchParams.get("format") === "csv") {
        return new Response(csvReport(checks, report), {
          headers: {
            ...corsHeaders(request),
            "Content-Type": "text/csv; charset=utf-8",
            "Content-Disposition": 'attachment; filename="multideck-party-screening-report.csv"',
            "Cache-Control": "no-store",
          },
        })
      }
      return json(request, { generatedAt: new Date().toISOString(), report, checks })
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
      const result = await refreshUksl(admin)
      if (result.status === "failed") throw new HttpError(502, result.message)
      return json(request, { list: await listStatus(admin), refresh: result })
    }

    if (request.method === "POST" && parts[0] === "checks" && parts[1] && parts[2] === "decision") {
      await requirePermission(admin, current.User_ID, "Screening.Decide")
      const payload = await body<Record<string, unknown>>(request)
      const action = normalize(payload.action)
      const { error } = await admin.rpc("cmp_decide_screening_check", {
        p_company_id: companyId,
        p_user_id: current.User_ID,
        p_check_id: parts[1],
        p_action: action,
        p_note: normalize(payload.note),
      })
      if (error) throw new HttpError(error.code === "22023" ? 400 : 500, error.message)
      return json(request, await checkDetail(admin, companyId, parts[1]))
    }

    if (request.method === "POST" && (parts[0] === "checks" || parts.length === 0)) {
      await requirePermission(admin, current.User_ID, "Screening.Write")
      const payload = await body<Record<string, unknown>>(request)
      const subjectName = normalize(payload.subjectName ?? payload.name)
      if (!subjectName) throw new HttpError(400, "Enter a party name to screen.")
      const { data, error } = await admin.rpc("cmp_run_screening_check_v2", {
        p_company_id: companyId,
        p_user_id: current.User_ID,
        p_subject_name: subjectName,
        p_country: normalize(payload.country),
        p_org_id: normalize(payload.orgId),
        p_source_area: normalize(payload.sourceArea) ?? "manual",
        p_source_record_id: normalize(payload.sourceRecordId),
        p_source_label: normalize(payload.sourceLabel),
        p_subject_role: normalize(payload.subjectRole) ?? "party",
        p_include_similar: payload.includeSimilar === true,
      })
      if (error) throw new HttpError(error.code === "22023" ? 400 : 500, error.message)
      return json(request, data, 201)
    }

    throw new HttpError(405, "Method not allowed.")
  } catch (error) {
    return failure(request, error)
  }
})
