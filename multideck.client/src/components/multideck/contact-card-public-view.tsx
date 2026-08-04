import { useMemo, type CSSProperties, type ReactNode, type RefObject } from "react"
import { AnimatePresence, motion, useReducedMotion } from "motion/react"
import { Check, Eye, Globe, LoaderCircle, Mail, Phone, TriangleAlert, UserRoundPlus } from "lucide-react"
import { CopyableField } from "@/components/multideck/copyable-field"
import { ContactSocialMark } from "@/components/multideck/contact-social-mark"
import { useLanguage } from "@/i18n/language-provider"
import { mdEaseIn, mdEaseOut } from "@/lib/motion"
import { cardThemeVariables, resolveCardTheme } from "@/lib/card-theme"
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
  const centred = card?.branding.layout === "spotlight"
  const compact = card?.branding.layout === "compact"
  const editorial = card?.branding.layout === "editorial"

  return (
    <div
      dir="auto"
      style={style}
      className={cn("min-h-full w-full bg-[var(--card-page-bg)] text-[var(--card-ink)]", className)}
    >
      {preview ? (
        <div className="sticky top-0 z-20 flex items-center justify-center gap-2 bg-[var(--card-ink)] px-4 py-2 text-center text-[12.5px] font-medium text-[var(--card-page-bg)]">
          <Eye className="size-3.5 shrink-0" strokeWidth={1.6} />
          {t("Preview — nothing is recorded and no lead is created")}
        </div>
      ) : null}

      <CardHeader card={card} />

      <main
        className={cn(
          "mx-auto w-full",
          compact ? "max-w-[440px] px-5 pb-12 pt-6" : "max-w-[500px] px-6 pb-16 pt-9",
          centred && "text-center",
          editorial && "max-w-[540px]",
        )}
      >
        {children}
      </main>
    </div>
  )
}

function CardHeader({ card }: { card: ContactCard | null }) {
  if (!card) return null
  const { headerStyle, accent, logoDataUrl } = card.branding

  if (headerStyle === "none") return null

  if (headerStyle === "bar") {
    return <div aria-hidden="true" className="h-1.5 w-full" style={{ backgroundColor: accent }} />
  }

  if (headerStyle === "band") {
    return (
      <div className="w-full px-6 py-5" style={{ backgroundColor: accent, color: readableInk(accent) }}>
        <div className="mx-auto flex max-w-[500px] items-center gap-3">
          {logoDataUrl ? (
            <img src={logoDataUrl} alt="" className="h-7 max-w-[132px] object-contain" />
          ) : (
            <span className="text-[14px] font-medium tracking-[0.01em]">{card.person.company}</span>
          )}
        </div>
      </div>
    )
  }

  // Cover: a taller gradient field that the content sits below.
  return (
    <div
      aria-hidden="true"
      className="h-[104px] w-full"
      style={{ background: `linear-gradient(160deg, ${accent} 0%, color-mix(in srgb, ${accent}, #000 26%) 100%)` }}
    />
  )
}

/* -------------------------------------------------------------------------- */
/* Identity                                                                    */
/* -------------------------------------------------------------------------- */

function IdentityMark({ card, size = 48 }: { card: ContactCard; size?: number }) {
  const initials = card.person.fullName
    .split(" ")
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")

  const cover = card.branding.headerStyle === "cover"

  if (card.person.profileImageDataUrl) {
    return (
      <span
        aria-hidden="true"
        className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--card-surface)] shadow-[var(--card-shadow)]", cover && "-mt-12")}
        style={{ width: size, height: size }}
      >
        <img src={card.person.profileImageDataUrl} alt="" className="size-full object-cover" />
      </span>
    )
  }

  if (card.branding.logoDataUrl) {
    return (
      <span
        aria-hidden="true"
        className={cn("grid shrink-0 place-items-center overflow-hidden rounded-full bg-[var(--card-surface)] shadow-[var(--card-shadow)]", cover && "-mt-12")}
        style={{ width: size, height: size }}
      >
        <img src={card.branding.logoDataUrl} alt="" className="size-full object-contain p-1.5" />
      </span>
    )
  }

  return (
    <span
      aria-hidden="true"
      className={cn("grid shrink-0 place-items-center rounded-full font-medium", cover && "-mt-12")}
      style={{
        width: size,
        height: size,
        backgroundColor: card.branding.accent,
        color: readableInk(card.branding.accent),
        fontSize: size * 0.32,
      }}
    >
      {initials}
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

export function ContactCardSocialLinks({ card, interactive = true, className }: { card: ContactCard; interactive?: boolean; className?: string }) {
  const links = card.person.socialLinks.filter((link) => link.enabled && link.value.trim())
  if (links.length === 0) return null

  return (
    <div className={cn("flex flex-wrap gap-2", card.branding.layout === "spotlight" && "justify-center", className)} aria-label="Social links">
      {links.map((link) => {
        const label = CARD_SOCIAL_LABELS[link.kind]
        return (
          <a
            key={link.id}
            href={socialHref(link.kind, link.value)}
            target={link.kind === "email" ? undefined : "_blank"}
            rel={link.kind === "email" ? undefined : "noreferrer noopener"}
            tabIndex={interactive ? undefined : -1}
            aria-label={label}
            title={label}
            className="grid size-10 place-items-center rounded-full bg-[var(--card-surface)] text-[var(--card-ink)] shadow-[inset_0_0_0_1px_var(--card-hairline)] transition-[transform,background-color,color] duration-[160ms] hover:bg-[var(--card-accent-soft)] hover:text-[var(--card-accent)] active:scale-[0.96] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--card-focus-ring)] motion-reduce:transition-none"
          >
            <ContactSocialMark kind={link.kind} className="size-[18px]" />
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
  interactive = true,
  ...props
}: {
  id: string
  label: string
  optional?: boolean
  error?: string
  value: string
  onChange: (value: string) => void
  interactive?: boolean
} & Omit<React.ComponentProps<"input">, "id" | "value" | "onChange">) {
  const { t } = useLanguage()
  const errorId = `${id}-error`

  return (
    <div className="text-start">
      <label htmlFor={id} className="flex items-baseline gap-2">
        <span className="text-[13.5px] font-medium text-[var(--card-ink)]">{label}</span>
        {optional ? <span className="text-[12.5px] font-normal text-[var(--card-subtle)]">{t("Optional")}</span> : null}
      </label>
      <input
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        tabIndex={interactive ? undefined : -1}
        className={cn(
          "mt-1.5 block h-[52px] w-full bg-[var(--card-field-bg)] px-3.5 text-[16px] text-[var(--card-ink)] outline-none",
          "rounded-[var(--card-radius-field)] shadow-[inset_0_0_0_1px_var(--card-hairline)]",
          "transition-[box-shadow,background-color] duration-[180ms] ease-[cubic-bezier(0.22,1,0.36,1)] motion-reduce:transition-none",
          "placeholder:text-[var(--card-subtle)]",
          "focus-visible:shadow-[inset_0_0_0_1px_var(--card-accent),0_0_0_3px_var(--card-focus-ring)]",
          "disabled:cursor-not-allowed",
          error && "shadow-[inset_0_0_0_1px_var(--card-error-ink)]",
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
  const centred = card.branding.layout === "spotlight"
  const editorial = card.branding.layout === "editorial"

  return (
    <div>
      <div className={cn("flex flex-col gap-4", centred && "items-center", editorial && "border-s-2 border-[var(--card-accent)] ps-5")}>
        <IdentityMark card={card} size={card.branding.layout === "compact" ? 44 : 52} />

        <div className="min-w-0">
          <h1 className="text-[25px] font-medium leading-[1.2] tracking-[-0.01em] text-[var(--card-ink)]" style={{ textWrap: "balance" }}>
            {card.publicHeading}
          </h1>
          <p className="mt-2.5 text-[15px] leading-[1.55] text-[var(--card-text)]" style={{ textWrap: "pretty" }}>
            {card.publicSubheading}
          </p>
        </div>
      </div>

      <ContactCardSocialLinks card={card} interactive={interactive} className="mt-5" />

      <form ref={formRef} noValidate className="mt-8 text-start" onSubmit={onSubmit}>
        <fieldset disabled={submitting} className="grid gap-[18px] border-0 p-0">
          <div className="grid gap-[18px] sm:grid-cols-2">
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

function ContactRow({ icon: Icon, label, value, href, interactive }: { icon: typeof Mail; label: string; value: string; href?: string; interactive: boolean }) {
  return (
    <div className="flex items-start gap-3 py-3.5 text-start">
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
  const centred = card.branding.layout === "spotlight"

  return (
    <div>
      <div className={cn("flex flex-col gap-4", centred && "items-center")}>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--card-accent-soft)] text-[var(--card-accent)]">
          <Check className="size-5" strokeWidth={2.1} />
        </span>

        <div className="min-w-0">
          <h1
            ref={headingRef}
            tabIndex={-1}
            className="text-[25px] font-medium leading-[1.2] tracking-[-0.01em] text-[var(--card-ink)] outline-none"
            style={{ textWrap: "balance" }}
          >
            {card.thanksHeading}
          </h1>
          <p className="mt-2.5 text-[15px] leading-[1.55] text-[var(--card-text)]" style={{ textWrap: "pretty" }}>
            {card.thanksBody}
          </p>
        </div>
      </div>

      {/* The only elevated surface on the page: this is what they came for. */}
      <section
        aria-label={`${t("Contact details for")} ${card.person.fullName}`}
        className="mt-8 rounded-[var(--card-radius-outer)] bg-[var(--card-surface)] p-5 text-start shadow-[var(--card-shadow)]"
      >
        <div className="flex items-center gap-3.5">
          <IdentityMark card={card} size={52} />
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
          <ContactRow icon={Mail} label={t("Email")} value={card.person.email} href={`mailto:${card.person.email}`} interactive={interactive} />
          {card.showPhone && card.person.phone ? (
            <ContactRow icon={Phone} label={t("Phone")} value={card.person.phone} href={`tel:${card.person.phone.replace(/\s/g, "")}`} interactive={interactive} />
          ) : null}
          {card.showWebsite && card.person.website ? (
            <ContactRow icon={Globe} label={t("Website")} value={card.person.website} href={`https://${card.person.website}`} interactive={interactive} />
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
