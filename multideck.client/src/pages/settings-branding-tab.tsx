import { useEffect, useMemo, useRef, useState } from "react"
import { CheckCircle2, CircleAlert, IdCard, ImageUp, LoaderCircle, Mail, RefreshCw, Sparkles, Trash2 } from "@/components/icons/hugeicons"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DotGridLoader } from "@/components/multideck/dot-grid-loader"
import {
  SettingsChoiceGroup,
  SettingsFieldRow,
  SettingsInput,
  SettingsPageHeader,
  SettingsPanel,
  SettingsTextarea,
} from "@/components/multideck/settings-components"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"
import { contrastRatio, parseHex, readableInk } from "@/lib/color"
import { getSupabaseSession } from "@/lib/supabase"
import {
  DEFAULT_TENANT_BRAND,
  getTenantBranding,
  importTenantBranding,
  saveTenantBranding,
  type TenantBrandImport,
  type TenantBranding,
} from "@/lib/tenant-branding-api"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

const MAX_LOGO_BYTES = 2 * 1024 * 1024
const SUPPORTED_LOGO_TYPES = new Set(["image/svg+xml", "image/png", "image/jpeg"])
const APPEARANCE_PALETTES = {
  light: { backgroundColor: "#F3F4F4", surfaceColor: "#FFFFFF", textColor: "#292929" },
  dark: { backgroundColor: "#0C1413", surfaceColor: "#161F1E", textColor: "#F1F5F4" },
} as const

function isHex(value: string) {
  return /^#[0-9A-F]{6}$/i.test(value.trim())
}

function isDefaultVisualBrand(brand: TenantBranding, hasLogo: boolean) {
  return !hasLogo
    && brand.primaryColor.toUpperCase() === DEFAULT_TENANT_BRAND.primaryColor
    && brand.secondaryColor.toUpperCase() === DEFAULT_TENANT_BRAND.secondaryColor
    && brand.backgroundColor.toUpperCase() === DEFAULT_TENANT_BRAND.backgroundColor
    && brand.surfaceColor.toUpperCase() === DEFAULT_TENANT_BRAND.surfaceColor
    && brand.textColor.toUpperCase() === DEFAULT_TENANT_BRAND.textColor
    && brand.appearanceMode === DEFAULT_TENANT_BRAND.appearanceMode
    && brand.cornerStyle === DEFAULT_TENANT_BRAND.cornerStyle
    && brand.emailSignOff === DEFAULT_TENANT_BRAND.emailSignOff
}

function BrandSwatch({ id, label, value, disabled, onChange }: {
  id: string
  label: string
  value: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  const { t } = useLanguage()
  const safeValue = isHex(value) ? value : "#000000"
  return (
    <div className="grid min-w-0 gap-2">
      <span
        className="relative block h-16 overflow-hidden rounded-[var(--md-radius-lg)] shadow-[var(--md-shadow-line)] transition-transform duration-200 focus-within:ring-[3px] focus-within:ring-[var(--md-accent-a14)] hover:scale-[1.02] motion-reduce:transition-none motion-reduce:hover:scale-100"
        style={{ backgroundColor: safeValue }}
      >
        <input
          id={`${id}-picker`}
          type="color"
          value={safeValue}
          disabled={disabled}
          aria-label={`${t(label)} · ${t("Choose colour")}`}
          className="absolute inset-0 size-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
      </span>
      <span className="grid gap-1.5">
        <label htmlFor={id} className="truncate text-[11px] font-medium text-[var(--md-text)]">{t(label)}</label>
        <SettingsInput
          id={id}
          value={value}
          disabled={disabled}
          maxLength={7}
          dir="ltr"
          spellCheck={false}
          aria-invalid={!isHex(value) || undefined}
          className="h-9 min-w-0 px-2.5 font-sans uppercase"
          onChange={(event) => onChange(event.target.value.toUpperCase())}
        />
      </span>
    </div>
  )
}

function useLogoPreview(file: File | null, importedLogoUrl: string | null, savedLogoUrl: string | null) {
  const [fileUrl, setFileUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!file) { setFileUrl(null); return }
    const next = URL.createObjectURL(file)
    setFileUrl(next)
    return () => URL.revokeObjectURL(next)
  }, [file])
  return fileUrl || importedLogoUrl || savedLogoUrl
}

function ContactBrandPreview({ brand, logoUrl }: { brand: TenantBranding; logoUrl: string | null }) {
  const radius = brand.cornerStyle === "rounded" ? 18 : 3
  return (
    <div data-testid="contact-brand-preview" className="h-full overflow-hidden shadow-[var(--md-shadow-line)]" style={{ borderRadius: radius, backgroundColor: brand.backgroundColor, color: brand.textColor }}>
      <div className="h-2" style={{ backgroundColor: brand.primaryColor }} />
      <div className="p-5">
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="" className="max-h-12 max-w-[140px] shrink-0 object-contain" />
          ) : (
            <span className="grid size-12 shrink-0 place-items-center overflow-hidden bg-white shadow-[var(--md-shadow-line)]" style={{ borderRadius: brand.cornerStyle === "rounded" ? 12 : 2 }}>
              <span className="text-[14px] font-medium" style={{ color: brand.primaryColor }}>{brand.displayName.slice(0, 2).toUpperCase()}</span>
            </span>
          )}
          <span className="min-w-0">
            <span className="block truncate text-[16px] font-medium">Alex Morgan</span>
            <span className="mt-0.5 block truncate text-[12px] opacity-70">{brand.displayName || "Your company"}</span>
          </span>
        </div>
        <div className="mt-6" style={{ borderRadius: brand.cornerStyle === "rounded" ? 14 : 2, backgroundColor: brand.surfaceColor, padding: 16 }}>
          <p className="text-[15px] font-medium">Let&apos;s stay in touch</p>
          <p className="mt-1 text-[12px] leading-5 opacity-70">Share your details and the team will follow up.</p>
          <span className="mt-4 block h-10 px-3 py-2.5 text-center text-[12px] font-medium" style={{ borderRadius: brand.cornerStyle === "rounded" ? 10 : 2, backgroundColor: brand.primaryColor, color: readableInk(brand.primaryColor) }}>
            Share my details
          </span>
        </div>
      </div>
    </div>
  )
}

function EmailBrandPreview({ brand, logoUrl }: { brand: TenantBranding; logoUrl: string | null }) {
  const radius = brand.cornerStyle === "rounded" ? 18 : 3
  return (
    <div data-testid="email-brand-preview" className="h-full p-5 shadow-[var(--md-shadow-line)]" style={{ borderRadius: radius, backgroundColor: brand.backgroundColor, color: brand.textColor }}>
      <div className="mb-4 flex min-h-12 items-center justify-center">
        {logoUrl ? <img src={logoUrl} alt="" className="max-h-12 max-w-[190px] object-contain" /> : <span className="text-[16px] font-medium">{brand.displayName || "Your company"}</span>}
      </div>
      <div style={{ borderRadius: radius, backgroundColor: brand.surfaceColor, padding: 22 }}>
        <p className="text-[11px] font-medium" style={{ color: brand.primaryColor }}>SHIPMENT UPDATE</p>
        <p className="mt-2 text-[19px] font-medium">Your booking has been updated</p>
        <p className="mt-3 text-[12px] leading-5 opacity-70">The latest milestone is ready to review in your workspace.</p>
        <span className="mt-5 inline-block px-4 py-2.5 text-[12px] font-medium" style={{ borderRadius: brand.cornerStyle === "rounded" ? 10 : 2, backgroundColor: brand.primaryColor, color: readableInk(brand.primaryColor) }}>Review update</span>
        {brand.emailSignOff ? <p className="mt-5 border-t pt-4 text-[11px] leading-4 opacity-60">{brand.emailSignOff}</p> : null}
      </div>
    </div>
  )
}

export function AdminBrandingContent({ currentUser }: { currentUser?: AuthUserSummary | null }) {
  const { t } = useLanguage()
  const canManage = hasPermission(currentUser, "Settings.Manage")
  const logoInputRef = useRef<HTMLInputElement>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
  const importPanelRef = useRef<HTMLDivElement>(null)
  const [saved, setSaved] = useState<TenantBranding | null>(null)
  const [draft, setDraft] = useState<TenantBranding | null>(null)
  const [logoFile, setLogoFile] = useState<File | null>(null)
  const [importedLogoUrl, setImportedLogoUrl] = useState<string | null>(null)
  const [removeLogo, setRemoveLogo] = useState(false)
  const [websiteImport, setWebsiteImport] = useState<TenantBrandImport["evidence"] | null>(null)
  const [importUrl, setImportUrl] = useState("")
  const [importExpanded, setImportExpanded] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    void getSupabaseSession().then((session) => {
      if (!session) throw new Error(t("Sign in again to load workspace branding."))
      return getTenantBranding(session.access_token)
    }).then((branding) => {
      if (!active) return
      setSaved(branding)
      setDraft(branding)
      setImportUrl(branding.websiteUrl)
    }).catch((loadError) => {
      if (active) setError(loadError instanceof Error ? loadError.message : t("Brand settings could not be loaded."))
    }).finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [t])

  useEffect(() => {
    if (!importExpanded) return
    const frame = window.requestAnimationFrame(() => importInputRef.current?.focus())
    return () => window.cancelAnimationFrame(frame)
  }, [importExpanded])

  const logoPreview = useLogoPreview(logoFile, importedLogoUrl, removeLogo ? null : saved?.logoUrl ?? null)
  const atDefault = Boolean(draft && isDefaultVisualBrand(draft, Boolean(logoFile || importedLogoUrl || (!removeLogo && saved?.logoUrl))))
  const validationError = useMemo(() => {
    if (!draft) return t("Brand settings are still loading.")
    if (!draft.displayName.trim()) return t("Add the company name customers should see.")
    const colours = [draft.primaryColor, draft.secondaryColor, draft.backgroundColor, draft.surfaceColor, draft.textColor]
    if (colours.some((colour) => !isHex(colour))) return t("Use six-digit hex values for every colour.")
    const text = parseHex(draft.textColor)
    const surface = parseHex(draft.surfaceColor)
    const background = parseHex(draft.backgroundColor)
    if (text && surface && contrastRatio(text, surface) < 4.5) return t("Choose text and surface colours with enough contrast to read.")
    if (text && background && contrastRatio(text, background) < 4.5) return t("Choose text and background colours with enough contrast to read.")
    if (draft.websiteUrl) {
      try {
        const url = new URL(draft.websiteUrl)
        if (url.protocol !== "https:" && url.protocol !== "http:") return t("Enter a valid company website.")
      } catch { return t("Enter a valid company website.") }
    }
    return null
  }, [draft, t])

  function update(patch: Partial<TenantBranding>) {
    setDraft((current) => current ? { ...current, ...patch } : current)
    setError(null)
  }

  function toggleWebsiteImport() {
    if (!canManage || importing) return
    if (importExpanded && importPanelRef.current?.contains(document.activeElement)) {
      document.getElementById("brand-import-trigger")?.focus()
    }
    setImportExpanded((current) => !current)
  }

  function resetToDefault() {
    if (!canManage || !draft) return
    setDraft((current) => current ? { ...current, ...DEFAULT_TENANT_BRAND } : current)
    setLogoFile(null)
    setImportedLogoUrl(null)
    setRemoveLogo(true)
    setWebsiteImport(null)
    setError(null)
    toast.success(t("Brand draft reset"), { description: t("Review the Multideck default look before saving it.") })
  }

  function chooseLogo(file: File | null) {
    if (!file) return
    if (!SUPPORTED_LOGO_TYPES.has(file.type)) {
      setError(t("Choose an SVG, PNG or JPEG logo."))
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      setError(t("Choose a logo smaller than 2 MB."))
      return
    }
    setLogoFile(file)
    setImportedLogoUrl(null)
    setRemoveLogo(false)
    setError(null)
  }

  async function importWebsite() {
    if (!canManage || importing || !importUrl.trim()) return
    setImporting(true)
    setError(null)
    try {
      const session = await getSupabaseSession()
      if (!session) throw new Error(t("Sign in again before importing a website."))
      const result = await importTenantBranding(session.access_token, importUrl.trim())
      setDraft((current) => current ? { ...current, ...result.draft } : current)
      setImportedLogoUrl(result.draft.importedLogoUrl)
      setLogoFile(null)
      setRemoveLogo(false)
      setWebsiteImport(result.evidence)
      setImportUrl(result.evidence.sourceUrl)
      toast.success(t("Brand draft imported"), { description: t("Review every suggestion before saving it.") })
    } catch (importError) {
      setError(importError instanceof Error ? importError.message : t("Luna could not import that website."))
    } finally { setImporting(false) }
  }

  async function save() {
    if (!draft || !canManage || saving || validationError) return
    setSaving(true)
    setError(null)
    try {
      const session = await getSupabaseSession()
      if (!session) throw new Error(t("Sign in again before saving workspace branding."))
      const next = await saveTenantBranding(session.access_token, {
        displayName: draft.displayName,
        websiteUrl: draft.websiteUrl,
        primaryColor: draft.primaryColor,
        secondaryColor: draft.secondaryColor,
        backgroundColor: draft.backgroundColor,
        surfaceColor: draft.surfaceColor,
        textColor: draft.textColor,
        appearanceMode: draft.appearanceMode,
        cornerStyle: draft.cornerStyle,
        emailSignOff: draft.emailSignOff,
        removeLogo,
        importedLogoUrl,
        importedFrom: websiteImport ? { url: websiteImport.sourceUrl, importedAt: websiteImport.importedAt, model: websiteImport.model } : saved?.importedFrom,
      }, logoFile)
      setSaved(next)
      setDraft(next)
      setLogoFile(null)
      setImportedLogoUrl(null)
      setRemoveLogo(false)
      setWebsiteImport(null)
      toast.success(t("Branding saved"), { description: t("New tenant-branded contact cards and operational emails now use this identity.") })
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("Brand settings could not be saved."))
    } finally { setSaving(false) }
  }

  const saveAction = canManage ? (
    <div className="flex flex-wrap items-center gap-2">
      <Button type="button" variant="outline" disabled={saving || loading || atDefault} onClick={resetToDefault}>
        <RefreshCw className="size-4" aria-hidden="true" />
        {t("Reset to default")}
      </Button>
      <Button type="button" disabled={saving || loading || Boolean(validationError)} onClick={() => void save()}>
        {saving ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <CheckCircle2 className="size-4" aria-hidden="true" />}
        {t(saving ? "Saving branding…" : "Save branding")}
      </Button>
    </div>
  ) : undefined

  if (loading || !draft) {
    return (
      <>
        <SettingsPageHeader title={t("Branding")} actions={saveAction} />
        <div className="mt-[var(--md-page-stack-gap)] grid min-h-[320px] place-items-center rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] shadow-[var(--md-shadow-soft)]">
          {error ? <p className="max-w-md px-6 text-center text-[13px] text-[var(--md-red)]" role="alert">{error}</p> : <DotGridLoader label="Loading brand settings…" />}
        </div>
      </>
    )
  }

  const sampleRadius = draft.cornerStyle === "rounded" ? 10 : 2

  function setAppearanceMode(appearanceMode: TenantBranding["appearanceMode"]) {
    update({ appearanceMode, ...APPEARANCE_PALETTES[appearanceMode] })
  }

  return (
    <>
      <SettingsPageHeader
        title={t("Branding")}
        actions={saveAction}
      />
      {!canManage ? (
        <div className="mt-4 flex items-start gap-2 rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] px-4 py-3 text-[12px] leading-5 text-[var(--md-text)] shadow-[var(--md-shadow-line)]" role="status">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-[var(--md-amber)]" aria-hidden="true" />
          {t("You can review this brand. A workspace administrator with Settings permission must change it.")}
        </div>
      ) : null}

      <section className="mt-[var(--md-page-stack-gap)] overflow-hidden rounded-[var(--md-radius-2xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-soft)]">
        <div className="relative overflow-hidden rounded-[var(--md-radius-xl)] px-6 py-12 transition-[background-color] duration-300 motion-reduce:transition-none" style={{ backgroundColor: draft.backgroundColor }}>
          <div className="mx-auto flex w-full max-w-lg flex-col items-center text-center">
            <button
              type="button"
              disabled={!canManage}
              onClick={() => logoInputRef.current?.click()}
              aria-label={t(logoPreview ? "Replace logo" : "Choose logo")}
              className={cn(
                "group relative grid h-20 shrink-0 place-items-center transition-transform duration-200 enabled:hover:scale-[1.03] enabled:active:scale-[0.97] motion-reduce:transition-none motion-reduce:enabled:hover:scale-100 disabled:cursor-not-allowed",
                logoPreview ? "w-full max-w-[240px] overflow-visible" : "w-20 overflow-hidden bg-white shadow-[var(--md-shadow-lift)]",
              )}
              style={{ borderRadius: logoPreview ? 0 : draft.cornerStyle === "rounded" ? 16 : 3 }}
            >
              {logoPreview
                ? <img src={logoPreview} alt={t("Company logo preview")} className="max-h-20 max-w-full object-contain" />
                : <span className="text-[20px] font-medium" style={{ color: draft.primaryColor }}>{(draft.displayName || "Your company").slice(0, 2).toUpperCase()}</span>}
              {canManage ? (
                <span className={cn(
                  "absolute grid place-items-center opacity-0 transition-opacity duration-200 group-hover:opacity-100 group-focus-visible:opacity-100 motion-reduce:transition-none",
                  logoPreview
                    ? "-bottom-2 -right-2 size-7 rounded-full bg-[var(--md-surface)] text-[var(--md-accent)] shadow-[var(--md-shadow-lift)]"
                    : "inset-0 bg-[rgba(11,20,19,0.42)] text-white",
                )} aria-hidden="true">
                  <ImageUp className={cn("size-4", logoPreview ? "text-[var(--md-accent)]" : "text-white")} />
                </span>
              ) : null}
            </button>
            <p className="mt-5 max-w-full truncate text-[26px] font-medium leading-tight tracking-[-0.02em]" style={{ color: draft.textColor }}>
              {draft.displayName || t("Your company")}
            </p>
            {draft.websiteUrl ? (
              <p className="mt-1 max-w-full truncate text-[13px]" style={{ color: draft.textColor, opacity: 0.66 }}>{draft.websiteUrl.replace(/^https?:\/\//, "")}</p>
            ) : null}
            <div className="mt-7 flex flex-wrap items-center justify-center gap-2.5">
              <span className="px-4 py-2 text-[12px] font-medium shadow-[var(--md-shadow-line)]" style={{ borderRadius: sampleRadius, backgroundColor: draft.primaryColor, color: readableInk(draft.primaryColor) }}>
                {t("Primary action")}
              </span>
              <span className="px-4 py-2 text-[12px] font-medium" style={{ borderRadius: sampleRadius, color: draft.secondaryColor, boxShadow: `inset 0 0 0 1px ${isHex(draft.secondaryColor) ? draft.secondaryColor : "#000000"}` }}>
                {t("Secondary")}
              </span>
            </div>
          </div>
        </div>

        <div className="grid gap-4 px-4 py-4 shadow-[var(--md-stroke-top)] lg:grid-cols-2">
          <div className="flex min-w-0 flex-col">
            <p className="flex items-center gap-2 text-[12px] font-medium text-[var(--md-ink)]">
              <IdCard className="size-4 text-[var(--md-accent)]" aria-hidden="true" />
              {t("Contact card preview")}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-[var(--md-text)]">{t("New cards inherit the workspace brand. A card with a deliberate custom style keeps its override.")}</p>
            <div className="mt-3 flex-1"><ContactBrandPreview brand={draft} logoUrl={logoPreview} /></div>
          </div>
          <div className="flex min-w-0 flex-col">
            <p className="flex items-center gap-2 text-[12px] font-medium text-[var(--md-ink)]">
              <Mail className="size-4 text-[var(--md-accent)]" aria-hidden="true" />
              {t("Email preview")}
            </p>
            <p className="mt-1 text-[11px] leading-4 text-[var(--md-text)]">{t("Operational notification only. Invitations and password emails do not use this template.")}</p>
            <div className="mt-3 flex-1"><EmailBrandPreview brand={draft} logoUrl={logoPreview} /></div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 px-4 pb-2 pt-4 sm:grid-cols-3 lg:grid-cols-5">
          <BrandSwatch id="brand-primary" label="Primary" value={draft.primaryColor} disabled={!canManage} onChange={(primaryColor) => update({ primaryColor })} />
          <BrandSwatch id="brand-secondary" label="Secondary" value={draft.secondaryColor} disabled={!canManage} onChange={(secondaryColor) => update({ secondaryColor })} />
          <BrandSwatch id="brand-background" label="Background" value={draft.backgroundColor} disabled={!canManage} onChange={(backgroundColor) => update({ backgroundColor })} />
          <BrandSwatch id="brand-surface" label="Surface" value={draft.surfaceColor} disabled={!canManage} onChange={(surfaceColor) => update({ surfaceColor })} />
          <BrandSwatch id="brand-text" label="Text" value={draft.textColor} disabled={!canManage} onChange={(textColor) => update({ textColor })} />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 pb-4 pt-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" disabled={!canManage} onClick={() => logoInputRef.current?.click()}>
                <ImageUp className="size-4" aria-hidden="true" />
                {t(logoPreview ? "Replace logo" : "Choose logo")}
              </Button>
              {logoPreview ? (
                <Button type="button" variant="ghost" disabled={!canManage} className="text-[var(--md-red)]" onClick={() => { setLogoFile(null); setImportedLogoUrl(null); setRemoveLogo(true) }}>
                  <Trash2 className="size-4" aria-hidden="true" />
                  {t("Remove")}
                </Button>
              ) : null}
              <DexterActionPill
                id="brand-import-trigger"
                icon={Sparkles}
                label={t("Import from website")}
                disabled={!canManage || importing}
                aria-expanded={importExpanded}
                aria-controls="brand-import-panel"
                className="h-9 min-w-[166px] rounded-[var(--md-radius-lg)] px-3 text-[12px]"
                onClick={toggleWebsiteImport}
              />
            </div>
            <p className="mt-2 text-[11px] leading-4 text-[var(--md-subtle)]">{t("SVG is preferred. PNG and JPEG are supported up to 2 MB.")}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-x-6 gap-y-3">
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-medium text-[var(--md-text)]">{t("Appearance")}</span>
              <SettingsChoiceGroup options={["Light", "Dark"]} value={draft.appearanceMode === "dark" ? "Dark" : "Light"} ariaLabel={t("Customer-facing appearance")} onChange={(value) => setAppearanceMode(value === "Dark" ? "dark" : "light")} />
            </div>
            <div className="flex items-center gap-3">
              <span className="text-[12px] font-medium text-[var(--md-text)]">{t("Corner style")}</span>
              <SettingsChoiceGroup options={["Rounded", "Sharp"]} value={draft.cornerStyle === "rounded" ? "Rounded" : "Sharp"} ariaLabel={t("Customer-facing corner style")} onChange={(value) => update({ cornerStyle: value === "Sharp" ? "sharp" : "rounded" })} />
            </div>
          </div>
        </div>

        <div
          className={cn(
            "grid px-4 transition-[grid-template-rows] motion-reduce:transition-none",
            importExpanded
              ? "grid-rows-[1fr] duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
              : "grid-rows-[0fr] duration-[160ms] ease-[cubic-bezier(0.4,0,1,1)]",
          )}
        >
          <div className="min-h-0 overflow-hidden">
            <div
              ref={importPanelRef}
              id="brand-import-panel"
              data-testid="brand-import-disclosure"
              data-state={importExpanded ? "open" : "closed"}
              aria-hidden={!importExpanded}
              className={cn(
                "mb-4 origin-top rounded-[22px] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-soft)] transition-[opacity,transform] motion-reduce:transition-none",
                importExpanded
                  ? "translate-y-0 opacity-100 duration-[220ms] ease-[cubic-bezier(0.16,1,0.3,1)]"
                  : "pointer-events-none -translate-y-1 opacity-0 duration-[140ms] ease-[cubic-bezier(0.4,0,1,1)]",
              )}
              onKeyDown={(event) => {
                if (event.key !== "Escape") return
                event.preventDefault()
                document.getElementById("brand-import-trigger")?.focus()
                setImportExpanded(false)
              }}
            >
              <div className="flex flex-col gap-1 sm:flex-row">
                <label htmlFor="brand-import-url" className="sr-only">{t("Company website")}</label>
                <SettingsInput
                  ref={importInputRef}
                  id="brand-import-url"
                  type="url"
                  value={importUrl}
                  disabled={!canManage || importing || !importExpanded}
                  tabIndex={importExpanded ? 0 : -1}
                  placeholder="https://yourcompany.com"
                  className="h-11 min-w-0 w-full shrink-0 rounded-[18px] bg-[var(--md-field-bg)] px-4 shadow-none sm:flex-1 sm:shrink"
                  onChange={(event) => setImportUrl(event.target.value)}
                />
                <Button
                  type="button"
                  disabled={!canManage || importing || !importExpanded || !importUrl.trim()}
                  tabIndex={importExpanded ? 0 : -1}
                  className="h-11 shrink-0 rounded-[18px] px-4 active:scale-[0.98] motion-reduce:active:scale-100"
                  onClick={() => void importWebsite()}
                >
                  {importing ? <LoaderCircle className="size-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> : <Sparkles className="size-4" aria-hidden="true" />}
                  {t(importing ? "Luna is reading…" : "Import with Luna")}
                </Button>
              </div>
              {websiteImport ? <p className="px-3 pb-2 pt-2 text-[11px] leading-4 text-[var(--md-text)]" role="status">{t("Draft only")} · {t(`${websiteImport.confidence} confidence`)}{websiteImport.note ? ` · ${websiteImport.note}` : ""}</p> : null}
            </div>
          </div>
        </div>
        <input ref={logoInputRef} type="file" accept=".svg,.png,.jpg,.jpeg,image/svg+xml,image/png,image/jpeg" className="sr-only" aria-label={t("Choose company logo")} onChange={(event) => { chooseLogo(event.target.files?.[0] ?? null); event.currentTarget.value = "" }} />
      </section>

      <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
        <SettingsPanel title={t("Identity")} description={t("The customer-facing company name and web address.")}>
          <SettingsFieldRow label={t("Display name")} labelFor="brand-display-name">
            <SettingsInput id="brand-display-name" value={draft.displayName} disabled={!canManage} maxLength={240} onChange={(event) => update({ displayName: event.target.value })} />
          </SettingsFieldRow>
          <SettingsFieldRow label={t("Website")} labelFor="brand-website-url">
            <SettingsInput id="brand-website-url" type="url" value={draft.websiteUrl} disabled={!canManage} placeholder="https://yourcompany.com" onChange={(event) => update({ websiteUrl: event.target.value })} />
          </SettingsFieldRow>
        </SettingsPanel>

        <SettingsPanel title={t("Operational emails")} description={t("Used for booking, shipment and workspace update notifications. Auth and security emails stay Multideck-branded.")}>
          <SettingsFieldRow label={t("Email sign-off")} description={t("One short factual line beneath operational updates.")} align="start" labelFor="brand-email-signoff">
            <SettingsTextarea id="brand-email-signoff" value={draft.emailSignOff} disabled={!canManage} maxLength={500} placeholder={t("Your company · Freight handled with care")} onChange={(event) => update({ emailSignOff: event.target.value })} />
          </SettingsFieldRow>
        </SettingsPanel>

        {error || validationError ? (
          <div aria-live="polite" className="min-h-5 text-[12px] leading-5 text-[var(--md-red)]">
            {error || validationError}
          </div>
        ) : null}
      </div>
    </>
  )
}
