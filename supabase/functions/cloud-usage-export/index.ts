import "jsr:@supabase/functions-js/edge-runtime.d.ts"
import { createClient } from "npm:@supabase/supabase-js@2.108.2"

const supabaseUrl = Deno.env.get("SUPABASE_URL")!
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
const cloudUrl = Deno.env.get("CLOUD_USAGE_INGESTION_URL")?.trim()
const cloudCredential = Deno.env.get("CLOUD_USAGE_INGESTION_SECRET")?.trim()
const workerSecret = Deno.env.get("MULTIDECK_CLOUD_USAGE_WORKER_SECRET")?.trim()

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } })
}

function safeCloudUrl(value: string | undefined) {
  if (!value) return null
  try {
    const url = new URL(value)
    return url.protocol === "https:" && url.pathname.endsWith("/functions/v1/cloud-usage-ingest") ? url.toString() : null
  } catch { return null }
}

async function deliver(endpoint: string, event: Record<string, unknown>) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-cloud-usage-secret": cloudCredential! },
    body: JSON.stringify(event),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`Cloud usage delivery failed (${response.status})`)
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return json({ title: "Usage exporter endpoint not found." }, 404)
  if (!workerSecret || request.headers.get("x-multideck-cloud-usage-worker") !== workerSecret) {
    return json({ title: "Usage exporter credential denied." }, 401)
  }
  const endpoint = safeCloudUrl(cloudUrl)
  if (!endpoint || !cloudCredential || cloudCredential.length < 32) return json({ title: "Cloud usage reporting is not configured." }, 503)

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
  const since = new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString()
  const [mistralResult, carboneResult] = await Promise.all([
    admin.from("AI_DexterModelEgressAudit")
      .select("AIDexterEgress_ID,AIDexterEgress_Model,AIDexterEgress_InputUnits,AIDexterEgress_CreatedAt")
      .eq("AIDexterEgress_Provider", "mistral").eq("AIDexterEgress_Outcome", "succeeded")
      .in("AIDexterEgress_Purpose", ["document_ocr", "invoice_ocr"])
      .gte("AIDexterEgress_CreatedAt", since).order("AIDexterEgress_CreatedAt").limit(1000),
    admin.from("DOCB_RenderJobs")
      .select("DOCBRJ_ID,DOCBRJ_CompletedAt")
      .eq("DOCBRJ_StatusCode", "completed").ilike("DOCBRJ_RenderEngineCode", "carbone")
      .gte("DOCBRJ_CompletedAt", since).order("DOCBRJ_CompletedAt").limit(1000),
  ])
  if (mistralResult.error || carboneResult.error) {
    console.error("cloud-usage-export: local usage query failed", mistralResult.error ?? carboneResult.error)
    return json({ title: "Local usage could not be read." }, 503)
  }

  let delivered = 0
  for (const row of mistralResult.data ?? []) {
    await deliver(endpoint, {
      sourceEventId: `mistral:${row.AIDexterEgress_ID}`,
      occurredAt: row.AIDexterEgress_CreatedAt,
      status: "successful", provider: "mistral",
      model: row.AIDexterEgress_Model,
      pageCount: Math.max(1, Number(row.AIDexterEgress_InputUnits ?? 1)),
      structuredAnnotation: false,
    })
    delivered += 1
  }
  for (const row of carboneResult.data ?? []) {
    await deliver(endpoint, {
      sourceEventId: `carbone:${row.DOCBRJ_ID}`,
      occurredAt: row.DOCBRJ_CompletedAt,
      status: "successful", provider: "carbone", documentCount: 1,
    })
    delivered += 1
  }
  return json({ delivered })
})
