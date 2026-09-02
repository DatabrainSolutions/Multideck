import { useEffect, useSyncExternalStore } from "react"
import { getSupabaseSession } from "@/lib/supabase"
import { getTenantBranding, type TenantBranding } from "@/lib/tenant-branding-api"

export type CompanyAppearanceBrand = Pick<
  TenantBranding,
  "configured" | "brandId" | "displayName" | "logoUrl" | "logoMimeType" | "primaryColor" | "secondaryColor" | "updatedAt"
>

type CompanyAppearanceState = {
  status: "idle" | "loading" | "ready" | "unavailable" | "error"
  brand: CompanyAppearanceBrand | null
}

const storageKey = "multideck.companyAppearance"
const listeners = new Set<() => void>()

function isHex(value: unknown): value is string {
  return typeof value === "string" && /^#[0-9a-f]{6}$/i.test(value)
}

/**
 * The signed-in shell only co-brands when Admin has saved a usable identity.
 * A reviewed website import may not find a safe logo asset, so the logo is
 * optional and the UI renders a company-initials mark until one is uploaded.
 */
export function isCompanyAppearanceBrand(value: unknown): value is CompanyAppearanceBrand {
  if (!value || typeof value !== "object") return false
  const brand = value as Partial<CompanyAppearanceBrand>
  const savedBrand = brand.configured === true || (
    // Local development can briefly run against the previous deployed Edge
    // Function response, which predates the explicit `configured` field. A
    // persisted brand id + update timestamp is equivalent evidence there; the
    // complete name and colour checks below still prevent defaults or
    // half-finished Admin branding from appearing in Profile Settings.
    typeof brand.configured === "undefined"
    && typeof brand.brandId === "string"
    && Boolean(brand.brandId.trim())
    && typeof brand.updatedAt === "string"
    && Boolean(brand.updatedAt.trim())
  )

  return savedBrand
    && typeof brand.displayName === "string"
    && Boolean(brand.displayName.trim())
    && isHex(brand.primaryColor)
    && isHex(brand.secondaryColor)
}

export function companyAppearanceInitials(displayName: string) {
  const words = displayName.trim().split(/\s+/).filter(Boolean)
  if (!words.length) return "CO"
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase()
  return `${words[0][0]}${words.at(-1)?.[0] ?? ""}`.toUpperCase()
}

function readCachedBrand(): CompanyAppearanceBrand | null {
  if (typeof window === "undefined") return null
  try {
    const parsed = JSON.parse(window.localStorage.getItem(storageKey) ?? "null") as unknown
    return isCompanyAppearanceBrand(parsed) ? parsed : null
  } catch {
    return null
  }
}

const initialBrand = readCachedBrand()
let state: CompanyAppearanceState = { status: initialBrand ? "ready" : "idle", brand: initialBrand }
let loadedUserId: string | null = null
let request: Promise<CompanyAppearanceState> | null = null
let requestVersion = 0

function publish(next: CompanyAppearanceState) {
  state = next
  for (const listener of listeners) listener()
}

function cacheBrand(brand: CompanyAppearanceBrand | null) {
  try {
    if (brand) window.localStorage.setItem(storageKey, JSON.stringify(brand))
    else window.localStorage.removeItem(storageKey)
  } catch {
    // The live brand remains usable when browser storage is unavailable.
  }
}

export function getCompanyAppearanceSnapshot() {
  return state
}

export function subscribeCompanyAppearance(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export async function loadCompanyAppearance({ force = false } = {}) {
  const session = await getSupabaseSession()
  const userId = session?.user.id ?? null
  if (!session || !userId) {
    requestVersion += 1
    request = null
    loadedUserId = null
    // `/settings` is intentionally available as a local navigation lab without
    // an auth session. Keep a previously verified, complete Admin brand there
    // so the company choice can be inspected on localhost. Production signed-
    // out surfaces still discard it and remain fully Multideck-branded.
    if (import.meta.env.DEV && state.brand) {
      publish({ status: "ready", brand: state.brand })
      return state
    }
    publish({ status: "unavailable", brand: null })
    return state
  }

  if (!force && loadedUserId === userId && (state.status === "ready" || state.status === "unavailable")) return state
  if (!force && loadedUserId === userId && request) return request

  loadedUserId = userId
  const version = ++requestVersion
  publish({ status: "loading", brand: state.brand })
  request = getTenantBranding(session.access_token)
    .then((branding) => {
      if (version !== requestVersion || loadedUserId !== userId) return state
      const brand = isCompanyAppearanceBrand(branding) ? branding : null
      cacheBrand(brand)
      publish({ status: brand ? "ready" : "unavailable", brand })
      return state
    })
    .catch(() => {
      if (version !== requestVersion || loadedUserId !== userId) return state
      // A transient read failure must not erase a previously valid user choice.
      publish({ status: "error", brand: state.brand })
      return state
    })
    .finally(() => { if (version === requestVersion) request = null })

  return request
}

/** Keeps Profile Settings and the sidebar current after Admin Branding saves. */
export function notifyCompanyAppearanceChanged(branding: TenantBranding) {
  requestVersion += 1
  request = null
  const brand = isCompanyAppearanceBrand(branding) ? branding : null
  cacheBrand(brand)
  publish({ status: brand ? "ready" : "unavailable", brand })
}

export function useCompanyAppearance(userId?: string | null) {
  const snapshot = useSyncExternalStore(subscribeCompanyAppearance, getCompanyAppearanceSnapshot, getCompanyAppearanceSnapshot)
  useEffect(() => { void loadCompanyAppearance() }, [userId])
  return snapshot
}
