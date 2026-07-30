import { getSupabaseSession, supabase } from "@/lib/supabase"

type RpcArguments = Record<string, unknown>

const SAFE_DATABASE_ERROR_CODES = new Set(["22023", "23505", "42501", "55000", "P0002"])

export class CrmSupabaseError extends Error {}

export async function callCrmRpc<T>(
  functionName: string,
  args: RpcArguments | undefined,
  fallback: string,
  signInMessage: string,
  allowNull = false,
) {
  if (!supabase) {
    throw new CrmSupabaseError("Supabase is not configured for this workspace.")
  }

  const session = await getSupabaseSession()
  if (!session?.access_token) {
    throw new CrmSupabaseError(signInMessage)
  }

  const rpc = supabase.rpc(functionName, args)
  const timeout = new Promise<never>((_, reject) => {
    window.setTimeout(
      () => reject(new CrmSupabaseError("The CRM data request timed out. Try again.")),
      15_000,
    )
  })

  const { data, error } = await Promise.race([rpc, timeout])
  if (error) {
    const message = SAFE_DATABASE_ERROR_CODES.has(error.code) ? error.message : fallback
    throw new CrmSupabaseError(message || fallback)
  }
  if ((data === null && !allowNull) || data === undefined) {
    throw new CrmSupabaseError(fallback)
  }

  return data as T
}
