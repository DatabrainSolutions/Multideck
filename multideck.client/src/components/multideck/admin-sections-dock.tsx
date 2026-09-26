import { useEffect, useRef, type KeyboardEvent, type MouseEvent } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { SidebarNavItem } from "@/components/multideck/app-sidebar"
import type { AdminHub, AdminHubBlock, AdminHubLink } from "@/data/navigation-data"
import { useLanguage } from "@/i18n/language-provider"
import { activeDockSetting, dockedAdminHubFor, noteAdminSettingOpened, rememberAdminSetting, useAdminExplorerState } from "@/lib/admin-explorer-state"
import { useSidebarDropdown } from "@/lib/sidebar-dropdown-state"
import { mdMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

const dockWidth = 248

function plainClick(event: MouseEvent) {
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
}

function orderedBlocks(hub: AdminHub) {
  if (!hub.groups) return [{ id: hub.id, title: null as string | null, blocks: hub.blocks }]
  return hub.groups.map((group) => ({ id: group.id, title: group.title as string | null, blocks: group.blockIds.flatMap((id) => hub.blocks.filter((block) => block.id === id)) }))
}

/**
 * The second sidebar's list. Each category with more than one setting is a
 * dropdown of those settings; a category with one setting opens it directly.
 * A category opens in place like every other sidebar dropdown; choosing a
 * setting opens its page and keeps this sidebar beside it. One highlight
 * travels to the setting on screen.
 */
function AdminDockNav({ hub, route, navigate }: { hub: AdminHub; route: string; navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const reduceMotion = useReducedMotion()
  const rootRef = useRef<HTMLElement>(null)
  const { opened } = useAdminExplorerState()
  const onLanding = route === hub.route
  const groups = orderedBlocks(hub)
  const blocks = groups.flatMap((group) => group.blocks)
  const activeLink = onLanding ? null : activeDockSetting(hub, route, opened)
  const selectedBlock = blocks.find((block) => activeLink && block.links.includes(activeLink)) ?? null
  const [expandedId, setExpandedId] = useSidebarDropdown(`admin:${hub.id}`)
  const selectedId = selectedBlock?.id ?? null
  useEffect(() => {
    if (!selectedId) return
    setExpandedId(selectedId)
  }, [selectedId])

  const toggle = (id: string, open?: boolean) => setExpandedId((current) => (open ?? current !== id) ? id : null)

  const openSetting = (link: AdminHubLink) => {
    noteAdminSettingOpened(hub.id, link)
    rememberAdminSetting({ label: link.label, route: link.route, area: hub.label })
    navigate(link.route)
  }

  // A category is a dropdown, exactly as it is in the main sidebar: it opens
  // and closes in place. Only a category with a single setting is a link.
  const chooseBlock = (block: AdminHubBlock) => {
    if (block.links.length === 1 && !block.comingSoon?.length) openSetting(block.links[0])
    else toggle(block.id)
  }

  // One list of rows for the arrow keys, in the order they are drawn. Each row
  // sits in a wrapper that says whether it is a category or one of its settings.
  const onKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    const rows = [...(rootRef.current?.querySelectorAll<HTMLElement>("[data-sidebar-row]:not([aria-disabled])") ?? [])]
    const index = rows.indexOf(event.target as HTMLElement)
    if (index < 0) return
    const item = rows[index].closest<HTMLElement>("[data-dock-item]")
    const blockId = item?.dataset.dockBlock
    const parentId = item?.dataset.dockParent
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      rows[Math.max(0, Math.min(rows.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus()
    } else if (event.key === "ArrowRight" && blockId && item?.dataset.dockExpandable === "true") {
      event.preventDefault()
      if (expandedId !== blockId) toggle(blockId, true)
      else rows[index + 1]?.focus()
    } else if (event.key === "ArrowLeft") {
      event.preventDefault()
      if (parentId) rootRef.current?.querySelector<HTMLElement>(`[data-dock-block="${CSS.escape(parentId)}"] [data-sidebar-row]`)?.focus()
      else if (blockId) toggle(blockId, false)
    }
  }

  const activeLayoutId = reduceMotion ? undefined : `admin-dock-active-${hub.id}`

  return (
    <nav ref={rootRef} aria-label={t(`${hub.label} settings`)} onKeyDown={onKeyDown} className="min-w-0">
      {groups.map((group) => (
        <div key={group.id} className="mb-4 last:mb-0">
          {group.title ? <p className="mb-1 px-2.5 text-[11px] font-medium text-[var(--md-subtle)]">{t(group.title)}</p> : null}
          <div className="flex flex-col gap-1">
            {group.blocks.map((block) => {
              const expandable = block.links.length > 1 || Boolean(block.comingSoon?.length)
              const isOpen = expandable && expandedId === block.id
              const singleActive = !expandable && selectedBlock?.id === block.id
              return (
                <div key={block.id} data-dock-item="" data-dock-block={block.id} data-dock-expandable={expandable ? "true" : "false"}>
                  <SidebarNavItem
                    item={{ label: block.title, icon: block.icon }}
                    isActive={singleActive}
                    onClick={() => chooseBlock(block)}
                    expanded={expandable ? isOpen : undefined}
                    affordance={expandable ? "group" : undefined}
                    activeLayoutId={activeLayoutId}
                  />
                  <AnimatePresence initial={false}>
                    {isOpen ? (
                      <motion.div
                        className="mt-1 overflow-hidden"
                        initial={reduceMotion ? false : { height: 0 }}
                        animate={{ height: "auto" }}
                        exit={reduceMotion ? undefined : { height: 0 }}
                        transition={reduceMotion ? { duration: 0 } : mdMotion.micro}
                      >
                        <div className="md-sidebar-expanded-options flex flex-col gap-1 rounded-[var(--md-radius-xl)] bg-[var(--md-bg-strong)] p-1 dark:bg-[var(--md-surface-soft)]">
                          {block.links.map((link) => (
                            <div key={`${link.label}|${link.route}`} data-dock-item="" data-dock-parent={block.id}>
                              <SidebarNavItem
                                item={{ label: link.label, icon: link.icon ?? block.icon, route: link.route }}
                                isActive={activeLink === link}
                                onClick={() => openSetting(link)}
                                nested
                                activeLayoutId={activeLayoutId}
                              />
                            </div>
                          ))}
                          {block.comingSoon?.map((label) => (
                            <div key={`soon-${label}`} data-dock-item="" data-dock-parent={block.id}>
                              <SidebarNavItem item={{ label, icon: block.icon, value: "Planned" }} nested />
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    ) : null}
                  </AnimatePresence>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </nav>
  )
}

/**
 * The second sidebar. Opening a large Admin area slides it out from behind the
 * main sidebar: the column grows while the panel travels out from under the
 * main sidebar's edge, so the page glides aside rather than jumping. It stays
 * while one of the area's settings pages is open, and moving between areas
 * swaps only what is inside it. Recently opened settings stay on the Admin
 * dashboard, so this column is only ever the area's own map.
 */
export function AdminSectionsDock({ hub, route, navigate }: { hub: AdminHub; route: string; navigate: (path: string) => void }) {
  const { t, direction } = useLanguage()
  const reduceMotion = useReducedMotion()
  const Icon = hub.icon
  const hidden = direction === "rtl" ? "100%" : "-100%"
  const travel = reduceMotion ? { duration: 0 } : mdMotion.panel
  const leave = reduceMotion ? { duration: 0 } : { ...mdMotion.panel, duration: 0.24 }

  return (
    <motion.div
      className="hidden h-full shrink-0 overflow-hidden lg:block"
      initial={{ width: 0 }}
      animate={{ width: dockWidth }}
      exit={{ width: 0, transition: leave }}
      transition={travel}
    >
      <motion.aside
        aria-label={t(`${hub.label} settings`)}
        className="flex h-full flex-col border-e border-[var(--md-hairline)] bg-[var(--md-sidebar-bg)]"
        style={{ width: dockWidth }}
        initial={{ x: hidden }}
        animate={{ x: 0 }}
        exit={{ x: hidden, transition: leave }}
        transition={travel}
      >
        <AnimatePresence initial={false} mode="popLayout">
          <motion.div
            key={hub.id}
            className="flex min-h-0 flex-1 flex-col"
            initial={{ opacity: 0, y: reduceMotion ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, transition: { ...mdMotion.exit, duration: 0.1 } }}
            transition={mdMotion.enter}
          >
            <header className="flex items-center gap-2.5 px-4 pb-4 pt-5">
              <span className="grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
                <Icon className="size-4" strokeWidth={1.4} aria-hidden="true" />
              </span>
              <h1 className="min-w-0 truncate text-[16px] font-medium text-[var(--md-ink)]">{t(hub.label)}</h1>
            </header>
            <div className="md-scrollbar min-h-0 flex-1 overflow-y-auto px-2 pb-4">
              <AdminDockNav key={hub.id} hub={hub} route={route} navigate={navigate} />
            </div>
          </motion.div>
        </AnimatePresence>
      </motion.aside>
    </motion.div>
  )
}

/** Decides from the route and the last opened area whether the second sidebar is out, and for which area. */
export function AdminSectionsDockHost({ route, navigate }: { route: string; navigate: (path: string) => void }) {
  const { hubId } = useAdminExplorerState()
  const hub = dockedAdminHubFor(route, hubId)
  return (
    <AnimatePresence initial={false}>
      {hub ? <AdminSectionsDock key="admin-sections-dock" hub={hub} route={route} navigate={navigate} /> : null}
    </AnimatePresence>
  )
}
