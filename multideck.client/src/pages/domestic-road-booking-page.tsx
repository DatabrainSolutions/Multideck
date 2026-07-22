import { useId, useMemo, useState, type ReactNode } from "react"
import { Check, ClipboardCheck, ExternalLink, Network, Package, Plus, Save, Search, SlidersHorizontal, Trash2, Truck } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { DexterActionPill } from "@/components/multideck/dexter-action-pill"
import { DexterDockedPage } from "@/components/multideck/dexter-companion-sidebar"
import { domesticRoadJobs } from "@/components/multideck/domestic-road-components"
import { Surface } from "@/components/multideck/surface"
import { useLanguage } from "@/i18n/language-provider"
import { cn } from "@/lib/utils"

type RoadLeg = {
  id: string
  role: string
  from: string
  to: string
  date: string
  carrier: string
}

type PalletDetail = {
  id: string
  type: string
  length: string
  width: string
  height: string
  weight: string
}

type AccountAddress = {
  id: string
  shortName: string
  contact: string
  address: string
}

type RoadCustomerAccount = {
  id: string
  code: string
  name: string
  contacts: Array<{ id: string; name: string; email: string }>
  addresses: AccountAddress[]
}

const initialLegs: RoadLeg[] = [
  { id: "collection", role: "Collection", from: "Jenkar · Leicester, GB", to: "Palletline local depot", date: "2026-07-23", carrier: "To be assigned" },
  { id: "linehaul", role: "Network linehaul", from: "Palletline local depot", to: "Palletline Scotland hub", date: "2026-07-23", carrier: "Palletline" },
  { id: "delivery", role: "Final delivery", from: "Palletline Scotland hub", to: "Bristol Retail DC · Bristol, GB", date: "2026-07-24", carrier: "To be assigned" },
]

const initialPalletDetails: PalletDetail[] = Array.from({ length: 4 }, (_, index) => ({
  id: `pallet-${index + 1}`,
  type: "Standard",
  length: "120",
  width: "100",
  height: "100",
  weight: "153",
}))

const roadCustomerAccounts: RoadCustomerAccount[] = [
  {
    id: "jenkar",
    code: "JEN-UK-001",
    name: "Jenkar",
    contacts: [
      { id: "jenkar-maya", name: "Maya Turner", email: "maya.turner@jenkar.co.uk" },
      { id: "jenkar-david", name: "David Reynolds", email: "david.reynolds@jenkar.co.uk" },
    ],
    addresses: [
      { id: "jenkar-leicester", shortName: "Leicester distribution centre", contact: "Maya Turner · 0116 496 8210", address: "Jenkar\nLeicester, GB\nLE3 2FG" },
      { id: "jenkar-bristol", shortName: "Bristol Retail DC", contact: "Bristol receiving · 0117 301 5240", address: "Jenkar\nBristol Retail DC\nBristol, GB\nBS11 0YB" },
    ],
  },
  {
    id: "marlow",
    code: "MAR-UK-004",
    name: "Marlow Apparel Ltd",
    contacts: [{ id: "marlow-sandra", name: "Sandra Hale", email: "sandra.hale@marlowapparel.co.uk" }],
    addresses: [
      { id: "marlow-london", shortName: "London buying office", contact: "Sandra Hale · 020 7946 0120", address: "Marlow Apparel Ltd\n42 Threadneedle Street\nLondon, GB\nEC2R 8AH" },
      { id: "marlow-felixstowe", shortName: "Felixstowe DC", contact: "Warehouse team · 01394 221100", address: "Marlow Apparel Ltd\nFelixstowe DC\nFelixstowe, GB\nIP11 3SY" },
    ],
  },
]

const inputClass = "h-9 rounded-[var(--md-radius-md)] text-[13px]"
const fieldLabelClass = "text-[11px] font-medium text-[var(--md-text)]"

function Field({
  label,
  children,
  className,
}: {
  label: string
  children: ReactNode
  className?: string
}) {
  return (
    <label className={cn("grid min-w-0 gap-1.5 text-start", className)}>
      <span className={fieldLabelClass}>{label}</span>
      {children}
    </label>
  )
}

function CustomerAccountSearch({
  value,
  onChange,
}: {
  value: string
  onChange: (accountId: string) => void
}) {
  const { direction, t } = useLanguage()
  const listId = useId()
  const [quickOpen, setQuickOpen] = useState(false)
  const [directoryOpen, setDirectoryOpen] = useState(false)
  const [quickQuery, setQuickQuery] = useState("")
  const [directoryAccountCode, setDirectoryAccountCode] = useState("")
  const [directoryCustomerName, setDirectoryCustomerName] = useState("")
  const [directoryContactQuery, setDirectoryContactQuery] = useState("")
  const [directoryAddressQuery, setDirectoryAddressQuery] = useState("")
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false)
  const selected = roadCustomerAccounts.find((account) => account.id === value)
  const includesQuery = (source: string, query: string) => !query.trim() || source.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())
  const quickMatches = roadCustomerAccounts.filter((account) => includesQuery(`${account.code} ${account.name}`, quickQuery))
  const directoryMatches = roadCustomerAccounts.filter((account) => (
    includesQuery(account.code, directoryAccountCode)
    && includesQuery(account.name, directoryCustomerName)
    && includesQuery(account.contacts.map((contact) => `${contact.name} ${contact.email}`).join(" "), directoryContactQuery)
    && includesQuery(account.addresses.map((address) => `${address.shortName} ${address.address}`).join(" "), directoryAddressQuery)
  ))
  const clearDirectoryCriteria = () => {
    setDirectoryAccountCode("")
    setDirectoryCustomerName("")
    setDirectoryContactQuery("")
    setDirectoryAddressQuery("")
  }
  const selectAccount = (accountId: string) => {
    onChange(accountId)
    setQuickOpen(false)
    setDirectoryOpen(false)
    clearDirectoryCriteria()
    setAdvancedSearchOpen(false)
  }

  return (
    <>
      <Popover open={quickOpen} onOpenChange={(nextOpen) => {
        setQuickOpen(nextOpen)
        if (!nextOpen) setQuickQuery("")
      }}>
        <div className="flex min-w-0 items-center gap-2">
          <PopoverTrigger asChild>
            <button type="button" role="combobox" aria-expanded={quickOpen} aria-controls={listId} aria-label={t("Select customer account")} className="flex h-9 min-w-0 flex-1 items-center rounded-[var(--md-radius-md)] bg-[var(--md-field-bg)] px-2.5 text-start text-[13px] text-[var(--md-ink)] shadow-[var(--md-shadow-line)] transition-[background-color,box-shadow] hover:bg-[var(--md-field-bg-hover)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              {selected ? <span className="min-w-0 truncate"><bdi dir="ltr" className="font-medium">{selected.code}</bdi><span className="text-[var(--md-subtle)]"> · </span><span>{selected.name}</span></span> : <span className="text-[var(--md-subtle)]">{t("No customer selected")}</span>}
            </button>
          </PopoverTrigger>
          <Button type="button" variant="outline" className="h-9 shrink-0 rounded-[var(--md-radius-md)] px-2.5 text-[12px]" onClick={() => { setQuickOpen(false); setDirectoryOpen(true) }} aria-label={t("Open customer account search")}>
            <Search className="size-3.5" strokeWidth={1.5} />
            {t("Search")}
          </Button>
        </div>
        <PopoverContent align="start" sideOffset={5} dir={direction} className="w-[min(420px,calc(100vw-24px))] rounded-[var(--md-radius-xl)] bg-[var(--md-surface)] p-1 shadow-[var(--md-shadow-lift)]">
          <div className="relative m-1"><Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} /><Input autoFocus value={quickQuery} onChange={(event) => setQuickQuery(event.target.value)} placeholder={t("Search customer by code or name")} aria-label={t("Search customer accounts")} className="h-8 rounded-[var(--md-radius-md)] ps-8 text-[12px]" /></div>
          <div id={listId} role="listbox" aria-label={t("Customer account options")} className="max-h-56 overflow-y-auto p-1 md-scrollbar">
            {quickMatches.map((account) => <button key={account.id} type="button" role="option" aria-selected={account.id === value} onClick={() => selectAccount(account.id)} className={cn("flex w-full items-center gap-3 rounded-[var(--md-radius-md)] px-2.5 py-2 text-start hover:bg-[var(--md-hover)]", account.id === value && "bg-[var(--md-selected-bg)]")}><bdi dir="ltr" className="w-24 shrink-0 text-[11px] font-medium text-[var(--md-accent)]">{account.code}</bdi><span className="min-w-0 truncate text-[12px] text-[var(--md-ink)]">{account.name}</span>{account.id === value ? <Check className="ms-auto size-3.5 shrink-0 text-[var(--md-accent)]" strokeWidth={1.6} /> : null}</button>)}
            {!quickMatches.length ? <p className="px-3 py-5 text-center text-[12px] text-[var(--md-subtle)]">{t("No matching customer accounts")}</p> : null}
          </div>
        </PopoverContent>
      </Popover>

      <Dialog open={directoryOpen} onOpenChange={(nextOpen) => { setDirectoryOpen(nextOpen); if (!nextOpen) { clearDirectoryCriteria(); setAdvancedSearchOpen(false) } }}>
        <DialogContent className="w-[calc(100vw-32px)] max-w-[860px] rounded-[var(--md-radius-xl)] border-[rgba(11,20,19,0.1)] bg-[var(--md-surface)] p-0 sm:max-w-[860px]" dir={direction}>
          <DialogHeader className="border-b border-[rgba(11,20,19,0.08)] px-5 py-4">
            <DialogTitle className="text-[17px] font-medium">{t("Search customer accounts")}</DialogTitle>
            <DialogDescription className="text-[12px] leading-5">{t("Search the account directory by customer name or account code, then select the account for this booking.")}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 px-5 py-4">
            <div className="grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)_auto]">
              <Field label={t("Account code")}><Input autoFocus value={directoryAccountCode} onChange={(event) => setDirectoryAccountCode(event.target.value)} placeholder={t("e.g. JEN-UK-001")} aria-label={t("Account code")} className={cn(inputClass, "bg-[var(--md-surface)]")} dir="ltr" /></Field>
              <Field label={t("Customer name")}><div className="relative"><Search className="pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2 text-[var(--md-subtle)]" strokeWidth={1.4} /><Input value={directoryCustomerName} onChange={(event) => setDirectoryCustomerName(event.target.value)} placeholder={t("Search customer name")} aria-label={t("Customer name")} className={cn(inputClass, "bg-[var(--md-surface)] ps-8")} /></div></Field>
              <div className="flex items-end gap-2"><Button type="button" variant="outline" className="h-9 rounded-[var(--md-radius-md)] px-2.5 text-[12px]" onClick={() => setAdvancedSearchOpen((current) => !current)} aria-expanded={advancedSearchOpen}><SlidersHorizontal className="size-3.5" strokeWidth={1.5} />{advancedSearchOpen ? t("Hide advanced") : t("Advanced search")}</Button><Button type="button" variant="ghost" className="h-9 rounded-[var(--md-radius-md)] px-2.5 text-[12px]" onClick={clearDirectoryCriteria}>{t("Clear")}</Button></div>
            </div>
            {advancedSearchOpen ? <div className="grid gap-3 rounded-[var(--md-radius-lg)] border border-[rgba(11,20,19,0.08)] p-3 sm:grid-cols-2"><Field label={t("Contact name or email")}><Input className={inputClass} value={directoryContactQuery} onChange={(event) => setDirectoryContactQuery(event.target.value)} placeholder={t("Search contact")} dir="auto" /></Field><Field label={t("Saved address, city or postcode")}><Input className={inputClass} value={directoryAddressQuery} onChange={(event) => setDirectoryAddressQuery(event.target.value)} placeholder={t("Search saved address")} dir="auto" /></Field></div> : null}
            <div className="overflow-hidden rounded-[var(--md-radius-lg)] border border-[rgba(11,20,19,0.08)]">
              <div className="hidden grid-cols-[140px_minmax(0,1fr)_110px_130px] gap-3 bg-[var(--md-surface-tint)] px-4 py-2 text-[11px] font-medium text-[var(--md-text)] sm:grid"><span>{t("Account code")}</span><span>{t("Customer")}</span><span>{t("Contacts")}</span><span>{t("Saved addresses")}</span></div>
              <div role="listbox" aria-label={t("Customer account search results")} className="divide-y divide-[rgba(11,20,19,0.07)]">
                {directoryMatches.map((account) => <button key={account.id} type="button" role="option" aria-selected={account.id === value} onClick={() => selectAccount(account.id)} className={cn("grid w-full gap-1 px-4 py-3 text-start transition-colors hover:bg-[var(--md-hover)] sm:grid-cols-[140px_minmax(0,1fr)_110px_130px] sm:items-center sm:gap-3", account.id === value && "bg-[var(--md-selected-bg)]")}><bdi dir="ltr" className="text-[12px] font-medium text-[var(--md-accent)]">{account.code}</bdi><span className="text-[13px] font-medium text-[var(--md-ink)]">{account.name}</span><span className="text-[12px] text-[var(--md-text)]">{account.contacts.length} {t("contacts")}</span><span className="text-[12px] text-[var(--md-text)]">{account.addresses.length} {t("saved addresses")}</span></button>)}
                {!directoryMatches.length ? <p className="px-4 py-10 text-center text-[13px] text-[var(--md-subtle)]">{t("No matching customer accounts")}</p> : null}
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-[rgba(11,20,19,0.08)] px-5 py-3"><Button type="button" variant="outline" className="h-8 rounded-[var(--md-radius-md)] px-3 text-[12px]" onClick={() => setDirectoryOpen(false)}>{t("Cancel")}</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

export function DomesticRoadBookingPage({ navigate, roadJobId }: { navigate: (path: string) => void; roadJobId?: string }) {
  const { t } = useLanguage()
  const viewedJob = roadJobId ? domesticRoadJobs.find((job) => job.id.toLocaleLowerCase() === roadJobId.toLocaleLowerCase()) : undefined
  const isExistingRoadJob = Boolean(viewedJob)
  const [dexterOpen, setDexterOpen] = useState(false)
  const [networkDistribution, setNetworkDistribution] = useState(() => !viewedJob || /pallet|next-day/i.test(viewedJob.service))
  const [network, setNetwork] = useState("Palletline")
  const [service, setService] = useState("Next-day")
  const [palletType, setPalletType] = useState("Standard")
  const [pallets, setPallets] = useState("4")
  const [weight, setWeight] = useState("612")
  const [goodsDescription, setGoodsDescription] = useState("Packaged components")
  const [productDetailsConfirmed, setProductDetailsConfirmed] = useState(false)
  const [palletDetailsOpen, setPalletDetailsOpen] = useState(false)
  const [palletDetails, setPalletDetails] = useState<PalletDetail[]>(initialPalletDetails)
  const [customerReference, setCustomerReference] = useState(viewedJob?.reference ?? "JK-PO-48230")
  const [accountId, setAccountId] = useState("jenkar")
  const [contactId, setContactId] = useState("jenkar-maya")
  const [collectionAddressId, setCollectionAddressId] = useState("jenkar-leicester")
  const [deliveryAddressId, setDeliveryAddressId] = useState("jenkar-bristol")
  const [collectionOverride, setCollectionOverride] = useState(false)
  const [deliveryOverride, setDeliveryOverride] = useState(false)
  const [tailLiftRequired, setTailLiftRequired] = useState(false)
  const [collectionOpeningTimes, setCollectionOpeningTimes] = useState("08:00–17:00")
  const [deliveryOpeningTimes, setDeliveryOpeningTimes] = useState("09:00–17:00")
  const [haulierBookingInstructions, setHaulierBookingInstructions] = useState("")
  const [specialInstructions, setSpecialInstructions] = useState("")
  const [manualCollectionAddress, setManualCollectionAddress] = useState(roadCustomerAccounts[0].addresses[0].address)
  const [manualDeliveryAddress, setManualDeliveryAddress] = useState(roadCustomerAccounts[0].addresses[1].address)
  const [legs, setLegs] = useState<RoadLeg[]>(initialLegs)

  const account = roadCustomerAccounts.find((item) => item.id === accountId) ?? roadCustomerAccounts[0]
  const contact = account.contacts.find((item) => item.id === contactId) ?? account.contacts[0]
  const collectionAddress = account.addresses.find((item) => item.id === collectionAddressId) ?? account.addresses[0]
  const deliveryAddress = account.addresses.find((item) => item.id === deliveryAddressId) ?? account.addresses.at(-1) ?? account.addresses[0]

  const journeySummary = useMemo(() => {
    if (viewedJob) return `${viewedJob.collection} → ${viewedJob.delivery}`
    return collectionAddress && deliveryAddress ? `${collectionAddress.shortName} → ${deliveryAddress.shortName}` : t("Route to be confirmed")
  }, [collectionAddress, deliveryAddress, t, viewedJob])

  function selectAccount(nextAccountId: string) {
    const nextAccount = roadCustomerAccounts.find((item) => item.id === nextAccountId)
    if (!nextAccount) return
    setAccountId(nextAccountId)
    setContactId(nextAccount.contacts[0]?.id ?? "")
    setCollectionAddressId(nextAccount.addresses[0]?.id ?? "")
    setDeliveryAddressId(nextAccount.addresses[1]?.id ?? nextAccount.addresses[0]?.id ?? "")
    setManualCollectionAddress(nextAccount.addresses[0]?.address ?? "")
    setManualDeliveryAddress(nextAccount.addresses[1]?.address ?? nextAccount.addresses[0]?.address ?? "")
    setCollectionOverride(false)
    setDeliveryOverride(false)
  }

  function addLeg() {
    setLegs((current) => [
      ...current,
      { id: `leg-${Date.now()}`, role: t("Additional leg"), from: "", to: "", date: "", carrier: "" },
    ])
  }

  function updateLeg(id: string, field: keyof Omit<RoadLeg, "id">, value: string) {
    setLegs((current) => current.map((leg) => leg.id === id ? { ...leg, [field]: value } : leg))
  }

  function removeLeg(id: string) {
    setLegs((current) => current.filter((leg) => leg.id !== id))
  }

  function updatePallet(id: string, field: keyof Omit<PalletDetail, "id">, value: string) {
    setPalletDetails((current) => current.map((pallet) => pallet.id === id ? { ...pallet, [field]: value } : pallet))
  }

  function addPallet() {
    setPalletDetails((current) => [...current, {
      id: `pallet-${Date.now()}`,
      type: "Standard",
      length: "120",
      width: "100",
      height: "100",
      weight: "",
    }])
  }

  function removePallet(id: string) {
    setPalletDetails((current) => current.length > 1 ? current.filter((pallet) => pallet.id !== id) : current)
  }

  function applyPalletDetails() {
    const totalWeight = palletDetails.reduce((total, pallet) => total + (Number(pallet.weight) || 0), 0)
    const types = Array.from(new Set(palletDetails.map((pallet) => pallet.type).filter(Boolean)))
    setPallets(String(palletDetails.length))
    setWeight(String(totalWeight))
    setPalletType(types.length === 1 ? types[0] : t("Mixed"))
    setPalletDetailsOpen(false)
  }

  function saveDraft() {
    if (viewedJob) {
      toast.success(t("Road job updated"), { description: `${viewedJob.id} ${t("has been updated.")}` })
      return
    }
    toast.success(t("Road job draft saved"), { description: t("Your route, cargo and service choices are ready to continue.") })
  }

  function createRoadJob() {
    if (viewedJob) {
      toast.success(t("Road job updated"), { description: `${viewedJob.id} ${t("is ready in Road control.")}` })
      navigate("/road-control")
      return
    }
    toast.success(t("Road job created"), { description: t("RD-10684 is ready in Road control." ) })
    navigate("/road-control")
  }

  return (
    <DexterDockedPage open={dexterOpen} onClose={() => setDexterOpen(false)} contextLabel={viewedJob ? `${t("Road job")} ${viewedJob.id}` : t("New domestic road job")} className="md-page md-page-stack">
      <header className="flex flex-wrap items-center justify-end gap-4">
        <h1 className="sr-only">{t("New domestic road job")}</h1>
        <div className="flex shrink-0 items-center gap-2">
          <DexterActionPill onClick={() => setDexterOpen(true)} />
          <Button type="button" variant="outline" className="h-9 rounded-[var(--md-radius-md)] px-3 text-[12px]" onClick={saveDraft}>
            <Save className="size-3.5" strokeWidth={1.5} />
            {isExistingRoadJob ? t("Save changes") : t("Save draft")}
          </Button>
          <Button type="button" className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[12px] text-white hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]" onClick={createRoadJob}>
            <Check className="size-3.5" strokeWidth={1.7} />
            {isExistingRoadJob ? t("Update road job") : t("Create road job")}
          </Button>
        </div>
      </header>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_290px]">
        <div className="grid gap-4">
          <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-accent)_10%,var(--md-surface))] text-[var(--md-accent)]"><Truck className="size-4" strokeWidth={1.5} /></span>
              <div>
                <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Customer and contact details")}</h2>
                <p className="mt-0.5 text-[12px] text-[var(--md-text)]">{t("Select the customer account first. Contacts and saved addresses follow the account record.")}</p>
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)]">
              <Field label={t("Customer account")}><CustomerAccountSearch value={account.id} onChange={selectAccount} /></Field>
              <Field label={t("Customer contact")}><select value={contact.id} onChange={(event) => setContactId(event.target.value)} className={cn(inputClass, "premium-stroke-soft w-full bg-[var(--md-field-bg)] px-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}>{account.contacts.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>
              <Field label={t("Customer reference")}><Input className={inputClass} value={customerReference} onChange={(event) => setCustomerReference(event.target.value)} dir="ltr" /></Field>
            </div>
            <p className="mt-2 text-[11px] text-[var(--md-text)]">{contact.email}</p>
          </Surface>

          <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-4">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-[var(--md-radius-md)] bg-[rgba(216,145,35,0.12)] text-[var(--md-amber)]"><ClipboardCheck className="size-4" strokeWidth={1.5} /></span>
                <div>
                  <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Warehouse job details")}</h2>
                  <p className="mt-0.5 text-[12px] text-[var(--md-text)]">{t("Keep the linked goods-out job, pick progress and road cargo details aligned.")}</p>
                </div>
              </div>
              <span className="inline-flex h-7 items-center rounded-full bg-[rgba(216,145,35,0.12)] px-2.5 text-[11px] font-medium text-[var(--md-amber)]">{t("Picking")}</span>
            </div>
            <div className="grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 md:grid-cols-2 xl:grid-cols-4">
              <div className="grid content-start gap-1">
                <span className={fieldLabelClass}>{t("Goods-out job")}</span>
                <button type="button" className="inline-flex w-fit items-center gap-1 text-[13px] font-medium text-[var(--md-accent)] hover:underline" onClick={() => navigate("/warehouse/goods-out")}><bdi dir="ltr">GOUT-6710</bdi><ExternalLink className="size-3.5" strokeWidth={1.5} /></button>
              </div>
              <div className="grid content-start gap-1">
                <span className={fieldLabelClass}>{t("Pick status")}</span>
                <button type="button" className="w-fit text-[13px] font-medium text-[var(--md-ink)] hover:text-[var(--md-accent)] hover:underline" onClick={() => navigate("/warehouse/goods-out")}>{t("Picking")}</button>
              </div>
              <div className="grid content-start gap-1">
                <span className={fieldLabelClass}>{t("Product details")}</span>
                <span className="truncate text-[13px] font-medium text-[var(--md-ink)]" dir="auto">{goodsDescription || t("No goods description")}</span>
              </div>
              <div className="grid content-start gap-1">
                <span className={fieldLabelClass}>{t("Outbound quantity")}</span>
                <span className="text-[13px] font-medium text-[var(--md-ink)]"><bdi dir="ltr">{pallets || "0"}</bdi> {t(palletType.toLowerCase())} · <bdi dir="ltr">{weight || "0"} kg</bdi></span>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2.5">
              <p className="text-[12px] text-[var(--md-text)]">{t("The goods description, pallet type, quantity and gross weight mirror the road booking above.")}</p>
              <Button type="button" variant={productDetailsConfirmed ? "outline" : "secondary"} className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px]" onClick={() => setProductDetailsConfirmed((current) => !current)}>{productDetailsConfirmed ? <Check className="size-3.5" strokeWidth={1.6} /> : null}{productDetailsConfirmed ? t("Product details confirmed") : t("Confirm product details")}</Button>
            </div>
          </Surface>

          <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-[var(--md-radius-md)] bg-[rgba(68,128,165,0.1)] text-[var(--md-blue)]"><Package className="size-4" strokeWidth={1.5} /></span>
              <div>
                <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Collection, delivery and cargo")}</h2>
                <p className="mt-0.5 text-[12px] text-[var(--md-text)]">{t("Capture the detail a carrier needs before planning begins.")}</p>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-2">
              <div className="grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3">
                <Field label={t("Saved collection address")}><select value={collectionAddress.id} disabled={collectionOverride} onChange={(event) => { setCollectionAddressId(event.target.value); const next = account.addresses.find((item) => item.id === event.target.value); if (next) setManualCollectionAddress(next.address) }} className={cn(inputClass, "premium-stroke-soft w-full bg-[var(--md-field-bg)] px-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-55")}>{account.addresses.map((address) => <option key={address.id} value={address.id}>{address.shortName}</option>)}</select></Field>
                <label className="flex items-center gap-2 text-[11px] font-medium text-[var(--md-text)]"><input type="checkbox" checked={collectionOverride} onChange={(event) => setCollectionOverride(event.target.checked)} className="size-3.5 rounded border-[var(--md-subtle)] accent-[var(--md-accent)]" />{t("Override saved address")}</label>
                <Textarea className="min-h-[88px] rounded-[var(--md-radius-md)] text-[13px]" value={collectionOverride ? manualCollectionAddress : collectionAddress.address} readOnly={!collectionOverride} onChange={(event) => setManualCollectionAddress(event.target.value)} dir="auto" />
                {!collectionOverride ? <p className="-mt-1 text-[11px] text-[var(--md-text)]">{collectionAddress.contact}</p> : <p className="-mt-1 text-[11px] text-[var(--md-amber)]">{t("Manual address override — this does not amend the account record.")}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("Ready date")}><Input className={inputClass} type="date" defaultValue="2026-07-23" /></Field>
                  <Field label={t("Collection window")}><Input className={inputClass} defaultValue="08:00–12:00" dir="ltr" /></Field>
                </div>
              </div>
              <div className="grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3">
                <Field label={t("Saved delivery address")}><select value={deliveryAddress.id} disabled={deliveryOverride} onChange={(event) => { setDeliveryAddressId(event.target.value); const next = account.addresses.find((item) => item.id === event.target.value); if (next) setManualDeliveryAddress(next.address) }} className={cn(inputClass, "premium-stroke-soft w-full bg-[var(--md-field-bg)] px-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-55")}>{account.addresses.map((address) => <option key={address.id} value={address.id}>{address.shortName}</option>)}</select></Field>
                <label className="flex items-center gap-2 text-[11px] font-medium text-[var(--md-text)]"><input type="checkbox" checked={deliveryOverride} onChange={(event) => setDeliveryOverride(event.target.checked)} className="size-3.5 rounded border-[var(--md-subtle)] accent-[var(--md-accent)]" />{t("Override saved address")}</label>
                <Textarea className="min-h-[88px] rounded-[var(--md-radius-md)] text-[13px]" value={deliveryOverride ? manualDeliveryAddress : deliveryAddress.address} readOnly={!deliveryOverride} onChange={(event) => setManualDeliveryAddress(event.target.value)} dir="auto" />
                {!deliveryOverride ? <p className="-mt-1 text-[11px] text-[var(--md-text)]">{deliveryAddress.contact}</p> : <p className="-mt-1 text-[11px] text-[var(--md-amber)]">{t("Manual address override — this does not amend the account record.")}</p>}
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("Required delivery")}><Input className={inputClass} type="date" defaultValue="2026-07-24" /></Field>
                  <Field label={t("Delivery restriction")}><Input className={inputClass} defaultValue={t("Booking required")} dir="auto" /></Field>
                </div>
              </div>
            </div>
            <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_110px_130px_120px]">
              <Field label={t("Goods description")}><Input className={inputClass} value={goodsDescription} onChange={(event) => setGoodsDescription(event.target.value)} dir="auto" /></Field>
              <Field label={t("Pallets")}><Input className={inputClass} type="number" min="1" value={pallets} onChange={(event) => setPallets(event.target.value)} /></Field>
              <Field label={t("Pallet type")}><select value={palletType} onChange={(event) => setPalletType(event.target.value)} className={cn(inputClass, "premium-stroke-soft w-full bg-[var(--md-field-bg)] px-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}><option>{t("Standard")}</option><option>{t("Euro")}</option><option>{t("Half pallet")}</option><option>{t("Oversize")}</option></select></Field>
              <Field label={t("Gross weight (kg)")}><Input className={inputClass} type="number" min="0" value={weight} onChange={(event) => setWeight(event.target.value)} /></Field>
            </div>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] px-3 py-2.5">
              <p className="text-[12px] text-[var(--md-text)]">{t("Set pallet dimensions and weights individually for accurate carrier and network planning.")}</p>
              <Button type="button" variant="outline" className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px]" onClick={() => setPalletDetailsOpen(true)}>{t("Configure pallets")}</Button>
            </div>
          </Surface>

          <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-[var(--md-radius-md)] bg-[rgba(46,142,96,0.1)] text-[var(--md-green)]"><Network className="size-4" strokeWidth={1.5} /></span>
                <div>
                  <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Service model")}</h2>
                  <p className="mt-0.5 text-[12px] text-[var(--md-text)]">{t("Choose direct capacity or a consolidated distribution network.")}</p>
                </div>
              </div>
              <label className="flex items-center gap-2 text-[12px] font-medium text-[var(--md-ink)]">
                <Switch checked={networkDistribution} onCheckedChange={setNetworkDistribution} aria-label={t("Use network distribution")} />
                {t("Network distribution")}
              </label>
            </div>

            {networkDistribution ? (
              <div className="mt-4 grid gap-3 rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-accent)_6%,var(--md-surface))] p-3 md:grid-cols-3">
                <Field label={t("Network programme")}>
                  <select value={network} onChange={(event) => setNetwork(event.target.value)} className={cn(inputClass, "premium-stroke-soft w-full bg-[var(--md-field-bg)] px-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}>
                    <option>Palletline</option><option>Pall-Ex</option><option>The Pallet Network</option><option>{t("Customer nominated")}</option>
                  </select>
                </Field>
                <Field label={t("Service level")}>
                  <select value={service} onChange={(event) => setService(event.target.value)} className={cn(inputClass, "premium-stroke-soft w-full bg-[var(--md-field-bg)] px-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}>
                    <option>{t("Economy 48")}</option><option>{t("Next-day")}</option><option>{t("Timed AM")}</option><option>{t("Saturday")}</option>
                  </select>
                </Field>
                <div className="rounded-[var(--md-radius-md)] bg-white/60 px-3 py-2.5 text-[12px] text-[var(--md-text)] shadow-[var(--md-shadow-line)]">
                  <span className="block font-medium text-[var(--md-ink)]">{t("UK pallet network")}</span>
                  <span className="mt-1 block">{t("Use the local network configuration when this service model is available in the selected market.")}</span>
                </div>
              </div>
            ) : (
              <div className="mt-4 grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 md:grid-cols-3">
                <Field label={t("Vehicle requirement")}><Input className={inputClass} defaultValue={t("Dedicated 7.5t")} /></Field>
                <Field label={t("Trailer / body")}><Input className={inputClass} defaultValue={t("Curtainsider")} /></Field>
                <Field label={t("Carrier preference")}><Input className={inputClass} placeholder={t("Optional") } /></Field>
              </div>
            )}
          </Surface>

          <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-4">
            <div className="mb-4 flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-[var(--md-radius-md)] bg-[color-mix(in_srgb,var(--md-accent)_10%,var(--md-surface))] text-[var(--md-accent)]"><Truck className="size-4" strokeWidth={1.5} /></span>
              <div>
                <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Service options")}</h2>
                <p className="mt-0.5 text-[12px] text-[var(--md-text)]">{t("Record site access, operating hours and any instructions the haulier needs to deliver the job.")}</p>
              </div>
            </div>
            <div className="grid gap-3 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
              <div className="grid gap-3 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3">
                <label className="flex items-center justify-between gap-3 rounded-[var(--md-radius-md)] bg-[var(--md-surface)] px-3 py-2.5 shadow-[var(--md-shadow-line)]">
                  <span>
                    <span className="block text-[12px] font-medium text-[var(--md-ink)]">{t("Tail lift required")}</span>
                    <span className="mt-0.5 block text-[11px] text-[var(--md-text)]">{t("Required for collection or delivery access.")}</span>
                  </span>
                  <Switch checked={tailLiftRequired} onCheckedChange={setTailLiftRequired} aria-label={t("Tail lift required")} />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label={t("Collection opening times")}><Input className={inputClass} value={collectionOpeningTimes} onChange={(event) => setCollectionOpeningTimes(event.target.value)} dir="ltr" /></Field>
                  <Field label={t("Delivery opening times")}><Input className={inputClass} value={deliveryOpeningTimes} onChange={(event) => setDeliveryOpeningTimes(event.target.value)} dir="ltr" /></Field>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label={t("Haulier booking instructions")}><Textarea className="min-h-[108px] rounded-[var(--md-radius-md)] text-[13px]" value={haulierBookingInstructions} onChange={(event) => setHaulierBookingInstructions(event.target.value)} placeholder={t("Add portal, contact, reference or booking-in requirements")} dir="auto" /></Field>
                <Field label={t("Special instructions")}><Textarea className="min-h-[108px] rounded-[var(--md-radius-md)] text-[13px]" value={specialInstructions} onChange={(event) => setSpecialInstructions(event.target.value)} placeholder={t("Add access, handling or site requirements")} dir="auto" /></Field>
              </div>
            </div>
          </Surface>

          <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-4">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h2 className="text-[14px] font-medium text-[var(--md-ink)]">{t("Operational legs")}</h2>
                <p className="mt-0.5 text-[12px] text-[var(--md-text)]">{t("Show the collection, consolidation and final-delivery movements that operations will manage.")}</p>
              </div>
              <Button type="button" variant="outline" className="h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px]" onClick={addLeg}><Plus className="size-3.5" strokeWidth={1.5} />{t("Add leg")}</Button>
            </div>
            <div className="grid gap-2.5">
              {legs.map((leg, index) => (
                <div key={leg.id} className="relative rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 ps-12">
                  <span className="absolute start-3 top-3 grid size-6 place-items-center rounded-full bg-[var(--md-accent)] text-[11px] font-medium text-white">{index + 1}</span>
                  <div className="grid min-w-0 gap-3 pe-10 sm:grid-cols-2 xl:grid-cols-3">
                    <Field label={t("Leg role")}><Input className={inputClass} value={leg.role} onChange={(event) => updateLeg(leg.id, "role", event.target.value)} /></Field>
                    <Field label={t("From")}><Input className={inputClass} value={leg.from} onChange={(event) => updateLeg(leg.id, "from", event.target.value)} dir="auto" /></Field>
                    <Field label={t("To")}><Input className={inputClass} value={leg.to} onChange={(event) => updateLeg(leg.id, "to", event.target.value)} dir="auto" /></Field>
                    <Field label={t("Movement date")}><Input className={inputClass} type="date" value={leg.date} onChange={(event) => updateLeg(leg.id, "date", event.target.value)} /></Field>
                    <Field label={t("Carrier")}><Input className={inputClass} value={leg.carrier} onChange={(event) => updateLeg(leg.id, "carrier", event.target.value)} dir="auto" /></Field>
                  </div>
                  <Button type="button" variant="ghost" size="icon" className="absolute end-3 top-3 size-8 rounded-[var(--md-radius-md)] text-[var(--md-red)] hover:bg-[rgba(192,57,43,0.08)]" aria-label={t("Remove leg")} onClick={() => removeLeg(leg.id)} disabled={legs.length === 1}><Trash2 className="size-3.5" strokeWidth={1.5} /></Button>
                </div>
              ))}
            </div>
          </Surface>
        </div>

        <aside className="sticky top-[72px] grid gap-3">
          <Surface padding="none" className="rounded-[var(--md-radius-xl)] p-4">
            <p className="text-[12px] font-medium text-[var(--md-text)]">{t("Road job summary")}</p>
            <p className="mt-2 text-[17px] font-medium text-[var(--md-ink)]">{networkDistribution ? t("Network distribution") : t("Direct vehicle")}</p>
            <p className="mt-2 text-[12px] leading-5 text-[var(--md-text)]" dir="auto">{journeySummary}</p>
            <dl className="mt-4 grid gap-3 border-t border-[rgba(11,20,19,0.08)] pt-4 text-[12px]">
              <div className="flex items-center justify-between gap-3"><dt className="text-[var(--md-text)]">{t("Customer ref")}</dt><dd dir="ltr" className="font-medium text-[var(--md-ink)]">{customerReference || "—"}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-[var(--md-text)]">{t("Cargo")}</dt><dd className="font-medium text-[var(--md-ink)]">{pallets || "0"} {t(palletType.toLowerCase())}</dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-[var(--md-text)]">{t("Weight")}</dt><dd className="font-medium text-[var(--md-ink)]"><bdi dir="ltr">{weight || "0"} kg</bdi></dd></div>
              <div className="flex items-center justify-between gap-3"><dt className="text-[var(--md-text)]">{t("Service")}</dt><dd className="font-medium text-[var(--md-ink)]">{networkDistribution ? `${network} · ${t(service)}` : t("Direct")}</dd></div>
            </dl>
          </Surface>
          <Surface padding="none" className="rounded-[var(--md-radius-xl)] bg-[color-mix(in_srgb,var(--md-amber)_8%,var(--md-surface))] p-4">
            <p className="text-[12px] font-medium text-[var(--md-ink)]">{t("Planner handoff")}</p>
            <p className="mt-1 text-[12px] leading-5 text-[var(--md-text)]">{networkDistribution ? t("The next step is to select a member carrier or request the network service.") : t("The next step is to source capacity and confirm the vehicle.")}</p>
          </Surface>
        </aside>
      </div>

      <Dialog open={palletDetailsOpen} onOpenChange={setPalletDetailsOpen}>
        <DialogContent className="w-[calc(100vw-32px)] max-w-[960px] rounded-[var(--md-radius-xl)] p-0 sm:max-w-[960px]">
          <DialogHeader className="border-b border-[rgba(11,20,19,0.08)] px-5 py-4">
            <DialogTitle>{t("Pallet specification")}</DialogTitle>
            <DialogDescription>{t("Record each pallet's footprint, height and gross weight. These details support carrier selection, network constraints and pricing.")}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] overflow-y-auto px-5 py-4">
            <div className="grid gap-2.5">
              <div className="hidden grid-cols-[32px_minmax(120px,1fr)_repeat(4,minmax(76px,0.6fr))_32px] gap-2 px-2 text-[11px] font-medium text-[var(--md-text)] md:grid">
                <span>#</span><span>{t("Pallet type")}</span><span>{t("Length")}</span><span>{t("Width")}</span><span>{t("Height")}</span><span>{t("Weight")}</span><span />
              </div>
              {palletDetails.map((pallet, index) => (
                <div key={pallet.id} className="grid gap-2 rounded-[var(--md-radius-lg)] bg-[var(--md-surface-tint)] p-3 md:grid-cols-[32px_minmax(120px,1fr)_repeat(4,minmax(76px,0.6fr))_32px] md:items-end">
                  <span className="self-start grid size-6 place-items-center rounded-full bg-[var(--md-accent)] text-[11px] font-medium text-white">{index + 1}</span>
                  <Field label={t("Pallet type")}><select value={pallet.type} onChange={(event) => updatePallet(pallet.id, "type", event.target.value)} className={cn(inputClass, "premium-stroke-soft w-full bg-[var(--md-field-bg)] px-2.5 outline-none focus-visible:ring-3 focus-visible:ring-ring/50")}><option>{t("Standard")}</option><option>{t("Euro")}</option><option>{t("Half pallet")}</option><option>{t("Oversize")}</option></select></Field>
                  <Field label={`${t("Length")} (cm)`}><Input className={inputClass} type="number" min="0" value={pallet.length} onChange={(event) => updatePallet(pallet.id, "length", event.target.value)} /></Field>
                  <Field label={`${t("Width")} (cm)`}><Input className={inputClass} type="number" min="0" value={pallet.width} onChange={(event) => updatePallet(pallet.id, "width", event.target.value)} /></Field>
                  <Field label={`${t("Height")} (cm)`}><Input className={inputClass} type="number" min="0" value={pallet.height} onChange={(event) => updatePallet(pallet.id, "height", event.target.value)} /></Field>
                  <Field label={`${t("Weight")} (kg)`}><Input className={inputClass} type="number" min="0" value={pallet.weight} onChange={(event) => updatePallet(pallet.id, "weight", event.target.value)} /></Field>
                  <Button type="button" variant="ghost" size="icon" className="size-8 rounded-[var(--md-radius-md)] text-[var(--md-red)] hover:bg-[rgba(192,57,43,0.08)]" aria-label={t("Remove pallet")} onClick={() => removePallet(pallet.id)} disabled={palletDetails.length === 1}><Trash2 className="size-3.5" strokeWidth={1.5} /></Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="outline" className="mt-3 h-8 rounded-[var(--md-radius-md)] px-2.5 text-[12px]" onClick={addPallet}><Plus className="size-3.5" strokeWidth={1.5} />{t("Add pallet")}</Button>
          </div>
          <DialogFooter className="border-t border-[rgba(11,20,19,0.08)] px-5 py-4">
            <Button type="button" variant="outline" className="h-9 rounded-[var(--md-radius-md)] px-3 text-[12px]" onClick={() => setPalletDetailsOpen(false)}>{t("Cancel")}</Button>
            <Button type="button" className="h-9 rounded-[var(--md-radius-md)] bg-[var(--md-accent)] px-3 text-[12px] text-white hover:bg-[color-mix(in_srgb,var(--md-accent),black_8%)]" onClick={applyPalletDetails}>{t("Apply pallet details")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </DexterDockedPage>
  )
}
