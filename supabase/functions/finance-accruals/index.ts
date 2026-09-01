import { authenticate, body, corsHeaders, currentInternalUser, failure, HttpError, json, requirePermission, routeParts } from "../_shared/backend.ts"

type RunInput = { legalEntityId: string; periodCode: string; jobIds: string[]; reason: string }
type ItemInput = { proposedWip: number; proposedAccrual: number; reviewerNote?: string | null }
type PeriodInput = { legalEntityId: string; periodCode: string; reason: string }
type ReverseInput = { reversalPeriodCode: string; reason: string }

const clean = (value: unknown, max: number) => typeof value === "string" ? value.trim().slice(0, max) : ""
const uuid = (value: unknown) => typeof value === "string" && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
const amount = (value: unknown) => { const number = Number(value); return Number.isFinite(number) ? Math.round(number * 10000) / 10000 : 0 }
const distribute = (rows: any[], total: number, basis: string) => {
  if (!rows.length) return []
  const weights = rows.map((row) => Math.max(0, amount(row[basis])))
  const weightTotal = amount(weights.reduce((sum, value) => sum + value, 0))
  let allocated = 0
  return rows.map((row, index) => {
    const value = index === rows.length - 1 ? amount(total - allocated) : amount(total * (weightTotal > 0 ? weights[index] / weightTotal : index === 0 ? 1 : 0))
    allocated = amount(allocated + value); return { row, value }
  })
}
const periodCode = (value: unknown) => {
  const code = clean(value, 6)
  const year = Number(code.slice(0, 4)); const month = Number(code.slice(4, 6))
  if (!/^\d{6}$/.test(code) || year < 2000 || year > 2200 || month < 1 || month > 12) throw new HttpError(400, "Enter a valid YYYYMM management period.")
  return code
}
const toMonth = (value: unknown) => clean(value, 10).replaceAll("-", "").slice(0, 6)

function rpcFailure(error: any, fallback: string) {
  if (!error) return
  const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : ["22023", "22P02", "23514"].includes(error.code) ? 400 : 500
  throw new HttpError(status, clean(error.message, 500) || fallback)
}

async function legalEntity(admin: any, current: any, id: string) {
  if (!uuid(id)) throw new HttpError(400, "Choose a legal entity.")
  const { data, error } = await admin.from("cmp_LegalEntities").select("LegalEntity_ID,LegalEntity_Name,LegalEntity_BaseCurrencyCodeSnapshot,Company_ID").eq("LegalEntity_ID", id).eq("Company_ID", current.Company_ID).maybeSingle()
  if (error) throw new HttpError(500, error.message)
  if (!data) throw new HttpError(404, "That legal entity is outside this workspace.")
  return data
}

async function accessibleJobs(admin: any, current: any, entityId: string, targetPeriod?: string) {
  const { data: offices, error: officeError } = await admin.from("cmp_Offices").select("Office_ID").eq("Company_ID", current.Company_ID)
  if (officeError) throw new HttpError(500, officeError.message)
  const officeIds = (offices ?? []).map((item: any) => item.Office_ID)
  if (!officeIds.length) return []
  let query = admin.from("Job_Header")
    .select("Job_ID,Job_Number,Job_Period,Job_Status,Job_DomainCode,Job_Customer,Job_Supplier,Job_ReadyDate,Job_RequiredDeliveryDate,Job_ClosedDate,Job_LegalEntityID,Job_OrgOfficeID,Job_OfficeID")
    .eq("Job_IsDeleted", false).order("Job_Number")
  if (targetPeriod) query = query.eq("Job_Period", targetPeriod)
  const { data, error } = await query
  if (error) throw new HttpError(500, error.message)
  const officeSet = new Set(officeIds)
  return (data ?? []).filter((job: any) =>
    officeSet.has(job.Job_OrgOfficeID ?? job.Job_OfficeID) && (!job.Job_LegalEntityID || job.Job_LegalEntityID === entityId)
  )
}

async function calculateCandidates(admin: any, current: any, entity: any, targetPeriod: string) {
  const jobs = await accessibleJobs(admin, current, entity.LegalEntity_ID, targetPeriod)
  const jobIds = jobs.map((job: any) => job.Job_ID)
  if (!jobIds.length) return []
  const organisationIds = [...new Set(jobs.flatMap((job: any) => [job.Job_Customer, job.Job_Supplier]).filter(Boolean))]
  const [costingResult, legacyCostResult, legacyRevenueResult, documentResult, linkResult, organisationsResult, nominalResult] = await Promise.all([
    admin.from("Job_Costing_Lines").select("JobCostingLine_ID,Job_ID,JobCostingLine_Number,JobCostingLine_ChargeCodeID,JobCostingLine_Description,JobCostingLine_DomainCode,JobCostingLine_SourceTable,JobCostingLine_SourceID,JobCostingLine_SourceLineID,JobCostingLine_CostAmountLocal,JobCostingLine_RevenueAmountLocal,JobCostingLine_CostNominalAccountID,JobCostingLine_RevenueNominalAccountID").in("Job_ID", jobIds).order("JobCostingLine_Number"),
    admin.from("Job_Costing_ChargesIn").select("Job_ID,JCIn_Expected_NetCost_Local,JCIn_Actual_NetCost_Local").in("Job_ID", jobIds),
    admin.from("Job_Costing_ChargesOut").select("Job_ID,JCOut_Expected_NetCost_Local,JCOut_Actual_NetCost_Local").in("Job_ID", jobIds),
    admin.from("FIN_Documents").select("FINDoc_ID,FINDoc_TypeCode,FINDoc_SourceJobID,FINDoc_AccountingDate,FINDoc_LocalNetAmount,FINDoc_PostingStatusCode").eq("FINDoc_LegalEntityID", entity.LegalEntity_ID).eq("FINDoc_PostingStatusCode", "posted"),
    admin.from("FIN_DocumentLineJobLinks").select("FINDocLineJob_DocumentID,FINDocLineJob_DocumentLineID,FINDocLineJob_JobID,FINDocLineJob_JobCostingLineID,FINDocLineJob_LocalNetAmount").in("FINDocLineJob_JobID", jobIds),
    organisationIds.length ? admin.from("Org_Master").select("Org_id,Org_Name").in("Org_id", organisationIds) : Promise.resolve({ data: [], error: null }),
    admin.from("FIN_NominalAccounts").select("FINNom_ID,FINNom_Code,FINNom_Name").eq("FINNom_LegalEntityID", entity.LegalEntity_ID).eq("FINNom_IsActive", true),
  ])
  for (const result of [costingResult, legacyCostResult, legacyRevenueResult, documentResult, linkResult, organisationsResult, nominalResult]) if (result.error) throw new HttpError(500, result.error.message)
  const names = new Map((organisationsResult.data ?? []).map((item: any) => [item.Org_id, item.Org_Name]))
  const nominal = new Map((nominalResult.data ?? []).map((item: any) => [item.FINNom_ID, item]))
  const linesByJob = new Map<string, any[]>()
  for (const line of costingResult.data ?? []) linesByJob.set(line.Job_ID, [...(linesByJob.get(line.Job_ID) ?? []), line])
  const legacyExpected = new Map<string, { cost: number; revenue: number }>()
  for (const line of legacyCostResult.data ?? []) {
    const row = legacyExpected.get(line.Job_ID) ?? { cost: 0, revenue: 0 }
    row.cost += amount(line.JCIn_Expected_NetCost_Local); legacyExpected.set(line.Job_ID, row)
  }
  for (const line of legacyRevenueResult.data ?? []) {
    const row = legacyExpected.get(line.Job_ID) ?? { cost: 0, revenue: 0 }
    row.revenue += amount(line.JCOut_Expected_NetCost_Local); legacyExpected.set(line.Job_ID, row)
  }
  const documents = new Map((documentResult.data ?? []).map((document: any) => [document.FINDoc_ID, document]))
  const linkedDocumentIds = new Set((linkResult.data ?? []).map((link: any) => link.FINDocLineJob_DocumentID))
  const actualByLine = new Map<string, { revenue: number; cost: number; outsideRevenue: number; outsideCost: number; documentIds: Set<string> }>()
  const unmatchedByJob = new Map<string, { revenue: number; cost: number; outsideRevenue: number; outsideCost: number; documentIds: Set<string> }>()
  const addActual = (target: Map<string, any>, key: string, document: any, localAmount: number) => {
    const row = target.get(key) ?? { revenue: 0, cost: 0, outsideRevenue: 0, outsideCost: 0, documentIds: new Set<string>() }
    const isRevenue = ["sl_invoice", "credit_note"].includes(document.FINDoc_TypeCode)
    const inPeriod = toMonth(document.FINDoc_AccountingDate) === targetPeriod
    if (isRevenue && inPeriod) row.revenue += localAmount
    else if (isRevenue) row.outsideRevenue += localAmount
    else if (inPeriod) row.cost += localAmount
    else row.outsideCost += localAmount
    row.documentIds.add(document.FINDoc_ID); target.set(key, row)
  }
  for (const link of linkResult.data ?? []) {
    const document = documents.get(link.FINDocLineJob_DocumentID)
    if (!document) continue
    if (link.FINDocLineJob_JobCostingLineID) addActual(actualByLine, link.FINDocLineJob_JobCostingLineID, document, amount(link.FINDocLineJob_LocalNetAmount))
    else addActual(unmatchedByJob, link.FINDocLineJob_JobID, document, amount(link.FINDocLineJob_LocalNetAmount))
  }
  for (const document of documentResult.data ?? []) if (document.FINDoc_SourceJobID && !linkedDocumentIds.has(document.FINDoc_ID)) addActual(unmatchedByJob, document.FINDoc_SourceJobID, document, amount(document.FINDoc_LocalNetAmount))
  return jobs.map((job: any) => {
    const sourceLines = linesByJob.get(job.Job_ID) ?? []
    const chargeLines = sourceLines.map((line: any) => {
      const recognised = actualByLine.get(line.JobCostingLine_ID) ?? { revenue: 0, cost: 0, outsideRevenue: 0, outsideCost: 0, documentIds: new Set<string>() }
      const expectedRevenue = amount(line.JobCostingLine_RevenueAmountLocal); const expectedCost = amount(line.JobCostingLine_CostAmountLocal)
      const actualRevenue = amount(recognised.revenue); const actualCost = amount(recognised.cost)
      const proposedWip = Math.max(0, amount(expectedRevenue - actualRevenue)); const proposedAccrual = Math.max(0, amount(expectedCost - actualCost))
      return {
        jobCostingLineId: line.JobCostingLine_ID, lineNo: line.JobCostingLine_Number, chargeCodeId: line.JobCostingLine_ChargeCodeID,
        domainCode: line.JobCostingLine_DomainCode, sourceTable: line.JobCostingLine_SourceTable,
        sourceId: line.JobCostingLine_SourceID, sourceLineId: line.JobCostingLine_SourceLineID,
        chargeCode: null, description: line.JobCostingLine_Description, costNominalAccountId: line.JobCostingLine_CostNominalAccountID,
        costNominalCode: nominal.get(line.JobCostingLine_CostNominalAccountID)?.FINNom_Code ?? null,
        revenueNominalAccountId: line.JobCostingLine_RevenueNominalAccountID,
        revenueNominalCode: nominal.get(line.JobCostingLine_RevenueNominalAccountID)?.FINNom_Code ?? null,
        expectedRevenue, expectedCost, actualRevenue, actualCost, outsidePeriodRevenue: amount(recognised.outsideRevenue), outsidePeriodCost: amount(recognised.outsideCost),
        proposedWip, proposedAccrual, recognisedRevenue: amount(actualRevenue + proposedWip), recognisedCost: amount(actualCost + proposedAccrual),
        grossProfit: amount(actualRevenue + proposedWip - actualCost - proposedAccrual), sourceDocumentIds: [...recognised.documentIds],
      }
    })
    if (!chargeLines.length) {
      const legacy = legacyExpected.get(job.Job_ID) ?? { cost: 0, revenue: 0 }
      if (legacy.cost || legacy.revenue) chargeLines.push({ jobCostingLineId: null, lineNo: 1, chargeCodeId: null, chargeCode: "LEGACY", description: "Legacy job costing", domainCode: job.Job_DomainCode ?? "freight", sourceTable: null, sourceId: null, sourceLineId: null, costNominalAccountId: null, costNominalCode: "5000", revenueNominalAccountId: null, revenueNominalCode: "4000", expectedRevenue: legacy.revenue, expectedCost: legacy.cost, actualRevenue: 0, actualCost: 0, outsidePeriodRevenue: 0, outsidePeriodCost: 0, proposedWip: legacy.revenue, proposedAccrual: legacy.cost, recognisedRevenue: legacy.revenue, recognisedCost: legacy.cost, grossProfit: amount(legacy.revenue - legacy.cost), sourceDocumentIds: [] })
    }
    const unmatched = unmatchedByJob.get(job.Job_ID) ?? { revenue: 0, cost: 0, outsideRevenue: 0, outsideCost: 0, documentIds: new Set<string>() }
    const totals = chargeLines.reduce((sum: any, line: any) => ({
      expectedRevenue: amount(sum.expectedRevenue + line.expectedRevenue), expectedCost: amount(sum.expectedCost + line.expectedCost), actualRevenue: amount(sum.actualRevenue + line.actualRevenue), actualCost: amount(sum.actualCost + line.actualCost),
      outsideRevenue: amount(sum.outsideRevenue + line.outsidePeriodRevenue), outsideCost: amount(sum.outsideCost + line.outsidePeriodCost), proposedWip: amount(sum.proposedWip + line.proposedWip), proposedAccrual: amount(sum.proposedAccrual + line.proposedAccrual),
      margin: amount(sum.margin + line.grossProfit), documentIds: new Set([...sum.documentIds, ...line.sourceDocumentIds]),
    }), { expectedRevenue: 0, expectedCost: 0, actualRevenue: 0, actualCost: 0, outsideRevenue: 0, outsideCost: 0, proposedWip: 0, proposedAccrual: 0, margin: 0, documentIds: new Set<string>() })
    totals.actualRevenue=amount(totals.actualRevenue+unmatched.revenue); totals.actualCost=amount(totals.actualCost+unmatched.cost); totals.outsideRevenue=amount(totals.outsideRevenue+unmatched.outsideRevenue); totals.outsideCost=amount(totals.outsideCost+unmatched.outsideCost); totals.margin=amount(totals.margin+unmatched.revenue-unmatched.cost); for (const id of unmatched.documentIds) totals.documentIds.add(id)
    return {
      jobId: job.Job_ID, jobNumber: job.Job_Number, jobReference: `${job.Job_Period}-${job.Job_Number}`, periodCode: job.Job_Period, legalEntityId: job.Job_LegalEntityID, domainCode: job.Job_DomainCode ?? "freight",
      status: job.Job_Status, customerName: names.get(job.Job_Customer) ?? "", supplierName: names.get(job.Job_Supplier) ?? "",
      readyDate: job.Job_ReadyDate, deliveryDate: job.Job_RequiredDeliveryDate, closedDate: job.Job_ClosedDate,
      expectedRevenue: totals.expectedRevenue, expectedCost: totals.expectedCost, actualRevenue: totals.actualRevenue, actualCost: totals.actualCost,
      outsidePeriodRevenue: totals.outsideRevenue, outsidePeriodCost: totals.outsideCost, proposedWip: totals.proposedWip, proposedAccrual: totals.proposedAccrual,
      adjustedRevenue: amount(totals.actualRevenue + totals.proposedWip), adjustedCost: amount(totals.actualCost + totals.proposedAccrual),
      adjustedMargin: totals.margin, sourceDocumentIds: [...totals.documentIds], chargeLines,
      unmatchedActualRevenue: amount(unmatched.revenue), unmatchedActualCost: amount(unmatched.cost), unmatchedDocumentIds: [...unmatched.documentIds],
      needsReview: totals.proposedWip > 0 || totals.proposedAccrual > 0 || totals.outsideRevenue !== 0 || totals.outsideCost !== 0 || unmatched.revenue !== 0 || unmatched.cost !== 0,
    }
  })
}

async function listRuns(admin: any, entityId: string) {
  const { data: runs, error } = await admin.from("FIN_PeriodCloseRuns")
    .select("FINCloseRun_ID,FINCloseRun_PeriodID,FINCloseRun_RunTypeCode,FINCloseRun_StatusCode,FINCloseRun_StartedAt,FINCloseRun_StartedBy,FINCloseRun_ApprovedAt,FINCloseRun_ApprovedBy,FINCloseRun_Reason,FINCloseRun_PostedAt,FINCloseRun_ReversedAt,FINCloseRun_PostingBatchID,FINCloseRun_ReversalBatchID,FINCloseRun_ControlTotalsJSON,FINCloseRun_UpdatedAt,FINPeriod:FINCloseRun_PeriodID(FINPeriod_Code,FINPeriod_Name,FINPeriod_StatusCode,FINPeriod_StartDate,FINPeriod_EndDate,FINPeriod_BaseCurrencyCode)")
    .eq("FINCloseRun_LegalEntityID", entityId).eq("FINCloseRun_RunTypeCode", "month_end").order("FINCloseRun_StartedAt", { ascending: false }).limit(40)
  if (error) throw new HttpError(500, error.message)
  const runIds = (runs ?? []).map((run: any) => run.FINCloseRun_ID)
  const { data: items, error: itemError } = runIds.length ? await admin.from("FIN_PeriodCloseRunItems").select("*").in("FINCloseItem_CloseRunID", runIds).order("FINCloseItem_JobID") : { data: [], error: null }
  if (itemError) throw new HttpError(500, itemError.message)
  const itemIds = (items ?? []).map((item: any) => item.FINCloseItem_ID)
  const { data: chargeAllocations, error: chargeError } = itemIds.length ? await admin.from("FIN_JobChargePeriodAllocations").select("*").in("FINChargePeriod_CloseRunItemID", itemIds).order("FINChargePeriod_LineNoSnapshot") : { data: [], error: null }
  if (chargeError) throw new HttpError(500, chargeError.message)
  const chargesByItem = new Map<string, any[]>()
  for (const charge of chargeAllocations ?? []) chargesByItem.set(charge.FINChargePeriod_CloseRunItemID, [...(chargesByItem.get(charge.FINChargePeriod_CloseRunItemID) ?? []), charge])
  const { data: releases, error: releaseError } = itemIds.length ? await admin.from("FIN_AccrualWIPReleases").select("FINRelease_ID,FINRelease_CloseRunItemID,FINRelease_DocumentID,FINRelease_ReleaseKindCode,FINRelease_LocalAmount,FINRelease_LocalCurrencyCode,FINRelease_PostingBatchID,FINRelease_ReleasedAt").in("FINRelease_CloseRunItemID", itemIds).order("FINRelease_ReleasedAt") : { data: [], error: null }
  if (releaseError) throw new HttpError(500, releaseError.message)
  const documentIds = [...new Set((releases ?? []).map((release: any) => release.FINRelease_DocumentID))]
  const { data: releaseDocuments, error: documentError } = documentIds.length ? await admin.from("FIN_Documents").select("FINDoc_ID,FINDoc_Number,FINDoc_TypeCode").in("FINDoc_ID", documentIds) : { data: [], error: null }
  if (documentError) throw new HttpError(500, documentError.message)
  const documents = new Map((releaseDocuments ?? []).map((document: any) => [document.FINDoc_ID, document]))
  const releasesByItem = new Map<string, any[]>()
  for (const release of releases ?? []) {
    const document = documents.get(release.FINRelease_DocumentID)
    const evidence = { ...release, documentNumber: document?.FINDoc_Number ?? null, documentType: document?.FINDoc_TypeCode ?? null }
    releasesByItem.set(release.FINRelease_CloseRunItemID, [...(releasesByItem.get(release.FINRelease_CloseRunItemID) ?? []), evidence])
  }
  const byRun = new Map<string, any[]>()
  for (const item of items ?? []) {
    const automaticReleases = releasesByItem.get(item.FINCloseItem_ID) ?? []
    const enriched = {
      ...item,
      chargeLines: chargesByItem.get(item.FINCloseItem_ID) ?? [],
      automaticReleases,
      automaticWipReleased: automaticReleases.filter((release: any) => release.FINRelease_ReleaseKindCode === "revenue_wip").reduce((total: number, release: any) => amount(total + amount(release.FINRelease_LocalAmount)), 0),
      automaticAccrualReleased: automaticReleases.filter((release: any) => release.FINRelease_ReleaseKindCode === "cost_accrual").reduce((total: number, release: any) => amount(total + amount(release.FINRelease_LocalAmount)), 0),
    }
    byRun.set(item.FINCloseItem_CloseRunID, [...(byRun.get(item.FINCloseItem_CloseRunID) ?? []), enriched])
  }
  return (runs ?? []).map((run: any) => ({ ...run, items: byRun.get(run.FINCloseRun_ID) ?? [] }))
}

async function workspace(admin: any, current: any, entityId: string, targetPeriod: string) {
  await requirePermission(admin, current.User_ID, "Finance.Management.View")
  const entity = await legalEntity(admin, current, entityId)
  const [candidates, assignableJobs, periodsResult, runs] = await Promise.all([
    calculateCandidates(admin, current, entity, targetPeriod),
    accessibleJobs(admin, current, entityId),
    admin.from("FIN_Periods").select("FINPeriod_ID,FINPeriod_Code,FINPeriod_Name,FINPeriod_StartDate,FINPeriod_EndDate,FINPeriod_StatusCode,FINPeriod_BaseCurrencyCode").eq("FINPeriod_LegalEntityID", entityId).order("FINPeriod_Code", { ascending: false }).limit(60),
    listRuns(admin, entityId),
  ])
  if (periodsResult.error) throw new HttpError(500, periodsResult.error.message)
  return {
    entity,
    periodCode: targetPeriod,
    periods: periodsResult.data ?? [],
    candidates,
    assignableJobs: assignableJobs.map((job: any) => ({ jobId: job.Job_ID, jobNumber: job.Job_Number, periodCode: job.Job_Period, status: job.Job_Status, legalEntityId: job.Job_LegalEntityID })),
    runs,
  }
}

async function entities(admin: any, current: any) {
  await requirePermission(admin, current.User_ID, "Finance.Management.View")
  const { data, error } = await admin.from("cmp_LegalEntities")
    .select("LegalEntity_ID,LegalEntity_Name,LegalEntity_BaseCurrencyCodeSnapshot")
    .eq("Company_ID", current.Company_ID).order("LegalEntity_Name")
  if (error) throw new HttpError(500, error.message)
  return { legalEntities: data ?? [] }
}

async function ensurePeriod(admin: any, current: any, input: PeriodInput) {
  await requirePermission(admin, current.User_ID, "Finance.Management.Prepare")
  await legalEntity(admin, current, input.legalEntityId)
  const code = periodCode(input.periodCode)
  const { data, error } = await admin.rpc("_multideck_finance_ensure_period", { p_legal_entity_id: input.legalEntityId, p_period_code: code, p_user_id: current.User_ID })
  rpcFailure(error, "The management period could not be created.")
  return { periodId: data, periodCode: code }
}

async function createRun(admin: any, current: any, input: RunInput) {
  await requirePermission(admin, current.User_ID, "Finance.Management.Prepare")
  const entity = await legalEntity(admin, current, input.legalEntityId)
  const code = periodCode(input.periodCode); const reason = clean(input.reason, 500)
  if (!reason) throw new HttpError(400, "Explain the basis for this accrual and WIP review.")
  const jobIds = [...new Set((input.jobIds ?? []).filter(uuid))]
  if (!jobIds.length) throw new HttpError(400, "Select at least one job for this review.")
  const period = await ensurePeriod(admin, current, { legalEntityId: input.legalEntityId, periodCode: code, reason })
  const { data: active, error: activeError } = await admin.from("FIN_PeriodCloseRuns").select("FINCloseRun_ID,FINCloseRun_StatusCode").eq("FINCloseRun_LegalEntityID", input.legalEntityId).eq("FINCloseRun_PeriodID", period.periodId).in("FINCloseRun_StatusCode", ["draft", "awaiting_approval", "approved", "posted"]).limit(1).maybeSingle()
  if (activeError) throw new HttpError(500, activeError.message)
  if (active) throw new HttpError(409, "This management period already has an active accrual and WIP review. Complete, reject or reverse it before preparing another.")
  const candidates = await calculateCandidates(admin, current, entity, code)
  const selected = candidates.filter((item: any) => jobIds.includes(item.jobId))
  if (selected.length !== jobIds.length) throw new HttpError(400, "One or more selected jobs are outside this legal entity or management period.")
  for (const item of selected) if (!item.periodCode || item.periodCode !== code) throw new HttpError(409, `Job ${item.jobReference} is not assigned to ${code}.`)
  for (const item of selected) if (!item.legalEntityId) {
    const { error } = await admin.rpc("multideck_finance_assign_job_period", { p_company_id: current.Company_ID, p_user_id: current.User_ID, p_legal_entity_id: input.legalEntityId, p_job_id: item.jobId, p_period_code: code, p_reason: reason })
    rpcFailure(error, `Job ${item.jobReference} could not be assigned to this legal entity and management period.`)
  }
  const totals = selected.reduce((sum: any, item: any) => ({ jobCount: sum.jobCount + 1, proposedAccrual: amount(sum.proposedAccrual + item.proposedAccrual), proposedWip: amount(sum.proposedWip + item.proposedWip), outsidePeriodRevenue: amount(sum.outsidePeriodRevenue + item.outsidePeriodRevenue), outsidePeriodCost: amount(sum.outsidePeriodCost + item.outsidePeriodCost) }), { jobCount: 0, proposedAccrual: 0, proposedWip: 0, outsidePeriodRevenue: 0, outsidePeriodCost: 0 })
  const { data: run, error: runError } = await admin.from("FIN_PeriodCloseRuns").insert({ FINCloseRun_PeriodID: period.periodId, FINCloseRun_LegalEntityID: input.legalEntityId, FINCloseRun_RunTypeCode: "month_end", FINCloseRun_StatusCode: "draft", FINCloseRun_StartedBy: current.User_ID, FINCloseRun_Reason: reason, FINCloseRun_ControlTotalsJSON: totals, FINCloseRun_UpdatedBy: current.User_ID }).select("FINCloseRun_ID").single()
  if (runError || !run) throw new HttpError(500, runError?.message ?? "The accrual and WIP review could not be created.")
  const rows = selected.map((item: any) => ({ FINCloseItem_CloseRunID: run.FINCloseRun_ID, FINCloseItem_ItemTypeCode: "job_charge_accrual_wip", FINCloseItem_SourceTable: "Job_Header", FINCloseItem_SourceID: item.jobId, FINCloseItem_JobID: item.jobId, FINCloseItem_StatusCode: "draft", FINCloseItem_Amount: amount(item.proposedWip + item.proposedAccrual), FINCloseItem_LocalAmount: amount(item.proposedWip + item.proposedAccrual), FINCloseItem_CurrencyCodeSnapshot: entity.LegalEntity_BaseCurrencyCodeSnapshot || "GBP", FINCloseItem_Explanation: "System proposal from exact job charge lines versus posted finance document lines in the assigned management period.", FINCloseItem_MetadataJSON: item, FINCloseItem_ExpectedRevenue: item.expectedRevenue, FINCloseItem_ExpectedCost: item.expectedCost, FINCloseItem_ActualRevenue: item.actualRevenue, FINCloseItem_ActualCost: item.actualCost, FINCloseItem_OutOfPeriodRevenue: item.outsidePeriodRevenue, FINCloseItem_OutOfPeriodCost: item.outsidePeriodCost, FINCloseItem_ProposedWIP: item.proposedWip, FINCloseItem_ProposedAccrual: item.proposedAccrual, FINCloseItem_UpdatedBy: current.User_ID }))
  const { data: insertedItems, error: itemError } = await admin.from("FIN_PeriodCloseRunItems").insert(rows).select("FINCloseItem_ID,FINCloseItem_JobID")
  if (itemError) { await admin.from("FIN_PeriodCloseRuns").delete().eq("FINCloseRun_ID", run.FINCloseRun_ID); throw new HttpError(500, itemError.message) }
  const itemByJob = new Map((insertedItems ?? []).map((item: any) => [item.FINCloseItem_JobID, item.FINCloseItem_ID]))
  const allocations = selected.flatMap((item: any) => (item.chargeLines ?? []).filter((line: any) => uuid(line.jobCostingLineId)).map((line: any) => ({
    FINChargePeriod_CloseRunItemID: itemByJob.get(item.jobId), FINChargePeriod_JobID: item.jobId, FINChargePeriod_JobCostingLineID: line.jobCostingLineId,
    FINChargePeriod_LineNoSnapshot: line.lineNo, FINChargePeriod_ChargeCodeSnapshot: line.chargeCode, FINChargePeriod_DescriptionSnapshot: line.description,
    FINChargePeriod_CostNominalAccountID: line.costNominalAccountId, FINChargePeriod_RevenueNominalAccountID: line.revenueNominalAccountId,
    FINChargePeriod_ExpectedRevenue: line.expectedRevenue, FINChargePeriod_ExpectedCost: line.expectedCost, FINChargePeriod_ActualRevenue: line.actualRevenue, FINChargePeriod_ActualCost: line.actualCost,
    FINChargePeriod_OutOfPeriodRevenue: line.outsidePeriodRevenue, FINChargePeriod_OutOfPeriodCost: line.outsidePeriodCost,
    FINChargePeriod_ProposedWIP: line.proposedWip, FINChargePeriod_ProposedAccrual: line.proposedAccrual, FINChargePeriod_UpdatedBy: current.User_ID,
  })))
  if (allocations.length) {
    const { error: allocationError } = await admin.from("FIN_JobChargePeriodAllocations").insert(allocations)
    if (allocationError) { await admin.from("FIN_PeriodCloseRuns").delete().eq("FINCloseRun_ID", run.FINCloseRun_ID); throw new HttpError(500, allocationError.message) }
  }
  return { runId: run.FINCloseRun_ID, status: "draft", totals }
}

async function updateItem(admin: any, current: any, runId: string, itemId: string, input: ItemInput) {
  await requirePermission(admin, current.User_ID, "Finance.Management.Prepare")
  if (!uuid(runId) || !uuid(itemId)) throw new HttpError(404, "Review item not found.")
  const proposedWip = amount(input.proposedWip); const proposedAccrual = amount(input.proposedAccrual); const note = clean(input.reviewerNote, 1000)
  if (proposedWip < 0 || proposedAccrual < 0) throw new HttpError(400, "Accrual and WIP amounts cannot be negative.")
  const { data: run, error: runError } = await admin.from("FIN_PeriodCloseRuns").select("FINCloseRun_ID,FINCloseRun_StatusCode,FINCloseRun_LegalEntityID,FINCloseRun_ControlTotalsJSON").eq("FINCloseRun_ID", runId).maybeSingle()
  if (runError) throw new HttpError(500, runError.message)
  if (!run) throw new HttpError(404, "Accrual and WIP review not found.")
  await legalEntity(admin, current, run.FINCloseRun_LegalEntityID)
  if (run.FINCloseRun_StatusCode !== "draft") throw new HttpError(409, "Only a draft review can be edited.")
  const { data: existing, error: existingError } = await admin.from("FIN_PeriodCloseRunItems").select("FINCloseItem_ProposedWIP,FINCloseItem_ProposedAccrual,FINCloseItem_MetadataJSON").eq("FINCloseItem_ID", itemId).eq("FINCloseItem_CloseRunID", runId).maybeSingle()
  if (existingError) throw new HttpError(500, existingError.message)
  if (!existing) throw new HttpError(404, "Review item not found.")
  const recommendedWip = amount(existing.FINCloseItem_MetadataJSON?.proposedWip); const recommendedAccrual = amount(existing.FINCloseItem_MetadataJSON?.proposedAccrual)
  if ((proposedWip !== recommendedWip || proposedAccrual !== recommendedAccrual) && !note) throw new HttpError(400, "Explain every manual override to the calculated accrual or WIP amount.")
  const { error } = await admin.from("FIN_PeriodCloseRunItems").update({ FINCloseItem_ProposedWIP: proposedWip, FINCloseItem_ProposedAccrual: proposedAccrual, FINCloseItem_Amount: amount(proposedWip + proposedAccrual), FINCloseItem_LocalAmount: amount(proposedWip + proposedAccrual), FINCloseItem_ReviewerNote: note || null, FINCloseItem_UpdatedAt: new Date().toISOString(), FINCloseItem_UpdatedBy: current.User_ID }).eq("FINCloseItem_ID", itemId).eq("FINCloseItem_CloseRunID", runId)
  if (error) throw new HttpError(500, error.message)
  const { data: chargeRows, error: chargeError } = await admin.from("FIN_JobChargePeriodAllocations").select("FINChargePeriod_ID,FINChargePeriod_ExpectedRevenue,FINChargePeriod_ExpectedCost").eq("FINChargePeriod_CloseRunItemID", itemId).order("FINChargePeriod_LineNoSnapshot")
  if (chargeError) throw new HttpError(500, chargeError.message)
  const wipDistribution = new Map(distribute(chargeRows ?? [], proposedWip, "FINChargePeriod_ExpectedRevenue").map(({ row, value }) => [row.FINChargePeriod_ID, value]))
  const accrualDistribution = new Map(distribute(chargeRows ?? [], proposedAccrual, "FINChargePeriod_ExpectedCost").map(({ row, value }) => [row.FINChargePeriod_ID, value]))
  for (const row of chargeRows ?? []) {
    const { error: allocationError } = await admin.from("FIN_JobChargePeriodAllocations").update({ FINChargePeriod_ProposedWIP: wipDistribution.get(row.FINChargePeriod_ID) ?? 0, FINChargePeriod_ProposedAccrual: accrualDistribution.get(row.FINChargePeriod_ID) ?? 0, FINChargePeriod_UpdatedAt: new Date().toISOString(), FINChargePeriod_UpdatedBy: current.User_ID }).eq("FINChargePeriod_ID", row.FINChargePeriod_ID)
    if (allocationError) throw new HttpError(500, allocationError.message)
  }
  const { data: totalsRows, error: totalsError } = await admin.from("FIN_PeriodCloseRunItems").select("FINCloseItem_ProposedWIP,FINCloseItem_ProposedAccrual").eq("FINCloseItem_CloseRunID", runId)
  if (totalsError) throw new HttpError(500, totalsError.message)
  const totals = (totalsRows ?? []).reduce((sum: any, item: any) => ({ jobCount: sum.jobCount + 1, proposedWip: amount(sum.proposedWip + amount(item.FINCloseItem_ProposedWIP)), proposedAccrual: amount(sum.proposedAccrual + amount(item.FINCloseItem_ProposedAccrual)) }), { jobCount: 0, proposedWip: 0, proposedAccrual: 0 })
  const controlTotals = { ...(run.FINCloseRun_ControlTotalsJSON ?? {}), ...totals }
  await admin.from("FIN_PeriodCloseRuns").update({ FINCloseRun_ControlTotalsJSON: controlTotals, FINCloseRun_UpdatedAt: new Date().toISOString(), FINCloseRun_UpdatedBy: current.User_ID }).eq("FINCloseRun_ID", runId)
  return { itemId, proposedWip, proposedAccrual, reviewerNote: note || null, totals }
}

async function transition(admin: any, current: any, runId: string, action: string, reason?: string) {
  const permission = action === "request_review" ? "Finance.Management.Prepare" : "Finance.Management.Approve"
  await requirePermission(admin, current.User_ID, permission)
  if (!uuid(runId)) throw new HttpError(404, "Accrual and WIP review not found.")
  const { data, error } = await admin.rpc("multideck_finance_transition_accrual_wip", { p_company_id: current.Company_ID, p_user_id: current.User_ID, p_run_id: runId, p_action: action, p_reason: clean(reason, 500) || null })
  rpcFailure(error, "The accrual and WIP review could not be updated.")
  return data
}

async function postRun(admin: any, current: any, runId: string) {
  await requirePermission(admin, current.User_ID, "Finance.Management.Post")
  if (!uuid(runId)) throw new HttpError(404, "Accrual and WIP review not found.")
  const { data, error } = await admin.rpc("multideck_finance_post_accrual_wip", { p_company_id: current.Company_ID, p_user_id: current.User_ID, p_run_id: runId })
  rpcFailure(error, "The accrual and WIP journal could not be posted.")
  return data
}

async function reverseRun(admin: any, current: any, runId: string, input: ReverseInput) {
  await requirePermission(admin, current.User_ID, "Finance.Management.Post")
  if (!uuid(runId)) throw new HttpError(404, "Accrual and WIP review not found.")
  const { data, error } = await admin.rpc("multideck_finance_reverse_accrual_wip", { p_company_id: current.Company_ID, p_user_id: current.User_ID, p_run_id: runId, p_reversal_period_code: periodCode(input.reversalPeriodCode), p_reason: clean(input.reason, 500) })
  rpcFailure(error, "The accrual and WIP journal could not be reversed.")
  return data
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    const { admin, user } = await authenticate(request); const current = await currentInternalUser(admin, user); const parts = routeParts(request, "finance-accruals")
    if (request.method === "GET" && parts[0] === "entities") return json(request, await entities(admin, current))
    if (request.method === "GET" && parts[0] === "workspace") {
      const search = new URL(request.url).searchParams
      return json(request, await workspace(admin, current, search.get("legalEntityId") ?? "", periodCode(search.get("periodCode") ?? new Date().toISOString().slice(0, 7).replace("-", ""))))
    }
    if (request.method === "POST" && parts[0] === "periods") return json(request, await ensurePeriod(admin, current, await body<PeriodInput>(request)), 201)
    if (request.method === "PUT" && parts[0] === "jobs" && parts[2] === "period") {
      await requirePermission(admin, current.User_ID, "Finance.Management.Prepare")
      const input = await body<PeriodInput>(request)
      const { data, error } = await admin.rpc("multideck_finance_assign_job_period", { p_company_id: current.Company_ID, p_user_id: current.User_ID, p_legal_entity_id: input.legalEntityId, p_job_id: parts[1], p_period_code: periodCode(input.periodCode), p_reason: clean(input.reason, 500) })
      rpcFailure(error, "The job management period could not be assigned."); return json(request, data)
    }
    if (request.method === "POST" && parts[0] === "runs" && parts.length === 1) return json(request, await createRun(admin, current, await body<RunInput>(request)), 201)
    if (request.method === "PATCH" && parts[0] === "runs" && parts[2] === "items" && parts.length === 4) return json(request, await updateItem(admin, current, parts[1], parts[3], await body<ItemInput>(request)))
    if (request.method === "POST" && parts[0] === "runs" && parts[2] === "request-review") return json(request, await transition(admin, current, parts[1], "request_review", clean((await body<{ reason?: string }>(request)).reason, 500)))
    if (request.method === "POST" && parts[0] === "runs" && parts[2] === "approve") return json(request, await transition(admin, current, parts[1], "approve", clean((await body<{ reason?: string }>(request)).reason, 500)))
    if (request.method === "POST" && parts[0] === "runs" && parts[2] === "reject") return json(request, await transition(admin, current, parts[1], "reject", clean((await body<{ reason?: string }>(request)).reason, 500)))
    if (request.method === "POST" && parts[0] === "runs" && parts[2] === "post") return json(request, await postRun(admin, current, parts[1]))
    if (request.method === "POST" && parts[0] === "runs" && parts[2] === "reverse") return json(request, await reverseRun(admin, current, parts[1], await body<ReverseInput>(request)))
    throw new HttpError(404, "Accrual and WIP endpoint not found.")
  } catch (error) { return failure(request, error) }
})
