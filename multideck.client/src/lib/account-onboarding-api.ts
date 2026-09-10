import { edgeFetch, type ApiTeamUser } from "@/lib/api"
import { authSupabase, getSupabaseSession } from "@/lib/supabase"
import { invalidateWorkspaceBootstrap } from "@/lib/workspace-bootstrap"

export const accountSetupSteps = ["password", "photo", "work", "availability", "connections", "dexter", "dictation", "appearance"] as const
export type AccountSetupStep = typeof accountSetupSteps[number]
export type AccountSetupState = { version: 1; step: Exclude<AccountSetupStep, "password">; completed: AccountSetupStep[]; tutorialStage: number; completedAt: string | null }
export type AccountSetupData = {
  state: AccountSetupState | null
  profile: ApiTeamUser
  departments: { id: string; name: string }[]
  hasProfileDepartments: boolean
  themeMode: string | null
  accentPreset: string | null
  profileDepartmentIds: string[]
  preferredName: string
  phone: string
}
export type InvitationPreview = { firstName: string; name: string; email: string; workspaceName: string }

async function request<T>(payload?: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const session = await getSupabaseSession()
  if (!session) throw new Error("Sign in to continue setting up your account.")
  const response = await edgeFetch("account", "/onboarding", session.access_token, { method: payload ? "PATCH" : "GET", signal, ...(payload ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) } : {}) })
  const result = await response.json().catch(() => null)
  if (!response.ok) throw new Error(result?.detail || result?.message || result?.error || "Your account setup could not be loaded. Please try again.")
  if (payload) invalidateWorkspaceBootstrap()
  return result as T
}

export async function getAccountSetup(signal?: AbortSignal) {
  const result = await request<AccountSetupData>(undefined, signal)
  if (!result?.profile || !Array.isArray(result.departments) || !Array.isArray(result.profileDepartmentIds)) {
    throw new Error("Account setup is not available on this workspace version yet. Please try again shortly.")
  }
  return result
}
export function saveAccountSetup(payload: Record<string, unknown>) { return request<{ state: AccountSetupState }>(payload) }

async function invitationRequest<T>(payload: Record<string, string>) {
  if (!authSupabase) throw new Error("This workspace is not available. Please contact your administrator.")
  const { data, error } = await authSupabase.functions.invoke<T>("accept-invitation", { body: payload })
  if (error) {
    const context = "context" in error ? error.context : null
    const detail = context instanceof Response ? await context.json().catch(() => null) : null
    throw new Error(detail?.detail || detail?.message || detail?.error || "We couldn’t check this invitation. Try again, or ask your administrator for a fresh link.")
  }
  if (!data) throw new Error("Your invitation could not be loaded.")
  return data
}
export function previewInvitation(ticket: string) { return invitationRequest<InvitationPreview>({ action: "preview", ticket }) }
export async function acceptAccountInvitation(ticket: string, password: string) {
  const result = await invitationRequest<{ email: string }>({ ticket, password })
  // Remove the one-time invitation from the address bar as soon as it is used.
  window.history.replaceState({}, "", "/auth?mode=invite")
  const { data, error } = await authSupabase!.auth.signInWithPassword({ email: result.email, password })
  if (error || !data.session) throw new Error("Your password is ready, but automatic sign-in did not finish. Sign in with your new password to resume setup.")
  return data.session
}
