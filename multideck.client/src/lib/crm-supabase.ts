import { getSupabaseSession, supabase } from "@/lib/supabase"

type RpcArguments = Record<string, unknown>

const SAFE_DATABASE_ERROR_CODES = new Set(["22023", "23505", "42501", "55000", "P0002"])

export class CrmSupabaseError extends Error {}
export class CrmConflictError extends CrmSupabaseError {}
export class CrmMutationOutcomeUnknownError extends CrmSupabaseError {}

function transportError(mutation: boolean) {
  return mutation
    ? new CrmMutationOutcomeUnknownError("The CRM did not confirm whether that change was saved. Refresh this record before trying again.")
    : new CrmSupabaseError("The CRM could not be reached. Check your connection and try again.")
}

export async function callCrmRpc<T>(
  functionName: string,
  args: RpcArguments | undefined,
  fallback: string,
  signInMessage: string,
  allowNull = false,
  mutation = false,
) {
  if (!supabase) {
    throw new CrmSupabaseError("Supabase is not configured for this workspace.")
  }

  const session = await getSupabaseSession()
  if (!session?.access_token) {
    throw new CrmSupabaseError(signInMessage)
  }

  const controller = new AbortController()
  const timeoutId = globalThis.setTimeout(() => controller.abort(), 15_000)

  try {
    const { data, error } = await supabase.rpc(functionName, args).abortSignal(controller.signal)
    if (controller.signal.aborted) {
      throw transportError(mutation)
    }
    if (error) {
      if (error.code === "P0001" && error.message?.startsWith("CRM_CONFLICT:")) {
        throw new CrmConflictError(error.message.replace(/^CRM_CONFLICT:\s*/, ""))
      }
      const message = SAFE_DATABASE_ERROR_CODES.has(error.code) ? error.message : fallback
      throw new CrmSupabaseError(message || fallback)
    }
    if ((data === null && !allowNull) || data === undefined) {
      throw new CrmSupabaseError(fallback)
    }

    return data as T
  } catch (error) {
    if (controller.signal.aborted) {
      throw transportError(mutation)
    }
    if (error instanceof CrmSupabaseError) throw error
    throw transportError(mutation)
  } finally {
    globalThis.clearTimeout(timeoutId)
  }
}

export function callCrmMutation<T>(
  functionName: string,
  args: RpcArguments | undefined,
  fallback: string,
  signInMessage: string,
  allowNull = false,
) {
  return callCrmRpc<T>(functionName, args, fallback, signInMessage, allowNull, true)
}
