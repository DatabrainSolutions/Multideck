import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowLeft, Pencil } from "@/components/icons/hugeicons"

import { Button } from "@/components/ui/button"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { StatusPill } from "@/components/multideck/status-pill"
import { Surface } from "@/components/multideck/surface"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, staggerRamp } from "@/lib/motion"
import { cn } from "@/lib/utils"
import { WarehouseApiError, listWarehouseItems, type WarehouseItem } from "@/lib/warehouse"

/**
 * The item's own address. Lower-cased because it is typed and shared by people,
 * and matched case-insensitively when the page loads.
 */
export function itemDetailPath(item: { sku: string }) {
  return `/warehouse/items/${encodeURIComponent(item.sku.toLowerCase())}`
}

/** Matches `/warehouse/items/<sku>` and hands back the SKU. */
export function warehouseItemDetailSku(route: string) {
  const match = /^\/warehouse\/items\/([^/]+)$/.exec(route)
  return match ? decodeURIComponent(match[1]) : null
}

function message(error: unknown) {
  return error instanceof WarehouseApiError ? error.message : error instanceof Error ? error.message : String(error)
}

function Code({ children }: { children: ReactNode }) {
  return <span data-i18n-skip dir="ltr" className="font-medium tabular-nums text-[var(--md-ink)]">{children}</span>
}

/**
 * A page section. The same shell the order page uses, on the same ramp, so an
 * item and an order open the same way — a register row leading to a record should
 * not feel like two different products depending on which register it was.
 */
function ItemSection({ index, title, meta, children }: { index: number; title: string; meta?: string; children: ReactNode }) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()

  return (
    <motion.section
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.05) }}
      className="overflow-hidden rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-line)]"
    >
      <div className="px-4 py-3 shadow-[var(--md-stroke-bottom)]">
        <h2 className="text-[13px] font-medium leading-4 text-[var(--md-ink)]">{t(title)}</h2>
        {meta ? <p className="mt-0.5 text-[11.5px] leading-4 text-[var(--md-text)]">{t(meta)}</p> : null}
      </div>
      <div className="p-4">{children}</div>
    </motion.section>
  )
}

/**
 * Label beside value, hairline separated. Renders nothing when the value is
 * empty, so a sparse item has a shorter list rather than a column of dashes.
 */
function ItemFact({ label, value, code }: { label: string; value: string | null | undefined; code?: boolean }) {
  const { t } = useLanguage()
  if (!value) return null

  return (
    <div className="grid grid-cols-[112px_minmax(0,1fr)] items-baseline gap-3 py-[7px] first:pt-0 last:pb-0">
      <dt className="text-[11.5px] leading-4 text-[var(--md-text)]">{t(label)}</dt>
      <dd title={value} data-i18n-skip={code ? true : undefined} dir={code ? "ltr" : "auto"} className={cn("min-w-0 truncate text-[12.5px] font-medium leading-4 text-[var(--md-ink)]", code && "tabular-nums")}>{value}</dd>
    </div>
  )
}

/**
 * A warehouse item on its own screen, opened and left the same way an order is.
 * A SKU carries more than a register row can hold — a unit ladder, a box size, a
 * temperature range, what has to be captured every time it is received — and all
 * of it is worth a URL a colleague can be sent.
 */
export function WarehouseItemDetailView({
  sku,
  backTo,
  backLabel,
  navigate,
  canManage = true,
  onEdit,
}: {
  sku: string
  backTo: string
  backLabel: string
  navigate?: (path: string) => void
  canManage?: boolean
  onEdit?: (item: WarehouseItem) => void
}) {
  const { language, t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const number = useMemo(() => new Intl.NumberFormat(language, { maximumFractionDigits: 3 }), [language])
  const [item, setItem] = useState<WarehouseItem | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = useCallback(async function load() {
    try {
      const matches = await listWarehouseItems({ search: sku, includeInactive: true })
      const found = matches.find((candidate) => candidate.sku.toLowerCase() === sku.toLowerCase()) ?? null
      if (!found) {
        setLoadError(t("This SKU does not match any warehouse item."))
        return
      }
      setItem(found)
      setLoadError(null)
    } catch (cause) {
      setLoadError(message(cause))
    }
  }, [sku, t])

  useEffect(() => { void load() }, [load])

  const backButton = (
    <button
      type="button"
      onClick={() => navigate?.(backTo)}
      className="group -ms-2 inline-flex h-8 items-center gap-1.5 rounded-[var(--md-radius-md)] px-2 text-[12.5px] font-medium text-[var(--md-text)] outline-none transition-[background,color] duration-200 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]"
    >
      {/* The arrow leads the way back by 2px on hover, so the control reads as a
          direction rather than as a decorated word. */}
      <ArrowLeft className="size-3.5 transition-transform duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-x-0.5 rtl:rotate-180 rtl:group-hover:translate-x-0.5 motion-reduce:transform-none" strokeWidth={1.5} />
      {t(backLabel)}
    </button>
  )

  if (loadError) {
    return (
      <div className="grid gap-4">
        {backButton}
        <Surface padding="lg" className="grid min-h-[240px] place-items-center rounded-[var(--md-radius-xl)] text-center" role="alert">
          <div className="max-w-md">
            <p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Item not found")}</p>
            <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{loadError}</p>
            <Button type="button" variant="outline" className="mt-4 rounded-[var(--md-radius-lg)]" onClick={() => navigate?.(backTo)}>{t(backLabel)}</Button>
          </div>
        </Surface>
      </div>
    )
  }

  if (!item) {
    return (
      <div className="grid gap-4">
        {backButton}
        <Surface padding="lg" className="grid min-h-[240px] place-items-center rounded-[var(--md-radius-xl)]">
          <DotGridLoaderPanel label="Loading item" minHeight={0} />
        </Surface>
      </div>
    )
  }

  const currentItem = item

  // Only the flags that are actually set. A row of greyed-out "not dangerous, not
  // excise, not high value" chips is six things to read to learn nothing.
  const handling = [
    currentItem.isDangerousGoods ? { label: "Dangerous goods", tone: "red" as const } : null,
    currentItem.isExciseGoods ? { label: "Excise goods", tone: "amber" as const } : null,
    currentItem.isHighValue ? { label: "High value", tone: "amber" as const } : null,
    currentItem.isBondedEligible ? { label: "Bonded eligible", tone: "blue" as const } : null,
  ].filter(Boolean) as { label: string; tone: "red" | "amber" | "blue" }[]

  const captureOnReceipt = [
    currentItem.requiresLot ? t("lot") : null,
    currentItem.requiresSerial ? t("serial") : null,
    currentItem.requiresExpiry ? t("expiry") : null,
  ].filter(Boolean).join(", ")

  const hasBox = currentItem.lengthM !== null && currentItem.widthM !== null && currentItem.heightM !== null
  const dimensions = hasBox ? `${number.format(currentItem.lengthM!)} × ${number.format(currentItem.widthM!)} × ${number.format(currentItem.heightM!)} m` : null
  // Worked out rather than left for the operator to multiply three figures.
  const volume = hasBox ? `${number.format(currentItem.lengthM! * currentItem.widthM! * currentItem.heightM!)} m³` : null
  const temperature = currentItem.temperatureMinC !== null || currentItem.temperatureMaxC !== null
    ? `${currentItem.temperatureMinC ?? "−∞"} – ${currentItem.temperatureMaxC ?? "∞"} °C`
    : null

  return (
    <div className="grid gap-[var(--md-gap-lg)]">
      <motion.header
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : mdMotion.enter}
        className="grid gap-3"
      >
        {backButton}
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 data-i18n-skip dir="ltr" className="text-[24px] font-medium leading-none tracking-[-0.015em] tabular-nums text-[var(--md-ink)]">{currentItem.sku}</h1>
              <StatusPill tone={currentItem.isActive ? "green" : "neutral"}>{t(currentItem.isActive ? "Active" : "Inactive")}</StatusPill>
            </div>
            <p className="mt-1.5 text-[13px] leading-5 text-[var(--md-text)]" dir="auto">
              {currentItem.description}
              {currentItem.customerOrgName ? <><span className="text-[var(--md-subtle)]"> · </span>{currentItem.customerOrgName}</> : null}
              {currentItem.facilityName ? <><span className="text-[var(--md-subtle)]"> · </span>{currentItem.facilityName}</> : null}
            </p>
          </div>
          {canManage && onEdit ? (
            <Button
              type="button"
              onClick={() => onEdit(currentItem)}
              className="h-9 rounded-[var(--md-radius-lg)] bg-[var(--md-accent)] px-3.5 text-[13px] font-medium text-[var(--md-accent-ink)] shadow-[0_10px_22px_var(--md-accent-a14)] transition-[background-color,box-shadow,transform] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)] active:scale-[0.97] motion-reduce:transform-none"
            >
              <Pencil data-icon="inline-start" className="size-4" strokeWidth={1.4} />
              {t("Edit item")}
            </Button>
          ) : null}
        </div>
      </motion.header>

      <div className="grid gap-[var(--md-gap-lg)] xl:grid-cols-[minmax(0,1.7fr)_minmax(300px,1fr)] xl:items-start">
        <div className="grid gap-[var(--md-gap-lg)]">
          <ItemSection index={0} title="How it is counted" meta="The units this SKU is received, stored and picked in.">
            <dl>
              <ItemFact label="Base unit" value={currentItem.baseUomCode} code />
              <ItemFact label="Measured by" value={t(currentItem.quantityBasisCode)} />
              <ItemFact label="Smallest move" value={`${number.format(currentItem.minimumMovementQuantity)} ${currentItem.baseUomCode}`} code />
              <ItemFact label="Part units" value={t(currentItem.allowsFractionalQuantity ? "Allowed" : "Whole units only")} />
            </dl>
            {currentItem.uoms.length ? (
              <div className="mt-3 grid gap-1.5 pt-3 shadow-[var(--md-stroke-top)]">
                {currentItem.uoms.map((uom) => {
                  const roles = [uom.stocking ? t("stocking") : null, uom.purchasing ? t("buying") : null, uom.selling ? t("selling") : null].filter(Boolean).join(" · ")
                  return (
                    <div key={uom.id ?? uom.code} className="flex items-baseline justify-between gap-3">
                      <span className="min-w-0 truncate text-[12.5px]">
                        <Code>{uom.code}</Code>
                        {roles ? <span className="ms-2 text-[11px] text-[var(--md-subtle)]">{roles}</span> : null}
                      </span>
                      <span dir="ltr" className="shrink-0 text-[12px] font-medium tabular-nums text-[var(--md-text)]">
                        {number.format(uom.quantityInBaseUom)} {currentItem.baseUomCode}
                      </span>
                    </div>
                  )
                })}
              </div>
            ) : null}
          </ItemSection>

          {handling.length || captureOnReceipt || temperature ? (
            <ItemSection index={1} title="Handling" meta="What the warehouse has to do differently for this SKU.">
              {handling.length ? (
                <div className="mb-3 flex flex-wrap gap-1.5">
                  {handling.map((flag) => <StatusPill key={flag.label} tone={flag.tone}>{t(flag.label)}</StatusPill>)}
                </div>
              ) : null}
              <dl>
                <ItemFact label="Capture on receipt" value={captureOnReceipt || null} />
                <ItemFact label="Temperature" value={temperature} code />
              </dl>
              {!handling.length && !captureOnReceipt && !temperature ? (
                <p className="text-[12px] text-[var(--md-text)]">{t("Nothing special — handle as ordinary stock.")}</p>
              ) : null}
            </ItemSection>
          ) : null}
        </div>

        <div className="grid gap-[var(--md-gap-lg)]">
          <ItemSection index={2} title="Customs and origin">
            <dl>
              <ItemFact label="HS code" value={currentItem.hsCode} code />
              <ItemFact label="Origin" value={currentItem.countryOfOriginCode} code />
              <ItemFact label="Commodity" value={currentItem.commodityDescription !== currentItem.description ? currentItem.commodityDescription : null} />
              <ItemFact label="Bonded" value={t(currentItem.isBondedEligible ? "Eligible" : "Not eligible")} />
            </dl>
          </ItemSection>

          {dimensions || currentItem.netWeightKg !== null || currentItem.grossWeightKg !== null ? (
            <ItemSection index={3} title="Size and weight">
              <dl>
                <ItemFact label="Dimensions" value={dimensions} code />
                <ItemFact label="Volume" value={volume} code />
                <ItemFact label="Net weight" value={currentItem.netWeightKg === null ? null : `${number.format(currentItem.netWeightKg)} kg`} code />
                <ItemFact label="Gross weight" value={currentItem.grossWeightKg === null ? null : `${number.format(currentItem.grossWeightKg)} kg`} code />
              </dl>
            </ItemSection>
          ) : null}
        </div>
      </div>
    </div>
  )
}
