"use client"

import * as React from "react"
import { Select as SelectPrimitive } from "radix-ui"

import { cn } from "@/lib/utils"
import { ChevronDownIcon, CheckIcon, ChevronUpIcon } from "@/components/icons/hugeicons"
import { useInvalidFeedback } from "@/components/ui/use-invalid-feedback"

function Select({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Root>) {
  return <SelectPrimitive.Root data-slot="select" {...props} />
}

function SelectGroup({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Group>) {
  return (
    <SelectPrimitive.Group
      data-slot="select-group"
      className={cn("scroll-my-1", className)}
      {...props}
    />
  )
}

function SelectValue({
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Value>) {
  return <SelectPrimitive.Value data-slot="select-value" {...props} />
}

function SelectTrigger({
  className,
  size = "default",
  children,
  invalidFeedbackMotion = true,
  "aria-invalid": ariaInvalid,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Trigger> & {
  size?: "sm" | "default"
  invalidFeedbackMotion?: boolean
}) {
  const invalidFeedback = useInvalidFeedback(ariaInvalid, invalidFeedbackMotion)

  return (
    <SelectPrimitive.Trigger
      data-slot="select-trigger"
      data-size={size}
      data-invalid-feedback={invalidFeedback}
      aria-invalid={ariaInvalid}
      className={cn(
        "premium-stroke-soft flex w-fit items-center justify-between gap-1.5 rounded-lg bg-[var(--md-field-bg)] py-2 pe-2 ps-2.5 text-sm whitespace-nowrap transition-[background-color,border-color,box-shadow,color,opacity,transform] duration-160 ease-[cubic-bezier(0.22,1,0.36,1)] outline-none select-none hover:bg-[var(--md-field-bg-hover)] focus-visible:border-ring focus-visible:bg-[var(--md-field-bg-hover)] focus-visible:ring-3 focus-visible:ring-ring/50 active:scale-[0.985] disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-3 aria-invalid:ring-destructive/20 data-placeholder:text-muted-foreground data-[state=open]:bg-[var(--md-field-bg-hover)] data-[state=open]:shadow-[var(--md-shadow-soft)] data-[size=default]:h-8 data-[size=sm]:h-7 data-[size=sm]:rounded-[min(var(--radius-md),10px)] *:data-[slot=select-value]:line-clamp-1 *:data-[slot=select-value]:flex *:data-[slot=select-value]:items-center *:data-[slot=select-value]:gap-1.5 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      {children}
      <SelectPrimitive.Icon asChild>
        <ChevronDownIcon data-slot="select-trigger-icon" className="pointer-events-none size-4 text-muted-foreground transition-[color,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]" />
      </SelectPrimitive.Icon>
    </SelectPrimitive.Trigger>
  )
}

function SelectContent({
  className,
  children,
  position = "popper",
  align = "start",
  sideOffset = 6,
  collisionPadding = 12,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Content>) {
  return (
    <SelectPrimitive.Portal>
      <SelectPrimitive.Content
        data-slot="select-content"
        className={cn(
          "md-dropdown-content premium-stroke relative z-50 max-h-(--radix-select-content-available-height) origin-(--radix-select-content-transform-origin) overflow-x-hidden overflow-y-auto rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-surface)_96%,transparent)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] backdrop-blur-xl",
          className,
        )}
        position={position}
        align={align}
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        {...props}
      >
        <SelectScrollUpButton />
        <SelectPrimitive.Viewport
          data-slot="select-viewport"
          data-position={position}
          className="w-full min-w-(--radix-select-trigger-width) p-1"
        >
          {children}
        </SelectPrimitive.Viewport>
        <SelectScrollDownButton />
      </SelectPrimitive.Content>
    </SelectPrimitive.Portal>
  )
}

function SelectLabel({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Label>) {
  return (
    <SelectPrimitive.Label
      data-slot="select-label"
      className={cn("px-2 py-1.5 text-[11px] font-medium text-[var(--md-subtle)]", className)}
      {...props}
    />
  )
}

function SelectItem({
  className,
  children,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Item>) {
  return (
    <SelectPrimitive.Item
      data-slot="select-item"
      className={cn(
        "md-dropdown-option relative my-0.5 flex min-h-8 w-full cursor-default items-center gap-2 rounded-[var(--md-radius-lg)] py-1.5 pe-8 ps-2 text-[13px] font-normal text-[var(--md-text)] outline-hidden transition-[background-color,box-shadow,color,transform] duration-160 ease-[cubic-bezier(0.22,1,0.36,1)] select-none data-[state=checked]:font-medium data-[state=checked]:text-[var(--md-selected-text)] data-disabled:pointer-events-none data-disabled:opacity-45 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
        className
      )}
      {...props}
    >
      <span data-slot="select-item-indicator" className="pointer-events-none absolute end-1.5 flex size-5 scale-90 items-center justify-center rounded-[var(--md-radius-md)] text-[var(--md-accent)] opacity-0 transition-[background-color,opacity,transform] duration-160 ease-[cubic-bezier(0.22,1,0.36,1)]">
        <SelectPrimitive.ItemIndicator>
          <CheckIcon className="pointer-events-none size-3.5" strokeWidth={1.7} />
        </SelectPrimitive.ItemIndicator>
      </span>
      <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
    </SelectPrimitive.Item>
  )
}

function SelectSeparator({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.Separator>) {
  return (
    <SelectPrimitive.Separator
      data-slot="select-separator"
      className={cn("pointer-events-none mx-1 my-1 h-px bg-[var(--md-line)]", className)}
      {...props}
    />
  )
}

function SelectScrollUpButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
  return (
    <SelectPrimitive.ScrollUpButton
      data-slot="select-scroll-up-button"
      className={cn(
        "sticky top-0 z-10 flex cursor-default items-center justify-center bg-[color-mix(in_srgb,var(--md-surface)_96%,transparent)] py-1.5 text-[var(--md-subtle)] backdrop-blur-xl [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronUpIcon
      />
    </SelectPrimitive.ScrollUpButton>
  )
}

function SelectScrollDownButton({
  className,
  ...props
}: React.ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
  return (
    <SelectPrimitive.ScrollDownButton
      data-slot="select-scroll-down-button"
      className={cn(
        "sticky bottom-0 z-10 flex cursor-default items-center justify-center bg-[color-mix(in_srgb,var(--md-surface)_96%,transparent)] py-1.5 text-[var(--md-subtle)] backdrop-blur-xl [&_svg:not([class*='size-'])]:size-4",
        className
      )}
      {...props}
    >
      <ChevronDownIcon
      />
    </SelectPrimitive.ScrollDownButton>
  )
}

export {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectScrollDownButton,
  SelectScrollUpButton,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
}
