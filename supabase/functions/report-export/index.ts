import { zipSync, strToU8 } from "npm:fflate@0.8.3"
import { authenticate, authenticatedClient, body, corsHeaders, HttpError, json } from "../_shared/backend.ts"
import { csv, docxEntries, workbookEntries, type ExportRun } from "./export-core.ts"

const zip = (entries: Record<string, string>) => zipSync(Object.fromEntries(Object.entries(entries).map(([path, value]) => [path, strToU8(value)])))
function renderer() {
  const configured = Deno.env.get("CARBONE_URL")?.trim().replace(/\/$/, "")
  if (!configured || new URL(configured).protocol !== "https:") throw new HttpError(503, "The PDF renderer is not configured for this workspace. Your snapshot and Excel download are available.")
  const explicit = Deno.env.get("CARBONE_AUTH_HEADER")?.trim()
  const username = Deno.env.get("CARBONE_USERNAME"), password = Deno.env.get("CARBONE_PASSWORD"), token = Deno.env.get("CARBONE_API_TOKEN")?.trim()
  const authorization = explicit || (username && password ? `Basic ${btoa(`${username}:${password}`)}` : token ? `Bearer ${token}` : null)
  if (!authorization) throw new HttpError(503, "The PDF renderer is not configured for this workspace.")
  return { url: configured, authorization }
}
Deno.serve(async request => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(request) })
  try {
    if (request.method !== "POST") throw new HttpError(405, "Use POST to download a report.")
    const { token } = await authenticate(request)
    const input = await body<{ runId: string; format: string }>(request)
    if (!/^[0-9a-f-]{36}$/i.test(input.runId) || !["csv", "xlsx", "pdf"].includes(input.format)) throw new HttpError(400, "Choose a saved report and download format.")
    const client = authenticatedClient(token)
    // No client-submitted rows or service-role reads of snapshots. The RPC checks
    // both current and historical sources, owner access and account status.
    const { data, error } = await client.rpc("reporting_workspace", { action: "get_run", payload: { id: input.runId } })
    if (error) throw new HttpError(error.code === "42501" ? 403 : 400, error.message)
    if (data.status !== "ready" || !data.snapshot) throw new HttpError(409, "This snapshot is not ready to download.")
    const run = data as ExportRun
    let bytes: Uint8Array; let mime: string
    if (input.format === "csv") { bytes = strToU8(csv(run)); mime = "text/csv; charset=utf-8" }
    else if (input.format === "xlsx") { bytes = zip(workbookEntries(run)); mime = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
    else {
      const carbone = renderer()
      const templateData: Record<string, string> = {}
      const template = zip(docxEntries(run, templateData))
      if (template.length > 15 * 1024 * 1024) throw new HttpError(413, "This document is too large for PDF. Reduce the report or download Excel.")
      let binary = ""; for (let i = 0; i < template.length; i += 8192) binary += String.fromCharCode(...template.subarray(i, i + 8192))
      const response = await fetch(`${carbone.url}/render/template?download=true`, { method: "POST", headers: { "Content-Type": "application/json", Authorization: carbone.authorization, "carbone-version": Deno.env.get("CARBONE_API_VERSION") || "5" },
        body: JSON.stringify({ template: btoa(binary), data: templateData, convertTo: "pdf", reportName: `report-${run.id}`, lang: "en-gb", converter: "L" }), signal: AbortSignal.timeout(90_000) })
      if (!response.ok) throw new HttpError(502, "The PDF renderer could not finish. Your snapshot is saved. Please retry or download Excel.")
      bytes = new Uint8Array(await response.arrayBuffer()); mime = "application/pdf"
      if (bytes.length > 50 * 1024 * 1024 || new TextDecoder().decode(bytes.slice(0, 5)) !== "%PDF-") throw new HttpError(502, "The renderer returned an invalid PDF. Please try again.")
    }
    return new Response(bytes, { headers: { ...corsHeaders(request), "Content-Type": mime, "Cache-Control": "no-store", "Content-Disposition": `attachment; filename="report-${run.id}.${input.format}"` } })
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500
    return json(request, { detail: e instanceof HttpError ? e.message : "The download could not be completed. Your report snapshot is saved; please try again." }, status)
  }
})
