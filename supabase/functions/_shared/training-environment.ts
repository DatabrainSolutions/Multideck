import type { SupabaseClient } from "npm:@supabase/supabase-js@2.108.2"
import { HttpError } from "./backend.ts"

export async function isTrainingDatabase(admin: SupabaseClient) {
  const { data, error } = await admin.from("training_configuration").select("singleton").eq("singleton", true).maybeSingle()
  if (error) throw new HttpError(503, "The workspace environment could not be checked. Contact your administrator.")
  return Boolean(data)
}

export async function requireMainIdentityAdministration(admin: SupabaseClient) {
  if (await isTrainingDatabase(admin)) throw new HttpError(403, "Manage accounts and permissions in Main. Training uses your team's existing access.")
}
