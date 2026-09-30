import { useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent, type ReactNode } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowRight, ChevronLeft, ChevronRight, type LucideIcon } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion } from "@/lib/motion"
import { cn } from "@/lib/utils"

export type ExplorerSetting = {
  label: string
  route: string
  /** What the setting decides, in one sentence. */
  description?: string
  keywords?: string
}

export type ExplorerSection = {
  id: string
  title: string
  icon: LucideIcon
  description: string
  settings: ExplorerSetting[]
  /** Settings not built yet. Named, never clickable. */
  comingSoon?: string[]
}

export type ExplorerArea = {
  id: string
  label: string
  sections: ExplorerSection[]
  /** Short headings that order the section list, each naming the sections beneath it. */
  groups?: Array<{ id: string; title: string; sectionIds: string[] }>
}

export type ExplorerTarget = { setting: ExplorerSetting; area: ExplorerArea; section: ExplorerSection }

const settingKey = (target: ExplorerTarget) => `${target.area.id}|${target.section.id}|${target.setting.label}|${target.setting.route}`

export function matchesExplorerQuery(setting: ExplorerSetting, section: ExplorerSection, query: string) {
  const needle = query.trim().toLowerCase()
  if (!needle) return true
  return `${setting.label} ${setting.keywords ?? ""} ${setting.description ?? ""} ${section.title}`.toLowerCase().includes(needle)
}

function orderSections(area: ExplorerArea | null) {
  if (!area) return []
  if (!area.groups) return [{ id: area.id, title: null as string | null, sections: area.sections }]
  return area.groups.map((group) => ({ id: group.id, title: group.title as string | null, sections: group.sectionIds.flatMap((id) => area.sections.filter((section) => section.id === id)) }))
}

/** The section an area opens on: the one asked for, or its first. */
export function resolveExplorerSection(area: ExplorerArea | null, sectionId: string | null | undefined) {
  const sections = orderSections(area).flatMap((group) => group.sections)
  return sections.find((section) => section.id === sectionId) ?? sections[0] ?? null
}

function Highlighted({ text, query }: { text: string; query: string }) {
  const needle = query.trim()
  const index = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1
  if (index < 0) return <>{text}</>
  return <>{text.slice(0, index)}<mark className="rounded-[3px] bg-[var(--md-accent-a14)] text-[var(--md-ink)]">{text.slice(index, index + needle.length)}</mark>{text.slice(index + needle.length)}</>
}

function plainClick(event: MouseEvent) {
  return !(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0)
}

/** Focus the first setting of the list currently on screen, never one that is still leaving. */
function focusFirstSetting(listKey: string) {
  document.querySelector<HTMLElement>(`[data-explorer-current="${CSS.escape(listKey)}"] [data-explorer-setting]`)?.focus()
}

function focusSection(id: string) {
  document.querySelector<HTMLElement>(`[data-explorer-section="${CSS.escape(id)}"]`)?.focus()
}

/**
 * Tier two: an area's sections under their short headings. One pill travels
 * to the chosen section. While searching, each count becomes the number of
 * matches and sections without any step back. Up and down choose, right
 * moves into the settings.
 */
export function AdminSectionNav({
  area,
  sectionId,
  query = "",
  onSelect,
  drillDown = false,
  className,
}: {
  area: ExplorerArea
  sectionId: string | null
  query?: string
  onSelect: (sectionId: string) => void
  /** On a phone the list leads into the settings, so each row shows the way forward. */
  drillDown?: boolean
  className?: string
}) {
  const { t } = useLanguage()
  const reduceMotion = useReducedMotion()
  const groups = orderSections(area)
  const flat = groups.flatMap((group) => group.sections)
  const searching = query.trim().length > 0
  const current = resolveExplorerSection(area, sectionId)

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const next = flat[Math.max(0, Math.min(flat.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]
      if (!next) return
      onSelect(next.id)
      focusSection(next.id)
    } else if (event.key === "ArrowRight") {
      event.preventDefault()
      focusFirstSetting(searching ? "search" : current?.id ?? "none")
    }
  }

  return (
    <nav aria-label={t(`${area.label} sections`)} className={cn("min-w-0", className)}>
      {groups.map((group) => (
        <div key={group.id} className="mb-4 last:mb-0">
          {group.title ? <p className="mb-1 px-3 text-[11px] font-medium text-[var(--md-subtle)]">{t(group.title)}</p> : null}
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-0.5">
            {group.sections.map((section) => {
              const Icon = section.icon
              const selected = !searching && section.id === current?.id
              const count = searching ? section.settings.filter((setting) => matchesExplorerQuery(setting, section, query)).length : section.settings.length
              const index = flat.indexOf(section)
              return (
                <li key={section.id}>
                  <button
                    type="button"
                    data-explorer-section={section.id}
                    aria-current={selected ? "page" : undefined}
                    tabIndex={section.id === current?.id ? 0 : -1}
                    className={cn(
                      "group/section relative flex h-9 w-full items-center gap-2.5 rounded-[var(--md-radius-lg)] px-3 text-start text-[13px] outline-none transition-[color,opacity] duration-150 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:transition-none",
                      selected ? "text-[var(--md-ink)]" : "text-[var(--md-text)] hover:text-[var(--md-ink)]",
                      searching && count === 0 && "opacity-45",
                    )}
                    onClick={() => onSelect(section.id)}
                    onKeyDown={(event) => onKeyDown(event, index)}
                  >
                    {selected ? (
                      <motion.span
                        layoutId={reduceMotion ? undefined : `admin-section-pill-${area.id}`}
                        aria-hidden="true"
                        className="absolute inset-0 rounded-[var(--md-radius-lg)] bg-[var(--md-bg-strong)] shadow-[inset_0_0_0_1px_var(--md-hairline)]"
                        transition={mdMotion.spring}
                      />
                    ) : (
                      <span aria-hidden="true" className="absolute inset-0 rounded-[var(--md-radius-lg)] bg-[var(--md-hover)] opacity-0 transition-opacity duration-150 group-hover/section:opacity-100 motion-reduce:transition-none" />
                    )}
                    <Icon aria-hidden="true" className={cn("relative size-4 shrink-0 transition-colors duration-150", selected ? "text-[var(--md-accent)]" : "text-[var(--md-subtle)]")} strokeWidth={1.5} />
                    <span className="relative min-w-0 flex-1 truncate">{t(section.title)}</span>
                    <span className={cn("relative shrink-0 text-[11px] tabular-nums", searching && count > 0 ? "text-[var(--md-accent)]" : "text-[var(--md-subtle)]")}>{count}</span>
                    {drillDown ? <ChevronRight aria-hidden="true" className="relative size-3.5 text-[var(--md-subtle)] rtl:-scale-x-100" strokeWidth={1.6} /> : null}
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </nav>
  )
}

/**
 * Tier three: the chosen section's settings, and a preview of the one under
 * the pointer or focus — its path, what it decides, and which settings open
 * the same page. Arrow keys continue the path the section list started.
 * A search narrows every area at once without changing the page's shape.
 *
 * This is the view where the second sidebar is not docked (tablet and
 * phone) and for searches: the section list is drawn inline, and on a phone
 * it becomes a drill-down with a way back.
 */
export function AdminSettingsExplorer({
  areas,
  areaId,
  query = "",
  sectionId,
  onSectionChange,
  onOpen,
  empty,
  className,
}: {
  areas: ExplorerArea[]
  /** The area this page belongs to, or null for a search across everything. */
  areaId: string | null
  query?: string
  sectionId?: string | null
  onSectionChange?: (sectionId: string) => void
  onOpen: (target: ExplorerTarget) => void
  empty?: ReactNode
  className?: string
}) {
  const { t } = useLanguage()
  const reduceMotion = useReducedMotion()
  const rootRef = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(1200)
  useLayoutEffect(() => {
    const element = rootRef.current
    if (!element) return
    const measure = () => setWidth(element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  const area = areas.find((candidate) => candidate.id === areaId) ?? null
  const searching = query.trim().length > 0
  const section = resolveExplorerSection(area, sectionId)
  const flatSections = orderSections(area).flatMap((group) => group.sections)
  const inlineSections = Boolean(area)
  const narrow = inlineSections && width < 620
  const showPreview = width >= (inlineSections ? 900 : 760)

  // The list arrives from the side the section moved towards.
  const sectionIndex = section ? flatSections.indexOf(section) : 0
  const previousIndex = useRef(sectionIndex)
  const direction = sectionIndex >= previousIndex.current ? 1 : -1
  useLayoutEffect(() => { previousIndex.current = sectionIndex }, [sectionIndex])

  const results = useMemo<ExplorerTarget[]>(() => {
    if (!searching) return []
    const ordered = area ? [area, ...areas.filter((candidate) => candidate.id !== area.id)] : areas
    const seen = new Set<string>()
    return ordered.flatMap((candidateArea) => candidateArea.sections.flatMap((candidateSection) => candidateSection.settings
      .filter((setting) => matchesExplorerQuery(setting, candidateSection, query))
      .map((setting) => ({ setting, area: candidateArea, section: candidateSection }))))
      .filter((target) => {
        const key = `${target.setting.label}|${target.setting.route}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
  }, [area, areas, query, searching])

  const listed: ExplorerTarget[] = searching ? results : section && area ? section.settings.map((setting) => ({ setting, area, section })) : []
  const listKey = searching ? "search" : section?.id ?? "none"
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const active = listed.find((target) => settingKey(target) === activeKey) ?? listed[0] ?? null
  const [narrowStage, setNarrowStage] = useState<"sections" | "settings">("sections")
  const showSectionColumn = inlineSections && !(narrow && (narrowStage === "settings" || searching))
  const showList = !narrow || !area || searching || narrowStage === "settings"

  const choose = (id: string) => {
    onSectionChange?.(id)
    setActiveKey(null)
    if (narrow) setNarrowStage("settings")
  }

  const onSettingKey = (event: KeyboardEvent<HTMLAnchorElement>, index: number) => {
    const items = [...(rootRef.current?.querySelectorAll<HTMLElement>(`[data-explorer-current="${CSS.escape(listKey)}"] [data-explorer-setting]`) ?? [])]
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      items[Math.max(0, Math.min(items.length - 1, index + (event.key === "ArrowDown" ? 1 : -1)))]?.focus()
    } else if (event.key === "ArrowLeft" && section && !searching) {
      event.preventDefault()
      focusSection(section.id)
    } else if (event.key === "ArrowRight" && showPreview) {
      event.preventDefault()
      rootRef.current?.querySelector<HTMLElement>("[data-explorer-open]")?.focus()
    }
  }

  const open = (event: MouseEvent, target: ExplorerTarget) => {
    if (!plainClick(event)) return
    event.preventDefault()
    onOpen(target)
  }

  const onSamePage = active ? active.section.settings.filter((setting) => setting.route === active.setting.route && setting.label !== active.setting.label) : []

  if (searching && results.length === 0 && empty) return <div ref={rootRef}>{empty}</div>

  const columns = [
    showSectionColumn ? "14rem" : null,
    showList ? "minmax(0,1fr)" : null,
    showPreview ? "19rem" : null,
  ].filter(Boolean).join(" ")

  const heading = searching ? (
    <div className="min-w-0">
      <h2 className="text-[16px] font-medium text-[var(--md-ink)]">{results.length === 1 ? t("1 setting") : `${results.length} ${t("settings")}`} {t("match")} “{query.trim()}”</h2>
      <p className="mt-0.5 text-[12px] text-[var(--md-text)]">{area ? t("From every area of Admin, this one first.") : t("From every area of Admin.")}</p>
    </div>
  ) : section ? (
    <div className="flex min-w-0 items-start gap-3">
      <span className="grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] text-[var(--md-accent)] shadow-[var(--md-shadow-line)]">
        <section.icon className="size-4" strokeWidth={1.4} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        <h2 className="text-[16px] font-medium leading-6 text-[var(--md-ink)]">{t(section.title)}</h2>
        <p className="text-pretty text-[12px] leading-5 text-[var(--md-text)]">{t(section.description)}</p>
      </div>
    </div>
  ) : null

  return (
    <div ref={rootRef} className={cn("grid min-w-0 items-start gap-5", className)} style={{ gridTemplateColumns: columns || "minmax(0,1fr)" }}>
      {showSectionColumn && area ? (
        <AdminSectionNav area={area} sectionId={section?.id ?? null} query={query} onSelect={choose} drillDown={narrow} className="pt-1" />
      ) : null}

      {showList ? (
        <div className="min-w-0">
          {narrow && area && !searching ? (
            <button type="button" className="-ms-2 mb-2 inline-flex h-8 items-center gap-1 rounded-full px-2 text-[12px] text-[var(--md-text)] transition-colors duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]" onClick={() => setNarrowStage("sections")}>
              <ChevronLeft aria-hidden="true" className="size-3.5 rtl:-scale-x-100" strokeWidth={1.6} />
              {t("All sections")}
            </button>
          ) : null}
          <AnimatePresence initial={false} mode="popLayout">
            <motion.div
              key={listKey}
              data-explorer-current={listKey}
              initial={{ opacity: 0, y: reduceMotion ? 0 : direction * 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, transition: { ...mdMotion.exit, duration: 0.08 } }}
              transition={mdMotion.enter}
              className="min-w-0"
            >
              <section aria-live={searching ? "polite" : undefined} className="rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1.5 shadow-[var(--md-shadow-soft)]">
                <header className="px-3 pb-3 pt-3">{heading}</header>
                <ul className="border-t border-[var(--md-hairline)] pt-1.5">
                  {listed.map((target, index) => {
                    const key = settingKey(target)
                    const isActive = active ? settingKey(active) === key : false
                    return (
                      <li key={key}>
                        <a
                          href={target.setting.route}
                          data-explorer-setting=""
                          aria-description={target.setting.description ? t(target.setting.description) : undefined}
                          className="group/setting relative flex min-h-11 items-center gap-3 rounded-[calc(var(--md-radius-xl)-6px)] px-3 py-2 text-[13px] outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
                          onPointerEnter={() => setActiveKey(key)}
                          onFocus={() => setActiveKey(key)}
                          onKeyDown={(event) => onSettingKey(event, index)}
                          onClick={(event) => open(event, target)}
                        >
                          {isActive ? (
                            <motion.span
                              layoutId={reduceMotion ? undefined : `admin-explorer-active-${listKey}`}
                              aria-hidden="true"
                              className="absolute inset-0 rounded-[calc(var(--md-radius-xl)-6px)] bg-[var(--md-hover)]"
                              transition={mdMotion.spring}
                            />
                          ) : null}
                          <span className="relative min-w-0 flex-1">
                            <span className={cn("block truncate transition-colors duration-150", isActive ? "text-[var(--md-ink)]" : "text-[var(--md-text)]")}><Highlighted text={t(target.setting.label)} query={query} /></span>
                            {searching ? <span className="block truncate text-[11px] text-[var(--md-subtle)]">{t(target.area.label)} › {t(target.section.title)}</span> : null}
                            {!showPreview && target.setting.description ? <span className="mt-0.5 block text-pretty text-[12px] leading-5 text-[var(--md-subtle)]">{t(target.setting.description)}</span> : null}
                          </span>
                          <ChevronRight aria-hidden="true" className={cn("relative size-3.5 shrink-0 text-[var(--md-subtle)] transition-[opacity,translate] duration-150 motion-reduce:transition-none rtl:-scale-x-100", isActive ? "translate-x-0 opacity-100" : "-translate-x-1 opacity-0")} strokeWidth={1.6} />
                        </a>
                      </li>
                    )
                  })}
                  {!searching && section?.comingSoon?.map((label) => (
                    <li key={`soon-${label}`} className="flex min-h-10 items-center justify-between gap-3 px-3 text-[13px] text-[var(--md-subtle)]" aria-disabled="true">
                      <span className="truncate">{t(label)}</span>
                      <span className="shrink-0 text-[11px]">{t("Coming soon")}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </motion.div>
          </AnimatePresence>
        </div>
      ) : null}

      {showPreview ? (
        <aside aria-label={t("Setting preview")} className="sticky top-4 min-w-0 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-5 shadow-[var(--md-shadow-soft)]">
          {active ? (
            <AnimatePresence initial={false} mode="popLayout">
              <motion.div
                key={settingKey(active)}
                initial={{ opacity: 0, y: reduceMotion ? 0 : 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { ...mdMotion.exit, duration: 0.07 } }}
                transition={{ ...mdMotion.micro, delay: 0.04 }}
              >
                <p className="text-[11px] text-[var(--md-subtle)]">{t(active.area.label)} › {t(active.section.title)}</p>
                <h3 className="mt-1.5 text-balance text-[18px] font-medium leading-6 text-[var(--md-ink)]">{t(active.setting.label)}</h3>
                <p className="mt-2 min-h-12 text-pretty text-[13px] leading-6 text-[var(--md-text)]">{t(active.setting.description ?? active.section.description)}</p>
                {onSamePage.length ? (
                  <div className="mt-4 border-t border-[var(--md-hairline)] pt-3">
                    <p className="text-[11px] text-[var(--md-subtle)]">{t("On the same page")}</p>
                    <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{onSamePage.map((setting) => t(setting.label)).join(", ")}</p>
                  </div>
                ) : null}
                <Button asChild className="mt-5 w-full justify-between">
                  <a href={active.setting.route} data-explorer-open="" onClick={(event) => open(event, active)}>
                    {t("Open setting")}
                    <ArrowRight data-icon="inline-end" className="rtl:-scale-x-100" />
                  </a>
                </Button>
              </motion.div>
            </AnimatePresence>
          ) : <p className="text-[13px] text-[var(--md-text)]">{t("Nothing to preview here yet.")}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-[var(--md-hairline)] pt-3 text-[11px] text-[var(--md-subtle)]" aria-hidden="true">
            <span className="inline-flex items-center gap-1"><Kbd>↑</Kbd><Kbd>↓</Kbd>{t("move")}</span>
            <span className="inline-flex items-center gap-1"><Kbd>←</Kbd><Kbd>→</Kbd>{t("columns")}</span>
            <span className="inline-flex items-center gap-1"><Kbd>↵</Kbd>{t("open")}</span>
          </div>
        </aside>
      ) : null}
    </div>
  )
}
