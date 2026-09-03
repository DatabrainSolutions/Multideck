import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { AiBrain, AiEditing, Archive, ArrowLeft, Bell, Boxes, ChartAnalysis, Check, ChevronDown, ChevronRight, Clock3, FileText, Folder, Inbox, LifeBuoy, LoaderCircle, LogOut, MailWarning, MorphingIcon, PencilEdit01, Plus, PanelLeftClose, PanelLeftOpen, Pin, Search, Send, Settings, Star, Tags, TicketCheck, Trash2, TriangleAlert, Users, X, type LucideIcon } from "@/components/icons/hugeicons"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"
import { Button, buttonVariants } from "@/components/ui/button"
import { SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { SidebarArrangeCanvas, type SidebarArrangeItem } from "@/components/multideck/sidebar-arrange"
import { SidebarItemMenu } from "@/components/multideck/sidebar-item-menu"
import { ThemeToggle } from "@/components/multideck/theme-toggle"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Separator } from "@/components/ui/separator"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { cn } from "@/lib/utils"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { isDefaultScope, mergeSavedOrder, useSidebarLayoutScope } from "@/lib/sidebar-preferences"
import { hasPermission, isTenantAdministrator, type AuthUserSummary } from "@/lib/auth-user"
import { createProfilePhotoSignedUrl } from "@/lib/profile-photo"
import { supabase } from "@/lib/supabase"
import { useAiAgentName } from "@/lib/user-preferences"
import { mailboxLabelTone } from "@/lib/mailbox-label-colour"
import { calendarNavItem, customerWarehouseNavigation, homeNavItem, inboxNavItem, sidebarAreas, todoNavItem, type NavItem, type SidebarArea, type SidebarDestination } from "@/data/navigation-data"
import { readSettingsSectionFromUrl, settingsNavigationGroups, type SettingsSectionId } from "@/data/settings-navigation"
import { useLanguage } from "@/i18n/language-provider"
import { deleteDexterConversation, getDexterUsage, listDexterConversationsPage, renameDexterConversation, type DexterConversationSummary } from "@/lib/dexter-api"
import { listDealsPage } from "@/lib/deal-api"
import { listLeadsPage } from "@/lib/lead-api"
import { companyAccentPreferenceId, useAccentPresetId } from "@/lib/accent-theme"
import { companyAppearanceInitials, useCompanyAppearance } from "@/lib/company-appearance"
import {
  announceDexterConversationsChanged,
  DEXTER_CONVERSATIONS_CHANGED_EVENT,
  DEXTER_NEW_CONVERSATION_EVENT,
  DEXTER_SELECT_CONVERSATION_EVENT,
} from "@/lib/dexter-navigation"
import multideckFullLogo from "@/assets/brand/multideck-full-logo.svg"
import multideckLogoMark from "@/assets/brand/multideck-logo-mark.svg"
import { MailProviderMark, mailProviderLabels } from "@/components/multideck/mailbox-provider-switch"
import { useOptionalInboxWorkspace, type InboxNavigationView } from "@/lib/inbox-workspace"
import { defaultCoverPhotoUrl } from "@/lib/default-cover-photo"
import type { MailboxFolder } from "@/lib/inbox-api"
import { useWorkspaceNotifications } from "@/lib/use-workspace-notifications"
import { openSupportTicket } from "@/components/multideck/support-ticket-dialog"
import { supportTicketFeatureEnabled } from "@/lib/support-ticket-feature"

const sidebarItemTransition = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
}

const sidebarActiveTransition = {
  type: "spring" as const,
  stiffness: 430,
  damping: 42,
  mass: 0.7,
}

const sidebarPaneTransition = {
  duration: 0.18,
  ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
}

type SearchableDexterConversation = DexterConversationSummary & {
  matchSnippet?: string
}

/** Pinning re-slots a row, so it travels on a spring rather than jumping to the top. */
const sidebarPinTransition = {
  type: "spring" as const,
  stiffness: 520,
  damping: 42,
  mass: 0.9,
}

const navReveal = {
  hidden: { opacity: 0 },
  show: {
    opacity: 1,
    transition: {
      duration: 0.18,
      ease: [0.22, 1, 0.36, 1] as [number, number, number, number],
      staggerChildren: 0.018,
      delayChildren: 0.01,
    },
  },
}

const navItemReveal = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: sidebarItemTransition },
}

const notificationsReveal = {
  hidden: { opacity: 1 },
  show: {
    opacity: 1,
    transition: {
      staggerChildren: 0.055,
      delayChildren: 0.05,
    },
  },
}

const notificationItemExit = { opacity: 0, x: -8, transition: { duration: 0.14, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] } }

function notificationTime(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60_000))
  if (minutes < 1) return "now"
  if (minutes < 60) return `${minutes} min`
  if (minutes < 1_440) return `${Math.floor(minutes / 60)} hr`
  return `${Math.floor(minutes / 1_440)} d`
}

function NotificationBell() {
  const { direction, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const { notifications, updateNotificationStatus, dismissNotification, markAllRead, clearNotifications } = useWorkspaceNotifications()
  const unreadCount = notifications.filter((notification) => notification.status === "unread").length

  function openNotificationSettings() {
    window.history.pushState({}, "", "/settings?tab=notifications")
    window.dispatchEvent(new PopStateEvent("popstate"))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={t("Open notifications")}
          title={t("Open notifications")}
          className="group relative grid size-9 shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--md-glass)] text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color,box-shadow,opacity,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.01] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] hover:shadow-[var(--md-shadow-soft)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] data-[state=open]:bg-[var(--md-bg-strong)] data-[state=open]:text-[var(--md-accent)]"
        >
          <motion.span
            aria-hidden="true"
            className="absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,var(--md-accent-a14),transparent_58%)] opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          />
          <motion.span
            animate={shouldReduceMotion ? undefined : { rotate: [0, -7, 6, 0] }}
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
            className="relative"
          >
            <Bell className="size-3.5" strokeWidth={1.3} />
          </motion.span>
          {unreadCount > 0 ? <motion.span
            className="absolute end-2 top-2 size-1.5 rounded-full bg-[var(--md-amber)] shadow-[0_0_0_2px_var(--md-glass)]"
            animate={shouldReduceMotion ? undefined : { scale: [1, 1.35, 1] }}
            transition={{ duration: 0.54, delay: 0.32, ease: [0.22, 1, 0.36, 1] }}
          /> : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        side={direction === "rtl" ? "left" : "right"}
        align="start"
        alignOffset={10}
        sideOffset={18}
        collisionPadding={18}
        className="w-[312px] gap-0 overflow-hidden rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] p-0 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]"
      >
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-[var(--md-ink)]">{t("Notifications")}</p>
            <p className="mt-1 text-[12px] text-[var(--md-text)]">{unreadCount ? `${unreadCount} ${t(unreadCount === 1 ? "unread notification" : "unread notifications")}` : t("You're all caught up")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <button type="button" disabled={unreadCount === 0} onClick={markAllRead} className="h-7 rounded-full bg-[var(--md-surface-tint)] px-2.5 text-[11px] font-medium text-[var(--md-text)] shadow-[var(--md-shadow-line)] transition-[background,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100">
              {t("Mark all as read")}
            </button>
            <button type="button" disabled={notifications.length === 0} onClick={clearNotifications} className="h-7 rounded-full px-2.5 text-[11px] font-medium text-[var(--md-subtle)] transition-[background,color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.96] disabled:opacity-40 disabled:active:scale-100">
              {t("Clear")}
            </button>
          </div>
        </div>
        <motion.div
          className="divide-y divide-[rgba(11,20,19,0.07)] shadow-[inset_0_1px_0_rgba(11,20,19,0.06)]"
          variants={shouldReduceMotion ? undefined : notificationsReveal}
          initial={shouldReduceMotion ? undefined : "hidden"}
          animate={shouldReduceMotion ? undefined : "show"}
        >
          {notifications.length === 0 ? <p className="px-4 py-5 text-[13px] text-[var(--md-text)]">{t("No notifications yet")}</p> : null}
          <AnimatePresence initial={false} mode="popLayout">
          {notifications.map((notification) => (
            <motion.div
              key={notification.id}
              layout
              initial={shouldReduceMotion ? false : { opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={shouldReduceMotion ? { opacity: 0 } : notificationItemExit}
              transition={sidebarItemTransition}
            >
              <ContextMenuPrimitive.Root dir={direction}>
                <ContextMenuPrimitive.Trigger asChild>
              <motion.button
                type="button"
                className="group grid w-full grid-cols-[6px_minmax(0,1fr)_auto] items-start gap-3 px-4 py-3 text-start transition-[background,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a14)]"
                onClick={() => {
                  const url = typeof notification.metadata.action_url === "string"
                    ? notification.metadata.action_url
                    : typeof notification.metadata.url === "string" ? notification.metadata.url : ""
                  if (notification.status === "unread") updateNotificationStatus(notification.id, "read")
                  if (url.startsWith("/")) {
                    window.history.pushState({}, "", url)
                    window.dispatchEvent(new PopStateEvent("popstate"))
                  }
                }}
              >
                <span aria-hidden="true" className={cn("mt-[7px] size-1.5 rounded-full transition-opacity duration-150", notification.status === "unread" ? "bg-[var(--md-accent)] opacity-100" : "opacity-0")} />
                <span className="min-w-0">
                  <span className="block truncate text-[13px] font-medium text-[var(--md-ink)]">{t(notification.title)}</span>
                  <span className="mt-0.5 block truncate text-[12px] leading-5 text-[var(--md-text)]">{t(notification.body)}</span>
                </span>
                <span className="pt-0.5 text-[11px] font-medium text-[var(--md-subtle)]">{notificationTime(notification.createdAt)}</span>
              </motion.button>
                </ContextMenuPrimitive.Trigger>
                <ContextMenuPrimitive.Portal>
                  <ContextMenuPrimitive.Content collisionPadding={14} className="z-50 min-w-[168px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)]">
                    <ContextMenuPrimitive.Item className="h-9 cursor-default select-none rounded-[var(--md-radius-lg)] px-3 text-[13px] leading-9 text-[var(--md-text)] outline-none data-[highlighted]:bg-[var(--md-hover)] data-[highlighted]:text-[var(--md-ink)]" onSelect={() => updateNotificationStatus(notification.id, notification.status === "unread" ? "read" : "unread")}>
                      {t(notification.status === "unread" ? "Mark as read" : "Mark as unread")}
                    </ContextMenuPrimitive.Item>
                    <ContextMenuPrimitive.Item className="h-9 cursor-default select-none rounded-[var(--md-radius-lg)] px-3 text-[13px] leading-9 text-[var(--md-danger)] outline-none data-[highlighted]:bg-[rgba(194,91,65,0.08)]" onSelect={() => dismissNotification(notification.id)}>
                      {t("Clear notification")}
                    </ContextMenuPrimitive.Item>
                  </ContextMenuPrimitive.Content>
                </ContextMenuPrimitive.Portal>
              </ContextMenuPrimitive.Root>
            </motion.div>
          ))}
          </AnimatePresence>
        </motion.div>
        <div className="px-3 py-3">
          <Button
            type="button"
            variant="ghost"
            className="h-8 w-full rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] text-[12px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)]"
            onClick={openNotificationSettings}
          >
            {t("Review notification settings")}
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/**
 * `branch` rows push a whole new sidebar pane, `group` rows unfold in place. The
 * glyph is the only cue for which one a row is, so it is owned here rather than
 * passed in as `trailing`: every arrow then shares one slot, one column and one
 * set of ramps regardless of the caller.
 */
export type SidebarNavAffordance = "branch" | "group"

function SidebarNavArrow({ affordance }: { affordance: SidebarNavAffordance }) {
  return (
    <span className="md-nav-arrow" data-affordance={affordance} aria-hidden="true">
      <span className="md-nav-arrow__glyph">
        {affordance === "branch" ? (
          <ChevronRight className="size-3.5" strokeWidth={1.35} />
        ) : (
          <ChevronDown className="size-3.5" strokeWidth={1.35} />
        )}
      </span>
    </span>
  )
}

export function SidebarNavItem({
  item,
  isActive,
  onClick,
  onIntent,
  accent = "default",
  collapsed = false,
  expanded,
  affordance,
  trailing,
  nested = false,
  activeLayoutId,
  className,
}: {
  item: NavItem
  isActive?: boolean
  onClick?: () => void
  onIntent?: () => void
  accent?: "default" | "dexter"
  collapsed?: boolean
  expanded?: boolean
  affordance?: SidebarNavAffordance
  trailing?: ReactNode
  nested?: boolean
  activeLayoutId?: string
  className?: string
}) {
  const Icon = item.icon
  const { t } = useLanguage()
  const aiAgentName = useAiAgentName()
  const isDisabled = !onClick
  const isDexterItem = accent === "dexter"
  const valueTone =
    accent === "dexter" ? "bg-[var(--md-accent)] text-[var(--md-accent-ink)]" :
    item.label === "Documents" ? "bg-[var(--md-accent)] text-[var(--md-accent-ink)]" :
    item.label === "Exceptions" || item.value === "2" ? "bg-[rgba(209,78,78,0.1)] text-[var(--md-red)]" :
    item.label === "Bookings" ? "bg-[rgba(221,138,43,0.12)] text-[var(--md-amber)]" :
    item.label === "Customers" ? "bg-[rgba(90,103,100,0.1)] text-[var(--md-text)]" :
    "bg-transparent text-[var(--md-text)]"
  const trailingSlot = trailing ?? (affordance ? <SidebarNavArrow affordance={affordance} /> : null)

  return (
    <button
      type="button"
      data-sidebar-row=""
      aria-current={isActive ? "page" : undefined}
      aria-disabled={isDisabled || undefined}
      aria-expanded={expanded}
      aria-label={collapsed ? t(item.label) : undefined}
      title={t(item.label)}
      className={cn(
        buttonVariants({ variant: "ghost", size: "sm" }),
        "group relative h-10 w-full justify-start gap-2 overflow-hidden rounded-[var(--md-radius-lg)] px-2.5 text-[14px] font-medium text-[var(--md-text)] transition-[color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
        nested && "h-9 text-[13px]",
        "bg-transparent hover:bg-transparent hover:text-[var(--md-ink)] aria-expanded:bg-transparent dark:hover:bg-transparent focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]",
        isDexterItem && "md-sidebar-dexter-item !text-white hover:!text-white focus-visible:!text-white",
        collapsed && "justify-center px-0",
        isActive && "text-[var(--md-selected-text)]",
        accent === "dexter" && isActive && "!text-white",
        isDisabled && "cursor-default opacity-55 hover:text-[var(--md-text)]",
        className,
      )}
      style={{
        transitionDuration: "150ms",
        transitionProperty: "color, opacity",
        transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
      }}
      disabled={isDisabled}
      onPointerEnter={onIntent}
      onFocus={onIntent}
      onClick={onClick}
    >
      {isDexterItem ? (
        <>
          <span className="md-dexter-pill__shader" aria-hidden="true">
            <SpectralBloomShader />
          </span>
          <span className="md-dexter-pill__contrast" aria-hidden="true" />
          <span
            data-sidebar-active-surface={isActive ? "" : undefined}
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 z-[1] rounded-[var(--md-radius-lg)] opacity-0 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.48),0_0_0_1px_var(--md-accent-deep-a16)] transition-opacity duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
          />
        </>
      ) : isActive ? (
        activeLayoutId ? (
          <motion.span
            layoutId={activeLayoutId}
            data-sidebar-active-surface
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 rounded-[var(--md-radius-lg)] bg-[var(--md-bg-strong)]",
              nested ? "shadow-[inset_0_0_0_1px_var(--md-hairline)]" : "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.68),0_8px_18px_rgba(42,52,50,0.08)]",
            )}
            transition={mdMotion.fast}
          />
        ) : (
          <span
            data-sidebar-active-surface
            aria-hidden="true"
            className={cn(
              "pointer-events-none absolute inset-0 rounded-[var(--md-radius-lg)] bg-[var(--md-bg-strong)]",
              nested ? "shadow-[inset_0_0_0_1px_var(--md-hairline)]" : "shadow-[inset_0_0_0_1px_rgba(255,255,255,0.68),0_8px_18px_rgba(42,52,50,0.08)]",
            )}
          />
        )
      ) : !isDisabled ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-[var(--md-radius-lg)] bg-[var(--md-hover)] opacity-0 transition-opacity duration-100 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
          style={{
            transitionDuration: "100ms",
            transitionProperty: "opacity",
            transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
          }}
        />
      ) : null}
      <span
        className={cn(
          "relative grid size-5 place-items-center text-[var(--md-subtle)] transition-colors duration-150",
          !isActive && "group-hover:text-[var(--md-ink)] group-focus-visible:text-[var(--md-ink)]",
          isActive && "text-[var(--md-selected-text)]",
          isDexterItem && "z-10 !text-white group-hover:!text-white",
        )}
      >
        <span
          aria-hidden="true"
          className="grid size-full place-items-center"
        >
          <Icon data-icon={collapsed ? undefined : "inline-start"} strokeWidth={1.2} />
        </span>
      </span>
      <span className={cn("min-w-0 flex-1 truncate text-start", isDexterItem && "z-10", collapsed ? "sr-only !absolute" : "relative")}>{t(item.label)}</span>
      {item.value ? (
        <span
          className={cn(
            "relative rounded-full px-2 py-0.5 text-[11px] font-medium shadow-[inset_0_0_0_1px_rgba(255,255,255,0.38)]",
            valueTone,
            collapsed && "absolute end-1 top-1 min-w-2 px-0 text-[0px] leading-none",
          )}
        >
          {t(item.value)}
        </span>
      ) : null}
      {/* One fixed 20px slot holds either the pin or the arrow, so the glyph column
          never drifts with the label's length or type size. */}
      {trailingSlot && !collapsed ? (
        <span className="relative ms-auto grid size-5 shrink-0 place-items-center text-[var(--md-subtle)]">{trailingSlot}</span>
      ) : null}
    </button>
  )
}

function SidebarSection({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.nav
      className={cn("flex flex-col gap-1", className)}
      variants={shouldReduceMotion ? undefined : navReveal}
      initial={shouldReduceMotion ? undefined : "hidden"}
      animate={shouldReduceMotion ? undefined : "show"}
    >
      {children}
    </motion.nav>
  )
}

function SidebarSectionItem({ children, layout = false }: { children: ReactNode; layout?: boolean }) {
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      variants={navItemReveal}
      layout={layout && !shouldReduceMotion ? "position" : false}
      transition={{ layout: sidebarPinTransition }}
    >
      {children}
    </motion.div>
  )
}

const areasScopeId = "areas"
const favouritesScopeId = "favourites"
const maximumSidebarFavourites = 2

type SidebarFavourite = {
  id: string
  item: NavItem
  areaId: string
  destinationId?: string
}

function sidebarFavouriteId(areaId: string, destinationId?: string, route?: string) {
  if (!destinationId) return `area:${areaId}`
  return route ? `destination:${areaId}:${destinationId}:${route}` : `destination:${areaId}:${destinationId}`
}

function sidebarFavouriteCandidates(areas: SidebarArea[]) {
  const candidates = new Map<string, SidebarFavourite>()

  areas.forEach((area) => {
    const areaId = sidebarFavouriteId(area.id)
    candidates.set(areaId, { id: areaId, item: { label: area.label, icon: area.icon }, areaId: area.id })

    area.destinations.forEach((destination) => {
      const destinationId = sidebarFavouriteId(area.id, destination.id, destination.route)
      candidates.set(destinationId, { id: destinationId, item: destination, areaId: area.id, destinationId: destination.id })
      destination.children?.forEach((child) => {
        const childId = sidebarFavouriteId(area.id, destination.id, child.route ?? child.label)
        candidates.set(childId, { id: childId, item: child, areaId: area.id, destinationId: destination.id })
      })
    })
  })

  return candidates
}

function SidebarArrangeHeader({ label, onExit }: { label: string; onExit: () => void }) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.div
      className="mt-3 flex items-center gap-2 ps-2 pe-1"
      initial={shouldReduceMotion ? false : { opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
    >
      <p className="min-w-0 flex-1 truncate text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--md-accent)]">
        {t("Arranging")} · {label}
      </p>
      <button
        type="button"
        aria-label={t("Stop arranging")}
        title={t("Stop arranging")}
        className="grid size-6 shrink-0 place-items-center rounded-full text-[var(--md-subtle)] transition-[background,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-90 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
        onClick={onExit}
      >
        <X className="size-3.5" strokeWidth={1.5} />
      </button>
    </motion.div>
  )
}

/**
 * Wraps one sidebar list with its right-click actions, pinned group and arrange canvas.
 * Every list gets its own scope, so pinning inside Sales & CRM never touches the areas rail.
 */
function CustomisableSidebarSection({
  scopeId,
  baseIds,
  promotedIds = [],
  arrangeItems,
  labelForId,
  renderItem,
  collapsed,
  arranging,
  onArrangingChange,
  favouriteIds,
  favouriteLimitReached,
  favouriteIdForItem,
  onToggleFavourite,
  className,
}: {
  scopeId: string
  baseIds: string[]
  promotedIds?: string[]
  arrangeItems: SidebarArrangeItem[]
  labelForId: (id: string) => string
  renderItem: (id: string, pinned: boolean) => ReactNode
  collapsed: boolean
  arranging: boolean
  onArrangingChange: (arranging: boolean) => void
  favouriteIds?: Set<string>
  favouriteLimitReached?: boolean
  favouriteIdForItem?: (id: string) => string | null
  onToggleFavourite?: (id: string) => void
  className?: string
}) {
  const { t } = useLanguage()
  const { scope, save, togglePin } = useSidebarLayoutScope(scopeId)

  const { pinnedIds, restIds, orderedIds } = useMemo(() => {
    const topLevelOrder = mergeSavedOrder(baseIds, scope.order)
    const validIds = new Set([...baseIds, ...promotedIds])
    const nextPinnedIds = scope.pinned.filter((id) => validIds.has(id))
    const pinnedSet = new Set(nextPinnedIds)
    const nextRestIds = topLevelOrder.filter((id) => !pinnedSet.has(id))

    return {
      pinnedIds: nextPinnedIds,
      restIds: nextRestIds,
      orderedIds: [...nextPinnedIds, ...nextRestIds],
    }
  }, [baseIds, promotedIds, scope.order, scope.pinned])
  const savedOrder = useMemo(() => mergeSavedOrder(baseIds, scope.order), [baseIds, scope.order])
  const savedPinned = useMemo(() => {
    const validIds = new Set([...baseIds, ...promotedIds])
    return scope.pinned.filter((id) => validIds.has(id))
  }, [baseIds, promotedIds, scope.pinned])

  if (arranging) {
    return (
      <SidebarArrangeCanvas
        items={arrangeItems}
        order={savedOrder}
        pinned={savedPinned}
        defaultOrder={baseIds}
        onSave={(next) => {
          save(isDefaultScope(baseIds, next) ? null : next)
          onArrangingChange(false)
        }}
        onCancel={() => onArrangingChange(false)}
      />
    )
  }

  const rows: ReactNode[] = []
  orderedIds.forEach((id, index) => {
    const pinned = index < pinnedIds.length
    const favouriteId = favouriteIdForItem?.(id) ?? null
    const favourite = Boolean(favouriteId && favouriteIds?.has(favouriteId))

    rows.push(
      <SidebarSectionItem key={id} layout>
        <SidebarItemMenu
          pinned={pinned}
          onTogglePin={() => togglePin(id)}
          favourite={favourite}
          onToggleFavourite={favouriteId && onToggleFavourite ? () => onToggleFavourite(favouriteId) : undefined}
          favouriteDisabled={Boolean(favouriteLimitReached && !favourite)}
          onReorder={() => onArrangingChange(true)}
        >
          {renderItem(id, pinned)}
          {pinned && !collapsed ? (
            <button
              type="button"
              aria-label={`${t("Unpin")}: ${t(labelForId(id))}`}
              title={t("Unpin")}
              className="absolute end-1.5 top-5 z-20 grid size-6 -translate-y-1/2 place-items-center rounded-full text-[var(--md-accent)] opacity-70 transition-[opacity,background,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] hover:opacity-100 active:scale-90 focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]"
              onClick={() => togglePin(id)}
            >
              <Pin className="size-3 -rotate-[32deg]" strokeWidth={1.6} />
            </button>
          ) : null}
        </SidebarItemMenu>
      </SidebarSectionItem>,
    )

    if (pinnedIds.length > 0 && index === pinnedIds.length - 1 && restIds.length > 0) {
      rows.push(
        <motion.div
          key="pinned-divider"
          aria-hidden="true"
          layout="position"
          transition={{ layout: sidebarPinTransition }}
          className="mx-2 my-1 h-px bg-[var(--md-line-strong)]"
        />,
      )
    }
  })

  return <SidebarSection className={className}>{rows}</SidebarSection>
}

function routeMatches(item: NavItem, route: string) {
  if (!item.route) return false
  if (item.route === "/") return route === "/"
  if (item.route === "/customs/standalone/export") return /^\/customs\/standalone\/(export|import)(\/|$)/.test(route)
  if (item.route === "/customs/job-related/export") return /^\/customs\/job-related\/(export|import)(\/|$)/.test(route)
  if (item.route === "/bookings") {
    return route === "/bookings" || (/^\/bookings\/[^/]+$/.test(route) && route !== "/bookings/new" && route !== "/bookings/provisional")
  }
  if (item.route === "/crm") return route === "/crm"
  if (item.route === "/warehouse") return route === "/warehouse"
  return route === item.route || route.startsWith(`${item.route}/`)
}

function destinationMatches(destination: SidebarDestination, route: string) {
  return routeMatches(destination, route) || destination.children?.some((child) => routeMatches(child, route)) === true
}

/**
 * Routes that live at the top of the sidebar rather than inside an area, so the
 * areas rail stays visible instead of opening a pane that does not own them.
 */
function isTopLevelRoute(route: string) {
  return route === "/" || route === "/inbox" || route === "/to-do" || route === "/agent-dexter"
}

function findAreaForRoute(route: string, areas: SidebarArea[] = sidebarAreas) {
  return areas.find((area) => area.destinations.some((destination) => destinationMatches(destination, route)))
}

function activeDestinationIds(area: SidebarArea | undefined, route: string) {
  if (!area) return []
  return area.destinations.filter((destination) => destination.children && destinationMatches(destination, route)).map((destination) => destination.id)
}

function nestedDestinationId(parentId: string, item: NavItem) {
  return `${parentId}::${item.route ?? item.label.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`
}

function inboxFolderRows(folders: MailboxFolder[]) {
  const visible = folders.filter((folder) => folder.role === "custom" || folder.role === "important")
  const visibleIds = new Set(visible.map((folder) => folder.id))
  const children = new Map<string | null, MailboxFolder[]>()

  for (const folder of visible) {
    const parentId = folder.parentId && visibleIds.has(folder.parentId) ? folder.parentId : null
    const siblings = children.get(parentId) ?? []
    siblings.push(folder)
    children.set(parentId, siblings)
  }
  for (const siblings of children.values()) {
    siblings.sort((a, b) => a.displayName.localeCompare(b.displayName, undefined, { sensitivity: "base" }))
  }

  const rows: Array<{ folder: MailboxFolder; depth: number }> = []
  const visited = new Set<string>()
  const visit = (parentId: string | null, depth: number) => {
    for (const folder of children.get(parentId) ?? []) {
      if (visited.has(folder.id)) continue
      visited.add(folder.id)
      rows.push({ folder, depth })
      visit(folder.id, depth + 1)
    }
  }
  visit(null, 0)
  // A malformed provider hierarchy must not make a folder disappear.
  for (const folder of visible) {
    if (!visited.has(folder.id)) rows.push({ folder, depth: 0 })
  }
  return rows
}

function InboxContextSidebar({
  collapsed,
  navigate,
  onRequestClose,
}: {
  collapsed: boolean
  navigate: (path: string) => void
  onRequestClose?: () => void
}) {
  const { t } = useLanguage()
  const workspace = useOptionalInboxWorkspace()
  const shouldReduceMotion = useReducedMotion()
  const [foldersExpanded, setFoldersExpanded] = useState(true)
  const sidebarInstanceId = useId()
  const folderRegionId = `inbox-provider-folders-${sidebarInstanceId}`
  const activeFolderLayoutId = `inbox-folder-selection-${sidebarInstanceId}`

  if (!workspace) return null

  const {
    connections,
    mailboxes,
    accountState,
    provider,
    mailboxId,
    folderId,
    view,
    folders,
    selectProvider,
    selectMailbox,
    selectView,
    selectFolder,
  } = workspace
  const providers = (["gmail", "outlook"] as const).filter((candidate) =>
    mailboxes.some((mailbox) => mailbox.provider === candidate)
    || connections.some((connection) => connection.provider === candidate && connection.status !== "disconnected"))
  const providerMailboxes = provider ? mailboxes.filter((mailbox) => mailbox.provider === provider) : []
  const personalMailboxes = providerMailboxes.filter((mailbox) => mailbox.kind === "personal")
  const sharedMailboxes = providerMailboxes.filter((mailbox) => mailbox.kind !== "personal")
  const personalUnread = personalMailboxes.reduce((sum, mailbox) => sum + mailbox.unreadCount, 0)
  const sharedUnread = sharedMailboxes.reduce((sum, mailbox) => sum + mailbox.unreadCount, 0)
  const hasMailbox = providerMailboxes.length > 0
  const folderRows = inboxFolderRows(folders.filter((folder) => folder.mailboxId === mailboxId))
  const folderNoun = provider === "gmail" ? "Labels" : "Folders"
  const FolderNounIcon = provider === "gmail" ? Tags : Folder

  const count = (value: number) => value > 0 ? String(value) : undefined
  const select = (nextView: InboxNavigationView) => {
    selectView(nextView)
    onRequestClose?.()
  }

  const items: Array<{
    view: InboxNavigationView
    label: string
    icon: LucideIcon
    value?: string
    enabled: boolean
    unavailableReason?: string
  }> = [
    { view: "all", label: "All inboxes", icon: Inbox, value: count(personalUnread), enabled: personalMailboxes.length > 0 },
    {
      view: "shared",
      label: "Shared inboxes",
      icon: Users,
      value: count(sharedUnread),
      enabled: sharedMailboxes.length > 0,
      unavailableReason: provider === "gmail"
        ? "Add a Google Group inbox in Settings."
        : "Add a shared Outlook mailbox in Settings.",
    },
    { view: "suggested", label: "Suggested updates", icon: AiEditing, enabled: hasMailbox },
    { view: "sent", label: "Sent items", icon: Send, enabled: hasMailbox },
    { view: "drafts", label: "Drafts", icon: FileText, enabled: hasMailbox },
    { view: "archive", label: "Archive", icon: Archive, enabled: hasMailbox },
    { view: "spam", label: "Spam", icon: MailWarning, enabled: hasMailbox },
    { view: "trash", label: provider === "gmail" ? "Trash" : "Deleted items", icon: Trash2, enabled: hasMailbox },
  ]

  return (
    <motion.div
      key="inbox"
      className="origin-top"
      initial={false}
      animate={{ opacity: 1, scale: 1 }}
      transition={sidebarPaneTransition}
    >
      <SidebarSection>
        <SidebarSectionItem>
          <SidebarNavItem
            item={{ label: "Back", icon: ArrowLeft }}
            onClick={() => {
              navigate("/")
              onRequestClose?.()
            }}
            collapsed={collapsed}
          />
        </SidebarSectionItem>
      </SidebarSection>

      <div className={cn("mt-4 px-1", collapsed && "px-0")}>
        {provider && providers.length > 1 ? (
          <Select value={provider} onValueChange={(value) => selectProvider(value as typeof provider)}>
            <SelectTrigger
              aria-label={t("Mail provider")}
              className={cn(
                "h-10 w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface)] px-2.5 text-[13px] font-medium text-[var(--md-ink)] shadow-[var(--md-shadow-line)] focus:ring-[3px] focus:ring-[var(--md-accent-a14)]",
                collapsed && "justify-center px-0 [&>svg]:hidden",
              )}
            >
              <SelectValue>
                <span className="flex min-w-0 items-center gap-2">
                  <MailProviderMark provider={provider} />
                  <span className={cn("truncate", collapsed && "sr-only")}>{mailProviderLabels[provider]}</span>
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent className="rounded-[var(--md-radius-xl)] border-0 bg-[var(--md-surface)] shadow-[var(--md-shadow-lift)]">
              {providers.map((candidate) => (
                <SelectItem key={candidate} value={candidate} className="text-[13px]">
                  <span className="flex items-center gap-2">
                    <MailProviderMark provider={candidate} />
                    {mailProviderLabels[candidate]}
                  </span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : provider ? (
          <div className={cn(
            "flex h-10 items-center gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-2.5 shadow-[var(--md-shadow-line)]",
            collapsed && "justify-center px-0",
          )}>
            <MailProviderMark provider={provider} />
            <span className={cn("truncate text-[13px] font-medium text-[var(--md-ink)]", collapsed && "sr-only")}>{mailProviderLabels[provider]}</span>
          </div>
        ) : (
          <p className={cn("px-2 text-[12px] text-[var(--md-subtle)]", collapsed && "sr-only")}>
            {t(accountState === "idle" || accountState === "loading" ? "Loading mailboxes" : accountState === "error" ? "Mail unavailable" : "No mail connected")}
          </p>
        )}
      </div>

      <div className={cn("mt-4 flex min-h-9 items-center gap-2.5 border-b border-[var(--md-line)] px-2 pb-3", collapsed && "justify-center border-b-0 px-0 pb-0")}>
        <Inbox className="size-[18px] shrink-0 text-[var(--md-accent)]" strokeWidth={1.3} aria-hidden="true" />
        <h2 className={cn("truncate text-[17px] font-medium leading-6 tracking-[-0.015em] text-[var(--md-ink)]", collapsed && "sr-only")}>{t("Inbox")}</h2>
      </div>

      <SidebarSection className="mt-2">
        {items.map((item) => (
          <Fragment key={item.view}>
            <SidebarSectionItem>
              <SidebarNavItem
                item={{ label: item.label, icon: item.icon, value: item.value }}
                isActive={item.view === view && !folderId}
                accent={item.view === "suggested" ? "dexter" : "default"}
                onClick={item.enabled ? () => select(item.view) : undefined}
                collapsed={collapsed}
                activeLayoutId={activeFolderLayoutId}
                trailing={!item.enabled && !collapsed ? (
                  <span
                    aria-label={t(item.unavailableReason ?? "Unavailable")}
                    title={t(item.unavailableReason ?? "Unavailable")}
                    className="grid size-5 place-items-center text-[var(--md-subtle)]"
                  >
                    <Clock3 className="size-3" strokeWidth={1.25} aria-hidden="true" />
                  </span>
                ) : undefined}
              />
            </SidebarSectionItem>

            {item.view === "shared" && view === "shared" && sharedMailboxes.length > 0 && !collapsed ? (
              <div
                role="group"
                aria-label={t("Shared inboxes")}
                className="ms-5 mb-1 mt-1 border-s border-[var(--md-line-strong)] ps-2"
              >
                {sharedMailboxes.map((mailbox) => (
                  <button
                    key={mailbox.id}
                    type="button"
                    aria-current={mailbox.id === mailboxId ? "page" : undefined}
                    className={cn(
                      "flex min-h-9 w-full items-center gap-2 rounded-[var(--md-radius-md)] px-2 text-start text-[12px] outline-none transition-[background-color,color] hover:bg-[var(--md-hover)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]",
                      mailbox.id === mailboxId ? "bg-[var(--md-bg-strong)] font-medium text-[var(--md-ink)]" : "text-[var(--md-text)]",
                    )}
                    onClick={() => {
                      selectMailbox(mailbox)
                      onRequestClose?.()
                    }}
                  >
                    <span data-i18n-skip dir="auto" className="min-w-0 flex-1 truncate">{mailbox.displayName}</span>
                    {mailbox.unreadCount > 0 ? (
                      <span data-i18n-skip dir="ltr" className="shrink-0 text-[11px] tabular-nums text-[var(--md-accent)]">{mailbox.unreadCount}</span>
                    ) : null}
                  </button>
                ))}
              </div>
            ) : null}
          </Fragment>
        ))}
      </SidebarSection>

      {view !== "suggested" && folderRows.length > 0 && !collapsed ? (
        <div className="mt-3">
          <button
            type="button"
            aria-expanded={foldersExpanded}
            aria-controls={folderRegionId}
            aria-label={t(`${foldersExpanded ? "Hide" : "Show"} ${folderNoun.toLowerCase()}`)}
            className="group flex min-h-10 w-full items-center gap-2 rounded-[var(--md-radius-md)] px-2.5 text-start text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--md-subtle)] outline-none transition-[background,color,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.96] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:transition-none motion-reduce:active:scale-100"
            onClick={() => setFoldersExpanded((current) => !current)}
          >
            <FolderNounIcon className="size-4 shrink-0 text-[var(--md-accent)]" strokeWidth={1.2} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">{t(folderNoun)}</span>
            <span data-i18n-skip dir="ltr" className="text-[11px] tabular-nums text-[var(--md-subtle)]">{folderRows.length}</span>
            <motion.span
              aria-hidden="true"
              animate={{ rotate: foldersExpanded ? 0 : -90 }}
              transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
              className="grid size-5 place-items-center"
            >
              <ChevronDown className="size-3.5" strokeWidth={1.35} />
            </motion.span>
          </button>

          <motion.div
            id={folderRegionId}
            aria-hidden={!foldersExpanded}
            initial={false}
            animate={{ gridTemplateRows: foldersExpanded ? "1fr" : "0fr", opacity: foldersExpanded ? 1 : 0 }}
            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.panel)}
            className="grid"
            inert={!foldersExpanded ? true : undefined}
          >
            <div className="min-h-0 overflow-hidden">
              <nav aria-label={t(folderNoun)} className="mt-1 flex flex-col gap-0.5">
                {folderRows.map(({ folder, depth }) => {
                  const isActive = folder.id === folderId
                  const labelTone = provider === "gmail" ? mailboxLabelTone(folder) : null
                  return (
                    <motion.button
                      key={folder.id}
                      type="button"
                      aria-current={isActive ? "page" : undefined}
                      title={folder.displayName}
                      whileTap={shouldReduceMotion ? undefined : { scale: 0.96 }}
                      className={cn(
                        "group relative flex min-h-9 w-full items-center gap-2 overflow-hidden rounded-[var(--md-radius-md)] pe-2.5 text-start text-[13px] font-medium outline-none transition-[color] duration-150 hover:text-[var(--md-ink)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]",
                        isActive ? "text-[var(--md-selected-text)]" : "text-[var(--md-text)]",
                      )}
                      style={{ paddingInlineStart: `${10 + Math.min(depth, 4) * 14}px` }}
                      onClick={() => {
                        selectFolder(folder)
                        onRequestClose?.()
                      }}
                    >
                      {isActive ? (
                        <motion.span
                          layoutId={activeFolderLayoutId}
                          aria-hidden="true"
                          className="pointer-events-none absolute inset-0 rounded-[var(--md-radius-md)] bg-[var(--md-bg-strong)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.68),0_8px_18px_rgba(42,52,50,0.08)]"
                          transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
                        />
                      ) : (
                        <span aria-hidden="true" className="pointer-events-none absolute inset-0 rounded-[var(--md-radius-md)] bg-[var(--md-hover)] opacity-0 transition-opacity duration-100 group-hover:opacity-100 motion-reduce:transition-none" />
                      )}
                      {labelTone ? (
                        <span className="relative min-w-0 flex-1">
                          <span
                            className="inline-flex max-w-full items-center gap-1.5 rounded-[6px] px-2 py-1 text-[12px] font-medium leading-4 shadow-[inset_0_0_0_1px_rgba(11,20,19,0.10)]"
                            style={{
                              backgroundColor: labelTone.backgroundColor,
                              color: labelTone.foregroundColor,
                            }}
                          >
                            <Tags className="size-3 shrink-0 opacity-70" strokeWidth={1.35} aria-hidden="true" />
                            <bdi dir="auto" data-i18n-skip className="min-w-0 truncate">{folder.displayName}</bdi>
                          </span>
                        </span>
                      ) : (
                        <>
                          <span
                            aria-hidden="true"
                            className="relative size-2.5 shrink-0 rounded-[3px] shadow-[inset_0_0_0_1px_rgba(11,20,19,0.10)]"
                            style={{ backgroundColor: folder.backgroundColor ?? "var(--md-icon-well)" }}
                          />
                          <bdi dir="auto" data-i18n-skip className="relative min-w-0 flex-1 truncate">{folder.displayName}</bdi>
                        </>
                      )}
                      {folder.unreadCount ? (
                        <span data-i18n-skip dir="ltr" className="relative shrink-0 text-[11px] tabular-nums text-[var(--md-accent)]">{folder.unreadCount}</span>
                      ) : null}
                    </motion.button>
                  )
                })}
              </nav>
            </div>
          </motion.div>
        </div>
      ) : null}

      <Button
        type="button"
        variant="ghost"
        aria-label={collapsed ? t("Manage connections") : undefined}
        title={t("Manage connections")}
        className={cn(
          "mt-4 h-10 w-full justify-start gap-2 rounded-[var(--md-radius-md)] px-2.5 text-[12.5px] font-medium text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]",
          collapsed && "justify-center px-0",
        )}
        onClick={() => {
          navigate("/settings?tab=integrations")
          onRequestClose?.()
        }}
      >
        <Settings className="size-4" strokeWidth={1.25} aria-hidden="true" />
        <span className={cn(collapsed && "sr-only")}>{t("Manage connections")}</span>
      </Button>
    </motion.div>
  )
}

export function AppSidebar({
  route,
  navigate,
  className,
  currentUser,
  collapsed = false,
  onCollapsedChange,
  onRequestClose,
}: {
  route: string
  navigate: (path: string) => void
  className?: string
  currentUser?: AuthUserSummary | null
  collapsed?: boolean
  onCollapsedChange?: (collapsed: boolean) => void
  onRequestClose?: () => void
}) {
  const { direction, t } = useLanguage()
  const aiAgentName = useAiAgentName()
  const inboxWorkspace = useOptionalInboxWorkspace()
  const shouldReduceMotion = useReducedMotion()
  const isCustomer = currentUser?.actorType === "customer"
  const accentPreferenceId = useAccentPresetId()
  const companyAppearance = useCompanyAppearance(currentUser?.id)
  const activeCompanyBrand = !isCustomer && accentPreferenceId === companyAccentPreferenceId
    ? companyAppearance.brand
    : null
  const isSettingsRoute = route === "/settings"
  const isAgentRoute = route === "/agent-dexter"
  const isInboxRoute = route === "/inbox"
  const canManageWarehouseUsers = hasPermission(currentUser, "Warehouse.Users.ManageOwn")
  const canReadDocuments = hasPermission(currentUser, "Documents.Read")
  const canReadPhoneCalls = hasPermission(currentUser, "CRM.PhoneCalls.Read")
  const canShowDocumentBuilder = import.meta.env.DEV || canReadDocuments
  const canOpenAdmin = isTenantAdministrator(currentUser)
  const isCrmRoute = route === "/crm" || route.startsWith("/crm/")
  const [crmDealCount, setCrmDealCount] = useState<number | null>(null)
  const [crmLeadCount, setCrmLeadCount] = useState<number | null>(null)

  useEffect(() => {
    if (isCustomer || !isCrmRoute) return
    let active = true
    Promise.allSettled([
      listLeadsPage({ limit: 1, offset: 0 }),
      listDealsPage({ limit: 1, offset: 0 }),
    ]).then(([leads, deals]) => {
      if (!active) return
      setCrmLeadCount(leads.status === "fulfilled" ? leads.value.total : null)
      setCrmDealCount(deals.status === "fulfilled" ? deals.value.total : null)
    })
    return () => { active = false }
  }, [route, isCrmRoute, isCustomer])

  const availableAreas = useMemo<SidebarArea[]>(() => {
    if (!isCustomer) {
      return sidebarAreas.filter((area) => area.id !== "administration" || canOpenAdmin).map((area) => {
        if (area.id === "documents-service") {
          return { ...area, destinations: area.destinations.filter((destination) => destination.id !== "document-builder" || canShowDocumentBuilder) }
        }
        if (area.id !== "sales-crm") return area
        return {
          ...area,
          destinations: area.destinations.filter((destination) => destination.id !== "crm-phone-calls" || canReadPhoneCalls).map((destination) => destination.id === "crm-leads-opportunities"
            ? {
                ...destination,
                children: destination.children?.map((item) => {
                  if (item.route === "/crm/leads") return { ...item, value: crmLeadCount === null ? undefined : String(crmLeadCount) }
                  if (item.route === "/crm/deals") return { ...item, value: crmDealCount === null ? undefined : String(crmDealCount) }
                  return item
                }),
              }
            : destination),
        }
      })
    }

    const destinations = customerWarehouseNavigation.filter((item) =>
      item.route !== "/warehouse/users" || canManageWarehouseUsers)
    return [{ id: "warehouse", label: "Warehouse", icon: Boxes, destinations }]
  }, [isCustomer, canManageWarehouseUsers, canShowDocumentBuilder, canOpenAdmin, canReadPhoneCalls, crmDealCount, crmLeadCount])
  const favouriteCandidates = useMemo(() => sidebarFavouriteCandidates(availableAreas), [availableAreas])
  const { scope: favouritesScope, save: saveFavourites } = useSidebarLayoutScope(favouritesScopeId)
  const favouriteIds = useMemo(
    () => favouritesScope.pinned.filter((id) => favouriteCandidates.has(id)).slice(0, maximumSidebarFavourites),
    [favouriteCandidates, favouritesScope.pinned],
  )
  const favouriteIdSet = useMemo(() => new Set(favouriteIds), [favouriteIds])
  const favouriteLimitReached = favouriteIds.length >= maximumSidebarFavourites
  const initialArea = isSettingsRoute
    ? undefined
    : isCustomer
      ? availableAreas[0]
      : isTopLevelRoute(route)
        ? undefined
        : findAreaForRoute(route, availableAreas)
  const [activeAreaId, setActiveAreaId] = useState<string | null>(initialArea?.id ?? null)
  const [activeSettingsSection, setActiveSettingsSection] = useState<SettingsSectionId>(readSettingsSectionFromUrl)
  const [expandedDestinationIds, setExpandedDestinationIds] = useState<Set<string>>(
    () => new Set(activeDestinationIds(initialArea, route)),
  )
  const activeArea = availableAreas.find((area) => area.id === activeAreaId)
  const ActiveAreaIcon = activeArea?.icon
  const accountName = currentUser?.name ?? currentUser?.email ?? t("Signed in")
  const accountDetail = currentUser?.name && currentUser.email ? currentUser.email : t("Signed in")
  const accountInitials = currentUser?.initials ?? "MD"
  const [accountPhotoUrl, setAccountPhotoUrl] = useState<string | null>(currentUser?.profilePhotoUrl ?? null)
  const [accountCoverPhotoUrl, setAccountCoverPhotoUrl] = useState<string | null>(null)
  const [accountMenuOpen, setAccountMenuOpen] = useState(false)
  const [aiUsagePercent, setAiUsagePercent] = useState<number | null>(null)
  const profileIsActive = false
  const [arrangingScopeId, setArrangingScopeId] = useState<string | null>(null)
  const [dexterConversations, setDexterConversations] = useState<SearchableDexterConversation[]>([])
  const [dexterConversationSearch, setDexterConversationSearch] = useState("")
  const [isSearchingDexterConversations, setIsSearchingDexterConversations] = useState(false)
  const [isLoadingMoreDexterConversations, setIsLoadingMoreDexterConversations] = useState(false)
  const [hasMoreDexterConversations, setHasMoreDexterConversations] = useState(false)
  const [activeDexterConversationId, setActiveDexterConversationId] = useState<string | null>(null)
  const [editingDexterConversationId, setEditingDexterConversationId] = useState<string | null>(null)
  const [editingDexterTitle, setEditingDexterTitle] = useState("")
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null)
  const [deletingDexterConversationId, setDeletingDexterConversationId] = useState<string | null>(null)
  const [dexterSidebarError, setDexterSidebarError] = useState<string | null>(null)
  const dexterConversationRequestVersion = useRef(0)
  const sidebarScrollRef = useRef<HTMLDivElement>(null)
  const [sidebarScrollFade, setSidebarScrollFade] = useState({ top: 0, bottom: 0 })

  const updateSidebarScrollFade = useCallback(() => {
    const scrollRegion = sidebarScrollRef.current
    if (!scrollRegion) return

    const remaining = Math.max(0, scrollRegion.scrollHeight - scrollRegion.clientHeight - scrollRegion.scrollTop)
    setSidebarScrollFade({
      top: Math.min(1, scrollRegion.scrollTop / 36),
      bottom: Math.min(1, remaining / 36),
    })
  }, [])

  useEffect(() => {
    const scrollRegion = sidebarScrollRef.current
    if (!scrollRegion) return

    updateSidebarScrollFade()
    const resizeObserver = new ResizeObserver(updateSidebarScrollFade)
    resizeObserver.observe(scrollRegion)
    if (scrollRegion.firstElementChild) resizeObserver.observe(scrollRegion.firstElementChild)
    return () => resizeObserver.disconnect()
  }, [activeAreaId, collapsed, isAgentRoute, isInboxRoute, isSettingsRoute, updateSidebarScrollFade])

  const loadDexterConversations = useCallback(async (search = "", offset = 0) => {
    if (!isAgentRoute) return
    const query = search.trim()
    const isLoadingMore = offset > 0
    const requestVersion = dexterConversationRequestVersion.current + 1
    dexterConversationRequestVersion.current = requestVersion
    setIsSearchingDexterConversations(Boolean(query) && !isLoadingMore)
    setIsLoadingMoreDexterConversations(isLoadingMore)

    try {
      const page = await listDexterConversationsPage({ query, limit: 25, offset })
      const conversations = page.rows as SearchableDexterConversation[]

      if (dexterConversationRequestVersion.current !== requestVersion) return
      setDexterConversations((current) => {
        if (!isLoadingMore) return conversations
        const byId = new Map(current.map((conversation) => [conversation.id, conversation]))
        conversations.forEach((conversation) => byId.set(conversation.id, conversation))
        return [...byId.values()]
      })
      setHasMoreDexterConversations(page.hasMore)
      setDexterSidebarError(null)
    } catch (error) {
      if (dexterConversationRequestVersion.current !== requestVersion) return
      if (!isLoadingMore) setDexterConversations([])
      setHasMoreDexterConversations(false)
      setDexterSidebarError(query
        ? t("Unable to search conversations. Clear the search and try again.")
        : error instanceof Error ? error.message : t("Dexter's conversation history is unavailable."))
    } finally {
      if (dexterConversationRequestVersion.current === requestVersion) {
        setIsSearchingDexterConversations(false)
        setIsLoadingMoreDexterConversations(false)
      }
    }
  }, [isAgentRoute, t])

  const areaBaseIds = useMemo(() => availableAreas.map((area) => area.id), [availableAreas])
  const areaArrangeItems = useMemo<SidebarArrangeItem[]>(
    () => availableAreas.map((area) => ({ id: area.id, label: area.label, icon: area.icon })),
    [availableAreas],
  )
  const destinationBaseIds = useMemo(
    () => activeArea?.destinations.map((destination) => destination.id) ?? [],
    [activeArea],
  )
  const destinationArrangeItems = useMemo<SidebarArrangeItem[]>(
    () => activeArea?.destinations.map(({ id, label, icon }) => ({ id, label, icon })) ?? [],
    [activeArea],
  )
  const destinationsById = useMemo(
    () => new Map((activeArea?.destinations ?? []).map((destination) => [destination.id, destination])),
    [activeArea],
  )
  const nestedDestinationsById = useMemo(
    () =>
      new Map(
        (activeArea?.destinations ?? []).flatMap((destination) =>
          (destination.children ?? []).map((item) => [
            nestedDestinationId(destination.id, item),
            { parentId: destination.id, item },
          ] as const),
        ),
      ),
    [activeArea],
  )
  const promotedDestinationIds = useMemo(() => [...nestedDestinationsById.keys()], [nestedDestinationsById])
  const { scope: activeAreaScope, togglePin: toggleActiveAreaPin } = useSidebarLayoutScope(activeArea?.id ?? null)
  const activeAreaPinnedIds = useMemo(() => new Set(activeAreaScope.pinned), [activeAreaScope.pinned])

  useEffect(() => {
    const profilePhoto = currentUser?.profilePhoto
    if (!profilePhoto) {
      setAccountPhotoUrl(null)
      return
    }

    if (currentUser.profilePhotoUrl) {
      setAccountPhotoUrl(currentUser.profilePhotoUrl)
      return
    }

    setAccountPhotoUrl(null)
    let cancelled = false
    createProfilePhotoSignedUrl(profilePhoto).then((signedUrl) => {
      if (!cancelled) setAccountPhotoUrl(signedUrl)
    }).catch((error) => {
      console.error("The sidebar profile photo could not be loaded.", error)
      if (!cancelled) setAccountPhotoUrl(null)
    })

    return () => {
      cancelled = true
    }
  }, [currentUser?.profilePhoto, currentUser?.profilePhotoUrl])

  useEffect(() => {
    const coverPhoto = currentUser?.coverPhoto
    if (!coverPhoto) {
      setAccountCoverPhotoUrl(null)
      return
    }

    setAccountCoverPhotoUrl(null)
    let cancelled = false
    createProfilePhotoSignedUrl(coverPhoto).then((signedUrl) => {
      if (!cancelled) setAccountCoverPhotoUrl(signedUrl)
    }).catch((error) => {
      console.error("The sidebar cover photo could not be loaded.", error)
      if (!cancelled) setAccountCoverPhotoUrl(null)
    })

    return () => {
      cancelled = true
    }
  }, [currentUser?.coverPhoto])

  useEffect(() => {
    if (!accountMenuOpen || !canOpenAdmin) return

    let active = true
    getDexterUsage()
      .then((usage) => {
        if (!active) return
        const percent = Number.isFinite(usage.includedUsagePercent)
          ? usage.includedUsagePercent
          : usage.includedActionsLimit > 0
            ? (usage.actionsUsed / usage.includedActionsLimit) * 100
            : 0
        setAiUsagePercent(Math.max(0, Math.min(100, percent)))
      })
      .catch(() => {
        if (active) setAiUsagePercent(null)
      })

    return () => { active = false }
  }, [accountMenuOpen, canOpenAdmin])

  useEffect(() => {
    const routeArea = isSettingsRoute
      ? undefined
      : isCustomer
        ? availableAreas[0]
        : isTopLevelRoute(route)
          ? undefined
          : findAreaForRoute(route, availableAreas)
    setActiveAreaId(routeArea?.id ?? null)
    setExpandedDestinationIds((current) => {
      const requiredIds = activeDestinationIds(routeArea, route)
      if (requiredIds.every((id) => current.has(id))) return current

      const next = new Set(current)
      requiredIds.forEach((id) => next.add(id))
      return next
    })
  }, [route, isCustomer, isSettingsRoute, canManageWarehouseUsers, canShowDocumentBuilder]) // availableAreas is intentionally derived from the account type, environment and permissions.

  useEffect(() => {
    if (!isSettingsRoute) return

    const syncSettingsSection = () => setActiveSettingsSection(readSettingsSectionFromUrl())
    syncSettingsSection()
    window.addEventListener("popstate", syncSettingsSection)
    return () => window.removeEventListener("popstate", syncSettingsSection)
  }, [isSettingsRoute])

  useEffect(() => {
    setArrangingScopeId(null)
  }, [activeAreaId])

  useEffect(() => {
    if (!isAgentRoute) return
    const search = dexterConversationSearch.trim()
    const timer = window.setTimeout(() => void loadDexterConversations(search), search ? 180 : 0)
    const refresh = () => void loadDexterConversations(search)
    window.addEventListener(DEXTER_CONVERSATIONS_CHANGED_EVENT, refresh)
    return () => {
      window.clearTimeout(timer)
      window.removeEventListener(DEXTER_CONVERSATIONS_CHANGED_EVENT, refresh)
    }
  }, [dexterConversationSearch, isAgentRoute, loadDexterConversations])

  function openArea(area: SidebarArea) {
    setActiveAreaId(area.id)
    setExpandedDestinationIds(new Set(activeDestinationIds(area, route)))
  }

  function toggleSidebarFavourite(id: string) {
    const next = favouriteIdSet.has(id)
      ? favouriteIds.filter((entry) => entry !== id)
      : favouriteLimitReached ? favouriteIds : [...favouriteIds, id]
    saveFavourites(next.length > 0 ? { order: [], pinned: next } : null)
  }

  function openSidebarFavourite(favourite: SidebarFavourite) {
    if (favourite.item.route) {
      navigate(favourite.item.route)
      return
    }

    const area = availableAreas.find((entry) => entry.id === favourite.areaId)
    if (!area) return
    openArea(area)
    if (favourite.destinationId) {
      setExpandedDestinationIds((current) => new Set(current).add(favourite.destinationId!))
    }
  }

  function setArranging(scopeId: string, arranging: boolean) {
    // Rows need their labels to be arrangeable, so a collapsed rail opens first.
    if (arranging && collapsed) onCollapsedChange?.(false)
    setArrangingScopeId(arranging ? scopeId : null)
  }

  function toggleDestination(destinationId: string) {
    setExpandedDestinationIds((current) => {
      const next = new Set(current)
      if (next.has(destinationId)) next.delete(destinationId)
      else next.add(destinationId)
      return next
    })
  }

  function openSettingsSection(sectionId: SettingsSectionId) {
    const nextPath = sectionId === "profile" ? "/settings" : `/settings?tab=${sectionId}`
    window.history.pushState({}, "", nextPath)
    window.dispatchEvent(new PopStateEvent("popstate"))
  }

  function launchSupportTicket() {
    setAccountMenuOpen(false)
    onRequestClose?.()
    window.requestAnimationFrame(openSupportTicket)
  }

  function startDexterConversation() {
    setActiveDexterConversationId(null)
    setConfirmingDeleteId(null)
    window.dispatchEvent(new Event(DEXTER_NEW_CONVERSATION_EVENT))
    onRequestClose?.()
  }

  function selectDexterConversation(id: string) {
    setActiveDexterConversationId(id)
    setConfirmingDeleteId(null)
    window.dispatchEvent(new CustomEvent(DEXTER_SELECT_CONVERSATION_EVENT, { detail: { id } }))
    onRequestClose?.()
  }

  async function saveDexterConversationTitle(id: string) {
    const title = editingDexterTitle.trim()
    if (!title) return
    try {
      await renameDexterConversation(id, title)
      setEditingDexterConversationId(null)
      setDexterSidebarError(null)
      announceDexterConversationsChanged({ action: "rename", id, title })
    } catch (error) {
      setDexterSidebarError(error instanceof Error ? error.message : t("This conversation could not be renamed."))
    }
  }

  async function removeDexterConversation(id: string) {
    if (confirmingDeleteId !== id) {
      setConfirmingDeleteId(id)
      return
    }
    if (deletingDexterConversationId === id) return
    setDeletingDexterConversationId(id)
    try {
      await deleteDexterConversation(id)
      setConfirmingDeleteId(null)
      setDexterSidebarError(null)
      if (activeDexterConversationId === id) setActiveDexterConversationId(null)
      announceDexterConversationsChanged({ action: "delete", id })
    } catch (error) {
      setDexterSidebarError(error instanceof Error ? error.message : t("This conversation could not be deleted."))
    } finally {
      setDeletingDexterConversationId(null)
    }
  }

  const homeSidebarItem = (
    <SidebarSectionItem>
      <SidebarNavItem
        item={homeNavItem}
        isActive={route === "/"}
        onIntent={() => { if (typeof window !== "undefined") void import("@/pages/home-page") }}
        onClick={() => navigate("/")}
        collapsed={collapsed}
      />
    </SidebarSectionItem>
  )

  const inboxSidebarItem = (
    <SidebarSectionItem>
      <SidebarNavItem
        item={inboxNavItem}
        isActive={route === "/inbox"}
        onIntent={() => {
          void inboxWorkspace?.prepareAccounts()
          if (typeof window !== "undefined") void import("@/pages/inbox-page")
        }}
        onClick={() => navigate("/inbox")}
        collapsed={collapsed}
      />
    </SidebarSectionItem>
  )

  const todoSidebarItem = (
    <SidebarSectionItem>
      <SidebarNavItem
        item={todoNavItem}
        isActive={route === "/to-do"}
        onIntent={() => { if (typeof window !== "undefined") void import("@/pages/to-do-page") }}
        onClick={() => navigate("/to-do")}
        collapsed={collapsed}
      />
    </SidebarSectionItem>
  )

  const calendarSidebarItem = (
    <SidebarSectionItem>
      <SidebarNavItem
        item={calendarNavItem}
        isActive={route === "/calendar" || route.startsWith("/calendar/")}
        onIntent={() => { if (typeof window !== "undefined") void import("@/pages/calendar-page") }}
        onClick={() => navigate("/calendar")}
        collapsed={collapsed}
      />
    </SidebarSectionItem>
  )

  const favouriteSidebarItems = favouriteIds.map((id) => {
    const favourite = favouriteCandidates.get(id)
    if (!favourite) return null

    return (
      <SidebarSectionItem key={id} layout>
        <SidebarItemMenu favourite onToggleFavourite={() => toggleSidebarFavourite(id)}>
          <SidebarNavItem
            item={favourite.item}
            isActive={favourite.item.route ? routeMatches(favourite.item, route) : false}
            onClick={() => openSidebarFavourite(favourite)}
            collapsed={collapsed}
            trailing={<Star className="size-3.5 text-[var(--md-accent)]" fill="currentColor" strokeWidth={1.3} />}
          />
        </SidebarItemMenu>
      </SidebarSectionItem>
    )
  })

  const dexterSidebarItem = (
    <SidebarSectionItem>
      <SidebarNavItem
        item={{ label: `Agent ${aiAgentName}`, icon: AiBrain, route: "/agent-dexter" }}
        isActive={route === "/agent-dexter"}
        onClick={() => navigate("/agent-dexter")}
        accent="dexter"
        collapsed={collapsed}
      />
    </SidebarSectionItem>
  )

  return (
    <aside
      data-sidebar-collapsed={collapsed ? "true" : undefined}
      data-sidebar-mode={isInboxRoute ? "inbox" : isAgentRoute ? "dexter" : isSettingsRoute ? "settings" : activeArea?.id ?? "areas"}
      className={cn(
        "relative isolate flex h-full min-h-0 shrink-0 flex-col bg-[var(--md-sidebar-bg)] py-3 shadow-[var(--md-stroke-right)] transition-[width,padding] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
        collapsed ? "w-[var(--md-sidebar-collapsed-width)] px-2" : "w-[var(--md-sidebar-width)] px-[var(--md-gap-lg)]",
        className,
      )}
    >
      <div className={cn("relative z-10 flex h-10 items-center gap-1", collapsed ? "justify-center px-0" : "px-1")}>
        {collapsed ? null : (
          activeCompanyBrand ? (
            <span
              className="flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden"
              aria-label={`${activeCompanyBrand.displayName}, with Multideck`}
              title={`${activeCompanyBrand.displayName} × Multideck`}
            >
              {activeCompanyBrand.logoUrl ? (
                <img
                  src={activeCompanyBrand.logoUrl}
                  alt=""
                  className={cn(
                    "h-7 w-auto max-w-[104px] shrink-0 object-contain",
                    activeCompanyBrand.logoMimeType === "image/svg+xml" && "dark:brightness-0 dark:invert",
                  )}
                />
              ) : (
                <span className="grid size-7 shrink-0 place-items-center rounded-[8px] bg-[var(--md-accent-a14)] text-[9px] font-semibold leading-none text-[var(--md-accent)]">
                  {companyAppearanceInitials(activeCompanyBrand.displayName)}
                </span>
              )}
              <span aria-hidden="true" className="shrink-0 text-[10px] font-medium text-[var(--md-subtle)]">×</span>
              <img src={multideckLogoMark} alt="" className="size-5 shrink-0 object-contain dark:brightness-0 dark:invert" />
            </span>
          ) : (
            <img
              src={multideckFullLogo}
              alt="Multideck"
              className="me-auto h-[34px] min-w-0 max-w-[112px] object-contain transition-[filter,opacity] duration-200 dark:brightness-0 dark:invert"
            />
          )
        )}
        {collapsed ? null : onRequestClose ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t("Close navigation")}
            title={t("Close navigation")}
            className="size-9 shrink-0 rounded-full bg-[var(--md-glass)] text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]"
            onClick={onRequestClose}
          >
            <X className="size-4" strokeWidth={1.3} />
          </Button>
        ) : <NotificationBell />}
        {onCollapsedChange ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t(collapsed ? "Expand sidebar" : "Collapse sidebar")}
            title={t(collapsed ? "Expand sidebar" : "Collapse sidebar")}
            className={cn(
              "size-9 shrink-0 rounded-full bg-[var(--md-glass)] text-[var(--md-text)] shadow-[var(--md-shadow-line)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]",
            )}
            onClick={() => onCollapsedChange(!collapsed)}
          >
            <MorphingIcon from={PanelLeftClose} to={PanelLeftOpen} active={collapsed} className="size-3.5" strokeWidth={1.3} />
          </Button>
        ) : null}
      </div>

      <div className="relative z-10 mt-[var(--md-page-stack-gap)] min-h-0 flex-1">
        <div
          ref={sidebarScrollRef}
          className="md-sidebar-scroll-region h-full overflow-y-auto overflow-x-hidden"
          style={{ contain: "layout paint" }}
          onScroll={updateSidebarScrollFade}
        >
          <div>
        {isSettingsRoute || isCustomer || isAgentRoute || isInboxRoute ? null : (
          <SidebarSection>{homeSidebarItem}{inboxSidebarItem}{todoSidebarItem}{calendarSidebarItem}{favouriteSidebarItems}{dexterSidebarItem}</SidebarSection>
        )}

        <AnimatePresence mode="popLayout" initial={false}>
          {isInboxRoute ? (
            <InboxContextSidebar collapsed={collapsed} navigate={navigate} onRequestClose={onRequestClose} />
          ) : isAgentRoute ? (
            <motion.div
              key="dexter"
              className="origin-top"
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.992 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.996 }}
              transition={shouldReduceMotion ? { duration: 0 } : sidebarPaneTransition}
            >
              <SidebarSection>
                {homeSidebarItem}
                {calendarSidebarItem}
                <SidebarSectionItem>
                  <SidebarNavItem
                    item={{ label: "Back", icon: ArrowLeft }}
                    onClick={() => {
                      if (window.history.length > 1) window.history.back()
                      else navigate("/")
                      onRequestClose?.()
                    }}
                    collapsed={collapsed}
                  />
                </SidebarSectionItem>
                <SidebarSectionItem>
                  <button
                    type="button"
                    className={cn(
                      "group relative flex h-10 w-full items-center gap-2.5 overflow-hidden rounded-[var(--md-radius-lg)] px-3 text-start text-[13px] font-medium text-white shadow-[var(--md-shadow-line)] transition-[transform,box-shadow] hover:-translate-y-px focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a20)] motion-reduce:hover:translate-y-0",
                      collapsed && "justify-center px-0",
                    )}
                    onClick={startDexterConversation}
                  >
                    <span className="absolute inset-0" aria-hidden="true">
                      <SpectralBloomShader />
                    </span>
                    <span className="absolute inset-0 bg-black/20" aria-hidden="true" />
                    <Plus className="relative size-4 shrink-0" strokeWidth={1.4} />
                    <span className={cn("relative truncate", collapsed && "sr-only")}>{t("New chat")}</span>
                  </button>
                </SidebarSectionItem>
              </SidebarSection>

              <div className={cn("mt-5 flex items-center justify-between px-2", collapsed && "justify-center px-0")}>
                <p className={cn("text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--md-subtle)]", collapsed && "sr-only")}>
                  {t("History")}
                </p>
                {collapsed ? <Clock3 className="size-4 text-[var(--md-subtle)]" strokeWidth={1.25} /> : null}
              </div>

              {collapsed ? null : (
                <>
                  <div className="relative mx-2 mt-2">
                    <label className="sr-only" htmlFor="dexter-conversation-search">{t("Search conversations")}</label>
                    <Search
                      className="pointer-events-none absolute start-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]"
                      strokeWidth={1.4}
                      aria-hidden="true"
                    />
                    <input
                      id="dexter-conversation-search"
                      type="text"
                      role="searchbox"
                      value={dexterConversationSearch}
                      placeholder={t("Search conversations")}
                      autoComplete="off"
                      className="h-9 w-full rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] pe-9 ps-9 text-[12.5px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] outline-none transition-[background-color,box-shadow] duration-150 placeholder:text-[var(--md-subtle)] focus-visible:shadow-[var(--md-shadow-line),0_0_0_3px_var(--md-accent-a20)] motion-reduce:transition-none"
                      onChange={(event) => setDexterConversationSearch(event.target.value)}
                    />
                    <span className="absolute end-1 top-1/2 z-10 grid size-7 -translate-y-1/2 place-items-center">
                      <LoaderCircle
                        className={cn(
                          "pointer-events-none absolute size-3.5 animate-spin text-[var(--md-subtle)] transition-opacity duration-150 motion-reduce:animate-none motion-reduce:transition-none",
                          isSearchingDexterConversations ? "opacity-100" : "opacity-0",
                        )}
                        strokeWidth={1.4}
                        aria-hidden="true"
                      />
                      <button
                        type="button"
                        aria-label={t("Clear search")}
                        className={cn(
                          "grid size-7 place-items-center rounded-full text-[var(--md-subtle)] outline-none transition-[background-color,color,opacity,scale] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a20)] active:scale-[0.96] motion-reduce:transition-none motion-reduce:active:scale-100",
                          dexterConversationSearch && !isSearchingDexterConversations ? "opacity-100" : "pointer-events-none scale-75 opacity-0",
                        )}
                        onClick={() => setDexterConversationSearch("")}
                      >
                        <X className="size-3.5" strokeWidth={1.4} aria-hidden="true" />
                      </button>
                    </span>
                  </div>

                  <div className="mt-2 grid gap-0.5" aria-busy={isSearchingDexterConversations || isLoadingMoreDexterConversations}>
                  {dexterConversations.map((conversation, index) => (
                    <motion.div
                      key={conversation.id}
                      className="group relative min-w-0"
                      initial={shouldReduceMotion
                        ? false
                        : dexterConversationSearch
                          ? { opacity: 0 }
                          : { opacity: 0, x: direction === "rtl" ? 6 : -6 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={shouldReduceMotion
                        ? { duration: 0 }
                        : dexterConversationSearch
                          ? mdMotion.micro
                          : { ...mdMotion.enter, delay: Math.min(index * 0.025, 0.2) }}
                    >
                      {editingDexterConversationId === conversation.id ? (
                        <form
                          className="flex h-9 items-center gap-1 rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] px-2 shadow-[var(--md-shadow-line)]"
                          onSubmit={(event) => {
                            event.preventDefault()
                            void saveDexterConversationTitle(conversation.id)
                          }}
                        >
                          <input
                            autoFocus
                            value={editingDexterTitle}
                            maxLength={120}
                            aria-label={t("Conversation name")}
                            className="min-w-0 flex-1 bg-transparent text-[13px] text-[var(--md-ink)] outline-none"
                            onChange={(event) => setEditingDexterTitle(event.target.value)}
                            onKeyDown={(event) => {
                              if (event.key === "Escape") setEditingDexterConversationId(null)
                            }}
                          />
                          <button
                            type="submit"
                            className="group/save grid size-7 place-items-center rounded-full text-[var(--md-accent)] outline-none"
                            aria-label={t("Save name")}
                          >
                            <span className="grid size-6 place-items-center rounded-full transition-[background-color,box-shadow,transform] duration-150 group-hover/save:bg-[var(--md-accent-a10)] group-hover/save:shadow-[var(--md-shadow-line)] group-focus-visible/save:bg-[var(--md-accent-a10)] group-focus-visible/save:ring-[3px] group-focus-visible/save:ring-[var(--md-accent-a20)] group-active/save:scale-[0.94] motion-reduce:transition-none">
                              <Check className="size-3.5" strokeWidth={1.4} />
                            </span>
                          </button>
                        </form>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={cn(
                              "flex h-9 w-full min-w-0 items-center rounded-[var(--md-radius-lg)] px-2.5 pe-[94px] text-start text-[13px] font-medium transition-[background,color,box-shadow]",
                              activeDexterConversationId === conversation.id
                                ? "bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]"
                                : "text-[var(--md-text)] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)]",
                            )}
                            title={conversation.title}
                            onClick={() => selectDexterConversation(conversation.id)}
                          >
                            <span className="truncate">{conversation.title}</span>
                          </button>
                          <motion.div
                            className={cn(
                              "pointer-events-none absolute inset-y-0 end-1 flex items-center gap-0.5 opacity-0 transition-opacity duration-150 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
                              confirmingDeleteId === conversation.id && "pointer-events-auto opacity-100",
                            )}
                            onKeyDown={(event) => {
                              if (event.key !== "Escape" || confirmingDeleteId !== conversation.id) return
                              event.preventDefault()
                              setConfirmingDeleteId(null)
                            }}
                          >
                            <motion.button
                              type="button"
                              className="group/secondary grid size-7 shrink-0 place-items-center rounded-full text-[var(--md-subtle)] outline-none"
                              aria-label={t(confirmingDeleteId === conversation.id ? "Cancel delete" : "Rename conversation")}
                              title={t(confirmingDeleteId === conversation.id ? "Cancel" : "Rename conversation")}
                              onClick={() => {
                                if (confirmingDeleteId === conversation.id) {
                                  setConfirmingDeleteId(null)
                                  return
                                }
                                setEditingDexterConversationId(conversation.id)
                                setEditingDexterTitle(conversation.title)
                                setConfirmingDeleteId(null)
                              }}
                            >
                              <span className="relative grid size-6 place-items-center rounded-full transition-[background-color,box-shadow,color,transform] duration-150 group-hover/secondary:bg-[var(--md-hover)] group-hover/secondary:text-[var(--md-ink)] group-hover/secondary:shadow-[var(--md-shadow-line)] group-focus-visible/secondary:bg-[var(--md-hover)] group-focus-visible/secondary:ring-[3px] group-focus-visible/secondary:ring-[var(--md-accent-a20)] group-active/secondary:scale-[0.94] motion-reduce:transition-none">
                                <PencilEdit01
                                  className={cn(
                                    "absolute size-3.5 transition-[opacity,transform] duration-150",
                                    confirmingDeleteId === conversation.id ? "scale-75 opacity-0" : "scale-100 opacity-100",
                                  )}
                                  strokeWidth={1.3}
                                />
                                <X
                                  className={cn(
                                    "absolute size-3.5 transition-[opacity,transform] duration-150",
                                    confirmingDeleteId === conversation.id ? "scale-100 opacity-100" : "scale-75 opacity-0",
                                  )}
                                  strokeWidth={1.4}
                                />
                              </span>
                            </motion.button>
                            <motion.button
                              type="button"
                              initial={false}
                              animate={{ width: confirmingDeleteId === conversation.id ? 62 : 28 }}
                              className={cn(
                                "group/delete relative grid h-7 shrink-0 place-items-center overflow-hidden rounded-full text-[var(--md-subtle)] outline-none",
                                confirmingDeleteId === conversation.id
                                  ? "bg-[rgba(209,78,78,0.12)] px-2 text-[11px] font-medium text-[var(--md-red)] hover:bg-[rgba(209,78,78,0.18)]"
                                  : "hover:text-[var(--md-red)]",
                              )}
                              aria-label={t(confirmingDeleteId === conversation.id ? "Confirm delete" : "Delete conversation")}
                              title={t(confirmingDeleteId === conversation.id ? "Confirm delete" : "Delete conversation")}
                              disabled={deletingDexterConversationId === conversation.id}
                              onClick={() => void removeDexterConversation(conversation.id)}
                              transition={reduceMotion(
                                Boolean(shouldReduceMotion),
                                confirmingDeleteId === conversation.id ? mdMotion.fast : mdMotion.micro,
                              )}
                            >
                              <span
                                className={cn(
                                  "absolute grid size-6 place-items-center rounded-full transition-[background-color,box-shadow,color,opacity,transform] duration-150 group-hover/delete:bg-[rgba(209,78,78,0.10)] group-hover/delete:shadow-[var(--md-shadow-line)] group-focus-visible/delete:ring-[3px] group-focus-visible/delete:ring-[var(--md-accent-a20)] group-active/delete:scale-[0.94] motion-reduce:transition-none",
                                  confirmingDeleteId === conversation.id ? "scale-75 opacity-0" : "scale-100 opacity-100",
                                )}
                                aria-hidden="true"
                              >
                                <Trash2 className="size-3.5" strokeWidth={1.3} />
                              </span>
                              <span
                                className={cn(
                                  "whitespace-nowrap transition-[opacity,transform] duration-150",
                                  confirmingDeleteId === conversation.id ? "translate-y-0 opacity-100" : "translate-y-1 opacity-0",
                                )}
                                aria-hidden={confirmingDeleteId !== conversation.id}
                              >
                                {deletingDexterConversationId === conversation.id ? t("Deleting") : t("Confirm")}
                              </span>
                            </motion.button>
                          </motion.div>
                        </>
                      )}
                    </motion.div>
                  ))}
                  {hasMoreDexterConversations ? (
                    <Button
                      type="button"
                      variant="ghost"
                      className="mx-2 mt-1 h-8 rounded-[var(--md-radius-lg)] text-[12px] font-medium text-[var(--md-text)]"
                      disabled={isLoadingMoreDexterConversations}
                      onClick={() => void loadDexterConversations(dexterConversationSearch, dexterConversations.length)}
                    >
                      {t(isLoadingMoreDexterConversations ? "Loading older conversations" : "Load older conversations")}
                    </Button>
                  ) : null}
                  {dexterConversations.length === 0 && !isSearchingDexterConversations ? (
                    <div className="px-2 py-3 text-[12px] leading-5 text-[var(--md-subtle)]">
                      <p>{t(dexterConversationSearch ? "No matching conversations" : "No conversations yet")}</p>
                      {dexterConversationSearch ? (
                        <button
                          type="button"
                          className="mt-1 font-medium text-[var(--md-accent)] outline-none hover:underline focus-visible:rounded focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a20)]"
                          onClick={() => setDexterConversationSearch("")}
                        >
                          {t("Clear search")}
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {dexterSidebarError ? <p className="px-2 py-2 text-[12px] leading-5 text-[var(--md-red)]" role="alert">{dexterSidebarError}</p> : null}
                  </div>
                </>
              )}
            </motion.div>
          ) : isSettingsRoute ? (
            <motion.div
              key="settings"
              className="origin-top"
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.992 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.996 }}
              transition={shouldReduceMotion ? { duration: 0 } : sidebarPaneTransition}
            >
              <SidebarNavItem
                item={{ label: "All areas", icon: ArrowLeft }}
                collapsed={collapsed}
                onClick={() => navigate("/")}
              />

              <div className={cn("mt-3 flex items-center gap-2 px-2", collapsed && "justify-center px-0")}>
                <Settings className="size-4 shrink-0 text-[var(--md-accent)]" strokeWidth={1.2} aria-hidden="true" />
                <p className={cn("truncate text-[12px] font-medium uppercase tracking-[0.08em] text-[var(--md-subtle)]", collapsed && "sr-only")}>
                  {t("Settings")}
                </p>
              </div>

              <nav aria-label={t("Settings")} className="mt-3 flex flex-col gap-[var(--md-page-stack-gap)]">
                {settingsNavigationGroups.map((group) => (
                  <div key={group.label}>
                    <p className={cn("mb-1.5 px-2 text-[11px] font-medium text-[var(--md-subtle)]", collapsed && "sr-only")}>
                      {t(group.label)}
                    </p>
                    <SidebarSection>
                      {group.items.map((item) => (
                        <SidebarSectionItem key={item.id}>
                          <SidebarNavItem
                            item={{ label: item.id === "dexter" ? aiAgentName : item.label, icon: item.icon }}
                            isActive={activeSettingsSection === item.id}
                            onClick={() => openSettingsSection(item.id)}
                            collapsed={collapsed}
                            trailing={item.badge ? (
                              <span className="rounded-[var(--md-radius-sm)] bg-[var(--md-accent-a10)] px-1.5 py-0.5 text-[11px] font-medium tabular-nums text-[var(--md-accent)]">
                                {item.badge}
                              </span>
                            ) : undefined}
                          />
                        </SidebarSectionItem>
                      ))}
                    </SidebarSection>
                  </div>
                ))}
              </nav>
            </motion.div>
          ) : activeArea ? (
            <motion.div
              key={activeArea.id}
              className="mt-2 origin-top"
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.992 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.996 }}
              transition={shouldReduceMotion ? { duration: 0 } : sidebarPaneTransition}
            >
              {isCustomer || arrangingScopeId === activeArea.id ? null : (
                <SidebarNavItem
                  item={{ label: "All areas", icon: ArrowLeft }}
                  collapsed={collapsed}
                  onClick={() => setActiveAreaId(null)}
                />
              )}

              {arrangingScopeId === activeArea.id ? (
                <SidebarArrangeHeader label={t(activeArea.label)} onExit={() => setArranging(activeArea.id, false)} />
              ) : (
                <div className={cn("mt-4 flex min-h-9 items-center gap-2.5 border-b border-[var(--md-line)] px-2 pb-3", collapsed && "justify-center border-b-0 px-0 pb-0")}>
                  {ActiveAreaIcon ? <ActiveAreaIcon className="size-[18px] shrink-0 text-[var(--md-accent)]" strokeWidth={1.3} aria-hidden="true" /> : null}
                  <h2 className={cn("truncate text-[17px] font-medium leading-6 tracking-[-0.015em] text-[var(--md-ink)]", collapsed && "sr-only")}>
                    {t(activeArea.label)}
                  </h2>
                </div>
              )}

              <CustomisableSidebarSection
                className="mt-2.5"
                scopeId={activeArea.id}
                baseIds={destinationBaseIds}
                promotedIds={promotedDestinationIds}
                arrangeItems={destinationArrangeItems}
                labelForId={(id) => destinationsById.get(id)?.label ?? nestedDestinationsById.get(id)?.item.label ?? id}
                collapsed={collapsed}
                arranging={arrangingScopeId === activeArea.id}
                onArrangingChange={(next) => setArranging(activeArea.id, next)}
                favouriteIds={favouriteIdSet}
                favouriteLimitReached={favouriteLimitReached}
                favouriteIdForItem={(id) => {
                  const promoted = nestedDestinationsById.get(id)
                  if (promoted) return sidebarFavouriteId(activeArea.id, promoted.parentId, promoted.item.route ?? promoted.item.label)
                  const destination = destinationsById.get(id)
                  return destination ? sidebarFavouriteId(activeArea.id, destination.id, destination.route) : null
                }}
                onToggleFavourite={toggleSidebarFavourite}
                renderItem={(id, pinned) => {
                  const promotedDestination = nestedDestinationsById.get(id)
                  if (promotedDestination) {
                    const { item } = promotedDestination

                    return (
                      <SidebarNavItem
                        item={item}
                        isActive={routeMatches(item, route)}
                        onClick={item.route ? () => navigate(item.route!) : undefined}
                        collapsed={collapsed}
                        className={pinned && !collapsed ? "pe-9" : undefined}
                      />
                    )
                  }

                  const destination = destinationsById.get(id)
                  if (!destination) return null

                  const hasChildren = Boolean(destination.children?.length)
                  const isExpanded = expandedDestinationIds.has(destination.id)
                  const destinationActive = destinationMatches(destination, route)

                  return (
                    <>
                      <SidebarNavItem
                        item={destination}
                        isActive={!hasChildren && destinationActive}
                        onClick={hasChildren ? () => toggleDestination(destination.id) : destination.route ? () => navigate(destination.route!) : undefined}
                        collapsed={collapsed}
                        expanded={hasChildren ? isExpanded : undefined}
                        className={pinned && !collapsed ? "pe-9" : undefined}
                        // A pinned row hands the slot to its unpin button instead.
                        affordance={hasChildren && !pinned ? "group" : undefined}
                      />

                      <AnimatePresence initial={false}>
                        {hasChildren && isExpanded ? (
                          <motion.div
                            className="mt-1 overflow-hidden"
                            initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
                          >
                            <div className="md-sidebar-expanded-options flex flex-col gap-1 rounded-[var(--md-radius-xl)] bg-[var(--md-bg-strong)] p-1 dark:bg-[var(--md-surface-soft)]">
                              <AnimatePresence initial={false}>
                                {destination.children?.map((child) => {
                                  const childId = nestedDestinationId(destination.id, child)
                                  const favouriteId = sidebarFavouriteId(activeArea.id, destination.id, child.route ?? child.label)
                                  if (activeAreaPinnedIds.has(childId)) return null

                                  return (
                                    <motion.div
                                      key={childId}
                                      layout={shouldReduceMotion ? false : "position"}
                                      initial={shouldReduceMotion ? false : { height: 0, opacity: 0 }}
                                      animate={{ height: "auto", opacity: 1 }}
                                      exit={shouldReduceMotion ? undefined : { height: 0, opacity: 0 }}
                                      transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.fast)}
                                      className="overflow-hidden"
                                    >
                                      <SidebarItemMenu
                                        onTogglePin={() => toggleActiveAreaPin(childId)}
                                        favourite={favouriteIdSet.has(favouriteId)}
                                        onToggleFavourite={() => toggleSidebarFavourite(favouriteId)}
                                        favouriteDisabled={favouriteLimitReached && !favouriteIdSet.has(favouriteId)}
                                      >
                                        <SidebarNavItem
                                          item={child}
                                          isActive={routeMatches(child, route)}
                                          onClick={child.route ? () => navigate(child.route!) : undefined}
                                          collapsed={collapsed}
                                          nested
                                        />
                                      </SidebarItemMenu>
                                    </motion.div>
                                  )
                                })}
                              </AnimatePresence>
                            </div>
                          </motion.div>
                        ) : null}
                      </AnimatePresence>
                    </>
                  )
                }}
              />
            </motion.div>
          ) : (
            <motion.div
              key="areas"
              className="origin-top"
              initial={shouldReduceMotion ? false : { opacity: 0, scale: 0.992 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={shouldReduceMotion ? undefined : { opacity: 0, scale: 0.996 }}
              transition={shouldReduceMotion ? { duration: 0 } : sidebarPaneTransition}
            >
              {arrangingScopeId === areasScopeId ? (
                <SidebarArrangeHeader label={t("All areas")} onExit={() => setArranging(areasScopeId, false)} />
              ) : null}

              <CustomisableSidebarSection
                className="mt-[var(--md-gap-sm)]"
                scopeId={areasScopeId}
                baseIds={areaBaseIds}
                arrangeItems={areaArrangeItems}
                labelForId={(id) => availableAreas.find((area) => area.id === id)?.label ?? id}
                collapsed={collapsed}
                arranging={arrangingScopeId === areasScopeId}
                onArrangingChange={(next) => setArranging(areasScopeId, next)}
                favouriteIds={favouriteIdSet}
                favouriteLimitReached={favouriteLimitReached}
                favouriteIdForItem={(id) => sidebarFavouriteId(id)}
                onToggleFavourite={toggleSidebarFavourite}
                renderItem={(id, pinned) => {
                  const area = availableAreas.find((entry) => entry.id === id)
                  if (!area) return null

                  return (
                    <SidebarNavItem
                      item={{ label: area.label, icon: area.icon }}
                      onClick={() => openArea(area)}
                      collapsed={collapsed}
                      className={pinned && !collapsed ? "pe-9" : undefined}
                      affordance={pinned ? undefined : "branch"}
                    />
                  )
                }}
              />
            </motion.div>
          )}
          </AnimatePresence>
          </div>
        </div>
        <div
          aria-hidden="true"
          data-edge="top"
          className="md-sidebar-scroll-fade pointer-events-none absolute inset-x-0 top-0 z-20 h-10"
          style={{ opacity: sidebarScrollFade.top }}
        />
        <div
          aria-hidden="true"
          data-edge="bottom"
          className="md-sidebar-scroll-fade pointer-events-none absolute inset-x-0 bottom-0 z-20 h-10"
          style={{ opacity: sidebarScrollFade.bottom }}
        />
      </div>

      <div className="relative z-10 mt-[var(--md-page-stack-gap)]">
        {supportTicketFeatureEnabled ? <><Separator className="mb-[var(--md-page-stack-gap)] bg-[var(--md-line-strong)]" />
        <button
          type="button"
          aria-label={collapsed ? t("Submit a ticket") : undefined}
          title={collapsed ? t("Submit a ticket") : undefined}
          className={cn(
            "group mb-[var(--md-page-stack-gap)] flex min-h-10 w-full items-center gap-3 rounded-[var(--md-radius-lg)] px-2.5 text-start text-[13px] font-medium text-[var(--md-text)] outline-none transition-[background-color,color,scale] hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.97] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:transition-none motion-reduce:active:scale-100",
            collapsed && "justify-center px-0",
          )}
          onClick={launchSupportTicket}
        >
          <TicketCheck className="size-4 shrink-0" strokeWidth={1.4} aria-hidden="true" />
          <span className={cn("min-w-0 flex-1 truncate", collapsed && "sr-only")}>{t("Submit a ticket")}</span>
        </button></> : null}
        <Popover open={accountMenuOpen} onOpenChange={setAccountMenuOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-current={profileIsActive ? "page" : undefined}
              aria-label={collapsed ? t("Account menu") : undefined}
              title={collapsed ? accountName : undefined}
              className={cn(
                "group relative flex min-w-0 w-full items-center gap-3 overflow-hidden rounded-[var(--md-radius-lg)] px-2 py-2 text-left transition-[color,opacity,transform] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.004] hover:text-[var(--md-ink)] active:scale-[0.986] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:transition-none motion-reduce:hover:scale-100 motion-reduce:active:scale-100",
                collapsed && "justify-center px-0",
                profileIsActive && "text-[var(--md-ink)]",
              )}
              style={{
                transitionDuration: "150ms",
                transitionProperty: "color, opacity, scale, box-shadow",
                transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
              }}
            >
              {profileIsActive ? (
                <span
                  data-sidebar-active-surface
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 rounded-[var(--md-radius-lg)] bg-[var(--md-bg-strong)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.68),0_8px_18px_rgba(42,52,50,0.08)]"
                />
              ) : (
                <span
                  className="pointer-events-none absolute inset-0 scale-[0.985] rounded-[var(--md-radius-lg)] bg-[var(--md-hover)] opacity-0 transition-[opacity,transform] duration-100 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:scale-100 group-hover:opacity-100 group-focus-visible:scale-100 group-focus-visible:opacity-100 motion-reduce:transition-none"
                  style={{
                    transitionDuration: "100ms",
                    transitionProperty: "opacity, scale",
                    transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)",
                  }}
                />
              )}
              <Avatar className="relative size-10 rounded-full">
                {accountPhotoUrl ? <AvatarImage src={accountPhotoUrl} alt="" /> : null}
                <AvatarFallback
                  className={cn(
                    "rounded-full bg-[var(--md-avatar-bg)] text-[13px] font-medium text-[var(--md-ink)]",
                    currentUser?.profilePhoto && "animate-pulse text-transparent motion-reduce:animate-none",
                  )}
                  data-i18n-skip
                >
                  {currentUser?.profilePhoto ? null : accountInitials}
                </AvatarFallback>
              </Avatar>
              <div className={cn("relative min-w-0 flex-1", collapsed && "sr-only")}>
                <p className="truncate text-[14px] font-medium text-[var(--md-ink)]" dir="auto" data-i18n-skip>{accountName}</p>
                <p className="truncate text-[12px] text-[var(--md-text)]" dir={currentUser?.email ? "ltr" : "auto"} data-i18n-skip={currentUser?.email ? true : undefined}>{accountDetail}</p>
              </div>
            </button>
          </PopoverTrigger>
          <PopoverContent
            side="top"
            align="start"
            sideOffset={-48}
            collisionPadding={8}
            className="md-account-sheet w-[232px] max-w-[calc(100vw-32px)] gap-0 overflow-hidden rounded-[var(--md-radius-2xl)] border-0 bg-[var(--md-surface)] p-0 text-[var(--md-ink)] shadow-[0_22px_60px_rgba(11,20,19,0.20),inset_0_0_0_1px_rgba(255,255,255,0.72)]"
          >
            <div className="relative h-[112px] overflow-hidden bg-[color-mix(in_srgb,var(--md-accent)_11%,var(--md-surface-soft))]">
              {accountCoverPhotoUrl || !currentUser?.coverPhoto ? (
                <img src={accountCoverPhotoUrl ?? defaultCoverPhotoUrl} alt="" className="size-full object-cover" decoding="async" />
              ) : (
                <div
                  aria-hidden="true"
                  className="absolute inset-0 opacity-70"
                  style={{
                    backgroundImage: "radial-gradient(circle at 20% 16%, color-mix(in srgb, var(--md-accent) 28%, transparent), transparent 34%), radial-gradient(circle at 82% 82%, color-mix(in srgb, var(--md-accent) 16%, transparent), transparent 38%)",
                  }}
                />
              )}
              <div aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(to_bottom,rgba(0,0,0,0.04)_0%,rgba(0,0,0,0.08)_44%,color-mix(in_srgb,var(--md-surface)_96%,transparent)_100%)]" />
              <button
                type="button"
                aria-label={t("Close menu")}
                className="absolute end-3 top-3 grid size-8 place-items-center rounded-full bg-black/20 text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.18),0_4px_12px_rgba(0,0,0,0.12)] transition-[background-color,box-shadow,transform] duration-150 hover:bg-black/32 active:scale-[0.96] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white/40 motion-reduce:transition-none motion-reduce:active:scale-100"
                onClick={() => setAccountMenuOpen(false)}
              >
                <X className="size-3.5" strokeWidth={1.5} aria-hidden="true" />
              </button>
            </div>

            <div className="relative -mt-8 px-3 pb-2">
              <Avatar className="size-16 rounded-full bg-[var(--md-surface)] p-[3px] shadow-[0_9px_26px_rgba(11,20,19,0.18)] outline outline-1 outline-black/10 dark:outline-white/10">
                {accountPhotoUrl ? <AvatarImage src={accountPhotoUrl} alt="" className="rounded-full object-cover" /> : null}
                <AvatarFallback className="rounded-full bg-[var(--md-accent)] text-[18px] font-medium text-[var(--md-accent-ink)]" data-i18n-skip>
                  {accountInitials}
                </AvatarFallback>
              </Avatar>
              <div className="mt-2 min-w-0 px-1">
                <p className="truncate text-[14px] font-medium leading-[1.35] tracking-[-0.01em] text-[var(--md-ink)]" dir="auto" data-i18n-skip>{accountName}</p>
                <p className="mt-0.5 truncate text-[12px] leading-[1.45] text-[var(--md-text)]" dir={currentUser?.email ? "ltr" : "auto"} data-i18n-skip={currentUser?.email ? true : undefined}>{accountDetail}</p>
              </div>
            </div>

            <Separator className="mx-3 bg-[var(--md-line-strong)]" />
            <div className="p-2">
            {/* Keep sign out away from the profile trigger beneath this popover. */}
            <button
              type="button"
              className="flex h-10 w-full items-center gap-2.5 rounded-[var(--md-radius-lg)] px-2.5 text-start text-[13px] font-medium text-[var(--md-red)] transition-[background-color,color,transform] duration-150 hover:bg-[rgba(209,78,78,0.08)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[rgba(209,78,78,0.14)] motion-reduce:transition-none motion-reduce:active:scale-100"
              onClick={() => {
                setAccountMenuOpen(false)
                void supabase?.auth.signOut()
              }}
            >
              <LogOut data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              <span className="min-w-0 flex-1 truncate">{t("Sign out")}</span>
            </button>
            {canOpenAdmin ? (
              <>
                <button
                  type="button"
                  aria-label={aiUsagePercent === null ? t("Usage") : `${t("Usage")}: ${Math.round(aiUsagePercent)}%`}
                  className="group/action flex h-10 w-full items-center gap-2.5 rounded-[var(--md-radius-lg)] px-2.5 text-start text-[13px] font-medium text-[var(--md-text)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:transition-none motion-reduce:active:scale-100"
                  onClick={() => {
                    setAccountMenuOpen(false)
                    navigate("/admin/usage")
                  }}
                >
                  <ChartAnalysis data-icon="inline-start" className="size-4" strokeWidth={1.4} />
                  <span className="min-w-0 flex-1 truncate">{t("Usage")}</span>
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    className="size-5 shrink-0 text-[var(--md-accent)]"
                  >
                    <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.18" />
                    <circle
                      cx="12"
                      cy="12"
                      r="9"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray={2 * Math.PI * 9}
                      strokeDashoffset={(2 * Math.PI * 9) * (1 - (aiUsagePercent ?? 0) / 100)}
                      className="origin-center -rotate-90 transition-[stroke-dashoffset,opacity] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none"
                      opacity={aiUsagePercent === null ? 0 : 0.9}
                    />
                  </svg>
                </button>
              </>
            ) : null}
            {supportTicketFeatureEnabled ? <button
              type="button"
              className="group/action flex h-10 w-full items-center gap-2.5 rounded-[var(--md-radius-lg)] px-2.5 text-start text-[13px] font-medium text-[var(--md-text)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:transition-none motion-reduce:active:scale-100"
              onClick={() => {
                launchSupportTicket()
              }}
            >
              <LifeBuoy data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              <span className="min-w-0 flex-1 truncate">{t("Support")}</span>
            </button> : null}
            <Separator className="my-1 bg-[var(--md-line-strong)]" />
            <ThemeToggle showAppearanceLabel={false} className="h-11 rounded-[var(--md-radius-lg)] px-2.5 shadow-none" />
            {!isCustomer ? <>
            <Separator className="my-1 bg-[var(--md-line-strong)]" />
            <button
              type="button"
              className="group/action flex h-10 w-full items-center gap-2.5 rounded-[var(--md-radius-lg)] px-2.5 text-start text-[13px] font-medium text-[var(--md-text)] transition-[background-color,color,transform] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] motion-reduce:transition-none motion-reduce:active:scale-100"
              onClick={() => {
                setAccountMenuOpen(false)
                openSettingsSection("profile")
              }}
            >
              <Settings data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              <span className="min-w-0 flex-1 truncate">{t("Account settings")}</span>
            </button>
            </> : null}
            </div>
          </PopoverContent>
        </Popover>
      </div>
    </aside>
  )
}
