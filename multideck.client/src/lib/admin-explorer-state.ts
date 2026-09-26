import { useSyncExternalStore } from "react"
import type { ExplorerArea } from "@/components/multideck/admin-settings-explorer"
import { adminHubs, sidebarAreas, type AdminHub, type AdminHubLink } from "@/data/navigation-data"

/**
 * The Admin settings explorer is split across the shell: the docked section
 * sidebar sits beside the main sidebar, the settings sit in the page. Both
 * read the chosen section and the search from here, and the section is kept
 * in the address so a reload or a shared link lands in the same place.
 */
type AdminExplorerState = {
  sectionId: string | null
  query: string
  /** The area the second sidebar was last opened for, so a shared page keeps the sidebar it was reached from. */
  hubId: string | null
  /** The setting last opened from the second sidebar, so two settings on one page stay distinguishable. */
  opened: { label: string; route: string } | null
}

const listeners = new Set<() => void>()
let state: AdminExplorerState = { sectionId: readSectionParam(), query: "", hubId: null, opened: null }

function readSectionParam() {
  if (typeof window === "undefined") return null
  return new URLSearchParams(window.location.search).get("section")
}

function emit(next: AdminExplorerState) {
  state = next
  listeners.forEach((listener) => listener())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useAdminExplorerState() {
  return useSyncExternalStore(subscribe, () => state, () => state)
}

/** Choosing a section also ends any search, since the list now answers a different question. */
export function selectAdminSection(sectionId: string) {
  const url = new URL(window.location.href)
  url.searchParams.set("section", sectionId)
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`)
  emit({ ...state, sectionId, query: "" })
}

export function setAdminSettingsQuery(query: string) {
  if (query !== state.query) emit({ ...state, query })
}

/** Called when a new area opens: start from its address, with no search carried over. */
export function resetAdminExplorer(hubId: string) {
  emit({ ...state, sectionId: readSectionParam(), query: "", hubId, opened: null })
}

/** Record which setting was opened, and from which area, before navigating to its page. */
export function noteAdminSettingOpened(hubId: string, setting: { label: string; route: string }) {
  emit({ ...state, hubId, opened: { label: setting.label, route: setting.route } })
}

const wideQuery = "(min-width: 1024px)"

function subscribeWide(listener: () => void) {
  const media = window.matchMedia(wideQuery)
  media.addEventListener("change", listener)
  return () => media.removeEventListener("change", listener)
}

/** True where the shell shows its desktop sidebar, which is where the section sidebar docks beside it. */
export function useDockedAdminSections() {
  return useSyncExternalStore(subscribeWide, () => window.matchMedia(wideQuery).matches, () => true)
}

/** Every Admin area in the explorer's shape, so one search reaches all of them. */
export const adminExplorerAreas: ExplorerArea[] = adminHubs.map((hub) => ({
  id: hub.id,
  label: hub.label,
  sections: hub.blocks.map((block) => ({ id: block.id, title: block.title, icon: block.icon, description: block.description, settings: block.links, comingSoon: block.comingSoon })),
  groups: hub.groups?.map((group) => ({ id: group.id, title: group.title, sectionIds: group.blockIds })),
}))

const pathOf = (route: string) => route.split(/[?#]/)[0]
const operationalRoutes = new Set(sidebarAreas
  .filter((area) => area.id !== "administration")
  .flatMap((area) => area.destinations.flatMap((destination) => [destination.route, ...(destination.children ?? []).map((child) => child.route)]))
  .filter((route): route is string => Boolean(route)))

/**
 * Which large Admin area the second sidebar belongs to on this route: the
 * area's own page, or one of its settings pages. A page shared by several
 * areas keeps the area it was opened from. Pages the main sidebar shows
 * under an operational area never get the Admin sidebar, so the two never
 * disagree about where the operator is.
 */
export function dockedAdminHubFor(route: string, hubId: string | null): AdminHub | null {
  const hubs = adminHubs.filter((hub) => hub.display === "hub")
  const landing = hubs.find((hub) => hub.route === route)
  if (landing) return landing
  if (operationalRoutes.has(route)) return null
  const contains = (hub: AdminHub) => hub.blocks.some((block) => block.links.some((link) => pathOf(link.route) === route))
  const remembered = hubs.find((hub) => hub.id === hubId)
  if (remembered && contains(remembered)) return remembered
  return hubs.find((hub) => hub.owns?.some((owned) => route === owned || route.startsWith(`${owned}/`)) && contains(hub)) ?? null
}

/** The area the second sidebar shows for this route right now, read without subscribing. */
export function adminDockHubIdFor(route: string) {
  return dockedAdminHubFor(route, state.hubId)?.id ?? null
}

/** The setting on screen now: the one opened, or the first of this area's settings for this page. */
export function activeDockSetting(hub: AdminHub, route: string, opened: AdminExplorerState["opened"]): AdminHubLink | null {
  const links = hub.blocks.flatMap((block) => block.links)
  const hash = typeof window === "undefined" ? "" : window.location.hash
  if (opened && pathOf(opened.route) === route) {
    const exact = links.find((link) => link.label === opened.label && link.route === opened.route)
    if (exact) return exact
  }
  return links.find((link) => link.route === `${route}${hash}`) ?? links.find((link) => pathOf(link.route) === route) ?? null
}

export type RecentAdminSetting = { label: string; route: string; area: string }
const recentSettingsKey = "multideck.admin.recent-settings"
const knownSettings = new Set(adminHubs.flatMap((hub) => hub.blocks.flatMap((block) => block.links.map((link) => `${link.label}|${link.route}`))))

/** The last few settings this person opened. Browser-only, so it never follows them to another device. */
export function readRecentAdminSettings(): RecentAdminSetting[] {
  try {
    const stored: unknown = JSON.parse(window.localStorage.getItem(recentSettingsKey) ?? "[]")
    if (!Array.isArray(stored)) return []
    return stored.filter((item): item is RecentAdminSetting => Boolean(item) && typeof item.label === "string" && typeof item.route === "string" && typeof item.area === "string" && knownSettings.has(`${item.label}|${item.route}`)).slice(0, 4)
  } catch {
    return []
  }
}

export function rememberAdminSetting(item: RecentAdminSetting) {
  try {
    const next = [item, ...readRecentAdminSettings().filter((recent) => recent.label !== item.label || recent.route !== item.route)].slice(0, 4)
    window.localStorage.setItem(recentSettingsKey, JSON.stringify(next))
  } catch {
    // A private window or blocked storage only loses the shortcut list.
  }
}
