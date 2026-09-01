import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"

type Db = SupabaseClient<any, "public", any, any, any>
type JsonObject = Record<string, unknown>

export type ModelPurpose = "dexter_chat" | "developer_broadcast" | "email_compose" | "email_refine" | "writing_profile" | "document_ocr" | "invoice_ocr" | "inbox_document_extraction" | "quote_intelligence" | "reference_rule"
export type DataCategory = "operator_instruction" | "business_record" | "email_content" | "document_content" | "personal_style" | "contact_details"

export type ModelGatewayContext = {
  admin: Db
  companyId: string
  userId: string
  conversationId?: string | null
}

function clean(value: unknown, maximum: number) {
  return typeof value === "string" ? value.trim().slice(0, maximum) : ""
}

function redactSecretText(value: string) {
  return value
    .replace(/\b(?:sk|rk|pk)-[A-Za-z0-9_-]{16,}\b/g, "[redacted secret]")
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, "[redacted token]")
    .replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[redacted private key]")
}

export function redactModelSecrets(value: unknown): unknown {
  if (typeof value === "string") return redactSecretText(value)
  if (Array.isArray(value)) return value.map(redactModelSecrets)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value as JsonObject).map(([key, item]) => [
    key,
    /(password|passwd|secret|api[_-]?key|authorization|cookie|private[_-]?key|access[_-]?token|refresh[_-]?token)/i.test(key)
      ? "[redacted secret]"
      : redactModelSecrets(item),
  ]))
}

function providerEnabled(provider: "openai" | "mistral", purpose: ModelPurpose) {
  if (/^(1|true|yes|on)$/i.test(Deno.env.get("DEXTER_AI_EGRESS_DISABLED")?.trim() ?? "")) return false
  if (/^(1|true|yes|on)$/i.test(Deno.env.get(`DEXTER_${provider.toUpperCase()}_DISABLED`)?.trim() ?? "")) return false
  return !/^(1|true|yes|on)$/i.test(Deno.env.get(`DEXTER_${purpose.toUpperCase()}_DISABLED`)?.trim() ?? "")
}

async function modelSecurityEvent(
  context: ModelGatewayContext,
  kind: string,
  severity: "info" | "warning" | "high",
  metadata: JsonObject,
) {
  try {
    await context.admin.from("AI_DexterSecurityEvents").insert({
      AIDexterSecurityEvent_CompanyID: context.companyId,
      AIDexterSecurityEvent_UserID: context.userId,
      AIDexterSecurityEvent_Kind: clean(kind, 80),
      AIDexterSecurityEvent_Severity: severity,
      AIDexterSecurityEvent_MetadataJSON: metadata,
    })
  } catch {
    // A telemetry failure must never bypass the provider or allowance denial.
  }
}

export async function reserveModelEgress(context: ModelGatewayContext, input: {
  provider: "openai" | "mistral"
  model: string
  purpose: ModelPurpose
  dataCategories: DataCategory[]
  recordCount?: number
  byteCount?: number
  estimatedInputUnits?: number
  estimatedOutputUnits?: number
}) {
  if (!providerEnabled(input.provider, input.purpose)) {
    await modelSecurityEvent(context, "model_capability_disabled", "warning", { provider: input.provider, purpose: input.purpose })
    throw new Error("model_capability_disabled")
  }
  const { data, error } = await context.admin.rpc("multideck_dexter_reserve_model_egress", {
    p_company_id: context.companyId,
    p_user_id: context.userId,
    p_conversation_id: context.conversationId ?? null,
    p_provider: input.provider,
    p_model: clean(input.model, 120),
    p_purpose: input.purpose,
    p_data_categories: [...new Set(input.dataCategories)],
    p_record_count: Math.max(0, Math.floor(input.recordCount ?? 0)),
    p_byte_count: Math.max(0, Math.floor(input.byteCount ?? 0)),
    p_estimated_input_units: Math.max(0, Math.floor(input.estimatedInputUnits ?? 0)),
    p_estimated_output_units: Math.max(0, Math.floor(input.estimatedOutputUnits ?? 0)),
  })
  if (error || typeof data !== "string") {
    const code = error?.code === "P0001" ? "usage_allowance_reached" : "model_allowance_unavailable"
    await modelSecurityEvent(context, code, code === "usage_allowance_reached" ? "warning" : "high", {
      provider: input.provider,
      purpose: input.purpose,
      model: clean(input.model, 120),
      recordCount: Math.max(0, Math.floor(input.recordCount ?? 0)),
      byteCount: Math.max(0, Math.floor(input.byteCount ?? 0)),
    })
    throw new Error(code)
  }
  return data
}

export async function settleModelEgress(context: ModelGatewayContext, input: {
  reservationId: string
  outcome: "succeeded" | "failed" | "denied"
  providerRequestId?: string | null
  inputUnits?: number
  outputUnits?: number
  errorCode?: string | null
}) {
  const { error } = await context.admin.rpc("multideck_dexter_settle_model_egress", {
    p_reservation_id: input.reservationId,
    p_company_id: context.companyId,
    p_user_id: context.userId,
    p_outcome: input.outcome,
    p_provider_request_id: clean(input.providerRequestId, 240) || null,
    p_input_units: Math.max(0, Math.floor(input.inputUnits ?? 0)),
    p_output_units: Math.max(0, Math.floor(input.outputUnits ?? 0)),
    p_error_code: clean(input.errorCode, 120) || null,
  })
  if (error) console.error("Dexter model egress settlement failed", { reservationId: input.reservationId, code: error.code })
}

function usageFrom(provider: "openai" | "mistral", payload: JsonObject, estimatedInputUnits = 0) {
  if (provider === "mistral") {
    const usage = payload.usage_info && typeof payload.usage_info === "object" ? payload.usage_info as JsonObject : {}
    const processedPages = Math.max(0, Number(usage.pages_processed) || 0)
    return {
      // OCR is sold and governed per page. Retain the reserved page count when
      // Mistral succeeds without returning usage_info so a real OCR request can
      // never disappear from the workspace ledger.
      inputUnits: processedPages > 0 ? processedPages : Math.max(0, Math.floor(estimatedInputUnits)),
      outputUnits: 0,
    }
  }
  const usage = payload.usage && typeof payload.usage === "object" ? payload.usage as JsonObject : {}
  return {
    inputUnits: Math.max(0, Number(usage.input_tokens) || 0),
    outputUnits: Math.max(0, Number(usage.output_tokens) || 0),
  }
}

export async function governedModelFetch(context: ModelGatewayContext, input: {
  provider: "openai" | "mistral"
  model: string
  purpose: ModelPurpose
  dataCategories: DataCategory[]
  recordCount?: number
  byteCount?: number
  estimatedInputUnits?: number
  estimatedOutputUnits?: number
  url: string
  apiKey: string
  body: JsonObject
  signal?: AbortSignal
  userAgent?: string
}) {
  const { response, reservationId } = await beginGovernedModelFetch(context, input)
  try {
    const requestId = response.headers.get("x-request-id") || response.headers.get("request-id") || null
    const clone = response.clone()
    const payload = await clone.json().catch(() => null) as JsonObject | null
    const usage = payload
      ? usageFrom(input.provider, payload, input.estimatedInputUnits)
      : { inputUnits: input.provider === "mistral" ? Math.max(0, Math.floor(input.estimatedInputUnits ?? 0)) : 0, outputUnits: 0 }
    await settleModelEgress(context, {
      reservationId,
      outcome: response.ok ? "succeeded" : "failed",
      providerRequestId: requestId,
      ...usage,
      errorCode: response.ok ? null : `provider_${response.status}`,
    })
    return response
  } catch (error) {
    await settleModelEgress(context, { reservationId, outcome: "failed", errorCode: error instanceof Error ? error.name : "gateway_failed" })
    throw error
  }
}

export async function beginGovernedModelFetch(context: ModelGatewayContext, input: {
  provider: "openai" | "mistral"
  model: string
  purpose: ModelPurpose
  dataCategories: DataCategory[]
  recordCount?: number
  byteCount?: number
  estimatedInputUnits?: number
  estimatedOutputUnits?: number
  url: string
  apiKey: string
  body: JsonObject
  signal?: AbortSignal
  userAgent?: string
}) {
  const reservationId = await reserveModelEgress(context, input)
  try {
    const safeBody = redactModelSecrets(input.body) as JsonObject
    const response = await fetch(input.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json",
        ...(input.userAgent ? { "User-Agent": input.userAgent } : {}),
      },
      body: JSON.stringify({ ...safeBody, ...(input.provider === "openai" ? { store: false } : {}) }),
      signal: input.signal,
    })
    return { response, reservationId }
  } catch (error) {
    await settleModelEgress(context, { reservationId, outcome: "failed", errorCode: error instanceof Error ? error.name : "gateway_failed" })
    throw error
  }
}
