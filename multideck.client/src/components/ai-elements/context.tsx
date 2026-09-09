"use client"

import {
  createContext,
  useContext,
  useMemo,
  type ComponentProps,
} from "react"
import { Info } from "@/components/icons/hugeicons"
import { Button } from "@/components/ui/button"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { cn } from "@/lib/utils"

const PERCENT_MAX = 100
const ICON_RADIUS = 10
const ICON_VIEWBOX = 24
const ICON_CENTER = 12
const ICON_STROKE_WIDTH = 2

type ContextSchema = {
  usedTokens: number
  maxTokens: number
  label: string
  description: string
  locale?: string
}

const ContextValue = createContext<ContextSchema | null>(null)

function useContextValue() {
  const context = useContext(ContextValue)

  if (!context) {
    throw new Error("Context components must be used within Context")
  }

  return context
}

function getUsagePercent(usedTokens: number, maxTokens: number) {
  if (maxTokens <= 0) return 0
  return Math.min(Math.max(usedTokens / maxTokens, 0), 1)
}

function formatUsagePercent(usedTokens: number, maxTokens: number, locale?: string) {
  return new Intl.NumberFormat(locale ?? "en-GB", {
    maximumFractionDigits: 1,
    style: "percent",
  }).format(getUsagePercent(usedTokens, maxTokens))
}

export type ContextProps = ComponentProps<typeof Popover> & ContextSchema

export function Context({
  usedTokens,
  maxTokens,
  label,
  description,
  locale,
  ...props
}: ContextProps) {
  const contextValue = useMemo(
    () => ({ description, label, locale, maxTokens, usedTokens }),
    [description, label, locale, maxTokens, usedTokens],
  )

  return (
    <ContextValue.Provider value={contextValue}>
      <Popover {...props} />
    </ContextValue.Provider>
  )
}

function ContextIcon() {
  const { usedTokens, maxTokens } = useContextValue()
  const circumference = 2 * Math.PI * ICON_RADIUS
  const usedPercent = getUsagePercent(usedTokens, maxTokens)
  const dashOffset = circumference * (1 - usedPercent)

  return (
    <svg
      aria-hidden="true"
      height="20"
      style={{ color: "currentcolor" }}
      viewBox={`0 0 ${ICON_VIEWBOX} ${ICON_VIEWBOX}`}
      width="20"
    >
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.2"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeWidth={ICON_STROKE_WIDTH}
      />
      <circle
        cx={ICON_CENTER}
        cy={ICON_CENTER}
        fill="none"
        opacity="0.78"
        r={ICON_RADIUS}
        stroke="currentColor"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={dashOffset}
        strokeLinecap="round"
        strokeWidth={ICON_STROKE_WIDTH}
        style={{ transform: "rotate(-90deg)", transformOrigin: "center" }}
      />
    </svg>
  )
}

export type ContextTriggerProps = ComponentProps<typeof Button>

export function ContextTrigger({ children, className, ...props }: ContextTriggerProps) {
  const { usedTokens, maxTokens, label, locale } = useContextValue()
  const renderedPercent = formatUsagePercent(usedTokens, maxTokens, locale)

  return (
    <PopoverTrigger asChild>
      {children ?? (
        <Button
          type="button"
          variant="ghost"
          aria-label={`${label}: ${renderedPercent}`}
          aria-haspopup="dialog"
          className={cn("gap-1.5", className)}
          {...props}
        >
          <span className="font-medium tabular-nums text-[var(--md-subtle)]">
            {renderedPercent}
          </span>
          <ContextIcon />
        </Button>
      )}
    </PopoverTrigger>
  )
}

export type ContextContentProps = ComponentProps<typeof PopoverContent>

export function ContextContent({
  className,
  "aria-label": ariaLabel,
  ...props
}: ContextContentProps) {
  const { label } = useContextValue()

  return (
    <PopoverContent
      aria-label={ariaLabel ?? label}
      className={cn(
        "w-[220px] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-0 shadow-[var(--md-shadow-popover)]",
        className,
      )}
      {...props}
    />
  )
}

export type ContextContentHeaderProps = ComponentProps<"div">

export function ContextContentHeader({
  children,
  className,
  ...props
}: ContextContentHeaderProps) {
  const { usedTokens, maxTokens, label, description, locale } = useContextValue()
  const usedPercent = getUsagePercent(usedTokens, maxTokens)
  const renderedPercent = formatUsagePercent(usedTokens, maxTokens, locale)

  return (
    <div className={cn("w-full space-y-2.5 p-3", className)} {...props}>
      {children ?? (
        <>
          <div className="flex items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-icon-well)] text-[var(--md-text)]">
              <Info className="size-3.5" aria-hidden="true" strokeWidth={1.4} />
            </span>
            <h2 className="text-[13px] font-medium text-[var(--md-ink)]">{label}</h2>
          </div>
          <p className="text-[11.5px] leading-4 text-[var(--md-text)]">{description}</p>
          <div className="flex items-center justify-end text-[13px] font-medium tabular-nums text-[var(--md-ink)]">
            <span>{renderedPercent}</span>
          </div>
          <Progress
            aria-label={label}
            aria-valuetext={renderedPercent}
            className="h-1.5 bg-[var(--md-icon-well)] [&_[data-slot=progress-indicator]]:bg-[var(--md-accent)]"
            dir="ltr"
            value={usedPercent * PERCENT_MAX}
          />
        </>
      )}
    </div>
  )
}
