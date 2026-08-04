import { useEffect, useState, type FormEvent } from "react"
import { LoaderCircle } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { useLanguage } from "@/i18n/language-provider"
import { createCustomerContact, type ApiCustomerContact } from "@/lib/customer-api"

type ContactAccount = { id: string; name: string }

type ContactDraft = {
  accountId: string
  firstName: string
  lastName: string
  email: string
  jobTitle: string
  department: string
  role: string
  marketingOptIn: boolean
  marketingConsentReason: string
}

const emptyDraft = (accountId = ""): ContactDraft => ({
  accountId,
  firstName: "",
  lastName: "",
  email: "",
  jobTitle: "",
  department: "",
  role: "",
  marketingOptIn: false,
  marketingConsentReason: "",
})

export function ContactCreateDialog({
  open,
  onOpenChange,
  accounts,
  fixedAccountId,
  onCreated,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  accounts: readonly ContactAccount[]
  fixedAccountId?: string
  onCreated: (contact: ApiCustomerContact) => void
}) {
  const { t } = useLanguage()
  const defaultAccountId = fixedAccountId ?? accounts[0]?.id ?? ""
  const accountIds = accounts.map((account) => account.id).join("|")
  const [draft, setDraft] = useState<ContactDraft>(() => emptyDraft(defaultAccountId))
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)

  useEffect(() => {
    setDraft((current) => {
      const accountId = fixedAccountId ?? (accounts.some((account) => account.id === current.accountId) ? current.accountId : defaultAccountId)
      return accountId === current.accountId ? current : { ...current, accountId }
    })
  }, [accountIds, accounts, defaultAccountId, fixedAccountId])

  function changeOpen(nextOpen: boolean) {
    setCreateError(null)
    onOpenChange(nextOpen)
  }

  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!draft.accountId) return
    setCreating(true)
    setCreateError(null)
    try {
      const contact = await createCustomerContact(draft.accountId, {
        firstName: draft.firstName || null,
        lastName: draft.lastName || null,
        email: draft.email,
        role: draft.role || null,
        jobTitle: draft.jobTitle || null,
        department: draft.department || null,
        marketingOptIn: draft.marketingOptIn,
        marketingConsentReason: draft.marketingConsentReason || null,
      })
      toast.success(t("Contact created"))
      setDraft(emptyDraft(fixedAccountId ?? draft.accountId))
      onOpenChange(false)
      onCreated(contact)
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : t("The contact could not be created. Check the details and try again."))
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={changeOpen}>
      <DialogContent className="max-h-[88vh] overflow-y-auto border-0 bg-[var(--md-surface)] text-[var(--md-ink)] shadow-[var(--md-shadow-lift)] sm:max-w-[620px]">
        <DialogHeader className="text-start">
          <DialogTitle>{t("New contact")}</DialogTitle>
          <DialogDescription>{t("Connect this person to an account and record only what helps the relationship now.")}</DialogDescription>
        </DialogHeader>
        <form className="grid gap-4" onSubmit={create}>
          <label className="grid gap-1.5 text-start text-[13px] font-medium">
            <span>{t("Account")} *</span>
            <select
              required
              disabled={Boolean(fixedAccountId)}
              value={draft.accountId}
              onChange={(event) => setDraft((current) => ({ ...current, accountId: event.target.value }))}
              className="h-10 rounded-[var(--md-radius-md)] bg-white/68 px-3 text-[16px] shadow-[var(--md-shadow-line)] outline-none disabled:cursor-default disabled:opacity-70 focus-visible:ring-[3px] focus-visible:ring-[var(--md-accent-a14)] sm:text-[14px]"
            >
              <option value="">{t("Choose an account")}</option>
              {accounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </label>
          <div className="grid gap-4 sm:grid-cols-2">
            <ContactField label={t("First name")} required={!draft.lastName} value={draft.firstName} onChange={(value) => setDraft((current) => ({ ...current, firstName: value }))} />
            <ContactField label={t("Last name")} required={!draft.firstName} value={draft.lastName} onChange={(value) => setDraft((current) => ({ ...current, lastName: value }))} />
          </div>
          <ContactField label={t("Work email")} type="email" required value={draft.email} onChange={(value) => setDraft((current) => ({ ...current, email: value }))} />
          <div className="grid gap-4 sm:grid-cols-2">
            <ContactField label={t("Job title")} value={draft.jobTitle} onChange={(value) => setDraft((current) => ({ ...current, jobTitle: value }))} />
            <ContactField label={t("Department")} value={draft.department} onChange={(value) => setDraft((current) => ({ ...current, department: value }))} />
          </div>
          <ContactField label={t("Relationship role")} value={draft.role} onChange={(value) => setDraft((current) => ({ ...current, role: value }))} />
          <label className="flex min-h-11 items-start gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-3 shadow-[var(--md-shadow-line)]">
            <Checkbox checked={draft.marketingOptIn} onCheckedChange={(checked) => setDraft((current) => ({ ...current, marketingOptIn: checked === true }))} className="mt-0.5" />
            <span>
              <span className="block text-[13px] font-medium text-[var(--md-ink)]">{t("Marketing opted in")}</span>
              <span className="mt-1 block text-[12px] leading-5 text-[var(--md-text)]">{t("Only enable this when the person has given a clear, recorded permission to receive marketing.")}</span>
            </span>
          </label>
          {draft.marketingOptIn ? <ContactField label={t("Consent source or evidence")} required value={draft.marketingConsentReason} onChange={(value) => setDraft((current) => ({ ...current, marketingConsentReason: value }))} /> : null}
          {createError ? <p role="alert" className="text-[13px] text-[var(--md-red)]">{createError}</p> : null}
          <DialogFooter>
            <Button type="button" variant="outline" disabled={creating} onClick={() => changeOpen(false)}>{t("Cancel")}</Button>
            <Button type="submit" disabled={creating || !draft.accountId || !draft.email || (!draft.firstName && !draft.lastName) || (draft.marketingOptIn && !draft.marketingConsentReason.trim())}>
              {creating ? <LoaderCircle className="size-4 animate-spin" /> : null}{t(creating ? "Creating contact…" : "Create contact")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function ContactField({ label, value, onChange, required, type = "text" }: { label: string; value: string; onChange: (value: string) => void; required?: boolean; type?: string }) {
  return <label className="grid gap-1.5 text-start text-[13px] font-medium text-[var(--md-ink)]"><span>{label}{required ? " *" : ""}</span><Input dir={type === "email" ? "ltr" : "auto"} type={type} required={required} value={value} onChange={(event) => onChange(event.target.value)} className="h-10 rounded-[var(--md-radius-md)] bg-white/68 text-[16px] shadow-[var(--md-shadow-line)] sm:text-[14px]" /></label>
}
