export type WorkspaceEnvironment = "main" | "training"

export function validateTrainingConfiguration(mainUrl: string, trainingUrl: string, trainingKey: string) {
  if (!trainingUrl && !trainingKey) return "Training has not been configured for this workspace."
  try {
    const main = new URL(mainUrl)
    const training = new URL(trainingUrl)
    if (!trainingKey || training.protocol !== "https:" || training.username || training.password || training.search || training.hash || training.pathname !== "/") {
      return "The training workspace configuration is incomplete or invalid."
    }
    if (training.origin === main.origin) return "Training must use a separate Supabase project."
    return null
  } catch {
    return "The training workspace configuration is incomplete or invalid."
  }
}

const mainUrl = import.meta.env?.VITE_SUPABASE_URL?.trim() ?? ""
export const trainingSupabaseUrl = import.meta.env?.TRAINING_SUPABASE_URL?.trim() ?? ""
export const trainingSupabaseKey = import.meta.env?.TRAINING_SUPABASE_ANON_KEY?.trim() ?? ""
export const trainingConfigurationError = validateTrainingConfiguration(mainUrl, trainingSupabaseUrl, trainingSupabaseKey)
export const trainingIsConfigured = trainingConfigurationError === null
export function isPublicWorkspacePath(path: string) {
  return /^\/(?:card\/[^/]+|quotes\/respond\/[^/]+|book\/[^/]+\/[^/]+|meetings\/manage\/[^/]+)$/.test(path)
}

const storageKey = `multideck.workspace-environment:${mainUrl}`

function initialEnvironment(): WorkspaceEnvironment {
  if (typeof window === "undefined") return "main"
  // Shared customer links never inherit an operator's private tab choice.
  // Training link previews must opt in explicitly; ordinary links use Main.
  if (isPublicWorkspacePath(window.location.pathname)) {
    return new URLSearchParams(window.location.search).get("workspace") === "training" ? "training" : "main"
  }
  // An explicit auth callback carries the choice into a magic-link tab too.
  const callbackChoice = window.location.pathname === "/auth"
    ? new URLSearchParams(window.location.search).get("workspace") : null
  try {
    if (callbackChoice === "main" || callbackChoice === "training") window.sessionStorage.setItem(storageKey, callbackChoice)
    return window.sessionStorage.getItem(storageKey) === "training" ? "training" : "main"
  } catch {
    return callbackChoice === "training" ? "training" : "main"
  }
}

export const workspaceEnvironment = initialEnvironment()
export const isTrainingWorkspace = workspaceEnvironment === "training"

export function selectWorkspaceEnvironment(environment: WorkspaceEnvironment) {
  if (environment === "training" && !trainingIsConfigured) throw new Error(trainingConfigurationError!)
  try { window.sessionStorage.setItem(storageKey, environment) } catch { /* The explicit URL still carries the choice. */ }
  // Recreate clients, subscriptions and in-memory caches together. Never switch
  // a live client underneath an in-flight save or reuse another database's rows.
  window.location.assign(`/auth?workspace=${environment}`)
}

/** Keep operational recovery copies in their original project; never import Main drafts into Training. */
export function workspaceStorageKey(key: string, environment: WorkspaceEnvironment = workspaceEnvironment, project = trainingSupabaseUrl) {
  return environment === "training" ? `${key}:training:${project}` : key
}
