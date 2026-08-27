import { useEffect, useMemo, useState } from "react"
import { motion, useReducedMotion } from "motion/react"
import {
  ChartAnalysis,
  FileCheck2,
  ScanText,
  ShieldCheck,
  Ship,
  type LucideIcon,
} from "@/components/icons/hugeicons"
import { StatusPill } from "@/components/multideck/status-pill"
import { DataTable, type DataTableColumn } from "@/components/multideck/data-table"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, reduceMotion } from "@/lib/motion"
import { createProfilePhotoSignedUrls, type UserProfilePhoto } from "@/lib/profile-photo"
import { cn } from "@/lib/utils"

export type UsageAllowanceUnit = "percent" | "pages" | "shipments" | "documents" | "declarations"

export type UsageContributor = {
  userId: string
  name: string
  email?: string | null
  initials: string
  usage: number
  profilePhoto?: UserProfilePhoto | null
}

export type UsageAllowanceCategory = {
  id: "ai" | "ocr" | "tracking" | "documents" | "customs"
  label: string
  description: string
  unit: UsageAllowanceUnit
  included: number
  used: number
  extra: number
  usedPercent: number
  enabled: boolean
  dataState: "live" | "pending_sync" | "not_connected"
  teamUsage?: UsageContributor[]
}

const categoryPresentation: Record<UsageAllowanceCategory["id"], {
  icon: LucideIcon
  iconClassName: string
  iconSurfaceClassName: string
  fillClassName: string
}> = {
  ai: {
    icon: ChartAnalysis,
    iconClassName: "text-[var(--md-accent)]",
    iconSurfaceClassName: "bg-[color-mix(in_srgb,var(--md-accent)_11%,var(--md-surface))]",
    fillClassName: "bg-[var(--md-accent)]",
  },
  ocr: {
    icon: ScanText,
    iconClassName: "text-[var(--md-blue)]",
    iconSurfaceClassName: "bg-[color-mix(in_srgb,var(--md-blue)_11%,var(--md-surface))]",
    fillClassName: "bg-[var(--md-blue)]",
  },
  tracking: {
    icon: Ship,
    iconClassName: "text-[var(--md-green)]",
    iconSurfaceClassName: "bg-[color-mix(in_srgb,var(--md-green)_11%,var(--md-surface))]",
    fillClassName: "bg-[var(--md-green)]",
  },
  documents: {
    icon: FileCheck2,
    iconClassName: "text-[var(--md-purple)]",
    iconSurfaceClassName: "bg-[color-mix(in_srgb,var(--md-purple)_9%,var(--md-surface))]",
    fillClassName: "bg-[var(--md-purple)]",
  },
  customs: {
    icon: ShieldCheck,
    iconClassName: "text-[var(--md-amber-strong)]",
    iconSurfaceClassName: "bg-[color-mix(in_srgb,var(--md-amber)_11%,var(--md-surface))]",
    fillClassName: "bg-[var(--md-amber)]",
  },
}

function unitLabel(unit: UsageAllowanceUnit, value: number) {
  if (unit === "percent") return "%"
  if (unit === "pages") return value === 1 ? "page" : "pages"
  if (unit === "shipments") return value === 1 ? "shipment" : "shipments"
  if (unit === "documents") return value === 1 ? "document" : "documents"
  return value === 1 ? "declaration" : "declarations"
}

function formatAmount(value: number, unit: UsageAllowanceUnit, locale: string) {
  const safeValue = Math.max(0, Number.isFinite(value) ? value : 0)
  if (unit === "percent") return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(safeValue)}%`
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(Math.round(safeValue))} ${unitLabel(unit, Math.round(safeValue))}`
}

function ContributorAvatar({ contributor, photoUrl, className }: {
  contributor: UsageContributor
  photoUrl?: string
  className?: string
}) {
  return (
    <Avatar className={cn("rounded-full outline outline-1 outline-black/10 dark:outline-white/10", className)}>
      {photoUrl ? <AvatarImage src={photoUrl} alt="" className="rounded-full object-cover" /> : null}
      <AvatarFallback className="rounded-full bg-[var(--md-surface-tint)] text-[10px] font-medium text-[var(--md-ink)]" data-i18n-skip>
        {contributor.initials || "?"}
      </AvatarFallback>
    </Avatar>
  )
}

function UsageTeam({ category }: { category: UsageAllowanceCategory }) {
  const { t, language } = useLanguage()
  const [dialogOpen, setDialogOpen] = useState(false)
  const team = useMemo(
    () => [...(category.teamUsage ?? [])].sort((left, right) => right.usage - left.usage || left.name.localeCompare(right.name)),
    [category.teamUsage],
  )
  const topUsers = useMemo(() => team.filter((contributor) => contributor.usage > 0).slice(0, 3), [team])
  const photos = useMemo(
    () => team.flatMap((contributor) => contributor.profilePhoto ? [contributor.profilePhoto] : []),
    [team],
  )
  const photoSignature = photos.map((photo) => `${photo.path}:${photo.updatedAt}`).join("|")
  const [photoUrls, setPhotoUrls] = useState<Map<string, string>>(new Map())

  useEffect(() => {
    let active = true
    if (photos.length === 0) {
      setPhotoUrls(new Map())
      return () => { active = false }
    }
    void createProfilePhotoSignedUrls(photos)
      .then((urls) => { if (active) setPhotoUrls(urls) })
      .catch(() => { if (active) setPhotoUrls(new Map()) })
    return () => { active = false }
  }, [photoSignature]) // The signature changes only when a stored profile photo changes.

  const columns = useMemo<DataTableColumn<UsageContributor>[]>(() => [
    {
      id: "member",
      label: t("Team member"),
      kind: "identity",
      minWidth: 260,
      cell: (contributor) => (
        <div className="flex min-w-0 items-center gap-2.5 py-0.5">
          <ContributorAvatar
            contributor={contributor}
            photoUrl={contributor.profilePhoto ? photoUrls.get(contributor.profilePhoto.path) : undefined}
            className="size-7"
          />
          <div className="min-w-0">
            <p className="truncate text-[12.5px] font-medium text-[var(--md-ink)]" data-i18n-skip>{contributor.name}</p>
            {contributor.email ? <p className="truncate text-[11px] text-[var(--md-subtle)]" dir="ltr" data-i18n-skip>{contributor.email}</p> : null}
          </div>
        </div>
      ),
      sortValue: (contributor) => contributor.name,
    },
    {
      id: "usage",
      label: t("Usage"),
      kind: "number",
      align: "end",
      width: 150,
      cell: (contributor) => (
        <span className="font-medium tabular-nums text-[var(--md-ink)]" dir="ltr" data-i18n-skip>
          {formatAmount(contributor.usage, category.unit, language)}
        </span>
      ),
      sortValue: (contributor) => contributor.usage,
    },
  ], [category.unit, language, photoUrls, t])

  return (
    <div className="mt-4 border-t border-[var(--md-line)] pt-3.5">
      <p className="text-[11px] font-medium text-[var(--md-subtle)]">{t("Top users")}</p>
      {topUsers.length > 0 ? (
        <div className="mt-2.5 space-y-2.5">
          {topUsers.map((contributor) => (
            <div key={contributor.userId} className="flex min-w-0 items-center gap-2.5">
              <ContributorAvatar
                contributor={contributor}
                photoUrl={contributor.profilePhoto ? photoUrls.get(contributor.profilePhoto.path) : undefined}
                className="size-7"
              />
              <p className="min-w-0 flex-1 truncate text-[12px] font-medium text-[var(--md-ink)]" data-i18n-skip>{contributor.name}</p>
              <p className="shrink-0 text-[11.5px] font-medium tabular-nums text-[var(--md-text)]" dir="ltr" data-i18n-skip>
                {formatAmount(contributor.usage, category.unit, language)}
              </p>
            </div>
          ))}
        </div>
      ) : (
        <p className="mt-2 text-[11.5px] leading-5 text-[var(--md-text)]">
          {t("No individual usage yet")}
        </p>
      )}

      {team.length > 0 ? (
        <button
          type="button"
          className="mt-3 inline-flex min-h-7 items-center text-[11.5px] font-medium text-[var(--md-ink)] underline decoration-[var(--md-line-strong)] underline-offset-4 transition-[color,transform] duration-150 ease-out hover:text-[var(--md-accent)] active:scale-[0.96] motion-reduce:transition-none"
          onClick={() => setDialogOpen(true)}
        >
          {t("See all team")}
        </button>
      ) : null}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[min(760px,calc(100dvh-2rem))] gap-0 overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-0 sm:max-w-[680px]">
          <DialogHeader className="px-5 pb-4 pt-5 pe-14">
            <DialogTitle className="text-[15px] font-medium text-[var(--md-ink)]">{t(category.label)} · {t("Team usage")}</DialogTitle>
            <DialogDescription className="text-[12px] leading-5 text-[var(--md-text)]">
              {t(category.id === "ocr"
                ? "OCR pages processed by each active workspace user this month."
                : "Percentage of each person's included AI allowance used this month.")}
            </DialogDescription>
          </DialogHeader>
          <div className="min-h-0 overflow-auto border-t border-[var(--md-line)] p-3">
            <DataTable
              ariaLabel={t(`${category.label} by team member`)}
              columns={columns}
              rows={team}
              getRowKey={(contributor) => contributor.userId}
              storageKey={`usage-${category.id}-team`}
              minimumWidth={460}
              showToolbar={false}
              showColumnManager={false}
              enableSelectionExport={false}
              className="rounded-[var(--md-radius-lg)] shadow-none"
              tableClassName="text-[12px]"
            />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export function UsageAllowanceCard({
  category,
  className,
}: {
  category: UsageAllowanceCategory
  className?: string
}) {
  const { t, language } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const presentation = categoryPresentation[category.id]
  const Icon = presentation.icon
  const connected = category.dataState === "live"
  const progress = Math.max(0, Math.min(100, category.usedPercent))
  const primaryValue = connected
    ? category.unit === "percent"
      ? formatAmount(category.usedPercent, "percent", language)
      : formatAmount(category.used, category.unit, language)
    : "—"
  const primaryDetail = connected
    ? category.unit === "percent"
      ? t("of included usage")
      : `${t("of")} ${formatAmount(category.included, category.unit, language)}`
    : t(category.dataState === "not_connected" ? "Tracking feed not connected" : "Not yet available")
  const includedValue = category.unit === "percent"
    ? t("Plan allowance")
    : formatAmount(category.included, category.unit, language)
  const extraValue = formatAmount(category.extra, category.unit, language)

  return (
    <article
      className={cn(
        "group flex min-h-[218px] flex-col rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-4 shadow-[var(--md-shadow-soft)] transition-[box-shadow,transform] duration-150 ease-out hover:-translate-y-0.5 hover:shadow-[var(--md-shadow-lift)] motion-reduce:transform-none motion-reduce:transition-none",
        className,
      )}
      aria-label={`${t(category.label)}: ${primaryValue}. ${t("Included")}: ${includedValue}. ${t("Extra usage")}: ${extraValue}.`}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn("grid size-9 shrink-0 place-items-center rounded-[var(--md-radius-lg)] shadow-[var(--md-shadow-line)]", presentation.iconSurfaceClassName, presentation.iconClassName)}>
          <Icon className="size-4" strokeWidth={1.5} aria-hidden="true" />
        </span>
        <StatusPill tone={connected ? (category.extra > 0 ? "amber" : "teal") : "neutral"}>
          {t(connected ? (category.extra > 0 ? "Extra usage" : "Included") : category.dataState === "not_connected" ? "Not connected" : "Pending")}
        </StatusPill>
      </div>

      <div className="mt-4 min-w-0">
        <h2 className="text-[14px] font-medium leading-[1.3] text-[var(--md-ink)]">{t(category.label)}</h2>
        <p className="mt-1 min-h-10 text-pretty text-[12px] leading-5 text-[var(--md-text)]">{t(category.description)}</p>
      </div>

      <div className="mt-auto pt-4">
        <div className="flex items-end justify-between gap-3">
          <p className="text-[21px] font-medium leading-none tracking-[-0.025em] tabular-nums text-[var(--md-ink)]" dir="ltr" data-i18n-skip>
            {primaryValue}
          </p>
          <p className="text-end text-[11px] leading-4 text-[var(--md-subtle)]">{primaryDetail}</p>
        </div>
        <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-[var(--md-surface-soft)] shadow-[inset_0_0_0_1px_var(--md-line-strong)]">
          <motion.span
            aria-hidden="true"
            className={cn("block h-full rounded-full", presentation.fillClassName)}
            initial={false}
            animate={{ width: connected ? `${progress}%` : "0%" }}
            transition={reduceMotion(Boolean(shouldReduceMotion), mdMotion.smooth)}
          />
        </span>
        <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-[var(--md-line)] pt-3 text-[11.5px]">
          <div className="min-w-0">
            <dt className="text-[var(--md-subtle)]">{t("Included")}</dt>
            <dd className="mt-0.5 truncate font-medium tabular-nums text-[var(--md-ink)]" dir={category.unit === "percent" ? undefined : "ltr"} data-i18n-skip={category.unit === "percent" ? undefined : true}>{includedValue}</dd>
          </div>
          <div className="min-w-0 text-end">
            <dt className="text-[var(--md-subtle)]">{t("Extra usage")}</dt>
            <dd className="mt-0.5 truncate font-medium tabular-nums text-[var(--md-ink)]" dir="ltr" data-i18n-skip>{extraValue}</dd>
          </div>
        </dl>
      </div>
      {(category.id === "ai" || category.id === "ocr") && Array.isArray(category.teamUsage) ? <UsageTeam category={category} /> : null}
    </article>
  )
}
