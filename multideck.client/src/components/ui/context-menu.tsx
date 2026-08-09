import * as React from "react"
import { ContextMenu as ContextMenuPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { CheckIcon, ChevronRightIcon } from "@/components/icons/hugeicons"

/**
 * Right-click menu. It shares the dropdown's surface, option rows, and motion —
 * `md-dropdown-content` and `md-dropdown-option` carry the enter blur-and-scale
 * and the option cascade — so a menu opened by pointer reads the same as one
 * opened from a trigger.
 */

function ContextMenu({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Root>) {
  return <ContextMenuPrimitive.Root data-slot="context-menu" {...props} />
}

function ContextMenuTrigger({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Trigger>) {
  return <ContextMenuPrimitive.Trigger data-slot="context-menu-trigger" {...props} />
}

function ContextMenuGroup({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Group>) {
  return <ContextMenuPrimitive.Group data-slot="context-menu-group" {...props} />
}

function ContextMenuContent({
  className,
  collisionPadding = 12,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Content>) {
  return (
    <ContextMenuPrimitive.Portal>
      <ContextMenuPrimitive.Content
        data-slot="context-menu-content"
        collisionPadding={collisionPadding}
        className={cn(
          "md-dropdown-content premium-stroke z-50 max-h-(--radix-context-menu-content-available-height) min-w-44 origin-(--radix-context-menu-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-surface)_96%,transparent)] p-1 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] backdrop-blur-xl data-[state=closed]:overflow-hidden",
          className,
        )}
        {...props}
      />
    </ContextMenuPrimitive.Portal>
  )
}

function ContextMenuItem({
  className,
  inset,
  variant = "default",
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.Item> & {
  inset?: boolean
  variant?: "default" | "destructive"
}) {
  return (
    <ContextMenuPrimitive.Item
      data-slot="context-menu-item"
      data-inset={inset}
      data-variant={variant}
      className={cn(
        "md-dropdown-option group/context-menu-item relative my-0.5 flex min-h-8 cursor-default items-center gap-2 rounded-[var(--md-radius-lg)] px-2 py-1.5 text-[13px] text-[var(--md-text)] outline-hidden transition-[background-color,box-shadow,color,transform] duration-160 ease-[cubic-bezier(0.22,1,0.36,1)] select-none data-inset:ps-7 data-[variant=destructive]:text-[var(--md-red)] data-disabled:pointer-events-none data-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    />
  )
}

function ContextMenuCheckboxItem({
  className,
  children,
  checked,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.CheckboxItem>) {
  return (
    <ContextMenuPrimitive.CheckboxItem
      data-slot="context-menu-checkbox-item"
      className={cn(
        "md-dropdown-option relative my-0.5 flex min-h-8 cursor-default items-center gap-2 rounded-[var(--md-radius-lg)] py-1.5 pe-8 ps-2 text-[13px] text-[var(--md-text)] outline-hidden transition-[background-color,box-shadow,color,transform] duration-160 ease-[cubic-bezier(0.22,1,0.36,1)] select-none data-[state=checked]:font-medium data-[state=checked]:text-[var(--md-selected-text)] data-disabled:pointer-events-none data-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      checked={checked}
      {...props}
    >
      <span className="pointer-events-none absolute end-1.5 flex size-5 items-center justify-center rounded-[var(--md-radius-md)] text-[var(--md-accent)]">
        <ContextMenuPrimitive.ItemIndicator>
          <CheckIcon className="size-3.5" strokeWidth={1.7} />
        </ContextMenuPrimitive.ItemIndicator>
      </span>
      {children}
    </ContextMenuPrimitive.CheckboxItem>
  )
}

function ContextMenuLabel({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Label>) {
  return (
    <ContextMenuPrimitive.Label
      data-slot="context-menu-label"
      className={cn("px-2 py-1.5 text-[11px] font-medium text-[var(--md-subtle)]", className)}
      {...props}
    />
  )
}

function ContextMenuSeparator({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Separator>) {
  return (
    <ContextMenuPrimitive.Separator
      data-slot="context-menu-separator"
      className={cn("mx-1 my-1 h-px bg-[var(--md-line)]", className)}
      {...props}
    />
  )
}

function ContextMenuShortcut({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      data-slot="context-menu-shortcut"
      className={cn("ms-auto text-[11px] tracking-wide text-[var(--md-subtle)]", className)}
      {...props}
    />
  )
}

function ContextMenuSub({ ...props }: React.ComponentProps<typeof ContextMenuPrimitive.Sub>) {
  return <ContextMenuPrimitive.Sub data-slot="context-menu-sub" {...props} />
}

function ContextMenuSubTrigger({
  className,
  children,
  ...props
}: React.ComponentProps<typeof ContextMenuPrimitive.SubTrigger>) {
  return (
    <ContextMenuPrimitive.SubTrigger
      data-slot="context-menu-sub-trigger"
      className={cn(
        "md-dropdown-option my-0.5 flex min-h-8 cursor-default items-center gap-2 rounded-[var(--md-radius-lg)] px-2 py-1.5 text-[13px] text-[var(--md-text)] outline-hidden transition-[background-color,box-shadow,color,transform] duration-160 ease-[cubic-bezier(0.22,1,0.36,1)] select-none data-open:bg-[var(--md-hover)] data-open:text-[var(--md-ink)] [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {children}
      <ChevronRightIcon className="ms-auto rtl:rotate-180" />
    </ContextMenuPrimitive.SubTrigger>
  )
}

function ContextMenuSubContent({ className, ...props }: React.ComponentProps<typeof ContextMenuPrimitive.SubContent>) {
  return (
    <ContextMenuPrimitive.SubContent
      data-slot="context-menu-sub-content"
      className={cn(
        "md-dropdown-content premium-stroke z-50 min-w-40 origin-(--radix-context-menu-content-transform-origin) overflow-hidden rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-surface)_96%,transparent)] p-1 text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] backdrop-blur-xl",
        className,
      )}
      {...props}
    />
  )
}

export {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuGroup,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuCheckboxItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubTrigger,
  ContextMenuSubContent,
}
