import { apiFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"
import type { StatusTone } from "@/data/multideck-data"

export type ApiPipelineStage = {
  id: string
  name: string
  tone: StatusTone
  rule: string
  probability: number
  sortOrder: number
  isDefaultEntry: boolean
  isConversion: boolean
}

export type ApiPipeline = {
  id: string
  name: string
  owner: string
  automation: string
  sortOrder: number
  defaultStage: string
  conversionStage: string
  stages: ApiPipelineStage[]
}

export type ApiLeadField = {
  id: string
  label: string
  type: string
  options: string[]
  activeOptions: string[]
  sortOrder: number
}

export type ApiPipelineSettings = {
  pipelines: ApiPipeline[]
  fields: ApiLeadField[]
}

export type SavePipelineStage = {
  id: string | null
  name: string
  tone: StatusTone
  rule: string
  probability: number
  isDefaultEntry: boolean
  isConversion: boolean
}

export type SavePipeline = {
  name: string
  owner: string
  automation: string
  stages: SavePipelineStage[]
}

export type SaveLeadField = {
  activeOptions: string[]
  label?: string
  type?: string
  options?: string[]
}

export type CreateLeadField = {
  label: string
  type: string
  options: string[]
  activeOptions?: string[]
}

export class PipelineApiError extends Error {}

async function readPipelineResponse<T>(response: Response, fallback: string) {
  if (response.ok) return response.json() as Promise<T>
  throw new PipelineApiError((await readPipelineError(response)) || fallback)
}

/** Delete returns 204, so there is no body to parse on the way through. */
async function readEmptyPipelineResponse(response: Response, fallback: string) {
  if (response.ok) return
  throw new PipelineApiError((await readPipelineError(response)) || fallback)
}

async function readPipelineError(response: Response) {
  let message = `${response.status} ${response.statusText}`.trim()
  try {
    const problem = await response.json()
    message = problem.detail || problem.title || message
  } catch {
    // Keep the HTTP status fallback for non-JSON failures.
  }
  return message
}

async function authorizedPipelineRequest(path: string, init: RequestInit = {}) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new PipelineApiError("Sign in again to manage pipeline settings.")

  try {
    return await apiFetch(path, {
      ...init,
      headers: {
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        Authorization: `Bearer ${session.access_token}`,
      },
    })
  } catch (error) {
    throw new PipelineApiError(
      "The CRM service could not be reached. Check that the local API is running and try again.",
      { cause: error },
    )
  }
}

export async function getPipelineSettings() {
  const response = await authorizedPipelineRequest("/api/v1/crm/pipeline-settings")
  return readPipelineResponse<ApiPipelineSettings>(response, "We could not load pipeline settings.")
}

export async function createPipeline(pipeline: SavePipeline) {
  const response = await authorizedPipelineRequest("/api/v1/crm/pipeline-settings/pipelines", {
    method: "POST",
    body: JSON.stringify(pipeline),
  })
  return readPipelineResponse<ApiPipeline>(response, "We could not create this pipeline.")
}

export async function savePipeline(pipelineId: string, pipeline: SavePipeline) {
  const response = await authorizedPipelineRequest(`/api/v1/crm/pipeline-settings/pipelines/${encodeURIComponent(pipelineId)}`, {
    method: "PUT",
    body: JSON.stringify(pipeline),
  })
  return readPipelineResponse<ApiPipeline>(response, "We could not save this pipeline.")
}

export async function deletePipeline(pipelineId: string) {
  const response = await authorizedPipelineRequest(`/api/v1/crm/pipeline-settings/pipelines/${encodeURIComponent(pipelineId)}`, {
    method: "DELETE",
  })
  return readEmptyPipelineResponse(response, "We could not delete this pipeline.")
}

/** The workspace's pipeline order. The list has to name every saved pipeline, first to last. */
export async function reorderPipelines(pipelineIds: string[]) {
  const response = await authorizedPipelineRequest("/api/v1/crm/pipeline-settings/pipelines/order", {
    method: "PUT",
    body: JSON.stringify({ pipelineIds }),
  })
  return readPipelineResponse<ApiPipeline[]>(response, "We could not save the pipeline order.")
}

export async function createLeadField(field: CreateLeadField) {
  const response = await authorizedPipelineRequest("/api/v1/crm/pipeline-settings/fields", {
    method: "POST",
    body: JSON.stringify(field),
  })
  return readPipelineResponse<ApiLeadField>(response, "We could not create this lead field.")
}

export async function saveLeadField(fieldId: string, field: SaveLeadField) {
  const response = await authorizedPipelineRequest(`/api/v1/crm/pipeline-settings/fields/${encodeURIComponent(fieldId)}`, {
    method: "PUT",
    body: JSON.stringify(field),
  })
  return readPipelineResponse<ApiLeadField>(response, "We could not save this lead field.")
}

export async function deleteLeadField(fieldId: string) {
  const response = await authorizedPipelineRequest(`/api/v1/crm/pipeline-settings/fields/${encodeURIComponent(fieldId)}`, {
    method: "DELETE",
  })
  return readEmptyPipelineResponse(response, "We could not delete this lead field.")
}

export async function reorderLeadFields(fieldIds: string[]) {
  const response = await authorizedPipelineRequest("/api/v1/crm/pipeline-settings/fields/order", {
    method: "PUT",
    body: JSON.stringify({ fieldIds }),
  })
  return readPipelineResponse<ApiLeadField[]>(response, "We could not save the field order.")
}
