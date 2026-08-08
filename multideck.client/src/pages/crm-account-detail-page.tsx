import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react"
import { motion, useReducedMotion } from "motion/react"
import { ArrowLeft, ArrowRight, Mail, MapPin, Plus, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { ContactCreateDialog } from "@/components/multideck/contact-create-dialog"
import { CustomerAvatar } from "@/components/multideck/customer-components"
import { SpectralBloomShader } from "@/components/multideck/dexter-action-pill"
import { DotGridLoaderPanel } from "@/components/multideck/dot-grid-loader"
import { InlineField, InlineFieldCard, InlineSelectField, InlineSwitchField } from "@/components/multideck/inline-field"
import { MarketingOptInControl } from "@/components/multideck/marketing-opt-in-control"
import { Surface } from "@/components/multideck/surface"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/i18n/language-provider"
import { mdMotion, staggerRamp } from "@/lib/motion"
import { getCustomer, getCustomerReference, updateAccount, type ApiCustomerDetail, type CustomerReference, type UpdateAccountInput } from "@/lib/customer-api"
import { CustomerWarehouseAccess } from "@/pages/customer-detail-page"

type CustomField = { id: string; label: string; value: string }
type AccountDraft = UpdateAccountInput & { customFields: CustomField[] }

/**
 * An account, edited where it is read.
 *
 * The previous screen showed the record and hid every field behind one large
 * dialog, so changing a trade lane meant opening a form of forty inputs, finding
 * the one, and saving all of it. Here each fact is its own control: it reads as
 * text, becomes an input when you ask, and writes on its own. The dialog is gone.
 */
export function CrmAccountDetailPage({ accountId, navigate }: { accountId: string; navigate: (path: string) => void }) {
  const { t } = useLanguage()
  const shouldReduceMotion = useReducedMotion()
  const [account, setAccount] = useState<ApiCustomerDetail | null>(null)
  const [state, setState] = useState<"loading" | "ready" | "error">("loading")
  const [error, setError] = useState<string | null>(null)
  const [reloadToken, setReloadToken] = useState(0)
  const [addContactOpen, setAddContactOpen] = useState(false)
  const [consentOpen, setConsentOpen] = useState(false)
  const [reference, setReference] = useState<CustomerReference | null>(null)

  useEffect(() => {
    let active = true
    setState("loading")
    setError(null)
    Promise.all([getCustomer(accountId), getCustomerReference()])
      .then(([data, nextReference]) => {
        if (!active) return
        setAccount(data)
        setReference(nextReference)
        setState("ready")
      })
      .catch((cause) => {
        if (!active) return
        setError(cause instanceof Error ? cause.message : t("This account could not be loaded. Check your connection and try again."))
        setState("error")
      })
    return () => { active = false }
  }, [accountId, reloadToken, t])

  /**
   * One field's change, sent as a complete record because the endpoint takes the
   * whole shape. The draft is rebuilt from the account each time rather than held
   * in state, so a save can never carry a stale copy of a neighbouring field.
   *
   * It throws on failure on purpose: the field that was edited catches it, puts
   * its own value back and shows the reason next to itself.
   */
  const patch = useCallback(async (change: Partial<AccountDraft>) => {
    const current = account
    if (!current) return
    const next = { ...toDraft(current), ...change }
    const metadata = {
      ...next.metadata,
      customFields: Object.fromEntries(next.customFields.filter((field) => field.label.trim()).map((field) => [field.label.trim(), field.value.trim()])),
    }
    const updated = await updateAccount(accountId, { ...next, metadata })
    setAccount(updated)
  }, [account, accountId])

  const customFields = useMemo(() => {
    const stored = account?.metadata.customFields
    const record = stored && typeof stored === "object" ? stored as Record<string, unknown> : {}
    return Object.entries(record).map(([label, value]) => ({ id: label, label, value: typeof value === "string" ? value : String(value) }))
  }, [account])

  const backButton = (
    <button
      type="button"
      onClick={() => navigate("/crm/accounts")}
      className="group -ms-2 inline-flex h-8 w-fit items-center gap-1.5 rounded-[var(--md-radius-md)] px-2 text-[12.5px] font-medium text-[var(--md-text)] outline-none transition-[background,color] duration-150 hover:bg-[var(--md-hover)] hover:text-[var(--md-ink)] focus-visible:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)]"
    >
      <ArrowLeft className="size-3.5 transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] group-hover:-translate-x-0.5 rtl:rotate-180 rtl:group-hover:translate-x-0.5 motion-reduce:transform-none" strokeWidth={1.5} />
      {t("Back to accounts")}
    </button>
  )

  if (state === "loading") {
    return <div className="md-page md-page-stack">{backButton}<Surface padding="lg" className="grid min-h-[320px] place-items-center rounded-[var(--md-radius-xl)]"><DotGridLoaderPanel label="Loading account" minHeight={0} /></Surface></div>
  }

  if (state === "error" || !account) {
    return (
      <div className="md-page md-page-stack">
        {backButton}
        <Surface padding="lg" className="grid min-h-[320px] place-items-center rounded-[var(--md-radius-xl)] text-center" role="alert">
          <div className="max-w-md">
            <p className="text-[15px] font-medium text-[var(--md-ink)]">{t("Account unavailable")}</p>
            {error ? <p className="mt-2 text-[13px] leading-5 text-[var(--md-text)]">{error}</p> : null}
            <Button variant="outline" className="mt-4" onClick={() => setReloadToken((value) => value + 1)}>
              <RefreshCw className="size-4" strokeWidth={1.5} />
              {t("Try again")}
            </Button>
          </div>
        </Surface>
      </div>
    )
  }

  const openExceptions = account.activeShipments.reduce((total, shipment) => total + shipment.openExceptionCount, 0)
  const currentAccount = account
  const address = currentAccount.address
  const engagement = currentAccount.engagement

  return (
    <div className="md-page md-page-stack">
      {backButton}

      <motion.header
        initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={shouldReduceMotion ? { duration: 0 } : mdMotion.enter}
        className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between"
      >
        <div className="flex min-w-0 items-start gap-4">
          <CustomerAvatar initials={currentAccount.initials} tone="teal" size="lg" />
          <div className="min-w-0">
            {/* The name is the page title and is edited in place like everything
                else. It carries the heading's own metrics so nothing shifts. */}
            <HeadingField value={currentAccount.name} onSave={(name) => patch({ name })} />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {currentAccount.tier ? <StatusPill tone="teal">{currentAccount.tier}</StatusPill> : null}
              <StatusPill tone={currentAccount.marketingOptIn ? "green" : "neutral"}>{t(currentAccount.marketingOptIn ? "Marketing opted in" : "Marketing opted out")}</StatusPill>
              <span className="text-[12.5px] text-[var(--md-text)]">
                {[currentAccount.vertical || currentAccount.industry, currentAccount.location, humanize(currentAccount.relationshipStatus)].filter(Boolean).join(" · ")}
              </span>
            </div>
            <div className="mt-3 max-w-[760px]">
              <InlineField
                label="Summary"
                kind="textarea"
                align="start"
                value={currentAccount.summary ?? ""}
                placeholder="What this account buys, and what matters to them"
                onSave={(summary) => patch({ summary: summary || null })}
              />
            </div>
          </div>
        </div>
      </motion.header>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: t("Contacts"), value: String(currentAccount.contacts.length), tone: "neutral" as const },
          { label: t("Active shipments"), value: String(currentAccount.activeShipments.length), tone: "neutral" as const },
          { label: t("Account health"), value: currentAccount.healthScore == null ? "—" : `${Math.round(currentAccount.healthScore)}%`, tone: "health" as const },
          { label: t("Open exceptions"), value: String(openExceptions), tone: openExceptions ? "amber" as const : "neutral" as const },
        ].map((metric, index) => (
          <motion.div
            key={metric.label}
            initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={shouldReduceMotion ? { duration: 0 } : { ...mdMotion.enter, delay: staggerRamp(index, 0.04) }}
          >
            <Metric {...metric} />
          </motion.div>
        ))}
      </div>

      <div className="grid gap-[var(--md-page-stack-gap)] 2xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="grid content-start gap-[var(--md-page-stack-gap)]">
          <Panel title={t("Latest updates")} meta={currentAccount.activities.length ? t("Newest first") : undefined}>
            {currentAccount.activities.length
              ? currentAccount.activities.map((activity, index) => <ActivityRow key={activity.id} activity={activity} last={index === currentAccount.activities.length - 1} />)
              : <Empty text={t("Nothing has been logged against this account yet.")} />}
          </Panel>

          <Panel title={t("Recent emails")} meta={currentAccount.recentEmails.available ? String(currentAccount.recentEmails.items.length) : t("Permission required")}>
            {!currentAccount.recentEmails.available ? (
              <Empty text={t("You need email access to see this account's conversations.")} />
            ) : currentAccount.recentEmails.items.length ? (
              currentAccount.recentEmails.items.map((email, index) => (
                <button
                  key={email.id}
                  type="button"
                  onClick={() => navigate(`/inbox?thread=${email.threadId}`)}
                  className={`group flex w-full items-start gap-3 px-5 py-4 text-start transition-colors duration-150 hover:bg-[var(--md-surface-soft)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a14)] ${index ? "border-t border-[var(--md-line)]" : ""}`}
                >
                  <span className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-[var(--md-radius-md)] ${email.direction === "inbound" ? "bg-[var(--md-accent-a11)] text-[var(--md-accent)]" : "bg-[var(--md-surface-tint)] text-[var(--md-text)]"}`}>
                    <Mail className="size-4" strokeWidth={1.5} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center justify-between gap-4">
                      <span className="truncate text-[14px] font-medium text-[var(--md-ink)]">{email.subject}</span>
                      <span className="shrink-0 text-[12px] tabular-nums text-[var(--md-subtle)]">{relativeDate(email.occurredAt, t)}</span>
                    </span>
                    <span className="mt-1 block truncate text-[12px] text-[var(--md-text)]">{[email.contactName || email.contactEmail, email.preview].filter(Boolean).join(" · ")}</span>
                  </span>
                  <ArrowRight className="mt-2 size-4 shrink-0 text-[var(--md-subtle)] transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transform-none" strokeWidth={1.5} />
                </button>
              ))
            ) : (
              <Empty text={t("No emails from this account or its contacts yet.")} />
            )}
          </Panel>

          <Panel title={t("Active shipments")} meta={String(currentAccount.activeShipments.length)}>
            {currentAccount.activeShipments.length ? currentAccount.activeShipments.map((shipment, index) => (
              <div key={shipment.id} className={`grid gap-3 px-5 py-4 sm:grid-cols-[130px_minmax(0,1fr)_auto] sm:items-center ${index ? "border-t border-[var(--md-line)]" : ""}`}>
                <p className="text-[13px] font-medium tabular-nums text-[var(--md-ink)]">{shipment.reference}</p>
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-medium text-[var(--md-ink)]">{shipment.route || t("Route not recorded")}</p>
                  <p className="mt-1 text-[12px] text-[var(--md-text)]">{[shipment.mode, shipment.status, shipment.eta ? `${t("ETA")} ${formatDate(shipment.eta)}` : null].filter(Boolean).join(" · ")}</p>
                </div>
                <StatusPill tone={shipment.openExceptionCount ? "amber" : "green"}>{shipment.openExceptionCount ? `${shipment.openExceptionCount} ${t("exceptions")}` : t("On track")}</StatusPill>
              </div>
            )) : <Empty text={t("Nothing is moving for this account right now.")} />}
          </Panel>

          <CustomerWarehouseAccess customerId={currentAccount.id} />
        </div>

        <aside className="grid content-start gap-[var(--md-page-stack-gap)]">
          <Panel
            title={t("Contacts")}
            meta={String(currentAccount.contacts.length)}
            action={<Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] px-2 text-[12px] active:scale-[0.96] motion-reduce:transform-none" onClick={() => setAddContactOpen(true)}><Plus className="size-3.5" strokeWidth={1.5} />{t("Add contact")}</Button>}
          >
            {currentAccount.contacts.length ? currentAccount.contacts.map((contact, index) => (
              <button
                key={contact.id}
                type="button"
                onClick={() => navigate(`/crm/contacts/${contact.id}`)}
                className={`group flex min-h-16 w-full items-center gap-3 px-5 py-3 text-start transition-colors duration-150 hover:bg-[var(--md-surface-soft)] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-[var(--md-accent-a14)] ${index ? "border-t border-[var(--md-line)]" : ""}`}
              >
                <CustomerAvatar initials={contact.initials} tone="blue" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[14px] font-medium text-[var(--md-ink)]">{contact.name}</span>
                  <span className="mt-0.5 block truncate text-[12px] text-[var(--md-text)]">{contact.jobTitle || contact.role || contact.email || t("No details recorded yet")}</span>
                </span>
                <ArrowRight className="size-4 text-[var(--md-subtle)] transition-transform duration-150 ease-[cubic-bezier(0.2,0,0,1)] group-hover:translate-x-0.5 rtl:rotate-180 rtl:group-hover:-translate-x-0.5 motion-reduce:transform-none" strokeWidth={1.5} />
              </button>
            )) : <Empty text={t("Add the people you deal with at this account.")} />}
          </Panel>

          <InlineFieldCard title="Account profile">
            <InlineSelectField
              label="Relationship"
              value={currentAccount.relationshipStatus}
              options={(reference?.relationshipStatuses ?? []).map((status) => ({ value: status.code, label: status.name }))}
              onSave={(relationshipStatus) => patch({ relationshipStatus })}
            />
            <InlineField label="Owner" value={currentAccount.ownerName ?? ""} readOnly />
            <InlineField label="Tier" value={currentAccount.tier ?? ""} onSave={(tier) => patch({ tier: tier || null })} />
            <InlineField label="Segment" value={currentAccount.segment ?? ""} onSave={(segment) => patch({ segment: segment || null })} />
            <InlineField label="Vertical" value={currentAccount.vertical ?? ""} onSave={(vertical) => patch({ vertical: vertical || null })} />
            <InlineField label="Primary mode" value={currentAccount.primaryMode ?? ""} onSave={(primaryMode) => patch({ primaryMode: primaryMode || null })} />
            <InlineField label="Trade lane" value={currentAccount.primaryTradeLane ?? ""} onSave={(primaryTradeLane) => patch({ primaryTradeLane: primaryTradeLane || null })} />
            <InlineField label="Growth state" value={currentAccount.growthState ?? ""} onSave={(growthState) => patch({ growthState: growthState || null })} />
            <InlineField
              label="Health score"
              kind="number"
              value={currentAccount.healthScore == null ? "" : String(currentAccount.healthScore)}
              hint="0 to 100"
              onSave={(value) => patch({ healthScore: value === "" ? null : clampScore(value) })}
            />
            <InlineField
              label="Churn risk"
              kind="number"
              value={currentAccount.churnRiskScore == null ? "" : String(currentAccount.churnRiskScore)}
              hint="0 to 100"
              onSave={(value) => patch({ churnRiskScore: value === "" ? null : clampScore(value) })}
            />
            <InlineField label="Customer since" value={currentAccount.customerSince ? formatDate(currentAccount.customerSince) : ""} readOnly />
            <InlineSwitchField label="Strategic account" checked={currentAccount.strategic} onSave={(strategic) => patch({ strategic })} />
            <InlineSwitchField
              label="Allow AI training on approved data"
              checked={currentAccount.trainingAllowed}
              onSave={(trainingAllowed) => patch({ trainingAllowed })}
            />
          </InlineFieldCard>

          <InlineFieldCard title="Address">
            <InlineField label="Line 1" value={address?.line1 ?? ""} onSave={(line1) => patch({ address: { ...emptyAddress, ...address, line1: line1 || null } })} />
            <InlineField label="Line 2" value={address?.line2 ?? ""} onSave={(line2) => patch({ address: { ...emptyAddress, ...address, line2: line2 || null } })} />
            <InlineField label="Town or city" value={address?.townCity ?? ""} onSave={(townCity) => patch({ address: { ...emptyAddress, ...address, townCity: townCity || null } })} />
            <InlineField label="County or state" value={address?.countyState ?? ""} onSave={(countyState) => patch({ address: { ...emptyAddress, ...address, countyState: countyState || null } })} />
            <InlineField label="Postcode" value={address?.postZipCode ?? ""} onSave={(postZipCode) => patch({ address: { ...emptyAddress, ...address, postZipCode: postZipCode || null } })} />
            <InlineField label="Country" value={address?.countryCode ?? ""} placeholder="GB" hint="Two-letter country code" onSave={(countryCode) => patch({ address: { ...emptyAddress, ...address, countryCode: countryCode || null } })} />
            <InlineField label="Main email" kind="email" placeholder="name@example.com" value={address?.mainEmail ?? ""} onSave={(mainEmail) => patch({ address: { ...emptyAddress, ...address, mainEmail: mainEmail || null } })} />
            <InlineField label="Main phone" kind="tel" value={address?.mainPhone ?? ""} onSave={(mainPhone) => patch({ address: { ...emptyAddress, ...address, mainPhone: mainPhone || null } })} />
            {address && [address.line1, address.townCity, address.countryCode].some(Boolean) ? (
              <div className="mt-1 flex gap-2.5 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] px-3 py-2.5 shadow-[var(--md-shadow-line)]">
                <MapPin className="mt-0.5 size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.5} />
                <address className="text-[12px] not-italic leading-5 text-[var(--md-text)]">
                  {[address.line1, address.line2, address.townCity, address.countyState, address.postZipCode, address.countryCode].filter(Boolean).map((line) => <span key={line} className="block">{line}</span>)}
                </address>
              </div>
            ) : null}
          </InlineFieldCard>

          <InlineFieldCard title="Communication">
            <InlineField label="Preferred channel" value={engagement?.preferredChannel ?? ""} onSave={(preferredChannel) => patch({ engagement: { ...defaultEngagement, ...engagement, preferredChannel: preferredChannel || null } })} />
            <InlineField
              label="Minimum gap"
              kind="number"
              hint="Hours between non-urgent messages"
              value={String(engagement?.minHoursBetweenNonUrgentMessages ?? 24)}
              onSave={(value) => patch({ engagement: { ...defaultEngagement, ...engagement, minHoursBetweenNonUrgentMessages: Number(value) || 0 } })}
            />
            <InlineSwitchField label="Send follow-up messages" checked={engagement?.allowFollowupMessages !== false} onSave={(allowFollowupMessages) => patch({ engagement: { ...defaultEngagement, ...engagement, allowFollowupMessages } })} />
            <InlineSwitchField label="Send thank-you messages" checked={engagement?.allowThankYouMessages !== false} onSave={(allowThankYouMessages) => patch({ engagement: { ...defaultEngagement, ...engagement, allowThankYouMessages } })} />
            <InlineSwitchField label="Use WhatsApp" checked={engagement?.allowWhatsApp === true} onSave={(allowWhatsApp) => patch({ engagement: { ...defaultEngagement, ...engagement, allowWhatsApp } })} />
            <InlineSwitchField label="Limit total contact" hint="Stops several teams reaching out at once" checked={engagement?.doNotOverContact === true} onSave={(doNotOverContact) => patch({ engagement: { ...defaultEngagement, ...engagement, doNotOverContact } })} />
            <InlineField label="Notes" kind="textarea" align="start" value={engagement?.notes ?? ""} onSave={(notes) => patch({ engagement: { ...defaultEngagement, ...engagement, notes: notes || null } })} />
          </InlineFieldCard>

          {/* Consent is the one thing that does not save on a toggle. A change here
              is recorded against your name, so it asks what it was based on first. */}
          <InlineFieldCard
            title="Marketing consent"
            action={<Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-md)] px-2 text-[12px] active:scale-[0.96] motion-reduce:transform-none" onClick={() => setConsentOpen(true)}>{t("Change")}</Button>}
          >
            <InlineField label="Status" value={t(currentAccount.marketingOptIn ? "Opted in" : "Opted out")} readOnly />
            <InlineField label="Source" value={humanize(currentAccount.marketingConsentSource) ?? ""} readOnly />
            <p className="px-2 pt-1 text-[11.5px] leading-4 text-[var(--md-subtle)]">
              {t("A contact's own opt-out always wins, whatever this says.")}
            </p>
          </InlineFieldCard>

          <InlineFieldCard title="Additional fields" meta={customFields.length ? String(customFields.length) : undefined}>
            {customFields.length ? customFields.map((field) => (
              <div key={field.id} className="group grid grid-cols-[minmax(96px,0.7fr)_minmax(0,1fr)_auto] items-start gap-2">
                <InlineField
                  label={field.label}
                  value={field.value}
                  onSave={(value) => patch({ customFields: customFields.map((item) => item.id === field.id ? { ...item, value } : item) })}
                />
                <span />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${t("Remove")} ${field.label}`}
                  className="mt-0.5 size-7 shrink-0 rounded-[var(--md-radius-sm)] text-[var(--md-subtle)] opacity-0 transition-opacity duration-150 hover:text-[var(--md-red)] focus-visible:opacity-100 group-hover:opacity-100"
                  onClick={() => void patch({ customFields: customFields.filter((item) => item.id !== field.id) }).catch((cause) => toast.error(cause instanceof Error ? cause.message : t("That field could not be removed.")))}
                >
                  <Trash2 className="size-3.5" strokeWidth={1.5} />
                </Button>
              </div>
            )) : null}
            <AddCustomField onAdd={(label, value) => patch({ customFields: [...customFields, { id: label, label, value }] })} />
          </InlineFieldCard>
        </aside>
      </div>

      <MarketingConsentDialog
        open={consentOpen}
        onOpenChange={setConsentOpen}
        current={currentAccount.marketingOptIn}
        onSave={async (marketingOptIn, marketingConsentReason) => {
          await patch({ marketingOptIn, marketingConsentReason })
          toast.success(t(marketingOptIn ? "Marketing consent recorded" : "Marketing opt-out recorded"))
        }}
      />

      <ContactCreateDialog
        accounts={[currentAccount]}
        fixedAccountId={currentAccount.id}
        open={addContactOpen}
        onOpenChange={setAddContactOpen}
        onCreated={(contact) => { setReloadToken((value) => value + 1); navigate(`/crm/contacts/${contact.id}`) }}
      />
    </div>
  )
}

/** The account name, edited in place at heading size. */
function HeadingField({ value, onSave }: { value: string; onSave: (next: string) => Promise<void> }) {
  const { t } = useLanguage()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (!editing) setDraft(value) }, [value, editing])

  async function commit() {
    setEditing(false)
    const next = draft.trim()
    if (!next || next === value.trim()) { setDraft(value); return }
    setSaving(true)
    try {
      await onSave(next)
    } catch (error) {
      setDraft(value)
      toast.error(error instanceof Error ? error.message : t("The account name could not be saved."))
    } finally {
      setSaving(false)
    }
  }

  const headingClass = "text-[24px] font-medium leading-tight tracking-[-0.015em] text-[var(--md-ink)]"

  if (editing) {
    return (
      <Input
        autoFocus
        dir="auto"
        value={draft}
        aria-label={t("Account name")}
        onChange={(event) => setDraft(event.target.value)}
        onBlur={() => void commit()}
        onKeyDown={(event) => {
          if (event.key === "Enter") { event.preventDefault(); void commit() }
          if (event.key === "Escape") { event.preventDefault(); setDraft(value); setEditing(false) }
        }}
        className={`${headingClass} h-auto w-full rounded-[var(--md-radius-md)] border-0 bg-[var(--md-surface-soft)] px-2 py-0.5 shadow-[var(--md-shadow-line)] focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)]`}
      />
    )
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      dir="auto"
      className={`${headingClass} -mx-2 rounded-[var(--md-radius-md)] px-2 py-0.5 text-start outline-none transition-colors duration-150 hover:bg-[var(--md-hover)] focus-visible:ring-2 focus-visible:ring-[var(--md-accent-a24)] ${saving ? "opacity-60" : ""}`}
    >
      <h1>{value}</h1>
    </button>
  )
}

function AddCustomField({ onAdd }: { onAdd: (label: string, value: string) => Promise<void> }) {
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [label, setLabel] = useState("")
  const [value, setValue] = useState("")
  const [saving, setSaving] = useState(false)

  if (!open) {
    return (
      <Button type="button" variant="ghost" className="mt-1 h-8 w-fit rounded-[var(--md-radius-md)] px-2 text-[12px] active:scale-[0.96] motion-reduce:transform-none" onClick={() => setOpen(true)}>
        <Plus className="size-3.5" strokeWidth={1.5} />
        {t("Add a field")}
      </Button>
    )
  }

  async function save() {
    if (!label.trim()) return
    setSaving(true)
    try {
      await onAdd(label.trim(), value.trim())
      setLabel(""); setValue(""); setOpen(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t("That field could not be added."))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-1 grid gap-2 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] p-2 shadow-[var(--md-shadow-line)]">
      <Input autoFocus value={label} onChange={(event) => setLabel(event.target.value)} placeholder={t("Field name")} aria-label={t("Field name")} className="h-8 rounded-[var(--md-radius-sm)] border-0 bg-[var(--md-surface)] text-base shadow-[var(--md-shadow-line)] sm:text-[13px]" />
      <Input value={value} onChange={(event) => setValue(event.target.value)} placeholder={t("Value")} aria-label={t("Value")} className="h-8 rounded-[var(--md-radius-sm)] border-0 bg-[var(--md-surface)] text-base shadow-[var(--md-shadow-line)] sm:text-[13px]" />
      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" className="h-8 rounded-[var(--md-radius-sm)] px-2 text-[12px]" onClick={() => { setOpen(false); setLabel(""); setValue("") }}>{t("Cancel")}</Button>
        <Button type="button" disabled={saving || !label.trim()} className="h-8 rounded-[var(--md-radius-sm)] bg-[var(--md-accent)] px-2.5 text-[12px] text-[var(--md-accent-ink)] active:scale-[0.96] motion-reduce:transform-none" onClick={() => void save()}>{t("Add field")}</Button>
      </div>
    </div>
  )
}

function MarketingConsentDialog({ open, onOpenChange, current, onSave }: { open: boolean; onOpenChange: (open: boolean) => void; current: boolean; onSave: (optIn: boolean, reason: string) => Promise<void> }) {
  const { t } = useLanguage()
  const [optIn, setOptIn] = useState(current)
  const [reason, setReason] = useState("")
  const [saving, setSaving] = useState(false)

  useEffect(() => { if (open) { setOptIn(current); setReason("") } }, [open, current])

  const changed = optIn !== current

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[520px]">
        <DialogHeader className="text-start">
          <DialogTitle>{t("Marketing consent")}</DialogTitle>
          <DialogDescription>{t("This change is recorded against your name and the time you made it.")}</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-4 shadow-[var(--md-shadow-line)]">
            <MarketingOptInControl checked={optIn} onCheckedChange={setOptIn} />
          </div>
          <label className="grid gap-1.5 text-[13px] font-medium text-[var(--md-ink)]">
            {t("What is this based on?")}
            <Input value={reason} onChange={(event) => setReason(event.target.value)} placeholder={t("Signed agreement, call on 3 June, web form…")} className="h-10 rounded-[var(--md-radius-md)] bg-[var(--md-surface-soft)] text-base shadow-[var(--md-shadow-line)] sm:text-[14px]" />
            {changed && !reason.trim() ? <span className="text-[11.5px] font-normal text-[var(--md-text)]">{t("Needed before a consent change can be saved.")}</span> : null}
          </label>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={saving} onClick={() => onOpenChange(false)}>{t("Cancel")}</Button>
          <Button
            type="button"
            disabled={saving || !changed || !reason.trim()}
            className="bg-[var(--md-accent)] text-[var(--md-accent-ink)] active:scale-[0.96] motion-reduce:transform-none"
            onClick={async () => {
              setSaving(true)
              try { await onSave(optIn, reason.trim()); onOpenChange(false) }
              catch (error) { toast.error(error instanceof Error ? error.message : t("The consent change could not be saved.")) }
              finally { setSaving(false) }
            }}
          >
            {t(optIn ? "Record opt-in" : "Record opt-out")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const emptyAddress = { line1: null, line2: null, townCity: null, countyState: null, postZipCode: null, countryCode: null, mainEmail: null, mainPhone: null }
const defaultEngagement = { preferredChannel: null, allowThankYouMessages: true, allowFollowupMessages: true, allowWhatsApp: false, doNotOverContact: false, minHoursBetweenNonUrgentMessages: 24, notes: null }

function clampScore(value: string) {
  return Math.max(0, Math.min(100, Number(value) || 0))
}

function toDraft(account: ApiCustomerDetail): AccountDraft {
  const metadata = account.metadata ?? {}
  const fields = metadata.customFields && typeof metadata.customFields === "object" ? metadata.customFields as Record<string, unknown> : {}
  return {
    name: account.name,
    relationshipStatus: account.relationshipStatus,
    tier: account.tier,
    segment: account.segment,
    vertical: account.vertical,
    primaryMode: account.primaryMode,
    primaryTradeLane: account.primaryTradeLane,
    growthState: account.growthState,
    healthScore: account.healthScore,
    churnRiskScore: account.churnRiskScore,
    summary: account.summary,
    strategic: account.strategic,
    trainingAllowed: account.trainingAllowed,
    marketingOptIn: account.marketingOptIn,
    // Blank unless a consent change is being made, which is the only time the
    // endpoint requires one.
    marketingConsentReason: "",
    metadata,
    address: account.address ? { ...emptyAddress, ...account.address } : { ...emptyAddress },
    engagement: account.engagement ?? { ...defaultEngagement },
    customFields: Object.entries(fields).map(([label, value]) => ({ id: label, label, value: typeof value === "string" ? value : String(value) })),
  }
}

function Panel({ title, meta, action, children }: { title: string; meta?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <Surface padding="none" className="overflow-hidden rounded-[var(--md-radius-xl)]">
      <div className="flex items-center justify-between gap-3 px-5 py-4">
        <h2 className="text-[15px] font-medium text-[var(--md-ink)]">{title}</h2>
        {meta || action ? <div className="flex items-center gap-2">{meta ? <span className="text-[12px] text-[var(--md-text)]">{meta}</span> : null}{action}</div> : null}
      </div>
      {children}
    </Surface>
  )
}

function Metric({ label, value, tone = "neutral" }: { label: string; value: string; tone?: "neutral" | "amber" | "health" }) {
  if (tone === "health") {
    return (
      <Surface padding="none" className="md-dexter-pill relative overflow-hidden rounded-[var(--md-radius-xl)] text-white">
        <span aria-hidden="true" className="md-dexter-pill__shader"><SpectralBloomShader /></span>
        <span aria-hidden="true" className="md-dexter-pill__contrast" />
        <div className="relative z-10 flex min-h-14 items-center gap-3 px-4 py-2.5">
          <p className="min-w-0 flex-1 truncate text-[12px] text-white/72">{label}</p>
          <p className="shrink-0 text-[18px] font-medium tabular-nums text-white">{value}</p>
        </div>
      </Surface>
    )
  }
  return (
    <Surface padding="none" className="rounded-[var(--md-radius-xl)]">
      <div className="flex min-h-14 items-center gap-3 px-4 py-2.5">
        <p className="min-w-0 flex-1 truncate text-[12px] text-[var(--md-text)]">{label}</p>
        <p className={`shrink-0 text-[18px] font-medium tabular-nums ${tone === "amber" ? "text-[var(--md-amber)]" : "text-[var(--md-ink)]"}`}>{value}</p>
      </div>
    </Surface>
  )
}

function ActivityRow({ activity, last }: { activity: ApiCustomerDetail["activities"][number]; last: boolean }) {
  const { t } = useLanguage()
  return (
    <div className={`grid grid-cols-[10px_minmax(0,1fr)_auto] gap-3 px-5 py-4 ${last ? "" : "border-b border-[var(--md-line)]"}`}>
      <span className="mt-1.5 size-2 rounded-full bg-[var(--md-accent)] shadow-[0_0_0_4px_var(--md-accent-a08)]" />
      <div>
        <p className="text-[14px] font-medium text-[var(--md-ink)]">{activity.subject}</p>
        {activity.summary ? <p className="mt-1 text-[13px] leading-5 text-[var(--md-text)]">{activity.summary}</p> : null}
      </div>
      <p className="shrink-0 text-[12px] tabular-nums text-[var(--md-subtle)]">{relativeDate(activity.occurredAt, t)}</p>
    </div>
  )
}

function Empty({ text }: { text: string }) {
  return <p className="border-t border-[var(--md-line)] px-5 py-6 text-[13px] leading-5 text-[var(--md-text)]">{text}</p>
}

function humanize(value: string | null | undefined) {
  return value ? value.replace(/[_-]+/g, " ").replace(/^./, (letter) => letter.toUpperCase()) : null
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, { day: "numeric", month: "short", year: "numeric" }).format(new Date(value))
}

function relativeDate(value: string, t: (value: string) => string) {
  const days = Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000)
  if (days <= 0) return t("Today")
  if (days === 1) return t("Yesterday")
  if (days < 30) return `${days} ${t("days ago")}`
  return formatDate(value)
}
