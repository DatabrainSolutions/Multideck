import { adminClient, authenticate, authenticatedClient, corsHeaders, currentInternalUser, HttpError, json } from "../_shared/backend.ts"
import { governedModelFetch } from "../_shared/model-gateway.ts"
import { buildSalesAnalysisSource, modelOutputText, object, parseSalesAnalysis, salesAnalysisInstructions, salesAnalysisSchemaFor, salesEvidenceFingerprint } from "./core.ts"

type Admin = ReturnType<typeof adminClient>
type Job = { companyId: string; userId: string; leaseId: string; snapshot: Record<string, unknown>; lastFingerprint: string | null }
const workerHeader = "x-multideck-crm-sales-worker"
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

async function secretsMatch(supplied: string, expected: string) {
  if (!supplied || expected.length < 32) return false
  const encoder = new TextEncoder()
  const [a, b] = await Promise.all([supplied, expected].map(value => crypto.subtle.digest("SHA-256", encoder.encode(value))))
  const left = new Uint8Array(a), right = new Uint8Array(b)
  let difference = 0
  for (let i = 0; i < left.length; i++) difference |= left[i] ^ right[i]
  return difference === 0
}

async function validJob(admin: Admin, job: Job) {
  const { data, error } = await admin.rpc("multideck_crm_validate_sales_briefing_job", {
    p_company_id: job.companyId, p_user_id: job.userId, p_lease_id: job.leaseId,
  })
  return !error && data === true
}

/** Only a leased database change can reach the provider. A page read cannot. */
export async function processSalesBriefingJobs(admin: Admin) {
  const { data: claimed, error } = await admin.rpc("multideck_crm_claim_sales_briefing_jobs", { p_limit: 1 })
  if (error || !Array.isArray(claimed)) throw new HttpError(503, "Sales briefing queue is unavailable.")
  let completed = 0, skipped = 0, failed = 0, modelCalls = 0
  for (const candidate of claimed.slice(0, 1)) {
    const value = object(candidate)
    if (![value.companyId, value.userId, value.leaseId].every(id => typeof id === "string" && uuid.test(id))) {
      failed++
      continue
    }
    const job = value as Job
    let errorCode = "generation_unavailable"
    try {
      if (!await validJob(admin, job)) { errorCode = "access_changed"; throw new Error(errorCode) }
      const snapshot = object(job.snapshot)
      const source = buildSalesAnalysisSource(snapshot)
      const { evidence, narrative } = source
      const model = Deno.env.get("CRM_SALES_INSIGHTS_MODEL")?.trim() || "gpt-5-mini"
      const fingerprint = await salesEvidenceFingerprint(source, model)
      const finish = (result: unknown, unchanged = false) => admin.rpc("multideck_crm_finish_sales_briefing_job", {
        p_company_id: job.companyId, p_user_id: job.userId, p_lease_id: job.leaseId,
        p_fingerprint: fingerprint, p_result: result, p_skipped: unchanged,
      })
      if (fingerprint === job.lastFingerprint) {
        const saved = await finish(null, true)
        if (saved.error || saved.data !== true) { errorCode = "stale_lease"; throw new Error(errorCode) }
        skipped++
        continue
      }
      const total = Number(object(snapshot.coverage).totalDeals) || 0
      if (total === 0) {
        // Empty workspaces need no paid model call and must not retain an old briefing.
        const saved = await finish(null)
        if (saved.error || saved.data !== true) { errorCode = "stale_lease"; throw new Error(errorCode) }
        completed++
        continue
      }
      // Grouping needs source text and stable references. Numeric joins and record
      // metadata stay in the application; the model cannot supply either.
      const { deals: _deals, ...narrativeInput } = narrative
      const modelInput = { ...source, narrative: narrativeInput, evidence: evidence.map(({ dealIds: _ids, ...fact }) => fact) }
      const bytes = new TextEncoder().encode(JSON.stringify(modelInput))
      if (bytes.byteLength > 60000) { errorCode = "evidence_too_large"; throw new Error(errorCode) }
      const apiKey = Deno.env.get("OPEN_API_KEY")?.trim() || Deno.env.get("OPENAI_API_KEY")?.trim()
      if (!apiKey) { errorCode = "not_configured"; throw new Error(errorCode) }
      // Recheck the actor and lease immediately before disclosure to the provider.
      if (!await validJob(admin, job)) { errorCode = "access_changed"; throw new Error(errorCode) }
      modelCalls++
      const response = await governedModelFetch({ admin, companyId: job.companyId, userId: job.userId }, {
        provider: "openai", model, purpose: "crm_sales_insights", dataCategories: ["business_record"],
        recordCount: evidence.length + narrative.documents.length, byteCount: bytes.byteLength, estimatedInputUnits: Math.ceil(bytes.byteLength / 3) + 1500, estimatedOutputUnits: 8000,
        url: "https://api.openai.com/v1/responses", apiKey, signal: AbortSignal.timeout(45000),
        body: { model, store: false, reasoning: { effort: "low" }, instructions: salesAnalysisInstructions,
          input: [{ role: "user", content: [{ type: "input_text", text: JSON.stringify(modelInput) }] }], max_output_tokens: 8000,
          text: { format: { type: "json_schema", name: "sales_insights", strict: true, schema: salesAnalysisSchemaFor(evidence, narrative) } },
        },
      })
      if (!response.ok) { errorCode = "provider_unavailable"; throw new Error(errorCode) }
      errorCode = "invalid_response"
      const envelope = object(await response.json())
      if (envelope.status === "incomplete" || envelope.error) throw new Error("incomplete_model_response")
      const payload = JSON.parse(modelOutputText(envelope))
      errorCode = "invalid_evidence"
      const result = parseSalesAnalysis(payload, evidence, String(snapshot.generatedAt), undefined, narrative)
      if (!await validJob(admin, job)) { errorCode = "access_changed"; throw new Error(errorCode) }
      const saved = await finish(result)
      if (saved.error || saved.data !== true) { errorCode = "stale_lease"; throw new Error(errorCode) }
      completed++
    } catch (cause) {
      failed++
      const known = cause instanceof Error ? cause.message : ""
      if (["usage_allowance_reached", "model_capability_disabled", "model_allowance_unavailable"].includes(known)) errorCode = known
      const recorded = await admin.rpc("multideck_crm_fail_sales_briefing_job", {
        p_company_id: job.companyId, p_user_id: job.userId, p_lease_id: job.leaseId, p_error_code: errorCode,
      })
      if (recorded.error) console.error("Sales briefing failure could not be recorded", { code: recorded.error.code })
    }
  }
  return { completed, skipped, failed, modelCalls }
}

export async function handleSalesInsights(request: Request) {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) })
  try {
    if (request.method !== "POST") throw new HttpError(405, "Use POST to read the saved sales briefing.")
    if (request.headers.has(workerHeader)) {
      const admin = adminClient()
      const { data: expected, error } = await admin.rpc("multideck_crm_sales_briefing_worker_secret")
      if (error || typeof expected !== "string" || !await secretsMatch(request.headers.get(workerHeader) || "", expected)) {
        throw new HttpError(401, "Worker authorisation failed.")
      }
      return json(request, await processSalesBriefingJobs(admin))
    }
    // Compatibility with an older browser: this endpoint now only reads saved work.
    // The payload cannot request a model call, scope another company or force a refresh.
    const { admin, user, token } = await authenticate(request)
    await currentInternalUser(admin, user)
    const { data, error } = await authenticatedClient(token).rpc("multideck_crm_get_sales_briefing")
    if (error) throw new HttpError(error.code === "42501" ? 403 : 503, "The saved sales briefing could not be loaded.")
    return json(request, data)
  } catch (error) {
    return json(request, { message: error instanceof HttpError ? error.message : "The sales briefing is temporarily unavailable." }, error instanceof HttpError ? error.status : 503)
  }
}
if (import.meta.main) Deno.serve(handleSalesInsights)
