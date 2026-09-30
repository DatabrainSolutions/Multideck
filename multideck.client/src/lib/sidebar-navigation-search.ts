import type { AdminHub, AdminHubLink, NavItem, SidebarArea } from "../data/navigation-data"

export type SidebarNavigationResult = NavItem & {
  id: string
  context: string
  areaId?: string
  destinationId?: string
  keywords?: string
  adminSetting?: { hubId: string; area: string; link: AdminHubLink }
}

/** Only expand the navigation supplied by the caller after its permission filters. */
export function sidebarNavigationIndex(areas: SidebarArea[], hubs: AdminHub[], shortcuts: NavItem[] = []) {
  const entries: SidebarNavigationResult[] = shortcuts.map((item) => ({ ...item, id: `shortcut:${item.route}`, context: "Quick links" }))
  for (const area of areas) {
    entries.push({ id: area.id, label: area.label, icon: area.icon, context: "Area", areaId: area.id })
    for (const destination of area.destinations) {
      if (!destination.route && !destination.children?.some((child) => child.route)) continue
      const hub = area.id === "administration" ? hubs.find((entry) => destination.id === `admin-${entry.id}`) : undefined
      entries.push({ ...destination, id: `${area.id}:${destination.id}`, context: area.label, areaId: area.id, destinationId: destination.children?.length ? destination.id : undefined })
      if (hub) {
        for (const block of hub.blocks) {
          for (const link of block.links) {
            entries.push({ ...link, icon: link.icon ?? block.icon, id: `${area.id}:${hub.id}:${block.id}:${link.label}:${link.route}`, context: `${area.label} › ${hub.label} › ${block.title}`, areaId: area.id, adminSetting: { hubId: hub.id, area: hub.label, link } })
          }
        }
      } else {
        for (const child of destination.children ?? []) {
          if (!child.route) continue
          entries.push({ ...child, id: `${area.id}:${destination.id}:${child.label}:${child.route}`, context: `${area.label} › ${destination.label}`, areaId: area.id })
        }
      }
    }
  }
  return entries
}

function normalise(value: string) {
  return value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, " ").trim()
}

export function searchSidebarNavigation(entries: SidebarNavigationResult[], query: string) {
  const needle = normalise(query)
  if (!needle) return []
  const words = needle.split(/\s+/)
  return entries.flatMap((entry) => {
    const label = normalise(entry.label)
    const searchable = normalise(`${entry.label} ${entry.context} ${entry.keywords ?? ""}`)
    if (!words.every((word) => searchable.includes(word))) return []
    const rank = label === needle ? 0 : label.startsWith(needle) ? 1 : words.every((word) => label.includes(word)) ? 2 : 3
    return [{ entry, rank }]
  }).sort((a, b) => a.rank - b.rank).map(({ entry }) => entry)
}
