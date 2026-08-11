import { useMemo, type CSSProperties, type ReactNode, type RefObject } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { ArrowUpRight, Check, Eye, Globe, LoaderCircle, Mail, Phone, TriangleAlert, UserRoundPlus } from "@/components/icons/hugeicons"
import { CopyableField } from "@/components/multideck/copyable-field"
import { ContactSocialMark } from "@/components/multideck/contact-social-mark"
import { useLanguage } from "@/i18n/language-provider"
import { mdEaseIn, mdEaseOut } from "@/lib/motion"
import { cardThemeVariables, resolveCardTheme } from "@/lib/card-theme"
import { markCoverOffset, resolveCardLayout, type CardLayoutSpec, type CardMarkShape } from "@/lib/card-layout"
import { readableInk } from "@/lib/color"
import { CARD_SOCIAL_LABELS, type CardSocialKind, type ContactCard } from "@/data/contact-card-data"
import { cn } from "@/lib/utils"

export type PublicFormValues = {
  firstName: string
  lastName: string
  email: string
  company: string
  phone: string
  marketingConsent: boolean
}

export const EMPTY_PUBLIC_FORM: PublicFormValues = {
  firstName: "",
  lastName: "",
  email: "",
  company: "",
  phone: "",
  marketingConsent: false,
}

export type PublicFormErrors = Partial<Record<keyof PublicFormValues, string>>

/* -------------------------------------------------------------------------- */
/* Shell                                                                       */
/* -------------------------------------------------------------------------- */

export function PublicCardShell({
  card,
  preview,
  scale = 1,
  className,
  children,
}: {
  card: ContactCard | null
  preview: boolean
  /** Shrinks type and spacing proportionally inside the design preview frame. */
  scale?: number
  className?: string
  children: ReactNode
}) {
  const { t } = useLanguage()
  const theme = useMemo(() => resolveCardTheme(card?.branding ?? { accent: "#1f6f68", theme: "light", headerStyle: "bar", layout: "classic", cornerStyle: "soft", logoDataUrl: null, logoInQr: false, qrModuleStyle: "rounded", qrEyeStyle: "rounded", qrDark: "#0b1413", qrLight: "#ffffff" }), [card?.branding])

  const style = { ...cardThemeVariables(theme), fontSize: `${scale}rem` } as CSSProperties
  const spec = resolveCardLayout(card?.branding.layout)

  return (
    <div
      dir="auto"
      style={style}
      className={cn("min-h-full w-full bg-[var(--card-page-bg)] text-[var(--card-ink)]", className)}
    >
      {preview ? (
        <div className="sticky top-0 z-20 flex items-center justify-center gap-2 bg-[var(--card-ink)] px-4 py-2 text-center text-[12.5px] font-medium text-[var(--card-page-bg)]">
          <Eye className="size-3.5 shrink-0" strokeWidth={1.6} />
          {t("Preview only. Nothing is recorded and no lead is created")}
        </div>
      ) : null}

      <CardHeader card={card} spec={spec} />

      <main
        className={cn("mx-auto w-full", spec.centred && "text-center")}
        style={{
          maxWidth: spec.maxWidth,
          paddingInline: spec.padX,
          paddingTop: spec.padTop,
          paddingBottom: spec.padBottom,
        }}
      >
        {children}
      </main>
    </div>
  )
}

function CardHeader({ card, spec }: { card: ContactCard | null; spec: CardLayoutSpec }) {
  if (!card) return null
  const { headerStyle, accent, logoDataUrl } = card.branding

  if (headerStyle === "none") return null

  if (headerStyle === "bar") {
    return <div aria-hidden="true" className="h-1.5 w-full" style={{ backgroundColor: accent }} />
  }

  if (headerStyle === "band") {
    return (
      <div className="w-full py-5" style={{ backgroundColor: accent, color: readableInk(accent), paddingInline: spec.padX }}>
        <div className={cn("mx-auto flex items-center gap-3", spec.centred && "justify-center")} style={{ maxWidth: spec.maxWidth - spec.padX * 2 }}>
          {logoDataUrl ? (
            <img src={logoDataUrl} alt="" className="h-7 max-w-[132px] object-contain" />
          ) : (
            <span className="text-[14px] font-medium tracking-[0.01em]">{card.person.company}</span>
          )}
        </div>
      </div>
    )
  }

  // Cover: a gradient field the content sits below. It grows with the mark, so a
  // hero portrait has something to overlap and a compact tile does not float.
  return (
    <div
      aria-hidden="true"
      className="w-full"
      style={{
        height: Math.round(spec.mark.size * 1.25) + 40,
        background: `linear-gradient(160deg, ${accent} 0%, color-mix(in srgb, ${accent}, #000 26%) 100%)`,
      }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The person, as one mark.
 *
 * Photo if there is one, then the company logo, then initials on the accent.
 * Size, corner and halo come from the layout preset — the same mark reads as a
 * hero portrait in Spotlight and as a dense tile in Compact.
 */
function IdentityMark({
  card,
  size = 48,
  shape = "circle",
  halo = false,
  lift = false,
}: {
  card: ContactCard
  size?: number
  shape?: CardMarkShape
  halo?: boolean
  /** True only where the mark sits directly under the header and may overlap it. */
  lift?: boolean
}) {
  const initials = card.person.fullName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")

  const photo = card.person.profileImageDataUrl
  const logo = !photo ? card.branding.logoDataUrl : null
  const artwork = Boolean(photo || logo)
  const cover = lift && card.branding.headerStyle === "cover"

  // Artwork needs a hairline so a white photo edge does not bleed into the page;
  // the halo replaces it with a soft accent ring instead of stacking both.
  const boxShadow = halo
    ? "0 0 0 5px var(--card-accent-soft), var(--card-shadow)"
    : artwork
      ? "inset 0 0 0 1px var(--card-hairline), var(--card-shadow)"
      : undefined

  return (
    <span
      aria-hidden="true"
      className="grid shrink-0 place-items-center overflow-hidden font-medium"
      style={{
        width: size,
        height: size,
        marginTop: cover ? markCoverOffset(size) : undefined,
        borderRadius: shape === "circle" ? "9999px" : `calc(var(--card-radius-field) + ${Math.round(size / 12)}px)`,
        backgroundColor: artwork ? "var(--card-surface)" : card.branding.accent,
        color: artwork ? undefined : readableInk(card.branding.accent),
        fontSize: Math.round(size * 0.34),
        letterSpacing: "0.01em",
        boxShadow,
      }}
    >
      {photo ? (
        <img src={photo} alt="" className="size-full object-cover" />
      ) : logo ? (
        <img src={logo} alt="" className="size-full object-contain" style={{ padding: Math.round(size * 0.16) }} />
      ) : (
        initials
      )}
    </span>
  )
}

function socialHref(kind: CardSocialKind, value: string) {
  const clean = value.trim()
  if (kind === "email") return `mailto:${clean}`
  if (kind === "whatsapp") return `https://wa.me/${clean.replace(/[^0-9+]/g, "").replace(/^\+/, "")}`
  if (/^https?:\/\//i.test(clean)) return clean
  if (kind === "linkedin") return `https://linkedin.com/in/${clean.replace(/^@/, "")}`
  if (kind === "facebook") return `https://facebook.com/${clean.replace(/^@/, "")}`
  if (kind === "instagram") return `https://instagram.com/${clean.replace(/^@/, "")}`
  return `https://${clean}`
}

/**
 * Social links, drawn the way the preset asks for.
 *
 * Pills and icons are the same round buttons at two sizes; Editorial lists them
 * as labelled rows with the handle beside each one, which suits a page whose
 * whole hierarchy is set in type rather than in tiles.
 */
export function ContactCardSocialLinks({
  card,
  interactive = true,
  className,
  style: styleOverride,
}: {
  card: ContactCard
  interactive?: boolean
  className?: string
  style?: CSSProperties
}) {
  const links = card.person.socialLinks.filter((link) => link.enabled && link.value.trim())
  if (links.length === 0) return null

  const spec = resolveCardLayout(card.branding.layout)

  function linkProps(link: (typeof links)[number]) {
    return {
      href: socialHref(link.kind, link.value),
      target: link.kind === "email" ? undefined : "_blank",
      rel: link.kind === "email" ? undefined : "noreferrer noopener",
      tabIndex: interactive ? undefined : -1,
    }
  }

  if (spec.social.style === "rows") {
    return (
      <ul
        className={cn("grid border-y border-[var(--card-hairline)] divide-y divide-[var(--card-hairline)]", className)}
        style={styleOverride}
        aria-label="Social links"
      >
        {links.map((link) => (
          <li key={link.id}>
            <a
              {...linkProps(link)}
              className="group/social flex items-center gap-3 py-3 text-start transition-colors duration-[160ms] hover:text-[var(--card-accent)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--card-focus-ring)] motion-reduce:transition-none"
            >
              <span
                aria-hidden="true"
                className="grid shrink-0 place-items-center rounded-[var(--card-radius-field)] bg-[var(--card-accent-soft)] text-[var(--card-accent)]"
                style={{ width: spec.social.size, height: spec.social.size }}
              >
                <ContactSocialMark kind={link.kind} className="size-4" />
              </span>
              <span className="shrink-0 text-[14.5px] font-medium text-[var(--card-ink)] transition-colors duration-[160ms] group-hover/social:text-[var(--card-accent)] motion-reduce:transition-none">
                {CARD_SOCIAL_LABELS[link.kind]}
              </span>
              <span className="min-w-0 flex-1 truncate text-end text-[13px] text-[var(--card-subtle)]" dir="ltr" data-i18n-skip>
                {link.value}
              </span>
              <ArrowUpRight
                aria-hidden="true"
                className="size-3.5 shrink-0 text-[var(--card-subtle)] transition-transform duration-[160ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover/social:-translate-y-px group-hover/social:translate-x-px motion-reduce:transition-none"
                strokeWidth={1.8}
              />
            </a>
          </li>
        ))}
      </ul>
    )
  }

  return (
    <div
      className={cn("flex flex-wrap", spec.centred && "justify-center", className)}
      style={{ gap: spec.social.style === "icons" ? 6 : 8, ...styleOverride }}
      aria-label="Social links"
    >
      {links.map((link) => {
        const label = CARD_SOCIAL_LABELS[link.kind]
        return (
          <a
            key={link.id}
            {...linkProps(link)}
            aria-label={label}
            title={label}
            className="grid place-items-center rounded-full bg-[var(--card-surface)] text-[var(--card-ink)] shadow-[inset_0_0_0_1px_var(--card-hairline)] transition-[transform,background-color,color] duration-[160ms] hover:bg-[var(--card-accent-soft)] hover:text-[var(--card-accent)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--card-focus-ring)] motion-reduce:transition-none motion-reduce:active:scale-100"
            style={{ width: spec.social.size, height: spec.social.size }}
          >
            <ContactSocialMark kind={link.kind} className={spec.social.style === "icons" ? "size-4" : "size-[18px]"} />
          </a>
        )
      })}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Field                                                                       */
/* -------------------------------------------------------------------------- */

/**
 * The public form's own input.
 *
 * 16px is the load-bearing number: anything smaller makes iOS Safari zoom on
 * focus and throw the layout away mid-form. The 52px target and the autocomplete
 * hints matter as much — platform autofill is what turns this from a 40-second
 * form into a 10-second one.
 */
function PublicField({
  id,
  label,
  optional,
  error,
  value,
  onChange,
  spec,
  interactive = true,
  ...props
}: {
  id: string
  label: string
  optional?: boolean
  error?: string
  value: string
  onChange: (value: string) => void
  spec: CardLayoutSpec
  interactive?: boolean
} & Omit<React.ComponentProps<"input">, "id" | "value" | "onChange">) {
  const { t } = useLanguage()
  const errorId = `${id}-error`
  const underline = spec.field.variant === "underline"

  return (
    <div className="text-start">
      <label htmlFor={id} className="flex items-baseline gap-2">
        <span
          className={cn(
            "font-medium text-[var(--card-ink)]",
            spec.field.labelCaps ? "text-[11px] uppercase tracking-[0.09em] text-[var(--card-subtle)]" : "text-[13.5px]",
          )}
        >
          {label}
        </span>
        {optional ? (
          <span className={cn("font-normal text-[var(--card-subtle)]", spec.field.labelCaps ? "text-[10.5px] uppercase tracking-[0.09em]" : "text-[12.5px]")}>
            {t("Optional")}
          </span>
        ) : null}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        tabIndex={interactive ? undefined : -1}
        style={{ height: spec.field.height }}
        className={cn(
          // 16px is load-bearing: anything smaller and iOS Safari zooms on focus.
          "mt-1.5 block w-full text-[16px] text-[var(--card-ink)] outline-none",
          "transition-[box-shadow,background-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          "placeholder:text-[var(--card-subtle)] disabled:cursor-not-allowed",
          underline
            ? [
                "rounded-none border-0 bg-transparent px-0",
                "shadow-[inset_0_-1px_0_0_var(--card-hairline)]",
                // Focus fills the well: a ring drawn around a bare underline reads as
                // a stray rectangle, so the field gains a surface to be ringed.
                "focus-visible:bg-[var(--card-surface)] focus-visible:shadow-[inset_0_-2px_0_0_var(--card-accent),0_0_0_3px_var(--card-focus-ring)]",
                error && "shadow-[inset_0_-2px_0_0_var(--card-error-ink)]",
              ]
            : [
                "rounded-[var(--card-radius-field)] px-3.5",
                // A white field on a white panel has no edge to speak of, so a form
                // that sits on a surface drops its fields a shade.
                spec.formOnSurface ? "bg-[var(--card-surface-muted)]" : "bg-[var(--card-field-bg)]",
                "shadow-[inset_0_0_0_1px_var(--card-hairline)]",
                "focus-visible:shadow-[inset_0_0_0_1px_var(--card-accent),0_0_0_3px_var(--card-focus-ring)]",
                error && "shadow-[inset_0_0_0_1px_var(--card-error-ink)]",
              ],
        )}
        {...props}
      />
      {error ? (
        <p id={errorId} className="mt-1.5 flex items-start gap-1.5 text-[13px] leading-5 text-[var(--card-error-ink)]">
          <TriangleAlert className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.6} />
          {error}
        </p>
      ) : null}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Headline                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * The heading block, at the preset's scale.
 *
 * Editorial opens with an accent rule and a tracked-out company line, so the
 * page reads as a printed spread; the others start straight on the sentence.
 */
function CardHeadline({
  spec,
  eyebrow,
  title,
  body,
  titleRef,
}: {
  spec: CardLayoutSpec
  eyebrow?: string
  title: string
  body: string
  titleRef?: RefObject<HTMLHeadingElement | null>
}) {
  return (
    <div className="min-w-0">
      {spec.rule ? (
        <span aria-hidden="true" className={cn("mb-4 block h-[3px] w-10 rounded-full bg-[var(--card-accent)]", spec.centred && "mx-auto")} />
      ) : null}
      {spec.eyebrow && eyebrow ? (
        <p className="mb-2.5 text-[11.5px] font-medium uppercase tracking-[0.14em] text-[var(--card-subtle)]" dir="auto" data-i18n-skip>
          {eyebrow}
        </p>
      ) : null}
      <h1
        ref={titleRef}
        tabIndex={titleRef ? -1 : undefined}
        className="font-medium text-[var(--card-ink)] outline-none"
        style={{
          fontSize: spec.heading.size,
          lineHeight: spec.heading.leading,
          letterSpacing: spec.heading.tracking,
          textWrap: "balance",
        }}
      >
        {title}
      </h1>
      <p
        className="text-[var(--card-text)]"
        style={{ marginTop: 10, fontSize: spec.subheading.size, lineHeight: spec.subheading.leading, textWrap: "pretty" }}
      >
        {body}
      </p>
    </div>
  )
}

/** Name, then role and company on one muted line. */
function PersonLine({ card, size }: { card: ContactCard; size: "sm" | "md" }) {
  return (
    <div className="min-w-0">
      <p
        className={cn("truncate font-medium text-[var(--card-ink)]", size === "sm" ? "text-[14px] leading-5" : "text-[15px] leading-[22px]")}
        dir="auto"
        data-i18n-skip
      >
        {card.person.fullName}
      </p>
      <p
        className={cn("truncate text-[var(--card-text)]", size === "sm" ? "text-[12.5px] leading-4" : "text-[13.5px] leading-5")}
        dir="auto"
        data-i18n-skip
      >
        {card.person.role}
        {card.person.role && card.person.company ? " · " : ""}
        {card.person.company}
      </p>
    </div>
  )
}

/**
 * Identity and heading, arranged the preset's way: mark above the sentence,
 * beside a dense name line, credited below it like a byline, or centred and
 * haloed as a portrait.
 */
function CardIntro({ card, spec }: { card: ContactCard; spec: CardLayoutSpec }) {
  // The byline mark sits mid-page, so it never rises into a cover header.
  const mark = (
    <IdentityMark card={card} size={spec.mark.size} shape={spec.mark.shape} halo={spec.mark.halo} lift={spec.mark.placement !== "byline"} />
  )
  const headline = <CardHeadline spec={spec} eyebrow={card.person.company} title={card.publicHeading} body={card.publicSubheading} />

  if (spec.mark.placement === "beside") {
    return (
      <div>
        <div className="flex items-center gap-3">
          {mark}
          <PersonLine card={card} size="sm" />
        </div>
        <div style={{ marginTop: spec.introGap }}>{headline}</div>
      </div>
    )
  }

  if (spec.mark.placement === "byline") {
    return (
      <div>
        {headline}
        <div className="mt-6 flex items-center gap-3 border-t border-[var(--card-hairline)] pt-4">
          {mark}
          <PersonLine card={card} size="md" />
        </div>
      </div>
    )
  }

  return (
    <div className={cn("flex flex-col", spec.centred && "items-center")} style={{ gap: spec.introGap }}>
      {mark}
      {headline}
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Form                                                                        */
/* -------------------------------------------------------------------------- */

export function PublicCardForm({
  card,
  values,
  errors,
  submitting,
  slow,
  submitError,
  onChange,
  onSubmit,
  formRef,
  interactive = true,
}: {
  card: ContactCard
  values: PublicFormValues
  errors: PublicFormErrors
  submitting: boolean
  slow: boolean
  submitError: string | null
  onChange: <K extends keyof PublicFormValues>(key: K, value: PublicFormValues[K]) => void
  onSubmit: (event: React.FormEvent) => void
  formRef?: RefObject<HTMLFormElement | null>
  interactive?: boolean
}) {
  const { t } = useLanguage()
  const spec = resolveCardLayout(card.branding.layout)

  return (
    <div>
      <CardIntro card={card} spec={spec} />

      <ContactCardSocialLinks card={card} interactive={interactive} style={{ marginTop: spec.socialGap }} />

      <form
        ref={formRef}
        noValidate
        onSubmit={onSubmit}
        style={{ marginTop: spec.formGap }}
        className={cn(
          "text-start",
          // Spotlight sets the task down on its own surface, so the page reads as
          // portrait first, form second. The others keep the form on the page.
          spec.formOnSurface && "rounded-[var(--card-radius-panel)] bg-[var(--card-surface)] p-[18px] shadow-[var(--card-shadow)]",
        )}
      >
        <fieldset disabled={submitting} className="grid border-0 p-0" style={{ gap: spec.field.gap }}>
          {/* Container-driven, not viewport-driven: the pair splits when the column
              is wide enough for it, which is what the preview frame needs too. */}
          <div className="grid" style={{ gap: spec.field.gap, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <PublicField
              id="first-name"
              label={t("First name")}
              value={values.firstName}
              onChange={(value) => onChange("firstName", value)}
              error={errors.firstName}
              autoComplete="given-name"
              autoCapitalize="words"
              enterKeyHint="next"
              interactive={interactive}
              spec={spec}
            />
            <PublicField
              id="last-name"
              label={t("Last name")}
              value={values.lastName}
              onChange={(value) => onChange("lastName", value)}
              error={errors.lastName}
              autoComplete="family-name"
              autoCapitalize="words"
              enterKeyHint="next"
              interactive={interactive}
              spec={spec}
            />
          </div>
          <PublicField
            id="email"
            label={t("Work email")}
            type="email"
            inputMode="email"
            dir="ltr"
            value={values.email}
            onChange={(value) => onChange("email", value)}
            error={errors.email}
            autoComplete="email"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            interactive={interactive}
            spec={spec}
          />
          <PublicField
            id="company"
            label={t("Company")}
            value={values.company}
            onChange={(value) => onChange("company", value)}
            error={errors.company}
            autoComplete="organization"
            autoCapitalize="words"
            enterKeyHint={card.phoneField === "hidden" ? "send" : "next"}
            interactive={interactive}
            spec={spec}
          />
          {card.phoneField !== "hidden" ? (
            <PublicField
              id="phone"
              label={t("Phone")}
              optional={card.phoneField === "optional"}
              type="tel"
              inputMode="tel"
              dir="ltr"
              value={values.phone}
              onChange={(value) => onChange("phone", value)}
              error={errors.phone}
              autoComplete="tel"
              enterKeyHint="send"
              interactive={interactive}
              spec={spec}
            />
          ) : null}
        </fieldset>

        <div className="mt-7">
          {card.consentEnabled && card.consentCopy ? (
            <label className="flex cursor-pointer items-start gap-3 py-1">
              <input
                type="checkbox"
                checked={values.marketingConsent}
                disabled={submitting}
                tabIndex={interactive ? undefined : -1}
                onChange={(event) => onChange("marketingConsent", event.target.checked)}
                className="mt-0.5 size-[18px] shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--card-focus-ring)]"
                style={{ accentColor: card.branding.accent }}
              />
              <span className="text-[13.5px] leading-[1.5] text-[var(--card-text)]">{card.consentCopy}</span>
            </label>
          ) : null}

          <p className="mt-3 text-[12.5px] leading-[1.55] text-[var(--card-subtle)]">
            {card.showTenantName ? (
              <>{t("Your details go to")} <bdi dir="auto" data-i18n-skip>{card.tenantName}</bdi> {t("so they can follow up with you.")}{" "}</>
            ) : (
              <>{t("Your details are used only to respond to this request.")}{" "}</>
            )}
            <a
              href={card.privacyUrl}
              target="_blank"
              rel="noreferrer noopener"
              tabIndex={interactive ? undefined : -1}
              className="underline underline-offset-2 transition-colors duration-[160ms] hover:text-[var(--card-text)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--card-focus-ring)] motion-reduce:transition-none"
            >
              {t("Privacy notice")}
            </a>
          </p>
        </div>

        <div aria-live="polite" className="empty:hidden">
          {submitError ? (
            <p className="mt-5 flex items-start gap-2 rounded-[var(--card-radius-field)] bg-[var(--card-error-soft)] p-3.5 text-[13.5px] leading-5 text-[var(--card-error-ink)]">
              <TriangleAlert className="mt-0.5 size-4 shrink-0" strokeWidth={1.6} />
              {submitError}
            </p>
          ) : Object.keys(errors).length > 0 ? (
            <p className="sr-only">{t("Some details are missing. Check the highlighted fields.")}</p>
          ) : null}
        </div>

        <button
          type="submit"
          disabled={submitting}
          tabIndex={interactive ? undefined : -1}
          className={cn(
            "group/submit mt-6 inline-flex h-[54px] w-full items-center justify-center rounded-[var(--card-radius-field)] text-[15px] font-medium",
            "bg-[var(--card-action-bg)] text-[var(--card-action-ink)]",
            "transition-[transform,background-color,box-shadow] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)]",
            "hover:bg-[var(--card-action-hover)] active:scale-[0.988]",
            "focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--card-focus-ring)]",
            "disabled:cursor-progress motion-reduce:transition-none motion-reduce:active:scale-100",
          )}
        >
          {/* Both states share one grid cell so the button never changes width. */}
          <span className="grid place-items-center">
            <span className={cn("col-start-1 row-start-1 transition-opacity duration-[140ms] motion-reduce:transition-none", submitting && "opacity-0")}>
              {card.submitLabel}
            </span>
            <span
              className={cn(
                "col-start-1 row-start-1 inline-flex items-center gap-2 transition-opacity duration-[140ms] motion-reduce:transition-none",
                !submitting && "opacity-0",
              )}
            >
              <LoaderCircle className="size-4 animate-spin" strokeWidth={1.8} />
              {slow ? t("Still sending…") : t("Sending…")}
            </span>
          </span>
        </button>
      </form>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Exchange                                                                    */
/* -------------------------------------------------------------------------- */

function ContactRow({ icon: Icon, label, value, href, interactive, padY }: { icon: typeof Mail; label: string; value: string; href?: string; interactive: boolean; padY: number }) {
  return (
    <div className="flex items-start gap-3 text-start" style={{ paddingBlock: padY }}>
      <Icon className="mt-0.5 size-4 shrink-0 text-[var(--card-subtle)]" strokeWidth={1.5} />
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-medium text-[var(--card-subtle)]">{label}</p>
        <CopyableField label={label} value={value} className="mt-0.5 w-full">
          {href ? (
            <a
              href={href}
              tabIndex={interactive ? undefined : -1}
              className="block break-words text-[15px] leading-6 text-[var(--card-ink)] underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--card-focus-ring)]"
              dir="ltr"
              data-i18n-skip
            >
              {value}
            </a>
          ) : (
            <span className="block break-words text-[15px] leading-6 text-[var(--card-ink)]" dir="auto" data-i18n-skip>
              {value}
            </span>
          )}
        </CopyableField>
      </div>
    </div>
  )
}

export function PublicCardExchange({
  card,
  headingRef,
  onAddToContacts,
  downloaded,
  interactive = true,
}: {
  card: ContactCard
  headingRef?: RefObject<HTMLHeadingElement | null>
  onAddToContacts: () => void
  downloaded: boolean
  interactive?: boolean
}) {
  const { t } = useLanguage()
  const spec = resolveCardLayout(card.branding.layout)
  const loudHeading = spec.heading.size >= 27

  return (
    <div>
      <div className={cn("flex flex-col", spec.centred && "items-center")} style={{ gap: spec.introGap }}>
        {/* Sized off the heading: a loud headline needs a badge that can hold it. */}
        <span
          className="grid shrink-0 place-items-center rounded-full bg-[var(--card-accent-soft)] text-[var(--card-accent)]"
          style={{ width: loudHeading ? 48 : 40, height: loudHeading ? 48 : 40 }}
        >
          <Check className={loudHeading ? "size-[22px]" : "size-5"} strokeWidth={2.1} />
        </span>

        <CardHeadline spec={spec} title={card.thanksHeading} body={card.thanksBody} titleRef={headingRef} />
      </div>

      {/* What they came for, so it is the one distinguished surface: raised in most
          presets, ruled rather than lifted in the editorial one. */}
      <section
        aria-label={`${t("Contact details for")} ${card.person.fullName}`}
        style={{ marginTop: spec.formGap }}
        className={cn(
          "rounded-[var(--card-radius-outer)] bg-[var(--card-surface)] p-5 text-start",
          spec.detailSurface === "raised" ? "shadow-[var(--card-shadow)]" : "shadow-[inset_0_0_0_1px_var(--card-hairline)]",
        )}
      >
        <div className="flex items-center gap-3.5">
          <IdentityMark card={card} size={spec.detailMark} shape={spec.mark.shape} />
          <div className="min-w-0">
            <p className="truncate text-[17.5px] font-medium leading-6 text-[var(--card-ink)]" data-i18n-skip dir="auto">
              {card.person.fullName}
            </p>
            <p className="mt-0.5 truncate text-[13.5px] text-[var(--card-text)]" data-i18n-skip dir="auto">
              {card.person.role}
              {card.person.role && card.person.company ? " · " : ""}
              {card.person.company}
            </p>
          </div>
        </div>

        <div className="mt-4 divide-y divide-[var(--card-hairline)] border-t border-[var(--card-hairline)]">
          <ContactRow icon={Mail} label={t("Email")} value={card.person.email} href={`mailto:${card.person.email}`} interactive={interactive} padY={spec.detailRowPad} />
          {card.showPhone && card.person.phone ? (
            <ContactRow icon={Phone} label={t("Phone")} value={card.person.phone} href={`tel:${card.person.phone.replace(/\s/g, "")}`} interactive={interactive} padY={spec.detailRowPad} />
          ) : null}
          {card.showWebsite && card.person.website ? (
            <ContactRow icon={Globe} label={t("Website")} value={card.person.website} href={`https://${card.person.website}`} interactive={interactive} padY={spec.detailRowPad} />
          ) : null}
        </div>
        <ContactCardSocialLinks card={card} interactive={interactive} className="mt-4 border-t border-[var(--card-hairline)] pt-4" />
      </section>

      <div className="mt-5 grid gap-2.5">
        <button
          type="button"
          onClick={onAddToContacts}
          tabIndex={interactive ? undefined : -1}
          className="inline-flex h-[54px] w-full items-center justify-center gap-2 rounded-[var(--card-radius-field)] bg-[var(--card-action-bg)] text-[15px] font-medium text-[var(--card-action-ink)] transition-[transform,background-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] hover:bg-[var(--card-action-hover)] active:scale-[0.988] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--card-focus-ring)] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <UserRoundPlus className="size-4" strokeWidth={1.6} />
          {t("Add to contacts")}
        </button>

        <a
          href={`mailto:${card.person.email}`}
          tabIndex={interactive ? undefined : -1}
          className="inline-flex h-[54px] w-full items-center justify-center gap-2 rounded-[var(--card-radius-field)] bg-[var(--card-surface)] text-[15px] font-medium text-[var(--card-ink)] shadow-[inset_0_0_0_1px_var(--card-hairline)] transition-[transform,background-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] active:scale-[0.988] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--card-focus-ring)] motion-reduce:transition-none motion-reduce:active:scale-100"
        >
          <Mail className="size-4" strokeWidth={1.6} />
          {t("Email")} {card.person.fullName.split(" ")[0]}
        </a>
      </div>

      {/* Reserved space, revealed by opacity: animating height here would push
          the buttons above it mid-read. */}
      <p
        aria-hidden={!downloaded}
        className={cn(
          "pt-3.5 text-[12.5px] leading-5 text-[var(--card-subtle)]",
          "transition-opacity duration-[240ms] ease-[cubic-bezier(0.16,1,0.3,1)] motion-reduce:transition-none",
          downloaded ? "opacity-100" : "opacity-0",
        )}
      >
        {t("If nothing opened, your browser saved a contact file to your downloads. The details above can also be copied.")}
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */
/* Phase switch                                                                */
/* -------------------------------------------------------------------------- */

/**
 * The one moment of motion in the public flow: the form leaves on an
 * accelerating curve, the exchange arrives on a decelerating one. Asymmetric on
 * purpose — nothing should feel like it snapped back.
 */
export function PublicCardPhases({ phase, form, exchange }: { phase: "form" | "done"; form: ReactNode; exchange: ReactNode }) {
  const shouldReduceMotion = useReducedMotion()
  const reduce = Boolean(shouldReduceMotion)

  return (
    <AnimatePresence mode="wait" initial={false}>
      {phase === "form" ? (
        <motion.div key="form" initial={false} exit={{ opacity: 0, y: reduce ? 0 : -6 }} transition={{ duration: reduce ? 0.12 : 0.16, ease: mdEaseIn }}>
          {form}
        </motion.div>
      ) : (
        <motion.div
          key="done"
          initial={{ opacity: 0, y: reduce ? 0 : 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: reduce ? 0.12 : 0.3, ease: mdEaseOut }}
        >
          {exchange}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function PublicCardFooter() {
  const { t } = useLanguage()
  return <p className="mt-12 text-[11.5px] text-[var(--card-subtle)]">{t("Powered by Multideck")}</p>
}
