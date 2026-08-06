import AsyncStorage from "@react-native-async-storage/async-storage"

export type WorkspaceConfiguration = {
  version: 1
  workspace: {
    slug: string
    name: string
  }
  supabase: {
    url: string
    publishableKey: string
  }
}

const selectedWorkspaceKey = "multideck.mobile.workspace.v1"
const reservedWorkspaceSlugs = new Set(["admin", "api", "auth", "data", "support", "www"])
const rootHost = (process.env.EXPO_PUBLIC_MULTIDECK_ROOT_HOST || "multideck.app").trim().toLowerCase()

export function normalizeWorkspaceSlug(value: string): string {
  const normalizedValue = value.trim().toLowerCase().replace(/^https?:\/\//, "")
  const hostname = normalizedValue.split(/[/?#]/, 1)[0]?.replace(/\.$/, "") ?? ""
  const tenantSuffix = `.${rootHost}`
  return hostname.endsWith(tenantSuffix) ? hostname.slice(0, -tenantSuffix.length) : hostname
}

export function isValidWorkspaceSlug(value: string): boolean {
  return /^(?=.{1,63}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(value) && !reservedWorkspaceSlugs.has(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value))
}

function isValidSupabaseUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === "https:" && !url.username && !url.password && url.pathname.replace(/\/$/, "") === ""
  } catch {
    return false
  }
}

export function parseWorkspaceConfiguration(value: unknown, expectedSlug: string): WorkspaceConfiguration {
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.workspace) || !isRecord(value.supabase)) {
    throw new Error("The workspace returned an invalid mobile configuration.")
  }

  const slug = value.workspace.slug
  const name = value.workspace.name
  const url = value.supabase.url
  const publishableKey = value.supabase.publishableKey

  if (
    typeof slug !== "string" ||
    slug !== expectedSlug ||
    !isValidWorkspaceSlug(slug) ||
    typeof name !== "string" ||
    !name.trim() ||
    typeof url !== "string" ||
    !isValidSupabaseUrl(url) ||
    typeof publishableKey !== "string" ||
    publishableKey.length < 20
  ) {
    throw new Error("The workspace mobile configuration did not pass validation.")
  }

  return {
    version: 1,
    workspace: { slug, name: name.trim() },
    supabase: { url, publishableKey },
  }
}

function getDiscoveryUrl(slug: string): string {
  const developmentOrigin = __DEV__ ? process.env.EXPO_PUBLIC_MULTIDECK_DISCOVERY_ORIGIN?.trim() : undefined
  const origin = developmentOrigin || `https://${slug}.${rootHost}`
  return `${origin.replace(/\/$/, "")}/.well-known/multideck-mobile.json`
}

export async function discoverWorkspace(rawSlug: string): Promise<WorkspaceConfiguration> {
  const slug = normalizeWorkspaceSlug(rawSlug)
  if (!isValidWorkspaceSlug(slug)) throw new Error("invalid_workspace")

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), 8_000)

  try {
    const discoveryUrl = getDiscoveryUrl(slug)
    const response = await fetch(discoveryUrl, {
      headers: { Accept: "application/json" },
      redirect: "error",
      signal: controller.signal,
    })
    if (!response.ok) throw new Error(`workspace_unavailable:${response.status}`)
    if (response.url && response.url !== discoveryUrl) throw new Error("workspace_redirected")

    return parseWorkspaceConfiguration(await response.json(), slug)
  } finally {
    clearTimeout(timeout)
  }
}

export async function saveWorkspace(configuration: WorkspaceConfiguration): Promise<void> {
  await AsyncStorage.setItem(selectedWorkspaceKey, JSON.stringify(configuration))
}

export async function loadWorkspace(): Promise<WorkspaceConfiguration | null> {
  const storedValue = await AsyncStorage.getItem(selectedWorkspaceKey)
  if (!storedValue) return null

  try {
    const parsedValue: unknown = JSON.parse(storedValue)
    if (!isRecord(parsedValue) || !isRecord(parsedValue.workspace) || typeof parsedValue.workspace.slug !== "string") {
      throw new Error("Invalid stored workspace")
    }
    return parseWorkspaceConfiguration(parsedValue, parsedValue.workspace.slug)
  } catch {
    await AsyncStorage.removeItem(selectedWorkspaceKey)
    return null
  }
}

export async function forgetWorkspace(): Promise<void> {
  await AsyncStorage.removeItem(selectedWorkspaceKey)
}
