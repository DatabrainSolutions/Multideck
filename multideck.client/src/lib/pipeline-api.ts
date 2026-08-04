import { callCrmRpc, CrmSupabaseError } from "@/lib/crm-supabase"
import type { StatusTone } from "@/data/multideck-data"
import { invalidateCrmResources, readCachedCrmResource, type CrmReadOptions } from "@/lib/crm-read-cache"
import { getSupabaseSession } from "@/lib/supabase"

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

export class PipelineApiError extends CrmSupabaseError {}

async function mutatePipelineSettings<T>(
  action: string,
  id: string | null,
  payload: unknown,
  fallback: string,
) {
  const result = await callCrmRpc<T>(
    "multideck_crm_mutate_pipeline_settings",
    { p_action: action, p_id: id, p_payload: payload },
    fallback,
    "Sign in again to manage pipeline settings.",
    action === "delete_pipeline" || action === "delete_field",
  )
  const session = await getSupabaseSession()
  if (session) invalidateCrmResources(session.user.id, ["pipelines:"])
  return result
}

export async function getPipelineSettings(options?: CrmReadOptions) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new PipelineApiError("Sign in again to manage pipeline settings.")
  return readCachedCrmResource(
    session.user.id,
    "pipelines:settings",
    () => callCrmRpc<ApiPipelineSettings>(
      "multideck_crm_pipeline_settings",
      undefined,
      "We could not load pipeline settings.",
      "Sign in again to manage pipeline settings.",
    ),
    options,
  )
}

export async function createPipeline(pipeline: SavePipeline) {
  return mutatePipelineSettings<ApiPipeline>(
    "create_pipeline",
    null,
    pipeline,
    "We could not create this pipeline.",
  )
}

export async function savePipeline(pipelineId: string, pipeline: SavePipeline) {
  return mutatePipelineSettings<ApiPipeline>(
    "save_pipeline",
    pipelineId,
    pipeline,
    "We could not save this pipeline.",
  )
}

export async function deletePipeline(pipelineId: string) {
  await mutatePipelineSettings<null>(
    "delete_pipeline",
    pipelineId,
    null,
    "We could not delete this pipeline.",
  )
}

/** The workspace's pipeline order. The list has to name every saved pipeline, first to last. */
export async function reorderPipelines(pipelineIds: string[]) {
  return mutatePipelineSettings<ApiPipeline[]>(
    "reorder_pipelines",
    null,
    pipelineIds,
    "We could not save the pipeline order.",
  )
}

export async function createLeadField(field: CreateLeadField) {
  return mutatePipelineSettings<ApiLeadField>(
    "create_field",
    null,
    field,
    "We could not create this lead field.",
  )
}

export async function saveLeadField(fieldId: string, field: SaveLeadField) {
  return mutatePipelineSettings<ApiLeadField>(
    "save_field",
    fieldId,
    field,
    "We could not save this lead field.",
  )
}

export async function deleteLeadField(fieldId: string) {
  await mutatePipelineSettings<null>(
    "delete_field",
    fieldId,
    null,
    "We could not delete this lead field.",
  )
}

export async function reorderLeadFields(fieldIds: string[]) {
  return mutatePipelineSettings<ApiLeadField[]>(
    "reorder_fields",
    null,
    fieldIds,
    "We could not save the field order.",
  )
}
