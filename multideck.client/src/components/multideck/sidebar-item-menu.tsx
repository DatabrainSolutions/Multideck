import type { ReactNode } from "react"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"
import { ArrowUpDown, Pin, PinOff, Star } from "@/components/icons/hugeicons"
import { cn } from "@/lib/utils"
import { useLanguage } from "@/i18n/language-provider"

function SidebarItemMenuAction({
  icon: Icon,
  label,
  hint,
  onSelect,
  disabled = false,
}: {
  icon: typeof Pin
  label: string
  hint: string
  onSelect: () => void
  disabled?: boolean
}) {
  return (
    <ContextMenuPrimitive.Item
      className="md-sidebar-menu-item group flex h-9 cursor-default select-none items-center gap-2.5 rounded-[var(--md-radius-lg)] px-2 text-[13px] font-medium text-[var(--md-text)] outline-none transition-[background,color] duration-150 ease-[cubic-bezier(0.22,1,0.36,1)] data-[disabled]:opacity-45 data-[highlighted]:bg-[var(--md-hover)] data-[highlighted]:text-[var(--md-ink)]"
      onSelect={onSelect}
      disabled={disabled}
    >
      <span className="md-sidebar-menu-item__icon grid size-5 shrink-0 place-items-center text-[var(--md-subtle)] transition-colors duration-150 group-data-[highlighted]:text-[var(--md-accent)]">
        <Icon className="size-4" strokeWidth={1.3} />
      </span>
      <span className="min-w-0 flex-1 truncate text-start">{label}</span>
      <span className="shrink-0 text-[11px] font-normal text-[var(--md-subtle)]">{hint}</span>
    </ContextMenuPrimitive.Item>
  )
}

/**
 * Wraps a sidebar row so right-click (or touch long-press) reveals its arrange and pin actions.
 */
export function SidebarItemMenu({
  children,
  pinned = false,
  onTogglePin,
  favourite = false,
  onToggleFavourite,
  favouriteDisabled = false,
  onReorder,
  disabled = false,
  className,
}: {
  children: ReactNode
  pinned?: boolean
  onTogglePin?: () => void
  favourite?: boolean
  onToggleFavourite?: () => void
  favouriteDisabled?: boolean
  onReorder?: () => void
  disabled?: boolean
  className?: string
}) {
  const { direction, t } = useLanguage()

  if (disabled) return <>{children}</>

  return (
    <ContextMenuPrimitive.Root dir={direction}>
      <ContextMenuPrimitive.Trigger asChild>
        <div className={cn("relative", className)}>{children}</div>
      </ContextMenuPrimitive.Trigger>
      <ContextMenuPrimitive.Portal>
        <ContextMenuPrimitive.Content
          collisionPadding={14}
          className="md-sidebar-menu premium-stroke z-50 origin-(--radix-context-menu-content-transform-origin) rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-surface)_96%,transparent)] p-1 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] backdrop-blur-xl"
        >
          {onTogglePin ? (
            <SidebarItemMenuAction
              icon={pinned ? PinOff : Pin}
              label={t(pinned ? "Unpin" : "Pin to top")}
              hint={t(pinned ? "Restore place" : "Keep first")}
              onSelect={onTogglePin}
            />
          ) : null}
          {onToggleFavourite ? (
            <SidebarItemMenuAction
              icon={Star}
              label={t(favourite ? "Remove from favourites" : "Add to favourites")}
              hint={t(favourite ? "Remove shortcut" : favouriteDisabled ? "2 maximum" : "Keep above Dexter")}
              onSelect={onToggleFavourite}
              disabled={!favourite && favouriteDisabled}
            />
          ) : null}
          {onReorder ? (
            <SidebarItemMenuAction
              icon={ArrowUpDown}
              label={t("Reorder")}
              hint={t("Drag to arrange")}
              onSelect={onReorder}
            />
          ) : null}
        </ContextMenuPrimitive.Content>
      </ContextMenuPrimitive.Portal>
    </ContextMenuPrimitive.Root>
  )
}
