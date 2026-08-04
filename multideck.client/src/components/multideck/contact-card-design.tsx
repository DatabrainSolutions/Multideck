import { useMemo, useRef, useState } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowDown, ArrowUp, Check, ImageUp, Info, QrCode, Trash2, TriangleAlert } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { SectionHeader, Surface } from "@/components/multideck/surface"
import { SegmentedControl } from "@/components/multideck/workflow-components"
import { QrCodeImage } from "@/components/multideck/contact-card-components"
import { ContactSocialMark } from "@/components/multideck/contact-social-mark"
import {
  EMPTY_PUBLIC_FORM,
  PublicCardExchange,
  PublicCardFooter,
  PublicCardForm,
  PublicCardPhases,
  PublicCardShell,
} from "@/components/multideck/contact-card-public-view"
import { useLanguage } from "@/i18n/language-provider"
import { mdEaseOut } from "@/lib/motion"
import { bestInkContrast, accentCanCarryActions } from "@/lib/color"
import { resolveCardTheme } from "@/lib/card-theme"
import { cardPublicUrl, readLogoFile, updateBranding, MAX_LOGO_BYTES } from "@/lib/contact-card-store"
import { CARD_SOCIAL_LABELS, type CardHeaderStyle, type CardLayout, type CardSocialKind, type CardSocialLink, type CardTheme, type ContactCard } from "@/data/contact-card-data"
import type { QrEyeStyle, QrModuleStyle } from "@/lib/qr-code"
import { cn } from "@/lib/utils"

const ACCENT_PRESETS = [
  "#1f6f68",
  "#2f6f3f",
  "#3f5f8a",
  "#5a4b8a",
  "#8a5a3f",
  "#a34747",
  "#b8862b",
  "#2b2f2e",
]

const LAYOUT_PRESETS: { id: CardLayout; label: string; detail: string }[] = [
  { id: "classic", label: "Classic", detail: "Balanced and familiar" },
  { id: "editorial", label: "Editorial", detail: "Strong left edge" },
  { id: "compact", label: "Compact", detail: "More visible at once" },
  { id: "spotlight", label: "Spotlight", detail: "Centred on the person" },
]

export function ContactCardLayoutPicker({ value, onChange }: { value: CardLayout; onChange: (value: CardLayout) => void }) {
  const { t } = useLanguage()

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-label={t("Layout preset")}>
      {LAYOUT_PRESETS.map((preset) => {
        const selected = value === preset.id
        return (
          <button
            key={preset.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(preset.id)}
            className={cn(
              "group rounded-[var(--md-radius-lg)] bg-[var(--md-surface)] p-2.5 text-start shadow-[var(--md-shadow-line)]",
              "transition-[transform,box-shadow,background-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:shadow-[var(--md-shadow-soft)] active:scale-[0.96]",
              "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a22)] motion-reduce:transition-none motion-reduce:active:scale-100",
              selected && "bg-[var(--md-accent-a08)] shadow-[inset_0_0_0_1px_var(--md-accent),var(--md-shadow-soft)]",
            )}
          >
            <span className={cn("relative block h-[76px] overflow-hidden rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] p-2", selected && "bg-[var(--md-surface)]")}>
              <span className={cn("block h-2 rounded-[var(--md-radius-xs)] bg-[var(--md-accent-a22)]", preset.id === "compact" ? "w-8" : "w-12", preset.id === "spotlight" && "mx-auto")} />
              <span className={cn("mt-2 block h-1.5 rounded-[var(--md-radius-xs)] bg-[rgba(11,20,19,0.16)]", preset.id === "editorial" ? "w-4/5" : "w-3/5", preset.id === "spotlight" && "mx-auto")} />
              <span className={cn("mt-1.5 block h-1.5 rounded-[var(--md-radius-xs)] bg-[rgba(11,20,19,0.09)]", preset.id === "compact" ? "w-2/3" : "w-full", preset.id === "spotlight" && "mx-auto w-2/3")} />
              <span className={cn("absolute bottom-2 size-6 rounded-[var(--md-radius-sm)] bg-[var(--md-ink)]", preset.id === "classic" && "right-2", preset.id === "editorial" && "right-2", preset.id === "compact" && "right-2 size-5", preset.id === "spotlight" && "left-1/2 -translate-x-1/2 rounded-full")} />
            </span>
            <span className="mt-2 flex items-center justify-between gap-2">
              <span className="text-[12.5px] font-medium text-[var(--md-ink)]">{t(preset.label)}</span>
              {selected ? <Check className="size-3.5 text-[var(--md-accent)]" strokeWidth={2} /> : null}
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-[var(--md-subtle)]">{t(preset.detail)}</span>
          </button>
        )
      })}
    </div>
  )
}

const SOCIAL_PLACEHOLDERS: Record<CardSocialKind, string> = {
  linkedin: "linkedin.com/in/harry-phillips",
  facebook: "facebook.com/your-name",
  instagram: "@your-name",
  whatsapp: "+44 7700 900000",
  email: "name@company.com",
  website: "company.com",
}

export function ContactCardSocialLinksEditor({ links, onChange }: { links: CardSocialLink[]; onChange: (links: CardSocialLink[]) => void }) {
  const { t } = useLanguage()

  function update(id: string, update: Partial<CardSocialLink>) {
    onChange(links.map((link) => (link.id === id ? { ...link, ...update } : link)))
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= links.length) return
    const next = [...links]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item)
    onChange(next)
  }

  return (
    <div className="grid gap-2">
      {links.map((link, index) => {
        const label = CARD_SOCIAL_LABELS[link.kind]
        return (
          <div key={link.id} className="grid items-center gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-2 sm:grid-cols-[36px_minmax(0,1fr)_auto]">
            <span className="grid size-9 place-items-center rounded-[var(--md-radius-md)] bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-line)]" aria-hidden="true">
              <ContactSocialMark kind={link.kind} className="size-4" />
            </span>
            <label className="min-w-0">
              <span className="sr-only">{t(label)}</span>
              <Input
                className="h-9 bg-[var(--md-surface)] text-[13px]"
                dir="ltr"
                type={link.kind === "email" ? "email" : "text"}
                value={link.value}
                placeholder={SOCIAL_PLACEHOLDERS[link.kind]}
                onChange={(event) => update(link.id, { value: event.target.value, enabled: link.enabled || Boolean(event.target.value.trim()) })}
              />
            </label>
            <div className="flex items-center justify-end gap-0.5">
              <Button variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)]" disabled={index === 0} aria-label={`${t("Move earlier")}: ${t(label)}`} onClick={() => move(index, -1)}>
                <ArrowUp className="size-3.5" strokeWidth={1.5} />
              </Button>
              <Button variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)]" disabled={index === links.length - 1} aria-label={`${t("Move later")}: ${t(label)}`} onClick={() => move(index, 1)}>
                <ArrowDown className="size-3.5" strokeWidth={1.5} />
              </Button>
              <Switch checked={link.enabled} disabled={!link.value.trim()} aria-label={`${t("Show")}: ${t(label)}`} onCheckedChange={(enabled) => update(link.id, { enabled })} />
            </div>
          </div>
        )
      })}
      <p className="text-[12px] leading-5 text-[var(--md-subtle)]">{t("Only enabled links appear on the public card. The order here is the order visitors see.")}</p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Control primitives                                                          */
/* -------------------------------------------------------------------------- */

function ControlRow({
  label,
  hint,
  children,
  stacked = false,
}: {
  label: string
  hint?: string
  children: React.ReactNode
  stacked?: boolean
}) {
  return (
    <div className={cn("py-4", stacked ? "grid gap-3" : "grid gap-3 sm:grid-cols-[minmax(0,200px)_minmax(0,1fr)] sm:items-start sm:gap-6")}>
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-[var(--md-ink)]">{label}</p>
        {hint ? <p className="mt-1 text-[12px] leading-[1.5] text-[var(--md-text)]">{hint}</p> : null}
      </div>
      <div className="min-w-0">{children}</div>
    </div>
  )
}

function ColourField({ value, onChange, label }: { value: string; onChange: (value: string) => void; label: string }) {
  return (
    <div className="inline-flex items-center gap-2.5 rounded-[var(--md-radius-md)] bg-[var(--md-surface-tint)] p-1.5 pr-3">
      <input
        type="color"
        aria-label={label}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="size-8 cursor-pointer rounded-[var(--md-radius-sm)] border-0 bg-transparent p-0"
      />
      <span className="text-[12.5px] uppercase text-[var(--md-text)] tabular-nums" dir="ltr">
        {value}
      </span>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Logo                                                                        */
/* -------------------------------------------------------------------------- */

function LogoControl({ card }: { card: ContactCard }) {
  const { t } = useLanguage()
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  async function accept(file: File | undefined) {
    if (!file) return
    try {
      const dataUrl = await readLogoFile(file)
      updateBranding(card.id, { logoDataUrl: dataUrl })
      toast.success(t("Logo updated"))
    } catch (error) {
      const reason = error instanceof Error ? error.message : "unreadable"
      toast.error(
        reason === "too-large"
          ? `${t("That image is over")} ${Math.round(MAX_LOGO_BYTES / 1024)}KB.`
          : reason === "unsupported"
            ? t("Choose an image file.")
            : t("That image could not be read."),
      )
    }
  }

  return (
    <div className="grid gap-3">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          void accept(event.dataTransfer.files[0])
        }}
        className={cn(
          "flex items-center gap-4 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3.5",
          "transition-[background-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          dragging && "bg-[var(--md-accent-a10)] shadow-[inset_0_0_0_1px_var(--md-accent-a22)]",
        )}
      >
        <span className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-[var(--md-radius-md)] bg-white shadow-[var(--md-shadow-line)]">
          {card.branding.logoDataUrl ? (
            <img src={card.branding.logoDataUrl} alt={t("Current logo")} className="size-full object-contain p-1.5" />
          ) : (
            <ImageUp className="size-5 text-[var(--md-subtle)]" strokeWidth={1.4} />
          )}
        </span>

        <div className="min-w-0 flex-1">
          <p className="text-[13px] text-[var(--md-ink)]">{card.branding.logoDataUrl ? t("Logo added") : t("Drop an image here, or choose a file.")}</p>
          <p className="mt-1 text-[12px] text-[var(--md-subtle)]">
            {t("PNG or SVG with a transparent background works best. Up to")} {Math.round(MAX_LOGO_BYTES / 1024)}KB.
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <Button variant="outline" className="h-9 rounded-[var(--md-radius-md)] text-[13px]" onClick={() => inputRef.current?.click()}>
            {card.branding.logoDataUrl ? t("Replace") : t("Choose")}
          </Button>
          {card.branding.logoDataUrl ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-9 rounded-[var(--md-radius-md)] text-[var(--md-subtle)] hover:text-[var(--md-red)]"
              aria-label={t("Remove logo")}
              onClick={() => updateBranding(card.id, { logoDataUrl: null, logoInQr: false })}
            >
              <Trash2 className="size-4" strokeWidth={1.4} />
            </Button>
          ) : null}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(event) => {
          void accept(event.target.files?.[0])
          event.target.value = ""
        }}
      />
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Preview                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * The preview renders the real public components, not a mock-up, so what the
 * owner tunes here is exactly what a visitor gets. It is inert: every control
 * inside is removed from the tab order.
 */
function CardPreview({ card }: { card: ContactCard }) {
  const { t } = useLanguage()
  const [phase, setPhase] = useState<"form" | "done">("form")
  const shouldReduceMotion = useReducedMotion()

  return (
    <div className="grid gap-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[12px] font-medium uppercase tracking-[0.06em] text-[var(--md-subtle)]">{t("Live preview")}</p>
        <SegmentedControl
          options={["form", "done"] as const}
          value={phase}
          onChange={setPhase}
          ariaLabel={t("Preview screen")}
          renderOption={(option) => (option === "form" ? t("Form") : t("Exchange"))}
        />
      </div>

      {/* A plain device frame: bezel, no ornament, so the page inside is the subject. */}
      <div className="mx-auto w-full max-w-[372px] rounded-[38px] bg-[var(--md-ink)] p-2.5 shadow-[var(--md-shadow-lift)]">
        <div className="h-[660px] overflow-y-auto overflow-x-hidden rounded-[28px] md-scrollbar">
          <PublicCardShell card={card} preview={false}>
            <PublicCardPhases
              phase={phase}
              form={
                <PublicCardForm
                  card={card}
                  values={EMPTY_PUBLIC_FORM}
                  errors={{}}
                  submitting={false}
                  slow={false}
                  submitError={null}
                  onChange={() => undefined}
                  onSubmit={(event) => event.preventDefault()}
                  interactive={false}
                />
              }
              exchange={<PublicCardExchange card={card} onAddToContacts={() => undefined} downloaded={false} interactive={false} />}
            />
            <PublicCardFooter />
          </PublicCardShell>
        </div>
      </div>

      <motion.p
        key={`${card.branding.theme}-${card.branding.layout}-${card.branding.headerStyle}`}
        initial={shouldReduceMotion ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.24, ease: mdEaseOut }}
        className="text-center text-[12px] text-[var(--md-subtle)]"
      >
        {t("Scaled to a 375px phone, the width most visitors will use.")}
      </motion.p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Panel                                                                       */
/* -------------------------------------------------------------------------- */

export function CardDesignPanel({ card }: { card: ContactCard }) {
  const { t } = useLanguage()
  const { branding } = card
  const theme = useMemo(() => resolveCardTheme(branding), [branding])
  const accentSafe = accentCanCarryActions(branding.accent, theme.pageBg)
  const contrast = useMemo(() => bestInkContrast(branding.accent), [branding.accent])
  const url = cardPublicUrl(card)

  return (
    <div className="grid items-start gap-[var(--md-page-stack-gap)] xl:grid-cols-[minmax(0,1fr)_400px]">
      <div className="grid gap-[var(--md-page-stack-gap)]">
        <Surface padding="md" className="p-5">
          <SectionHeader title={t("Logo")} meta={t("Shown on the public page, and optionally in the middle of the code.")} />
          <div className="mt-4">
            <LogoControl card={card} />
          </div>

          <div className="mt-2 divide-y divide-[rgba(11,20,19,0.06)]">
            <ControlRow
              label={t("Logo in the code")}
              hint={t("Clears a square in the centre and raises error correction so the code still scans.")}
            >
              <div className="flex items-center gap-3">
                <Switch
                  checked={branding.logoInQr}
                  disabled={!branding.logoDataUrl}
                  aria-label={t("Logo in the code")}
                  onCheckedChange={(checked) => updateBranding(card.id, { logoInQr: checked })}
                />
                <span className="text-[13px] text-[var(--md-text)]">
                  {!branding.logoDataUrl ? t("Add a logo first") : branding.logoInQr ? t("On") : t("Off")}
                </span>
              </div>
            </ControlRow>
          </div>
        </Surface>

        <Surface padding="md" className="p-5">
          <SectionHeader title={t("Colour and theme")} />
          <div className="mt-2 divide-y divide-[rgba(11,20,19,0.06)]">
            <ControlRow label={t("Accent")} hint={t("Used for the header, marks and — when it has enough contrast — buttons.")}>
              <div className="grid gap-3">
                <div className="flex flex-wrap gap-2">
                  {ACCENT_PRESETS.map((preset) => {
                    const selected = preset.toLowerCase() === branding.accent.toLowerCase()
                    return (
                      <button
                        key={preset}
                        type="button"
                        aria-label={preset}
                        aria-pressed={selected}
                        onClick={() => updateBranding(card.id, { accent: preset })}
                        style={{ backgroundColor: preset }}
                        className={cn(
                          "relative grid size-8 place-items-center rounded-full text-white",
                          "transition-transform duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:scale-[1.08] active:scale-[0.96]",
                          "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a22)]",
                          "motion-reduce:transition-none motion-reduce:hover:scale-100",
                          selected && "ring-2 ring-[var(--md-ink)] ring-offset-2 ring-offset-[var(--md-surface)]",
                        )}
                      >
                        <AnimatePresence initial={false}>
                          {selected ? (
                            <motion.span
                              initial={{ opacity: 0, scale: 0.6 }}
                              animate={{ opacity: 1, scale: 1 }}
                              exit={{ opacity: 0, scale: 0.6 }}
                              transition={{ type: "spring", stiffness: 520, damping: 30 }}
                            >
                              <Check className="size-4" strokeWidth={2.4} />
                            </motion.span>
                          ) : null}
                        </AnimatePresence>
                      </button>
                    )
                  })}
                </div>

                <ColourField label={t("Accent")} value={branding.accent} onChange={(value) => updateBranding(card.id, { accent: value })} />

                <div
                  className={cn(
                    "flex items-start gap-2.5 rounded-[var(--md-radius-md)] p-3 text-[12.5px] leading-5",
                    accentSafe ? "bg-[var(--md-surface-tint)] text-[var(--md-text)]" : "bg-[rgba(221,138,43,0.1)] text-[var(--md-text)]",
                  )}
                >
                  {accentSafe ? (
                    <Info className="mt-0.5 size-4 shrink-0 text-[var(--md-subtle)]" strokeWidth={1.5} />
                  ) : (
                    <TriangleAlert className="mt-0.5 size-4 shrink-0 text-[var(--md-amber)]" strokeWidth={1.5} />
                  )}
                  <p>
                    {accentSafe
                      ? t("Buttons will use this colour, with the more readable of light or dark text.")
                      : t("This colour is too close to the page behind it, so buttons would lose their edge. They will use a readable fallback instead.")}{" "}
                    <span className="text-[var(--md-subtle)] tabular-nums">
                      {t("Text contrast")} {contrast.toFixed(1)}:1
                    </span>
                  </p>
                </div>
              </div>
            </ControlRow>

            <ControlRow label={t("Theme")}>
              <SegmentedControl
                options={["light", "dark", "tinted"] as const satisfies readonly CardTheme[]}
                value={branding.theme}
                onChange={(theme) => updateBranding(card.id, { theme })}
                ariaLabel={t("Theme")}
                renderOption={(option) => t(option === "light" ? "Light" : option === "dark" ? "Dark" : "Tinted")}
              />
            </ControlRow>

            <ControlRow label={t("Header")}>
              <SegmentedControl
                options={["none", "bar", "band", "cover"] as const satisfies readonly CardHeaderStyle[]}
                value={branding.headerStyle}
                onChange={(headerStyle) => updateBranding(card.id, { headerStyle })}
                ariaLabel={t("Header")}
                renderOption={(option) => t(option === "none" ? "None" : option === "bar" ? "Bar" : option === "band" ? "Band" : "Cover")}
              />
            </ControlRow>

            <ControlRow label={t("Layout preset")} hint={t("Choose the arrangement first, then tune the colours and code.")} stacked>
              <ContactCardLayoutPicker value={branding.layout} onChange={(layout) => updateBranding(card.id, { layout })} />
            </ControlRow>

            <ControlRow label={t("Corners")}>
              <SegmentedControl
                options={["soft", "sharp"] as const}
                value={branding.cornerStyle}
                onChange={(cornerStyle) => updateBranding(card.id, { cornerStyle })}
                ariaLabel={t("Corners")}
                renderOption={(option) => t(option === "soft" ? "Soft" : "Sharp")}
              />
            </ControlRow>
          </div>
        </Surface>

        <Surface padding="md" className="p-5">
          <SectionHeader title={t("Code style")} meta={t("Changes apply to the on-screen code and to both downloads.")} />

          <div className="mt-4 grid gap-6 sm:grid-cols-[minmax(0,1fr)_180px] sm:items-start">
            <div className="divide-y divide-[rgba(11,20,19,0.06)]">
              <ControlRow label={t("Modules")} stacked>
                <SegmentedControl
                  options={["square", "rounded", "dots"] as const satisfies readonly QrModuleStyle[]}
                  value={branding.qrModuleStyle}
                  onChange={(qrModuleStyle) => updateBranding(card.id, { qrModuleStyle })}
                  ariaLabel={t("Module style")}
                  renderOption={(option) => t(option === "square" ? "Square" : option === "rounded" ? "Rounded" : "Dots")}
                />
              </ControlRow>

              <ControlRow label={t("Corner eyes")} stacked>
                <SegmentedControl
                  options={["square", "rounded", "circle"] as const satisfies readonly QrEyeStyle[]}
                  value={branding.qrEyeStyle}
                  onChange={(qrEyeStyle) => updateBranding(card.id, { qrEyeStyle })}
                  ariaLabel={t("Eye style")}
                  renderOption={(option) => t(option === "square" ? "Square" : option === "rounded" ? "Rounded" : "Circle")}
                />
              </ControlRow>

              <ControlRow label={t("Colours")} hint={t("Keep the code dark on light. Inverting it stops many scanners working.")} stacked>
                <div className="flex flex-wrap gap-2">
                  <ColourField label={t("Code colour")} value={branding.qrDark} onChange={(value) => updateBranding(card.id, { qrDark: value })} />
                  <ColourField label={t("Code background")} value={branding.qrLight} onChange={(value) => updateBranding(card.id, { qrLight: value })} />
                </div>
              </ControlRow>
            </div>

            <div className="grid gap-3">
              <div className="rounded-[var(--md-radius-xl)] p-3 shadow-[var(--md-shadow-line)]" style={{ backgroundColor: branding.qrLight }}>
                <QrCodeImage value={url} branding={branding} label={t("Code preview")} />
              </div>
              <Button
                variant="outline"
                className="h-9 rounded-[var(--md-radius-md)] text-[13px]"
                onClick={() => window.open(url, "_blank", "noopener,noreferrer")}
              >
                <QrCode data-icon="inline-start" strokeWidth={1.5} />
                {t("Test QR code")}
              </Button>
            </div>
          </div>
        </Surface>
      </div>

      {/* Sticky so the preview stays beside the control being changed. */}
      <div className="xl:sticky xl:top-[var(--md-page-stack-gap)]">
        <Surface padding="md" className="p-5">
          <CardPreview card={card} />
        </Surface>
      </div>
    </div>
  )
}
