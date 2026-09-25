import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Calculator, LoaderCircle, RefreshCw, ShieldCheck } from "@/components/icons/hugeicons"
import { SettingsPageHeader, SettingsPanel } from "@/components/multideck/settings-components"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { useLanguage } from "@/i18n/language-provider"
import { hasPermission, type AuthUserSummary } from "@/lib/auth-user"
import { suggestUkVatQuarter } from "@/lib/uk-vat-quarter.mts"
import { beginHmrcVatConnection, getHmrcVatConnections, refreshHmrcVatConnection, type HmrcVatConnection } from "@/lib/hmrc-vat-api"
import {
  backfillUkVatPostedLines, calculateUkVatDraft, getUkVatAccount, getUkVatCalculationDetail, getUkVatCoverage, getUkVatEntities,
  getUkVatTaxPostingInventory,
  getUkVatControlReviews, reviewUkVatControl, getUkVatFilingProjectionPreview,
  getUkVatFilingProjections, reviewUkVatFilingProjection,
  getUkVatReviewLocks, lockUkVatReview, reopenUkVatReview,
  getUkVatFilingStatus, confirmUkVatFilingApproval, revokeUkVatFilingApproval,
  getUkVatPeriods, getUkVatReviewQueue, prepareUkVatDraftPeriod, reconcileUkVatTransactions,
  getUkVatPriorPeriodErrors, previewUkVatPriorPeriodErrors, recordUkVatPriorPeriodError, reviewUkVatPriorErrorConduct,
  getUkVatPriorErrorTimeLimitHistory, reviewUkVatPriorErrorTimeLimit,
  getUkVatMethod1OffsetNominals, getUkVatMethod1Plans, reviewUkVatMethod1Plan,
  getUkVatMethod1Postings, postUkVatMethod1Plan,
  getUkVatExternalErrorNotifications, recordUkVatExternalErrorNotification,
  getUkVatCashPaymentDateQueue, getUkVatCashSourcePreview, getUkVatCashEventProjections,
  recordUkVatCashEventProjection, reviewUkVatCashPaymentDate,
  getUkVatClawbackCandidates, getUkVatSupplierInputTaxHistory,
  getUkVatSupplierInputTaxSource, prepareUkVatFirstInputTaxRepayment,
  reviewUkVatFirstInputTaxRepayment, postUkVatFirstInputTaxRepayment,
  reviewUkVatLaterInputTaxRestoration, postUkVatLaterInputTaxRestoration,
  findUkVatCreditCandidates, linkUkVatCredit,
  getUkVatRegistration, configureUkVatRegistration, scheduleUkVatRegistration,
  reviewUkVatEvidence, type UkVatAccount, type UkVatCalculationDetail, type UkVatCoverage, type UkVatPeriodList,
  type UkVatReviewItem, type UkVatReviewQueue, type UkVatTaxPostingInventory, type UkVatControlReviews,
  type UkVatFilingProjectionPreview, type UkVatFilingProjections,
  type UkVatReviewLocks,
  type UkVatFilingStatus,
  type UkVatRegistration,
  type UkVatCreditCandidate,
  type UkVatClawbackCandidates,
  type UkVatSupplierInputTaxSource, type UkVatSupplierInputTaxHistory,
  type UkVatPriorPeriodErrorIntake,
  type UkVatPriorPeriodErrorPreview,
  type UkVatPriorErrorTimeLimitHistory,
  type UkVatMethod1OffsetNominals, type UkVatMethod1Plans, type UkVatMethod1Postings,
  type UkVatExternalErrorNotifications,
  type UkVatCashPaymentDateQueue, type UkVatCashSourcePreview, type UkVatCashEventProjectionHistory,
} from "@/lib/finance-subledger-api"

type Entity = Awaited<ReturnType<typeof getUkVatEntities>>["entities"][number]
const message = (cause: unknown) => cause instanceof Error ? cause.message : "The VAT request could not be completed."

export function FinanceVatPage({ currentUser, navigate }: { currentUser?: AuthUserSummary | null; navigate: (path: string) => void }) {
  const { t, language } = useLanguage()
  const canManage = hasPermission(currentUser, "Finance.Compliance.Manage")
  const canOpenPayables = hasPermission(currentUser, "Finance.Payables.View")
  const [entities, setEntities] = useState<Entity[]>([])
  const [entityId, setEntityId] = useState("")
  const [registration, setRegistration] = useState<UkVatRegistration | null>(null)
  const [registrationVrn, setRegistrationVrn] = useState("")
  const [registrationScheme, setRegistrationScheme] = useState<"standard">("standard")
  const [registrationEffectiveFrom, setRegistrationEffectiveFrom] = useState("")
  const [invoiceBasisConfirmed, setInvoiceBasisConfirmed] = useState(false)
  const [revisionOpen, setRevisionOpen] = useState(false)
  const [revisionVrn, setRevisionVrn] = useState("")
  const [revisionScheme, setRevisionScheme] = useState<"standard">("standard")
  const [revisionEffectiveFrom, setRevisionEffectiveFrom] = useState("")
  const [revisionReason, setRevisionReason] = useState("")
  const [revisionInvoiceConfirmed, setRevisionInvoiceConfirmed] = useState(false)
  const [periods, setPeriods] = useState<UkVatPeriodList | null>(null)
  const [coverage, setCoverage] = useState<UkVatCoverage | null>(null)
  const [clawback, setClawback] = useState<UkVatClawbackCandidates | null>(null)
  const [clawbackError, setClawbackError] = useState<string | null>(null)
  const [clawbackRefresh, setClawbackRefresh] = useState(0)
  const [supplierDocumentId, setSupplierDocumentId] = useState<string | null>(null)
  const [supplierKind, setSupplierKind] = useState<"first" | "later">("first")
  const [supplierSource, setSupplierSource] = useState<UkVatSupplierInputTaxSource | null>(null)
  const [supplierHistory, setSupplierHistory] = useState<UkVatSupplierInputTaxHistory | null>(null)
  const [supplierError, setSupplierError] = useState<string | null>(null)
  const [supplierRefresh, setSupplierRefresh] = useState(0)
  const [supplierPrepareReason, setSupplierPrepareReason] = useState("")
  const [supplierReviewReason, setSupplierReviewReason] = useState("")
  const [supplierPostReason, setSupplierPostReason] = useState("")
  const [supplierOffsetNominalId, setSupplierOffsetNominalId] = useState("")
  const [supplierReviewConfirmed, setSupplierReviewConfirmed] = useState(false)
  const [supplierPostConfirmed, setSupplierPostConfirmed] = useState(false)
  const [queue, setQueue] = useState<UkVatReviewQueue | null>(null)
  const [periodId, setPeriodId] = useState("")
  const [detail, setDetail] = useState<UkVatCalculationDetail | null>(null)
  const [account, setAccount] = useState<UkVatAccount | null>(null)
  const [accountOffset, setAccountOffset] = useState(0)
  const [accountRefresh, setAccountRefresh] = useState(0)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [creditLinkId, setCreditLinkId] = useState("")
  const [creditSearch, setCreditSearch] = useState("")
  const [creditCandidates, setCreditCandidates] = useState<UkVatCreditCandidate[] | null>(null)
  const [creditOriginalId, setCreditOriginalId] = useState("")
  const [creditReason, setCreditReason] = useState("")
  const [creditBusy, setCreditBusy] = useState(false)
  const [creditError, setCreditError] = useState<string | null>(null)
  const [taxPostings, setTaxPostings] = useState<UkVatTaxPostingInventory | null>(null)
  const [taxPostingOffset, setTaxPostingOffset] = useState(0)
  const [taxPostingError, setTaxPostingError] = useState<string | null>(null)
  const [controlReviews, setControlReviews] = useState<UkVatControlReviews | null>(null)
  const [controlReviewError, setControlReviewError] = useState<string | null>(null)
  const [controlRefresh, setControlRefresh] = useState(0)
  const [controlReason, setControlReason] = useState("")
  const [filingPreview, setFilingPreview] = useState<UkVatFilingProjectionPreview | null>(null)
  const [filingReviews, setFilingReviews] = useState<UkVatFilingProjections | null>(null)
  const [filingError, setFilingError] = useState<string | null>(null)
  const [filingReason, setFilingReason] = useState("")
  const [filingRefresh, setFilingRefresh] = useState(0)
  const [reviewLocks, setReviewLocks] = useState<UkVatReviewLocks | null>(null)
  const [filingStatus, setFilingStatus] = useState<UkVatFilingStatus | null>(null)
  const [filingStatusError, setFilingStatusError] = useState<string | null>(null)
  const [declarationConfirmed, setDeclarationConfirmed] = useState(false)
  const [revocationReason, setRevocationReason] = useState("")
  const [hmrcConnections, setHmrcConnections] = useState<HmrcVatConnection[] | null>(null)
  const [hmrcError, setHmrcError] = useState<string | null>(null)
  const [hmrcCallbackNotice, setHmrcCallbackNotice] = useState<string | null>(null)
  const [hmrcRefresh, setHmrcRefresh] = useState(0)
  const [lockError, setLockError] = useState<string | null>(null)
  const [lockReason, setLockReason] = useState("")
  const [reopenReason, setReopenReason] = useState("")
  const [lockRefresh, setLockRefresh] = useState(0)
  const [offset, setOffset] = useState(0)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [priorErrors, setPriorErrors] = useState<UkVatPriorPeriodErrorIntake | null>(null)
  const [priorErrorLoadError, setPriorErrorLoadError] = useState<string | null>(null)
  const [priorErrorRefresh, setPriorErrorRefresh] = useState(0)
  const [priorErrorPreview, setPriorErrorPreview] = useState<UkVatPriorPeriodErrorPreview | null>(null)
  const [priorErrorPreviewError, setPriorErrorPreviewError] = useState<string | null>(null)
  const [priorChooseSeparate, setPriorChooseSeparate] = useState(false)
  const [priorOriginalStart, setPriorOriginalStart] = useState("")
  const [priorOriginalEnd, setPriorOriginalEnd] = useState("")
  const [priorDiscoveredOn, setPriorDiscoveredOn] = useState("")
  const [priorSourceReference, setPriorSourceReference] = useState("")
  const [priorTaxSide, setPriorTaxSide] = useState<"input" | "output">("input")
  const [priorSignedVat, setPriorSignedVat] = useState("")
  const [priorConduct, setPriorConduct] = useState<"undetermined" | "reasonable_care" | "careless" | "deliberate">("undetermined")
  const [priorExplanation, setPriorExplanation] = useState("")
  const [priorConductItemId, setPriorConductItemId] = useState<string | null>(null)
  const [priorReviewedConduct, setPriorReviewedConduct] = useState<"reasonable_care" | "careless" | "deliberate">("reasonable_care")
  const [priorConductReason, setPriorConductReason] = useState("")
  const [priorDeadlineItemId, setPriorDeadlineItemId] = useState<string | null>(null)
  const [priorDeadlineHistory, setPriorDeadlineHistory] = useState<UkVatPriorErrorTimeLimitHistory | null>(null)
  const [priorDeadlineError, setPriorDeadlineError] = useState<string | null>(null)
  const [priorReturnReference, setPriorReturnReference] = useState("")
  const [priorReturnDueOn, setPriorReturnDueOn] = useState("")
  const [priorDeadlineEvidence, setPriorDeadlineEvidence] = useState("")
  const [priorDeadlineReason, setPriorDeadlineReason] = useState("")
  const [method1Offsets, setMethod1Offsets] = useState<UkVatMethod1OffsetNominals | null>(null)
  const [method1Plans, setMethod1Plans] = useState<UkVatMethod1Plans | null>(null)
  const [method1Postings, setMethod1Postings] = useState<UkVatMethod1Postings | null>(null)
  const [method1Error, setMethod1Error] = useState<string | null>(null)
  const [method1Refresh, setMethod1Refresh] = useState(0)
  const [method1Items, setMethod1Items] = useState<Record<string, {
    boxNetDeltaGbp: string; offsetNominalId: string; evidenceReference: string }>>({})
  const [method1Reason, setMethod1Reason] = useState("")
  const [method1Confirmed, setMethod1Confirmed] = useState(false)
  const [method1PostReason, setMethod1PostReason] = useState("")
  const [method1PostConfirmed, setMethod1PostConfirmed] = useState(false)
  const [externalNotifications, setExternalNotifications] = useState<UkVatExternalErrorNotifications | null>(null)
  const [externalNotificationError, setExternalNotificationError] = useState<string | null>(null)
  const [selectedNotificationIds, setSelectedNotificationIds] = useState<string[]>([])
  const [notificationDate, setNotificationDate] = useState("")
  const [notificationChannel, setNotificationChannel] = useState<"hmrc_online" | "letter">("hmrc_online")
  const [notificationReference, setNotificationReference] = useState("")
  const [notificationExplanation, setNotificationExplanation] = useState("")
  const [notificationConfirmed, setNotificationConfirmed] = useState(false)
  const [cashDateQueue, setCashDateQueue] = useState<UkVatCashPaymentDateQueue | null>(null)
  const [cashDateError, setCashDateError] = useState<string | null>(null)
  const [cashDateOffset, setCashDateOffset] = useState(0)
  const [cashDateRefresh, setCashDateRefresh] = useState(0)
  const [cashReviewId, setCashReviewId] = useState<string | null>(null)
  const [cashReviewMethod, setCashReviewMethod] = useState<"cash_handover" | "bank_credit_or_debit" | "card_voucher" | "cheque" | "agent_collection">("bank_credit_or_debit")
  const [cashMethodDate, setCashMethodDate] = useState("")
  const [cashChequeDate, setCashChequeDate] = useState("")
  const [cashEvidenceReference, setCashEvidenceReference] = useState("")
  const [cashReviewReason, setCashReviewReason] = useState("")
  const [cashPreviewStart, setCashPreviewStart] = useState("")
  const [cashPreviewEnd, setCashPreviewEnd] = useState("")
  const [cashPreview, setCashPreview] = useState<UkVatCashSourcePreview | null>(null)
  const [cashPreviewError, setCashPreviewError] = useState<string | null>(null)
  const [cashPreviewLoading, setCashPreviewLoading] = useState(false)
  const [cashProjections, setCashProjections] = useState<UkVatCashEventProjectionHistory | null>(null)
  const [cashProjectionError, setCashProjectionError] = useState<string | null>(null)
  const [quarterReference, setQuarterReference] = useState<"last" | "next">("last")
  const [returnPeriodEnd, setReturnPeriodEnd] = useState("")
  const [reviewItem, setReviewItem] = useState<UkVatReviewItem | null>(null)
  const [taxPoint, setTaxPoint] = useState("")
  const [reviewReason, setReviewReason] = useState("")
  const [selected, setSelected] = useState<string[]>([])
  const [signoffReason, setSignoffReason] = useState("")
  const [backfillReason, setBackfillReason] = useState("")
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const activeEntity = useRef("")
  const cashPreviewRequest = useRef(0)
  const activeCreditLink = useRef("")
  const creditSearchRequest = useRef(0)
  const dateTime = useMemo(() => new Intl.DateTimeFormat(language, { dateStyle: "medium", timeStyle: "short" }), [language])
  const money = useMemo(() => new Intl.NumberFormat(language, { style: "currency", currency: "GBP" }), [language])
  const sourceAmount = useMemo(() => new Intl.NumberFormat(language, { minimumFractionDigits: 2, maximumFractionDigits: 4 }), [language])
  const preciseMoney = useMemo(() => new Intl.NumberFormat(language, { style: "currency", currency: "GBP", minimumFractionDigits: 4, maximumFractionDigits: 4 }), [language])
  const postingAmount = (value: number, currency: string) => currency === "GBP" ? money.format(Number(value)) : `${value} ${currency}`
  const suggestedQuarter = useMemo(() => {
    if (!returnPeriodEnd) return null
    try { return suggestUkVatQuarter(quarterReference, returnPeriodEnd) } catch { return null }
  }, [quarterReference, returnPeriodEnd])

  const refreshEntity = useCallback(async (id: string) => {
    const [nextPeriods, nextCoverage, nextQueue, nextRegistration] = await Promise.all([
      getUkVatPeriods(id), getUkVatCoverage(id), getUkVatReviewQueue(id), getUkVatRegistration(id),
    ])
    if (activeEntity.current === id) {
      setPeriods(nextPeriods)
      setCoverage(nextCoverage)
      setQueue(nextQueue)
      setRegistration(nextRegistration)
    }
    return nextPeriods
  }, [])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    getUkVatEntities().then((result) => {
      if (cancelled) return
      setEntities(result.entities)
      setEntityId((current) => current || result.entities[0]?.LegalEntity_ID || "")
    }).catch((cause) => { if (!cancelled) setError(message(cause)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    const url = new URL(window.location.href)
    const outcome = url.searchParams.get("vat_connection")
    if (outcome !== "connected" && outcome !== "error") return
    setHmrcCallbackNotice(outcome === "connected"
      ? t("HMRC consent completed. Check the connection status below.")
      : t("HMRC consent was not completed. You can try connecting again."))
    url.searchParams.delete("vat_connection")
    url.searchParams.delete("reason")
    window.history.replaceState(window.history.state, "", url.toString())
  }, [t])

  useEffect(() => {
    if (!entityId) return
    let cancelled = false
    activeEntity.current = entityId
    setLoading(true)
    setError(null)
    setNotice(null)
    setPeriods(null)
    setRegistration(null)
    setRegistrationVrn("")
    setRegistrationScheme("standard")
    setRegistrationEffectiveFrom("")
    setInvoiceBasisConfirmed(false)
    setRevisionOpen(false)
    setRevisionVrn("")
    setRevisionScheme("standard")
    setRevisionEffectiveFrom("")
    setRevisionReason("")
    setRevisionInvoiceConfirmed(false)
    setCoverage(null)
    setClawback(null)
    setClawbackError(null)
    setQueue(null)
    setPeriodId("")
    setDetail(null)
    setAccount(null)
    setAccountOffset(0)
    activeCreditLink.current = ""
    creditSearchRequest.current += 1
    setCreditLinkId("")
    setTaxPostings(null)
    setTaxPostingOffset(0)
    setControlReviews(null)
    setControlReason("")
    setFilingPreview(null)
    setFilingReviews(null)
    setFilingReason("")
    setReviewLocks(null)
    setFilingStatus(null)
    setDeclarationConfirmed(false)
    setRevocationReason("")
    setHmrcConnections(null)
    setHmrcError(null)
    setLockReason("")
    setReopenReason("")
    setSelected([])
    setQuarterReference("last")
    setReturnPeriodEnd("")
    setStartDate("")
    setEndDate("")
    setPriorErrors(null)
    setPriorErrorLoadError(null)
    setPriorErrorPreview(null)
    setPriorErrorPreviewError(null)
    setPriorChooseSeparate(false)
    setPriorOriginalStart("")
    setPriorOriginalEnd("")
    setPriorDiscoveredOn("")
    setPriorSourceReference("")
    setPriorTaxSide("input")
    setPriorSignedVat("")
    setPriorConduct("undetermined")
    setPriorExplanation("")
    setPriorDeadlineItemId(null)
    setPriorDeadlineHistory(null)
    setPriorDeadlineError(null)
    setPriorReturnReference("")
    setPriorReturnDueOn("")
    setPriorDeadlineEvidence("")
    setPriorDeadlineReason("")
    setMethod1Offsets(null)
    setMethod1Plans(null)
    setMethod1Error(null)
    setMethod1Items({})
    setMethod1Reason("")
    setMethod1Confirmed(false)
    setExternalNotifications(null)
    setExternalNotificationError(null)
    setSelectedNotificationIds([])
    setNotificationDate("")
    setNotificationReference("")
    setNotificationExplanation("")
    setNotificationConfirmed(false)
    setCashDateQueue(null)
    setCashDateError(null)
    setCashDateOffset(0)
    setCashReviewId(null)
    setCashMethodDate("")
    setCashChequeDate("")
    setCashEvidenceReference("")
    setCashReviewReason("")
    cashPreviewRequest.current += 1
    setCashPreviewStart("")
    setCashPreviewEnd("")
    setCashPreview(null)
    setCashPreviewError(null)
    setCashPreviewLoading(false)
    setCashProjections(null)
    setCashProjectionError(null)
    refreshEntity(entityId).then((result) => {
      if (!cancelled) setPeriodId(result.periods[0]?.period_id || "")
    }).catch((cause) => { if (!cancelled) setError(message(cause)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true; if (activeEntity.current === entityId) activeEntity.current = "" }
  }, [entityId, refreshEntity])

  useEffect(() => {
    if (!entityId) { setHmrcConnections(null); return }
    let cancelled = false
    setHmrcConnections(null)
    setHmrcError(null)
    getHmrcVatConnections(entityId)
      .then((result) => { if (!cancelled) setHmrcConnections(result.connections) })
      .catch((cause) => { if (!cancelled) setHmrcError(message(cause)) })
    return () => { cancelled = true }
  }, [entityId, hmrcRefresh])

  const selectedPeriod = periods?.periods.find((period) => period.period_id === periodId)
  const supplierCurrentProposal = supplierHistory?.firstProposals.find((proposal) =>
    proposal.sourceFingerprint === supplierSource?.sourceFingerprint)
  const supplierCurrentReview = supplierKind === "first"
    ? supplierHistory?.firstReviews.find((review) => !review.revokedAt
      && review.sourceFingerprint === supplierSource?.sourceFingerprint
      && review.proposalId === supplierCurrentProposal?.proposalId)
    : supplierHistory?.laterReviews.find((review) =>
      review.sourceFingerprint === supplierSource?.sourceFingerprint)
  const supplierHasPosting = supplierKind === "first"
    ? Boolean(supplierHistory?.firstPostings.length)
    : Boolean(supplierHistory?.laterPostings.length)
  const notifiedErrorIds = new Set(externalNotifications?.notifiedIntakeIds ?? [])
  const selectedNotificationMinDate = priorErrors?.items
    .filter((item) => selectedNotificationIds.includes(item.id))
    .reduce((latest, item) => item.discovered_on > latest ? item.discovered_on : latest, "") || ""
  useEffect(() => {
    if (!entityId || !periodId) { setPriorErrors(null); return }
    let cancelled = false
    setPriorErrors(null)
    setPriorErrorLoadError(null)
    getUkVatPriorPeriodErrors(entityId, periodId)
      .then((result) => { if (!cancelled) setPriorErrors(result) })
      .catch((cause) => { if (!cancelled) setPriorErrorLoadError(message(cause)) })
    return () => { cancelled = true }
  }, [entityId, periodId, priorErrorRefresh])
  useEffect(() => {
    if (!entityId) { setMethod1Offsets(null); return }
    let cancelled = false
    getUkVatMethod1OffsetNominals(entityId)
      .then((result) => { if (!cancelled) setMethod1Offsets(result) })
      .catch((cause) => { if (!cancelled) setMethod1Error(message(cause)) })
    return () => { cancelled = true }
  }, [entityId])
  useEffect(() => {
    if (!entityId || !periodId) { setMethod1Plans(null); return }
    let cancelled = false
    setMethod1Plans(null)
    getUkVatMethod1Plans(entityId, periodId)
      .then((result) => { if (!cancelled) setMethod1Plans(result) })
      .catch((cause) => { if (!cancelled) setMethod1Error(message(cause)) })
    return () => { cancelled = true }
  }, [entityId, periodId, method1Refresh])
  useEffect(() => {
    if (!entityId || !periodId) { setMethod1Postings(null); return }
    let cancelled = false
    setMethod1Postings(null)
    getUkVatMethod1Postings(entityId, periodId)
      .then((result) => { if (!cancelled) setMethod1Postings(result) })
      .catch((cause) => { if (!cancelled) setMethod1Error(message(cause)) })
    return () => { cancelled = true }
  }, [entityId, periodId, method1Refresh])
  useEffect(() => {
    if (!canManage || !entityId || !periodId) { setPriorErrorPreview(null); return }
    let cancelled = false
    setPriorErrorPreview(null)
    setPriorErrorPreviewError(null)
    previewUkVatPriorPeriodErrors(entityId, periodId, priorChooseSeparate)
      .then((result) => { if (!cancelled) setPriorErrorPreview(result) })
      .catch((cause) => { if (!cancelled) setPriorErrorPreviewError(message(cause)) })
    return () => { cancelled = true }
  }, [canManage, entityId, periodId, priorChooseSeparate, priorErrorRefresh])
  useEffect(() => {
    if (!entityId || !periodId) { setExternalNotifications(null); return }
    let cancelled = false
    setExternalNotifications(null)
    setExternalNotificationError(null)
    getUkVatExternalErrorNotifications(entityId, periodId)
      .then((result) => { if (!cancelled) setExternalNotifications(result) })
      .catch((cause) => { if (!cancelled) setExternalNotificationError(message(cause)) })
    return () => { cancelled = true }
  }, [entityId, periodId, priorErrorRefresh])
  useEffect(() => {
    if (!entityId) { setCashDateQueue(null); return }
    let cancelled = false
    setCashDateQueue(null)
    setCashDateError(null)
    getUkVatCashPaymentDateQueue(entityId, cashDateOffset, 25)
      .then((result) => { if (!cancelled) setCashDateQueue(result) })
      .catch((cause) => { if (!cancelled) setCashDateError(message(cause)) })
    return () => { cancelled = true }
  }, [entityId, cashDateOffset, cashDateRefresh])
  useEffect(() => {
    if (!entityId || !periodId) { setClawback(null); return }
    let cancelled = false
    setClawback(null)
    setClawbackError(null)
    getUkVatClawbackCandidates(entityId, periodId)
      .then((result) => { if (!cancelled) setClawback(result) })
      .catch((cause) => { if (!cancelled) setClawbackError(message(cause)) })
    return () => { cancelled = true }
  }, [entityId, periodId, clawbackRefresh])
  useEffect(() => {
    setSupplierDocumentId(null)
    setSupplierSource(null)
    setSupplierHistory(null)
    setSupplierError(null)
  }, [entityId, periodId])
  useEffect(() => {
    if (!entityId || !periodId || !supplierDocumentId) return
    let cancelled = false
    setSupplierSource(null)
    setSupplierHistory(null)
    setSupplierError(null)
    getUkVatSupplierInputTaxHistory(entityId, periodId, supplierDocumentId)
      .then((result) => { if (!cancelled) setSupplierHistory(result) })
      .catch((cause) => { if (!cancelled) setSupplierError(message(cause)) })
    if (canManage) {
      getUkVatSupplierInputTaxSource(entityId, periodId, supplierDocumentId, supplierKind)
        .then((result) => { if (!cancelled) setSupplierSource(result) })
        .catch((cause) => { if (!cancelled) setSupplierError(message(cause)) })
    }
    return () => { cancelled = true }
  }, [entityId, periodId, supplierDocumentId, supplierKind, supplierRefresh, canManage])
  useEffect(() => {
    activeCreditLink.current = ""
    creditSearchRequest.current += 1
    setCreditLinkId("")
  }, [periodId])
  useEffect(() => {
    if (!entityId || !selectedPeriod?.latest_calculation_id) { setDetail(null); return }
    let cancelled = false
    setDetail(null)
    setAccountOffset(0)
    setTaxPostingOffset(0)
    setSelected([])
    getUkVatCalculationDetail(entityId, selectedPeriod.latest_calculation_id, 0, 100)
      .then((result) => { if (!cancelled) { setDetail(result); setOffset(0) } })
      .catch((cause) => { if (!cancelled) setError(message(cause)) })
    return () => { cancelled = true }
  }, [entityId, selectedPeriod?.latest_calculation_id])

  useEffect(() => {
    if (!entityId || !detail) { setAccount(null); return }
    let cancelled = false
    setAccount(null)
    setAccountError(null)
    getUkVatAccount(entityId, detail.calculationId, accountOffset)
      .then((result) => { if (!cancelled) setAccount(result) })
      .catch((cause) => { if (!cancelled) setAccountError(message(cause)) })
    return () => { cancelled = true }
  }, [entityId, detail?.calculationId, accountOffset, accountRefresh])

  useEffect(() => {
    if (!entityId || !detail) { setTaxPostings(null); return }
    let cancelled = false
    setTaxPostings(null)
    setTaxPostingError(null)
    getUkVatTaxPostingInventory(entityId, detail.calculationId, taxPostingOffset)
      .then((result) => { if (!cancelled) setTaxPostings(result) })
      .catch((cause) => { if (!cancelled) setTaxPostingError(message(cause)) })
    return () => { cancelled = true }
  }, [entityId, detail?.calculationId, taxPostingOffset, accountRefresh])

  useEffect(() => {
    if (!entityId || !periodId) { setControlReviews(null); return }
    let cancelled = false
    setControlReviews(null)
    setControlReviewError(null)
    getUkVatControlReviews(entityId, periodId)
      .then((result) => { if (!cancelled) setControlReviews(result) })
      .catch((cause) => { if (!cancelled) setControlReviewError(message(cause)) })
    return () => { cancelled = true }
  }, [entityId, periodId, controlRefresh])

  useEffect(() => {
    if (!entityId || !detail) { setFilingPreview(null); return }
    let cancelled = false
    setFilingPreview(null)
    setFilingError(null)
    getUkVatFilingProjectionPreview(entityId, detail.calculationId)
      .then((result) => { if (!cancelled) setFilingPreview(result) })
      .catch((cause) => { if (!cancelled) setFilingError(message(cause)) })
    return () => { cancelled = true }
  }, [entityId, detail?.calculationId, controlRefresh, filingRefresh])

  useEffect(() => {
    if (!entityId || !periodId) { setFilingReviews(null); return }
    let cancelled = false
    setFilingReviews(null)
    getUkVatFilingProjections(entityId, periodId)
      .then((result) => { if (!cancelled) setFilingReviews(result) })
      .catch((cause) => { if (!cancelled) setFilingError(message(cause)) })
    return () => { cancelled = true }
  }, [entityId, periodId, filingRefresh])

  useEffect(() => {
    if (!entityId || !periodId) { setReviewLocks(null); return }
    let cancelled = false
    setReviewLocks(null)
    setLockError(null)
    getUkVatReviewLocks(entityId, periodId)
      .then((result) => { if (!cancelled) setReviewLocks(result) })
      .catch((cause) => { if (!cancelled) setLockError(message(cause)) })
    return () => { cancelled = true }
  }, [entityId, periodId, lockRefresh])

  useEffect(() => {
    if (!entityId || !periodId) { setFilingStatus(null); return }
    let cancelled = false
    setFilingStatus(null)
    setFilingStatusError(null)
    getUkVatFilingStatus(entityId, periodId)
      .then((result) => { if (!cancelled) setFilingStatus(result) })
      .catch((cause) => { if (!cancelled) setFilingStatusError(message(cause)) })
    return () => { cancelled = true }
  }, [entityId, periodId, lockRefresh])

  const transactions = useMemo(() => [...new Map((detail?.lines ?? []).map((line) => [line.evidence_id, line])).values()], [detail?.lines])
  const sourceLedger = detail?.controlReconciliation?.sourceLedger as {
    status?: string; checked?: number; mismatched?: number;
    mismatchSample?: Array<{ evidenceId: string; documentId: string; netGbp: number; vatGbp: number;
      netPosted: number; taxPosted: number; taxNominalLines: number;
      expectedTaxNominalId: string | null; expectedTaxNominalCode: string | null;
      postedTaxNominalIds: string[]; postedTaxNominalCodes: string[] }>
  } | undefined
  const canSignOff = canManage && detail?.latestRevision && detail.periodStatus === "draft"
    && detail.exceptions.length === 0 && sourceLedger?.status === "matched"
  const controlBridge = taxPostings?.controlBridge
  const canReviewControl = canSignOff && taxPostings?.calculationId === detail?.calculationId
    && selectedPeriod?.transaction_count === selectedPeriod?.signed_transaction_count
    && controlBridge?.accountingCoverageExact && Number(controlBridge.differenceGbp) === 0
    && controlBridge.expectedTaxPostingLines === controlBridge.linkedVatAccountTaxLines
    && taxPostings.unlinkedLines === 0 && taxPostings.nonGbpLines === 0
    && taxPostings.taxLinesOffVatAccounts === 0
  const matchingSourceFilingReview = filingReviews?.reviews.find((review) =>
    review.source_digest === detail?.sourceDigest && review.rule_version === filingPreview?.ruleVersion)
  const activeReviewLock = reviewLocks?.locks.find((lock) => lock.lock_id === reviewLocks.activeLockId)
  useEffect(() => { setDeclarationConfirmed(false) }, [activeReviewLock?.lock_id, filingStatus?.obligation?.verificationId])
  const lockedFilingValues = filingReviews?.reviews.find((review) =>
    review.review_id === activeReviewLock?.filing_projection_id
    && review.projection_fingerprint === activeReviewLock.projection_fingerprint)
  const activeApproval = filingStatus?.approval && !filingStatus.approval.revocation
    ? filingStatus.approval : null
  const canConfirmFiling = canManage && selectedPeriod?.status === "review_locked"
    && filingStatus?.periodStatus === "review_locked"
    && filingStatus.reviewLockId === activeReviewLock?.lock_id
    && Boolean(activeReviewLock && lockedFilingValues && filingStatus.obligation?.freshForApproval)
    && !activeApproval && (!filingStatus.attempt || filingStatus.attempt.status === "cancelled")
  const canRevokeFiling = canManage && Boolean(activeApproval)
    && (!filingStatus?.attempt || filingStatus.attempt.status === "cancelled")
  const filingOutcome = filingStatus?.attempt?.status === "accepted"
    ? "HMRC 201 receipt recorded"
    : filingStatus?.attempt?.status === "accepted_readback"
      ? "Matching HMRC return found; no 201 receipt recorded"
      : filingStatus?.attempt?.status === "reconciliation_required" || filingStatus?.attempt?.status === "dispatching"
        ? "Submission outcome unresolved. Do not send this return again."
        : filingStatus?.attempt?.status === "reserved"
          ? "Submission reserved; no dispatch recorded"
          : filingStatus?.attempt?.status === "cancelled"
            ? "Unsent submission reservation cancelled"
            : "No HMRC submission attempt recorded"

  async function run(action: () => Promise<void>) {
    setBusy(true)
    setError(null)
    setNotice(null)
    try { await action() } catch (cause) { setError(message(cause)) } finally { setBusy(false) }
  }

  async function refresh() {
    if (!entityId) return
    await run(async () => {
      const result = await refreshEntity(entityId)
      setClawbackRefresh((value) => value + 1)
      setPriorErrorRefresh((value) => value + 1)
      if (!result.periods.some((period) => period.period_id === periodId)) setPeriodId(result.periods[0]?.period_id || "")
      else {
        const latestId = result.periods.find((period) => period.period_id === periodId)?.latest_calculation_id
        setDetail(latestId ? await getUkVatCalculationDetail(entityId, latestId, offset, 100) : null)
        setAccountRefresh((current) => current + 1)
        setControlRefresh((current) => current + 1)
        setFilingRefresh((current) => current + 1)
        setLockRefresh((current) => current + 1)
        setSelected([])
      }
      setNotice(t("VAT evidence refreshed."))
      setHmrcRefresh((current) => current + 1)
    })
  }

  async function connectHmrcSandbox() {
    if (!entityId || !canManage) return
    await run(async () => {
      await beginHmrcVatConnection(entityId, "sandbox")
    })
  }

  async function renewHmrcToken(connectionId: string) {
    if (!entityId || !canManage) return
    await run(async () => {
      const result = await refreshHmrcVatConnection(entityId, connectionId)
      setHmrcRefresh((current) => current + 1)
      setNotice(t(result.status === "reauthorisation_required"
        ? "HMRC authority needs renewed consent. Connect again from this page."
        : result.status === "refresh_in_progress"
          ? "HMRC token renewal is already in progress. Refresh the connection status shortly."
          : "HMRC access token status refreshed."))
    })
  }

  async function configureRegistration() {
    if (!entityId || !canManage || !invoiceBasisConfirmed || !registrationEffectiveFrom
      || !/^[0-9]{9}$/.test(registrationVrn)) return
    await run(async () => {
      const result = await configureUkVatRegistration(entityId, {
        vrn: registrationVrn, schemeCode: registrationScheme,
        effectiveFrom: registrationEffectiveFrom, invoiceBasisConfirmed: true,
      })
      setRegistration(result)
      setRegistrationVrn("")
      setInvoiceBasisConfirmed(false)
      await refreshEntity(entityId)
      setNotice(t("UK VAT registration saved for this legal entity. HMRC verification has not been completed."))
    })
  }

  async function scheduleRegistrationChange() {
    if (!entityId || !canManage || !revisionInvoiceConfirmed || !revisionEffectiveFrom
      || !/^[0-9]{9}$/.test(revisionVrn) || revisionReason.trim().length < 10) return
    await run(async () => {
      await scheduleUkVatRegistration(entityId, {
        vrn: revisionVrn, schemeCode: revisionScheme,
        effectiveFrom: revisionEffectiveFrom, invoiceBasisConfirmed: true,
        reason: revisionReason.trim(),
      })
      setRegistration(await getUkVatRegistration(entityId))
      setRevisionOpen(false)
      setRevisionVrn("")
      setRevisionReason("")
      setRevisionInvoiceConfirmed(false)
      setHmrcRefresh((current) => current + 1)
      setNotice(t("VAT registration change recorded. HMRC authority for the new terms needs separate verification."))
    })
  }

  async function preparePeriod() {
    if (!entityId || !startDate || !endDate) return
    await run(async () => {
      const result = await prepareUkVatDraftPeriod(entityId, startDate, endDate)
      await refreshEntity(entityId)
      setPeriodId(result.periodId)
      setNotice(t("Draft VAT period prepared. HMRC obligation dates have not yet been verified."))
    })
  }

  async function recordPriorError() {
    if (!entityId || !periodId || selectedPeriod?.status !== "draft" || !canManage) return
    await run(async () => {
      await recordUkVatPriorPeriodError(entityId, periodId, {
        originalPeriodStart: priorOriginalStart, originalPeriodEnd: priorOriginalEnd,
        discoveredOn: priorDiscoveredOn, sourceReference: priorSourceReference.trim(),
        taxSide: priorTaxSide, signedVatErrorGbp: priorSignedVat.trim(),
        conduct: priorConduct, explanation: priorExplanation.trim(),
      })
      setPriorErrorRefresh((value) => value + 1)
      setPriorSourceReference("")
      setPriorSignedVat("")
      setPriorConduct("undetermined")
      setPriorExplanation("")
      setNotice(t("Prior-period VAT error recorded for assessment. It has not changed this return or notified HMRC."))
    })
  }

  async function reviewPriorErrorConduct() {
    if (!entityId || !priorConductItemId || !canManage || selectedPeriod?.status !== "draft") return
    await run(async () => {
      await reviewUkVatPriorErrorConduct(entityId, priorConductItemId, {
        conduct: priorReviewedConduct, reason: priorConductReason.trim(),
      })
      setPriorConductItemId(null)
      setPriorConductReason("")
      setPriorErrorRefresh((value) => value + 1)
      setNotice(t("Prior-period VAT error conduct review recorded."))
    })
  }

  async function openPriorErrorDeadline(intakeId: string) {
    if (!entityId) return
    setPriorDeadlineItemId(intakeId)
    setPriorDeadlineHistory(null)
    setPriorDeadlineError(null)
    setPriorReturnReference("")
    setPriorReturnDueOn("")
    setPriorDeadlineEvidence("")
    setPriorDeadlineReason("")
    try {
      const history = await getUkVatPriorErrorTimeLimitHistory(entityId, intakeId)
      setPriorDeadlineHistory(history)
    } catch (cause) {
      setPriorDeadlineError(message(cause))
    }
  }

  async function reviewPriorErrorDeadline() {
    if (!entityId || !priorDeadlineItemId || !canManage || selectedPeriod?.status !== "draft") return
    const item = priorErrors?.items.find((entry) => entry.id === priorDeadlineItemId)
    if (!item) return
    const category = item.tax_side === "output"
      ? (Number(item.signed_vat_error_gbp) > 0 ? "output_underdeclared" : "output_overdeclared")
      : (Number(item.signed_vat_error_gbp) > 0 ? "input_overclaimed" : "input_underclaimed")
    await run(async () => {
      const result = await reviewUkVatPriorErrorTimeLimit(entityId, item.id, {
        errorCategory: category, originalReturnReference: priorReturnReference.trim(),
        originalReturnDueOn: category === "input_underclaimed" ? priorReturnDueOn : null,
        evidenceReference: priorDeadlineEvidence.trim(), reason: priorDeadlineReason.trim(),
      })
      setPriorDeadlineHistory(await getUkVatPriorErrorTimeLimitHistory(entityId, item.id))
      setPriorDeadlineReason("")
      setNotice(t(result.withinTimeLimit
        ? "Deadline assessed as in time today. Recheck it when posting the correction."
        : "The ordinary four-year deadline has passed. Specialist review is needed before any correction."))
    })
  }

  async function reviewMethod1Plan() {
    if (!entityId || !periodId || !detail || !priorErrors || !canManage
      || selectedPeriod?.status !== "draft" || priorErrors.total !== priorErrors.items.length) return
    await run(async () => {
      await reviewUkVatMethod1Plan(entityId, periodId, {
        baseCalculationId: detail.calculationId, sourceDigest: detail.sourceDigest,
        items: priorErrors.items.map((item) => ({
          intakeId: item.id,
          boxNetDeltaGbp: method1Items[item.id]?.boxNetDeltaGbp.trim() ?? "",
          offsetNominalId: method1Items[item.id]?.offsetNominalId ?? "",
          evidenceReference: method1Items[item.id]?.evidenceReference.trim() ?? "",
        })),
        reason: method1Reason.trim(), confirmed: true,
      })
      setMethod1Refresh((value) => value + 1)
      setMethod1Confirmed(false)
      setNotice(t("Method 1 posting plan reviewed. It has not posted or changed this return."))
    })
  }

  async function postMethod1Plan() {
    const plan = method1Plans?.plans[0]
    if (!entityId || !periodId || !plan || !canManage || !method1PostConfirmed
      || method1PostReason.trim().length < 10 || method1Postings?.postings.length) return
    await run(async () => {
      const result = await postUkVatMethod1Plan(entityId, periodId, plan.id, {
        reason: method1PostReason.trim(), confirmed: true,
      })
      setMethod1PostReason("")
      setMethod1PostConfirmed(false)
      setMethod1Refresh((value) => value + 1)
      setControlRefresh((value) => value + 1)
      setNotice(`${t("Method 1 correction posted to the ledger. Calculate the draft, review its VAT control, reconcile the correction and lock the return before filing.")} ${t("Posting batch")}: ${result.batchId}`)
    })
  }

  function openSupplierVat(item: UkVatClawbackCandidates["items"][number]) {
    setSupplierDocumentId(item.document_id)
    setSupplierSource(null)
    setSupplierHistory(null)
    setSupplierError(null)
    setSupplierKind(item.first_possible_clawback_date >= (selectedPeriod?.start_date ?? "")
      ? "first" : "later")
    setSupplierPrepareReason("")
    setSupplierReviewReason("")
    setSupplierPostReason("")
    setSupplierOffsetNominalId("")
    setSupplierReviewConfirmed(false)
    setSupplierPostConfirmed(false)
  }

  async function prepareSupplierVat() {
    if (!entityId || !periodId || !supplierDocumentId || supplierKind !== "first"
      || !canManage || selectedPeriod?.status !== "draft"
      || supplierPrepareReason.trim().length < 10) return
    await run(async () => {
      await prepareUkVatFirstInputTaxRepayment(entityId, periodId,
        supplierDocumentId, supplierPrepareReason.trim())
      setSupplierPrepareReason("")
      setSupplierRefresh((value) => value + 1)
      setNotice(t("Supplier input VAT repayment prepared for accountant review. It has not changed the return."))
    })
  }

  async function reviewSupplierVat() {
    if (!entityId || !periodId || !supplierDocumentId || !canManage
      || selectedPeriod?.status !== "draft" || !supplierReviewConfirmed
      || !supplierOffsetNominalId || supplierReviewReason.trim().length < 10) return
    await run(async () => {
      if (supplierKind === "first") {
        const proposal = supplierHistory?.firstProposals[0]
        if (!proposal || proposal.sourceFingerprint !== supplierSource?.sourceFingerprint) {
          throw new Error("Prepare the current supplier VAT source before reviewing it.")
        }
        await reviewUkVatFirstInputTaxRepayment(entityId, periodId,
          supplierDocumentId, proposal.proposalId, supplierOffsetNominalId,
          supplierReviewReason.trim())
      } else {
        await reviewUkVatLaterInputTaxRestoration(entityId, periodId,
          supplierDocumentId, supplierOffsetNominalId, supplierReviewReason.trim())
      }
      setSupplierReviewConfirmed(false)
      setSupplierReviewReason("")
      setSupplierRefresh((value) => value + 1)
      setNotice(t("Supplier input VAT adjustment reviewed. Posting and return reconciliation remain separate."))
    })
  }

  async function postSupplierVat() {
    if (!entityId || !periodId || !supplierDocumentId || !canManage
      || selectedPeriod?.status !== "draft" || !supplierPostConfirmed
      || supplierPostReason.trim().length < 10) return
    await run(async () => {
      const reviewId = supplierKind === "first"
        ? supplierHistory?.firstReviews.find((review) => !review.revokedAt
          && review.sourceFingerprint === supplierSource?.sourceFingerprint)?.reviewId
        : supplierHistory?.laterReviews.find((review) =>
          review.sourceFingerprint === supplierSource?.sourceFingerprint)?.reviewId
      if (!reviewId) throw new Error("Review the current supplier VAT source before posting it.")
      const result = supplierKind === "first"
        ? await postUkVatFirstInputTaxRepayment(entityId, periodId,
          supplierDocumentId, reviewId, supplierPostReason.trim())
        : await postUkVatLaterInputTaxRestoration(entityId, periodId,
          supplierDocumentId, reviewId, supplierPostReason.trim())
      setSupplierPostConfirmed(false)
      setSupplierPostReason("")
      setSupplierRefresh((value) => value + 1)
      setClawbackRefresh((value) => value + 1)
      setControlRefresh((value) => value + 1)
      setNotice(`${t("Supplier input VAT adjustment recorded. Recalculate the draft, reconcile its VAT evidence and control account, then review-lock the return.")} ${result.batchId ? `${t("Posting batch")}: ${result.batchId}` : t("No tax journal was needed for this payment.")}`)
    })
  }

  function updateMethod1Item(intakeId: string,
    field: "boxNetDeltaGbp" | "offsetNominalId" | "evidenceReference", value: string) {
    setMethod1Items((current) => ({ ...current, [intakeId]: {
      boxNetDeltaGbp: current[intakeId]?.boxNetDeltaGbp ?? "",
      offsetNominalId: current[intakeId]?.offsetNominalId ?? "",
      evidenceReference: current[intakeId]?.evidenceReference ?? "",
      [field]: value,
    } }))
  }

  async function recordExternalNotification() {
    if (!entityId || !periodId || !canManage || !selectedNotificationIds.length) return
    await run(async () => {
      await recordUkVatExternalErrorNotification(entityId, periodId, {
        intakeIds: selectedNotificationIds, notifiedOn: notificationDate,
        channel: notificationChannel, evidenceReference: notificationReference.trim(),
        explanation: notificationExplanation.trim(), confirmed: true,
      })
      setSelectedNotificationIds([])
      setNotificationDate("")
      setNotificationReference("")
      setNotificationExplanation("")
      setNotificationConfirmed(false)
      setPriorErrorRefresh((value) => value + 1)
      setNotice(t("External HMRC error notification evidence recorded. Multideck has not verified HMRC acceptance."))
    })
  }

  async function reviewCashDate() {
    if (!entityId || !cashReviewId || !canManage) return
    await run(async () => {
      const result = await reviewUkVatCashPaymentDate(entityId, cashReviewId, {
        method: cashReviewMethod, methodDate: cashMethodDate,
        chequeDate: cashReviewMethod === "cheque" ? cashChequeDate : null,
        evidenceReference: cashEvidenceReference.trim(), reason: cashReviewReason.trim(),
      })
      setCashReviewId(null)
      setCashMethodDate("")
      setCashChequeDate("")
      setCashEvidenceReference("")
      setCashReviewReason("")
      setCashDateRefresh((value) => value + 1)
      cashPreviewRequest.current += 1
      setCashPreview(null)
      setCashPreviewError(null)
      setCashPreviewLoading(false)
      setCashProjections(null)
      setCashProjectionError(null)
      setNotice(t(result.inserted
        ? "Dated cash VAT payment review recorded. It has not changed a return."
        : "The existing cash VAT payment review was retained."))
    })
  }

  async function previewCashSources() {
    if (!entityId || !cashPreviewStart || !cashPreviewEnd) return
    const requestedEntity = entityId
    const requestId = ++cashPreviewRequest.current
    setCashPreviewLoading(true)
    setCashPreviewError(null)
    setCashPreview(null)
    setCashProjections(null)
    setCashProjectionError(null)
    try {
      const result = await getUkVatCashSourcePreview(requestedEntity, cashPreviewStart, cashPreviewEnd)
      if (activeEntity.current !== requestedEntity || cashPreviewRequest.current !== requestId) return
      setCashPreview(result)
      try {
        const history = await getUkVatCashEventProjections(requestedEntity, cashPreviewStart, cashPreviewEnd)
        if (activeEntity.current === requestedEntity && cashPreviewRequest.current === requestId) setCashProjections(history)
      } catch (cause) {
        if (activeEntity.current === requestedEntity && cashPreviewRequest.current === requestId) setCashProjectionError(message(cause))
      }
    } catch (cause) {
      if (activeEntity.current === requestedEntity && cashPreviewRequest.current === requestId) setCashPreviewError(message(cause))
    } finally {
      if (cashPreviewRequest.current === requestId) setCashPreviewLoading(false)
    }
  }

  async function recordCashProjection() {
    if (!entityId || !cashPreview?.calculationValid || !canManage) return
    const requestedEntity = entityId
    const start = cashPreview.startDate
    const end = cashPreview.endDate
    await run(async () => {
      const result = await recordUkVatCashEventProjection(requestedEntity, start, end)
      if (activeEntity.current !== requestedEntity || cashPreviewStart !== start || cashPreviewEnd !== end) return
      try {
        setCashProjections(await getUkVatCashEventProjections(requestedEntity, start, end))
        setCashProjectionError(null)
      } catch (cause) { setCashProjectionError(message(cause)) }
      setNotice(t(result.inserted
        ? "Cash VAT payment event projection recorded. It has not changed or approved a return."
        : "The existing cash VAT payment event projection was retained."))
    })
  }

  async function calculate() {
    if (!entityId || !periodId) return
    await run(async () => {
      const result = await calculateUkVatDraft(entityId, periodId)
      await refreshEntity(entityId)
      setDetail(await getUkVatCalculationDetail(entityId, result.calculationId))
      setOffset(0)
      setAccountOffset(0)
      setTaxPostingOffset(0)
      setSelected([])
      setNotice(t("Draft calculation refreshed. Any recorded control review must be revalidated before return approval."))
    })
  }

  async function backfill() {
    if (!entityId || backfillReason.trim().length < 10) return
    await run(async () => {
      const result = await backfillUkVatPostedLines(entityId, 100, backfillReason.trim())
      await refreshEntity(entityId)
      setBackfillReason("")
      setNotice(`${result.inserted} ${t("historical posted lines captured. Their VAT treatment still needs review.")}`)
    })
  }

  async function loadMoreEvidence() {
    if (!entityId || !queue?.nextCursor) return
    const cursor = queue.nextCursor
    await run(async () => {
      const next = await getUkVatReviewQueue(entityId, 100, cursor)
      setQueue((current) => current?.legalEntityId === entityId
        ? { ...next, items: [...current.items, ...next.items] } : next)
    })
  }

  async function review() {
    if (!entityId || !reviewItem || !taxPoint || reviewReason.trim().length < 10) return
    await run(async () => {
      await reviewUkVatEvidence(entityId, reviewItem.evidence_id, taxPoint, reviewReason.trim())
      await refreshEntity(entityId)
      setReviewItem(null)
      setTaxPoint("")
      setReviewReason("")
      setDetail(null)
      setSelected([])
      setNotice(t("VAT treatment reviewed. Recalculate the draft before signing off transactions."))
    })
  }

  async function signOff() {
    if (!entityId || !detail || !canSignOff || !selected.length || signoffReason.trim().length < 10) return
    await run(async () => {
      const result = await reconcileUkVatTransactions(entityId, detail.calculationId, detail.sourceDigest, selected, signoffReason.trim())
      await refreshEntity(entityId)
      setDetail(await getUkVatCalculationDetail(entityId, result.calculationId, offset, 100))
      setAccountRefresh((current) => current + 1)
      setSelected([])
      setSignoffReason("")
      setNotice(t("Transaction VAT reconciliation dates recorded."))
    })
  }

  function chooseCreditLink(evidenceId: string) {
    creditSearchRequest.current += 1
    const next = activeCreditLink.current === evidenceId ? "" : evidenceId
    activeCreditLink.current = next
    setCreditLinkId(next)
    setCreditSearch("")
    setCreditCandidates(null)
    setCreditOriginalId("")
    setCreditReason("")
    setCreditError(null)
    setCreditBusy(false)
  }

  async function searchCreditOriginal() {
    const creditId = activeCreditLink.current
    const search = creditSearch.trim()
    if (!entityId || !creditId || search.length < 2 || search.length > 80) return
    const requestId = ++creditSearchRequest.current
    setCreditBusy(true)
    setCreditError(null)
    setCreditCandidates(null)
    setCreditOriginalId("")
    try {
      const result = await findUkVatCreditCandidates(entityId, creditId, search)
      if (activeEntity.current === entityId && activeCreditLink.current === creditId && creditSearchRequest.current === requestId) {
        setCreditCandidates(result.candidates)
      }
    } catch (cause) {
      if (activeEntity.current === entityId && activeCreditLink.current === creditId && creditSearchRequest.current === requestId) setCreditError(message(cause))
    } finally {
      if (activeCreditLink.current === creditId && creditSearchRequest.current === requestId) setCreditBusy(false)
    }
  }

  async function saveCreditLink() {
    const creditId = activeCreditLink.current
    if (!entityId || !creditId || !creditOriginalId || creditReason.trim().length < 10) return
    setCreditBusy(true)
    setCreditError(null)
    try {
      await linkUkVatCredit(entityId, creditId, creditOriginalId, creditReason.trim())
      if (activeEntity.current === entityId && activeCreditLink.current === creditId) {
        chooseCreditLink(creditId)
        setAccountRefresh((current) => current + 1)
        setNotice(t("VAT credit linked to its original invoice. The posted transactions remain unchanged."))
      }
    } catch (cause) {
      if (activeEntity.current === entityId && activeCreditLink.current === creditId) setCreditError(message(cause))
    } finally {
      if (activeCreditLink.current === creditId) setCreditBusy(false)
    }
  }

  async function reviewControl() {
    if (!entityId || !detail || !canReviewControl || controlReason.trim().length < 10) return
    await run(async () => {
      const result = await reviewUkVatControl(entityId, detail.calculationId, detail.sourceDigest, controlReason.trim())
      await refreshEntity(entityId)
      setDetail(await getUkVatCalculationDetail(entityId, result.calculationId, 0, 100))
      setOffset(0)
      setAccountOffset(0)
      setTaxPostingOffset(0)
      setAccountRefresh((current) => current + 1)
      setControlRefresh((current) => current + 1)
      setControlReason("")
      setNotice(t(result.inserted ? "Dated VAT control review recorded for this calculation snapshot." : "Existing VAT control review retained its original date."))
    })
  }

  async function reviewFilingProjection() {
    if (!entityId || !detail || !filingPreview?.currentDraft || !filingPreview.controlReviewed
      || !canManage || filingReason.trim().length < 10) return
    await run(async () => {
      const result = await reviewUkVatFilingProjection(entityId, detail.calculationId,
        detail.sourceDigest, filingReason.trim())
      await refreshEntity(entityId)
      setDetail(await getUkVatCalculationDetail(entityId, result.calculationId, 0, 100))
      setOffset(0)
      setAccountRefresh((current) => current + 1)
      setFilingRefresh((current) => current + 1)
      setFilingReason("")
      setNotice(t(result.inserted ? "Dated VAT filing-value review recorded." : "Existing VAT filing-value review retained its original date."))
    })
  }

  async function lockReview() {
    if (!entityId || !detail || !matchingSourceFilingReview || selectedPeriod?.status !== "draft"
      || !canManage || lockReason.trim().length < 10) return
    await run(async () => {
      const result = await lockUkVatReview(entityId, detail.calculationId, detail.sourceDigest,
        matchingSourceFilingReview.review_id, lockReason.trim())
      await refreshEntity(entityId)
      setDetail(await getUkVatCalculationDetail(entityId, result.calculationId, 0, 100))
      setOffset(0)
      setAccountRefresh((current) => current + 1)
      setLockRefresh((current) => current + 1)
      setLockReason("")
      setNotice(t("VAT period review locked. HMRC obligation and final filing approval are still required."))
    })
  }

  async function reopenReview() {
    if (!entityId || !periodId || selectedPeriod?.status !== "review_locked"
      || !canManage || reopenReason.trim().length < 10) return
    await run(async () => {
      await reopenUkVatReview(entityId, periodId, reopenReason.trim())
      await refreshEntity(entityId)
      if (detail) setDetail(await getUkVatCalculationDetail(entityId, detail.calculationId, 0, 100))
      setOffset(0)
      setLockRefresh((current) => current + 1)
      setFilingRefresh((current) => current + 1)
      setReopenReason("")
      setNotice(t("VAT review lock reopened with a dated reason. Recalculate and review changes before locking again."))
    })
  }

  async function confirmFilingApproval() {
    if (!entityId || !periodId || !canConfirmFiling || !declarationConfirmed
      || !activeReviewLock || !filingStatus?.obligation) return
    await run(async () => {
      const result = await confirmUkVatFilingApproval(entityId, periodId,
        filingStatus.obligation!.verificationId, activeReviewLock.lock_fingerprint)
      setDeclarationConfirmed(false)
      setLockRefresh((current) => current + 1)
      setNotice(t(result.environment === "sandbox"
        ? "Sandbox VAT declaration confirmed and audited. No return has been sent to HMRC."
        : "VAT declaration confirmed and audited. No return has been sent to HMRC."))
    })
  }

  async function revokeFilingApproval() {
    if (!entityId || !activeApproval || !canRevokeFiling || revocationReason.trim().length < 10) return
    await run(async () => {
      await revokeUkVatFilingApproval(entityId, activeApproval.approvalId, revocationReason.trim())
      setRevocationReason("")
      setDeclarationConfirmed(false)
      setLockRefresh((current) => current + 1)
      setNotice(t("VAT declaration confirmation revoked with a dated reason. Reopen the review lock before changing the return."))
    })
  }

  async function page(nextOffset: number) {
    if (!entityId || !detail) return
    await run(async () => {
      setDetail(await getUkVatCalculationDetail(entityId, detail.calculationId, nextOffset, 100))
      setOffset(nextOffset)
      setSelected([])
    })
  }

  return <>
    <SettingsPageHeader title={t("UK VAT review")} description={t("Review posted evidence, calculate the return and record an audited filing declaration. HMRC submission is not available yet.")} icon={Calculator} actions={<Button type="button" variant="outline" onClick={() => void refresh()} disabled={busy || loading || !entityId}><RefreshCw className={loading ? "animate-spin" : ""} />{t("Refresh")}</Button>} />
    <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
      {error ? <p role="alert" className="rounded-[var(--md-radius-lg)] bg-[color-mix(in_srgb,var(--md-red),transparent_90%)] p-4 text-[13px] text-[var(--md-red)]">{error}</p> : null}
      {notice ? <p role="status" className="rounded-[var(--md-radius-lg)] bg-[var(--md-surface-soft)] p-4 text-[13px] text-[var(--md-text)]">{notice}</p> : null}
      {loading && !entities.length ? <div className="grid min-h-40 place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /></div> : null}
      {!loading && !entities.length && !error ? <p className="text-[13px] text-[var(--md-subtle)]">{t("No active UK legal entity is available for VAT review.")}</p> : null}
      {entities.length ? <>
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid min-w-52 gap-1.5 text-[12px] font-medium text-[var(--md-text)]">{t("Legal entity")}<Select value={entityId} onValueChange={setEntityId} disabled={busy || loading}><SelectTrigger aria-label={t("Legal entity")}><SelectValue /></SelectTrigger><SelectContent>{entities.map((entity) => <SelectItem key={entity.LegalEntity_ID} value={entity.LegalEntity_ID}>{entity.LegalEntity_Name}</SelectItem>)}</SelectContent></Select></label>
        </div>
        <SettingsPanel title={t("UK VAT registration")} description={t("Record the legal entity's VAT number and accounting scheme before preparing periods.")}>
          {registration?.registration && registration.registration.status !== "not_configured" ? <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-[12px] text-[var(--md-text)]">
            <strong className="font-medium text-[var(--md-ink)]" data-i18n-skip>{registration.registration.vrn}</strong>
            <span>{t(registration.registration.schemeCode === "annual" ? "Annual accounting" : "Standard accounting")}</span>
            <span>{t("Effective from")} <span data-i18n-skip>{registration.registration.effectiveFrom}</span></span>
            {registration.registration.effectiveTo ? <span>{t("Effective to")} <span data-i18n-skip>{registration.registration.effectiveTo}</span></span> : null}
            <span>{t("Status")}: {t(registration.registration.status.replaceAll("_", " "))}</span>
          </div> : registration && !registration.scheduledRegistration && canManage ? <div className="grid gap-3 py-2 sm:grid-cols-[160px_180px_180px_auto] sm:items-end">
            <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("VAT number")}<Input inputMode="numeric" autoComplete="off" maxLength={9} value={registrationVrn} onChange={(event) => setRegistrationVrn(event.target.value.replace(/\D/g, ""))} placeholder="123456789" data-i18n-skip dir="ltr" /></label>
            <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Scheme")}<Select value={registrationScheme} onValueChange={(value) => setRegistrationScheme(value as "standard")}><SelectTrigger aria-label={t("VAT scheme")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="standard">{t("Standard accounting")}</SelectItem><SelectItem value="cash" disabled>{t("Cash accounting — in development")}</SelectItem></SelectContent></Select></label>
            <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Effective from")}<Input type="date" value={registrationEffectiveFrom} onChange={(event) => setRegistrationEffectiveFrom(event.target.value)} data-i18n-skip /></label>
            <Button type="button" disabled={busy || !/^[0-9]{9}$/.test(registrationVrn) || !registrationEffectiveFrom || !invoiceBasisConfirmed} onClick={() => void configureRegistration()}>{t("Save VAT registration")}</Button>
            <label className="flex items-start gap-2 text-[12px] text-[var(--md-text)] sm:col-span-4"><Checkbox checked={invoiceBasisConfirmed} onCheckedChange={(checked) => setInvoiceBasisConfirmed(checked === true)} aria-label={t("Confirm invoice-basis VAT accounting")} /><span>{t("I confirm this entity uses invoice-basis VAT accounting for this scheme.")}</span></label>
          </div> : registration ? <p className="py-2 text-[12px] text-[var(--md-subtle)]">{t(registration.scheduledRegistration ? "No VAT registration is effective yet." : "VAT registration has not been configured. Ask a colleague with compliance management access.")}</p> : <p className="py-2 text-[12px] text-[var(--md-subtle)]">{t("VAT registration is loading.")}</p>}
          {registration?.scheduledRegistration ? <p className="py-2 text-[12px] text-[var(--md-text)]">{t("Scheduled VAT registration")}: <strong data-i18n-skip>{registration.scheduledRegistration.vrn}</strong> · {t(registration.scheduledRegistration.schemeCode === "annual" ? "Annual accounting" : "Standard accounting")} · {t("Effective from")} <span data-i18n-skip>{registration.scheduledRegistration.effectiveFrom}</span>. {t("HMRC authority for these terms still needs verification.")}</p> : null}
          {canManage && registration?.registration && registration.registration.status !== "not_configured"
            && registration.registration.effectiveTo === null && !registration.scheduledRegistration ? <div className="border-t border-[var(--md-line)] py-3">
              {!revisionOpen ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setRevisionVrn(registration.registration?.vrn || ""); setRevisionScheme("standard"); setRevisionOpen(true) }}>{t("Schedule VAT registration change")}</Button> : <div className="grid gap-3 sm:grid-cols-3">
                <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("New VAT number")}<Input inputMode="numeric" autoComplete="off" maxLength={9} value={revisionVrn} onChange={(event) => setRevisionVrn(event.target.value.replace(/\D/g, ""))} data-i18n-skip dir="ltr" /></label>
                <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("New scheme")}<Select value={revisionScheme} onValueChange={(value) => setRevisionScheme(value as "standard")}><SelectTrigger aria-label={t("New VAT scheme")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="standard">{t("Standard accounting")}</SelectItem><SelectItem value="cash" disabled>{t("Cash accounting — in development")}</SelectItem></SelectContent></Select></label>
                <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Effective from")}<Input type="date" value={revisionEffectiveFrom} onChange={(event) => setRevisionEffectiveFrom(event.target.value)} data-i18n-skip /></label>
                <label className="grid gap-1 text-[12px] text-[var(--md-text)] sm:col-span-3">{t("Reason for change")}<Textarea minLength={10} maxLength={2000} value={revisionReason} onChange={(event) => setRevisionReason(event.target.value)} /></label>
                <label className="flex items-start gap-2 text-[12px] text-[var(--md-text)] sm:col-span-3"><Checkbox checked={revisionInvoiceConfirmed} onCheckedChange={(checked) => setRevisionInvoiceConfirmed(checked === true)} aria-label={t("Confirm new invoice-basis VAT terms")} /><span>{t("I confirm the new terms use invoice-basis VAT accounting.")}</span></label>
                <div className="flex flex-wrap gap-2 sm:col-span-3"><Button type="button" disabled={busy || !/^[0-9]{9}$/.test(revisionVrn) || !revisionEffectiveFrom || revisionReason.trim().length < 10 || !revisionInvoiceConfirmed} onClick={() => void scheduleRegistrationChange()}>{t("Record change")}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setRevisionOpen(false)}>{t("Cancel")}</Button></div>
              </div>}
            </div> : null}
          <p className="pb-2 text-[11px] text-[var(--md-subtle)]">{t("Standard accounting is the default. Cash accounting will become available after payment-based VAT calculations are ready. New registration terms cannot overlap a prepared VAT period. Saving them does not verify HMRC authority.")}</p>
        </SettingsPanel>
        <SettingsPanel title={t("HMRC VAT connection")} description={t("Connect through HMRC's own sign-in page. Multideck keeps the authority for this legal entity on the tenant server.")}>
          {hmrcCallbackNotice ? <p role="status" className="px-5 py-3 text-[12px] text-[var(--md-text)]">{hmrcCallbackNotice}</p> : null}
          {hmrcError ? <p role="alert" className="px-5 py-3 text-[12px] text-[var(--md-red)]">{hmrcError}</p> : null}
          {hmrcConnections ? <div className="divide-y divide-[var(--md-line)] px-5">
            {hmrcConnections.length ? hmrcConnections.map((connection) => <div key={connection.connection_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[12px]">
              <div><p className="font-medium text-[var(--md-ink)]" data-i18n-skip>{connection.vrn} · {connection.environment === "sandbox" ? t("Sandbox") : t("Production")}</p>
                <p className="mt-1 text-[var(--md-text)]">{t(connection.status === "connected" ? "Connected" : connection.status === "reauthorisation_required" ? "Renewed HMRC consent required" : "Disconnected")} · {t("Authority expires")} <time dateTime={connection.authority_expires_at} data-i18n-skip>{dateTime.format(new Date(connection.authority_expires_at))}</time></p>
              </div>
              {canManage && connection.status === "connected" && connection.environment === "sandbox" ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void renewHmrcToken(connection.connection_id)}>{t("Renew access token")}</Button> : null}
            </div>) : <p className="py-3 text-[12px] text-[var(--md-subtle)]">{t("No HMRC VAT connection is recorded for this legal entity.")}</p>}
          </div> : !hmrcError ? <p className="px-5 py-3 text-[12px] text-[var(--md-subtle)]">{t("HMRC connection status is loading.")}</p> : null}
          <div className="flex flex-wrap items-center gap-3 px-5 py-3">
            {canManage ? <Button type="button" variant="outline" disabled={busy || !entityId || !registration?.registration || registration.registration.status === "not_configured"} onClick={() => void connectHmrcSandbox()}>{t("Connect HMRC sandbox")}</Button> : null}
            <p className="text-[11px] text-[var(--md-subtle)]">{t("Connection does not approve or submit a VAT return. HMRC obligation verification and filing remain unavailable.")}</p>
          </div>
        </SettingsPanel>
        <SettingsPanel title={t("Source coverage")} description={t("Every posted line needs captured and reviewed VAT evidence before a draft can be trusted.")}>
          {coverage ? <div className="grid gap-3 py-2 text-[12px] text-[var(--md-text)] sm:grid-cols-2 lg:grid-cols-4">
            <p>{t("Posted lines")}: <strong data-i18n-skip>{coverage.postedDocumentLines}</strong></p>
            <p>{t("Missing captures")}: <strong data-i18n-skip>{coverage.missingCapturedLines}</strong></p>
            <p>{t("Unreviewed events")}: <strong data-i18n-skip>{coverage.unreviewedEvents}</strong></p>
            <p>{t("Pending or reversed documents")}: <strong data-i18n-skip>{coverage.pendingOrReversedDocuments}</strong></p>
          </div> : <p className="py-3 text-[12px] text-[var(--md-subtle)]">{t("Coverage is loading.")}</p>}
          {canManage && coverage && coverage.missingCapturedLines > 0 ? <div className="mt-3 grid gap-3 border-t border-[var(--md-line)] pt-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Historical capture reason")}<Textarea value={backfillReason} onChange={(event) => setBackfillReason(event.target.value)} minLength={10} maxLength={1000} placeholder={t("Explain the historical posted-line capture.")} /></label><Button type="button" variant="outline" disabled={busy || backfillReason.trim().length < 10} onClick={() => void backfill()}>{t("Capture next 100 lines")}</Button></div> : null}
        </SettingsPanel>
        <SettingsPanel title={t("VAT evidence awaiting review")} description={t("Choose the VAT tax point from the source record and explain the treatment decision.")}>
          {queue?.items.length ? <div className="divide-y divide-[var(--md-line)]">{queue.items.map((item) => <div key={item.evidence_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[12px]"><div><p className="font-medium text-[var(--md-ink)]" data-i18n-skip>{item.document_number || item.document_id || item.evidence_id}</p><p className="mt-1 text-[var(--md-subtle)]">{t("Document date")}: <span data-i18n-skip>{item.document_date || "—"}</span> · {t("Net")}: <span data-i18n-skip>{money.format(Number(item.net_gbp))}</span> · {t("VAT")}: <span data-i18n-skip>{money.format(Number(item.vat_gbp))}</span> · <span data-i18n-skip>{item.tax_code || "—"}</span></p></div>{canManage ? <Button type="button" size="sm" variant="outline" onClick={() => { setReviewItem(item); setTaxPoint(item.document_date || ""); setReviewReason("") }}>{t("Review treatment")}</Button> : null}</div>)}</div> : <p className="py-3 text-[12px] text-[var(--md-subtle)]">{t(queue ? "No VAT evidence is waiting for review." : "Review queue is loading.")}</p>}
          {queue ? <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-[11px] text-[var(--md-subtle)]"><p>{t("Showing")} <span data-i18n-skip>{queue.items.length}</span> {t("of")} <span data-i18n-skip>{queue.totalUnreviewed}</span> {t("unreviewed events")}</p>{queue.nextCursor ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void loadMoreEvidence()}>{t("Load more evidence")}</Button> : null}</div> : null}
          {reviewItem ? <div className="mt-4 grid gap-3 border-t border-[var(--md-line)] pt-4 sm:grid-cols-[180px_minmax(0,1fr)]"><label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("VAT tax point")}<Input type="date" value={taxPoint} onChange={(event) => setTaxPoint(event.target.value)} /></label><label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Review reason")}<Textarea value={reviewReason} onChange={(event) => setReviewReason(event.target.value)} minLength={10} maxLength={2000} /></label><div className="flex gap-2 sm:col-span-2"><Button type="button" disabled={busy || !taxPoint || reviewReason.trim().length < 10} onClick={() => void review()}>{t("Save VAT review")}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setReviewItem(null)}>{t("Cancel")}</Button></div></div> : null}
        </SettingsPanel>
        <SettingsPanel title={t("Cash Accounting payment dates")} description={t("Record the date supported by each payment method and its evidence. These reviews prepare for Cash Accounting; they do not affect a VAT return yet.")}>
          {cashDateError ? <p role="alert" className="py-2 text-[12px] text-[var(--md-red)]">{cashDateError}</p> : null}
          {cashDateQueue ? <>
            {cashDateQueue.items.length ? <div className="divide-y divide-[var(--md-line)]">{cashDateQueue.items.map((item) => <div key={item.cash_id} className="py-3 text-[12px]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-[var(--md-ink)]" data-i18n-skip>{item.cash_number || item.cash_id} · {postingAmount(item.amount, item.currency_code)}</p>
                  <p className="mt-1 text-[var(--md-subtle)]">{t(item.cash_type === "customer_receipt" ? "Customer receipt" : "Supplier payment")} · {t("Ledger date")}: <span data-i18n-skip>{item.transaction_date}</span> · {t("Allocations")}: <span data-i18n-skip>{item.allocation_count}</span> · {t("Allocated")}: <span data-i18n-skip>{postingAmount(item.allocated_amount, item.currency_code)}</span></p>
                  <p className="mt-1 text-[var(--md-text)]">{t("Reviewed VAT payment date")}: <strong data-i18n-skip>{item.vat_payment_date || "—"}</strong>{item.method_code ? <> · {t(item.method_code.replaceAll("_", " "))} · <span data-i18n-skip>{item.evidence_reference}</span></> : null}</p>
                </div>
                {canManage ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => { setCashReviewId(item.cash_id); setCashReviewMethod(item.method_code || "bank_credit_or_debit"); setCashMethodDate(item.method_event_date || item.transaction_date); setCashChequeDate(item.cheque_date || ""); setCashEvidenceReference(item.evidence_reference || ""); setCashReviewReason("") }}>{t(item.review_id ? "Revise payment date" : "Review payment date")}</Button> : null}
              </div>
              {item.review_history.length ? <details className="mt-2 text-[11px] text-[var(--md-subtle)]"><summary className="cursor-pointer">{t("Payment date review history")} · <span data-i18n-skip>{item.review_history.length}</span></summary><div className="mt-2 space-y-2 border-l border-[var(--md-line)] pl-3">{item.review_history.map((entry) => <p key={entry.reviewId}><time dateTime={entry.reviewedAt} data-i18n-skip>{dateTime.format(new Date(entry.reviewedAt))}</time> · {t("Revision")} <span data-i18n-skip>{entry.revision}</span> · <span data-i18n-skip>{entry.vatPaymentDate}</span> · {t(entry.method.replaceAll("_", " "))} · <span data-i18n-skip>{entry.evidenceReference}</span> · <span data-i18n-skip>{entry.reason}</span></p>)}</div></details> : null}
              {cashReviewId === item.cash_id && canManage ? <div className="mt-3 grid gap-3 border-t border-[var(--md-line)] pt-3 sm:grid-cols-2">
                <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Payment method")}<Select value={cashReviewMethod} onValueChange={(value) => setCashReviewMethod(value as typeof cashReviewMethod)}><SelectTrigger aria-label={t("Payment method")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="bank_credit_or_debit">{t("Bank credit or debit")}</SelectItem><SelectItem value="cash_handover">{t("Cash handover")}</SelectItem><SelectItem value="card_voucher">{t("Card voucher")}</SelectItem><SelectItem value="cheque">{t("Cheque")}</SelectItem>{item.cash_type === "customer_receipt" ? <SelectItem value="agent_collection">{t("Agent collection")}</SelectItem> : null}</SelectContent></Select></label>
                <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t(cashReviewMethod === "cheque" ? "Cheque received or sent" : cashReviewMethod === "card_voucher" ? "Card voucher date" : cashReviewMethod === "agent_collection" ? "Agent collection date" : cashReviewMethod === "cash_handover" ? "Cash handover date" : "Bank credit or debit date")}<Input type="date" value={cashMethodDate} onChange={(event) => setCashMethodDate(event.target.value)} /></label>
                {cashReviewMethod === "cheque" ? <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Cheque date")}<Input type="date" value={cashChequeDate} onChange={(event) => setCashChequeDate(event.target.value)} /></label> : null}
                <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Payment evidence reference")}<Input value={cashEvidenceReference} onChange={(event) => setCashEvidenceReference(event.target.value)} maxLength={200} placeholder={t("Bank statement or receipt reference")} /></label>
                <label className="grid gap-1 text-[12px] text-[var(--md-text)] sm:col-span-2">{t("Review reason")}<Textarea value={cashReviewReason} onChange={(event) => setCashReviewReason(event.target.value)} minLength={10} maxLength={2000} /></label>
                <div className="flex flex-wrap gap-2 sm:col-span-2"><Button type="button" disabled={busy || !cashMethodDate || (cashReviewMethod === "cheque" && !cashChequeDate) || !cashEvidenceReference.trim() || cashReviewReason.trim().length < 10} onClick={() => void reviewCashDate()}>{t("Save payment date review")}</Button><Button type="button" variant="outline" disabled={busy} onClick={() => setCashReviewId(null)}>{t("Cancel")}</Button></div>
              </div> : null}
            </div>)}</div> : <p className="py-3 text-[12px] text-[var(--md-subtle)]">{t("No posted cash transactions are ready for payment date review.")}</p>}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 text-[11px] text-[var(--md-subtle)]"><p>{t("Showing")} <span data-i18n-skip>{cashDateQueue.offset + cashDateQueue.items.length}</span> {t("of")} <span data-i18n-skip>{cashDateQueue.total}</span> {t("posted cash transactions")}</p><div className="flex gap-2"><Button type="button" size="sm" variant="outline" disabled={busy || cashDateOffset === 0} onClick={() => { setCashReviewId(null); setCashDateOffset(Math.max(0, cashDateOffset - 25)) }}>{t("Previous")}</Button><Button type="button" size="sm" variant="outline" disabled={busy || cashDateOffset + cashDateQueue.items.length >= cashDateQueue.total} onClick={() => { setCashReviewId(null); setCashDateOffset(cashDateOffset + 25) }}>{t("Next")}</Button></div></div>
          </> : !cashDateError ? <p className="py-3 text-[12px] text-[var(--md-subtle)]">{t("Cash payment dates are loading.")}</p> : null}
        </SettingsPanel>
        <SettingsPanel title={t("Cash Accounting source preview")} description={t("Check posted GBP invoice allocations against reviewed payment dates and VAT lines. This is a source preview only; it cannot create or approve a return.")}>
          <div className="flex flex-wrap items-end gap-3 py-2">
            <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Start date")}<Input type="date" value={cashPreviewStart} onChange={(event) => { cashPreviewRequest.current += 1; setCashPreviewStart(event.target.value); setCashPreview(null); setCashPreviewError(null); setCashPreviewLoading(false) }} /></label>
            <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("End date")}<Input type="date" value={cashPreviewEnd} onChange={(event) => { cashPreviewRequest.current += 1; setCashPreviewEnd(event.target.value); setCashPreview(null); setCashPreviewError(null); setCashPreviewLoading(false) }} /></label>
            {selectedPeriod ? <Button type="button" size="sm" variant="outline" disabled={cashPreviewLoading} onClick={() => { cashPreviewRequest.current += 1; setCashPreviewStart(selectedPeriod.start_date); setCashPreviewEnd(selectedPeriod.end_date); setCashPreview(null); setCashPreviewError(null); setCashPreviewLoading(false) }}>{t("Use selected period")}</Button> : null}
            <Button type="button" size="sm" variant="outline" disabled={cashPreviewLoading || !entityId || !cashPreviewStart || !cashPreviewEnd || cashPreviewEnd < cashPreviewStart} onClick={() => void previewCashSources()}>{cashPreviewLoading ? <LoaderCircle className="size-4 animate-spin" /> : <Calculator className="size-4" />}{t("Preview cash sources")}</Button>
          </div>
          {cashPreviewError ? <p role="alert" className="py-2 text-[12px] text-[var(--md-red)]">{cashPreviewError}</p> : null}
          {cashPreview ? <div className="space-y-3 py-2 text-[12px]">
            <p role="status" className="text-[var(--md-text)]">{cashPreview.calculationValid ? t("All extracted sources passed this preview's checks.") : t("The cash source preview is blocked by missing or unsupported evidence.")} {t("Candidate allocations")}: <strong data-i18n-skip>{cashPreview.candidateAllocationCount}</strong> · {t("Excluded after accepted Standard return")}: <strong data-i18n-skip>{cashPreview.excludedAllocationCount}</strong>.</p>
            {cashPreview.issues.length ? <div role="alert" className="space-y-1 text-[var(--md-red)]"><p>{t("Issues")}: <span data-i18n-skip>{cashPreview.issueCount}</span></p><ul className="list-disc space-y-1 pl-5">{cashPreview.issues.map((issue, index) => <li key={`${index}-${issue}`} data-i18n-skip>{issue}</li>)}</ul></div> : null}
            {cashPreview.sourceBoxesGbp ? <div className="grid gap-3 sm:grid-cols-4">{([1, 4, 6, 7] as const).map((box) => <p key={box} className="text-[var(--md-text)]">{t("Candidate source Box")} <span data-i18n-skip>{box}</span>: <strong data-i18n-skip>{preciseMoney.format(Number(cashPreview.sourceBoxesGbp![box]))}</strong></p>)}</div> : null}
            {cashPreview.allocationLines.length ? <details className="text-[11px] text-[var(--md-subtle)]"><summary className="cursor-pointer">{t("Show source allocation lines")} · <span data-i18n-skip>{cashPreview.allocationLines.length}</span></summary><div className="mt-2 max-h-72 divide-y divide-[var(--md-line)] overflow-auto">{cashPreview.allocationLines.map((line) => <div key={`${line.allocationId}-${line.lineId}`} className="py-2"><p data-i18n-skip>{line.paymentDate} · {line.invoiceId} · {line.allocationId} · {line.treatment}</p><p>{t("Net")}: <span data-i18n-skip>{line.netGbp}</span> · {t("VAT")}: <span data-i18n-skip>{line.vatGbp}</span> · {t("Payment review")}: <span data-i18n-skip>{line.paymentReviewId}</span> · {t("Treatment review")}: <span data-i18n-skip>{line.treatmentReviewId}</span></p></div>)}</div></details> : null}
            {cashPreview.excludedAllocations.length ? <details className="text-[11px] text-[var(--md-subtle)]"><summary className="cursor-pointer">{t("Show excluded Standard-accounted payments")} · <span data-i18n-skip>{cashPreview.excludedAllocations.length}</span></summary><div className="mt-2 max-h-72 divide-y divide-[var(--md-line)] overflow-auto">{cashPreview.excludedAllocations.map((item) => <p key={item.allocationId} className="py-2"><span data-i18n-skip>{item.paymentDate} · {item.invoiceId} · {item.allocationId}</span> · {t("Production return accepted")} <time dateTime={item.standardAcceptedAt} data-i18n-skip>{dateTime.format(new Date(item.standardAcceptedAt))}</time></p>)}</div></details> : null}
            {canManage && cashPreview.calculationValid ? <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void recordCashProjection()}>{t("Record cash payment events")}</Button> : null}
            {cashProjectionError ? <p role="alert" className="text-[var(--md-red)]">{cashProjectionError}</p> : null}
            {cashProjections?.items.length ? <details className="text-[11px] text-[var(--md-subtle)]"><summary className="cursor-pointer">{t("Recorded cash event projections")} · <span data-i18n-skip>{cashProjections.items.length}</span></summary><div className="mt-2 max-h-72 divide-y divide-[var(--md-line)] overflow-auto">{cashProjections.items.map((item) => <div key={item.id} className="py-2"><p><time dateTime={item.projected_at} data-i18n-skip>{dateTime.format(new Date(item.projected_at))}</time> · {t(item.source_current ? "Current sources" : "Sources changed; recalculate")}</p><p>{t("Payment event lines")}: <span data-i18n-skip>{item.event_lines.length}</span> · {t("Candidate allocations")}: <span data-i18n-skip>{item.candidate_allocation_count}</span> · {t("Excluded Standard-accounted allocations")}: <span data-i18n-skip>{item.excluded_allocation_count}</span></p><p>{t("Source digest")}: <span className="break-all" data-i18n-skip>{item.source_digest}</span></p></div>)}</div></details> : null}
            <p className="text-[11px] text-[var(--md-subtle)]">{t("These are unrounded source amounts for supported GBP invoices. Accepted Standard-return invoices are excluded; unresolved or mixed scheme transitions block the preview. Recorded payment events are audit preparation only. Cash Accounting remains unavailable until credits, advances, currency conversion, VAT control and nine-box review are implemented.")}</p>
          </div> : null}
        </SettingsPanel>
        <SettingsPanel title={t("VAT periods")} description={t("Set ordinary quarterly dates from a return period end. HMRC obligations must still be verified before filing.")}>
          {canManage && registration?.registration?.schemeCode === "standard" ? <div className="flex flex-wrap items-end gap-3 border-b border-[var(--md-line)] py-3">
            <label className="grid min-w-40 gap-1 text-[12px] text-[var(--md-text)]">{t("Set quarter from")}<Select value={quarterReference} onValueChange={(value) => setQuarterReference(value as "last" | "next")}><SelectTrigger aria-label={t("Quarter reference")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="last">{t("Last return")}</SelectItem><SelectItem value="next">{t("Next return")}</SelectItem></SelectContent></Select></label>
            <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Return period end")}<Input type="date" value={returnPeriodEnd} onChange={(event) => setReturnPeriodEnd(event.target.value)} /></label>
            <Button type="button" variant="outline" disabled={busy || !suggestedQuarter} onClick={() => { if (suggestedQuarter) { setStartDate(suggestedQuarter.start); setEndDate(suggestedQuarter.end) } }}>{t("Use quarter dates")}</Button>
            {suggestedQuarter ? <p className="text-[12px] text-[var(--md-subtle)]" data-i18n-skip>{suggestedQuarter.start} – {suggestedQuarter.end}</p> : null}
          </div> : null}
          {canManage ? <div className="flex flex-wrap items-end gap-3 py-2"><label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Start date")}<Input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} /></label><label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("End date")}<Input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} /></label><Button type="button" variant="outline" disabled={busy || !startDate || !endDate || endDate < startDate} onClick={() => void preparePeriod()}>{t("Prepare draft period")}</Button></div> : null}
          {periods?.periods.length ? <div className="mt-3 flex flex-wrap items-end gap-3"><label className="grid min-w-64 gap-1 text-[12px] text-[var(--md-text)]">{t("Period")}<Select value={periodId} onValueChange={(value) => { setPeriodId(value); setDetail(null); setAccountOffset(0); setTaxPostingOffset(0); setSelected([]); setSelectedNotificationIds([]); setPriorDeadlineItemId(null); setPriorDeadlineHistory(null); setMethod1Items({}); setMethod1Reason(""); setMethod1Confirmed(false); setMethod1PostReason(""); setMethod1PostConfirmed(false); setNotificationConfirmed(false); setControlReason(""); setControlReviews(null); setFilingReason(""); setFilingReviews(null); setLockReason(""); setReopenReason(""); setReviewLocks(null); setFilingStatus(null); setDeclarationConfirmed(false); setRevocationReason("") }} disabled={busy}><SelectTrigger aria-label={t("VAT period")}><SelectValue /></SelectTrigger><SelectContent>{periods.periods.map((period) => <SelectItem key={period.period_id} value={period.period_id}>{period.start_date} – {period.end_date} · {period.scheme_code} · {period.status}</SelectItem>)}</SelectContent></Select></label>{canManage && periodId && selectedPeriod?.status === "draft" ? <Button type="button" disabled={busy} onClick={() => void calculate()}><Calculator />{t("Calculate draft")}</Button> : null}</div> : <p className="py-3 text-[12px] text-[var(--md-subtle)]">{t(periods ? "No VAT periods have been prepared." : "Periods are loading.")}</p>}
          {selectedPeriod?.latest_calculation_id ? <p className="mt-3 text-[12px] text-[var(--md-text)]">{t("Transaction sign-offs in latest draft")}: <strong data-i18n-skip>{selectedPeriod.signed_transaction_count}/{selectedPeriod.transaction_count}</strong>. {t("VAT control reconciliation and HMRC obligation verification remain separate checks.")}</p> : null}
        </SettingsPanel>
        {selectedPeriod ? <SettingsPanel title={t("Prior-period VAT errors")} description={t("Record errors found in an earlier submitted return. These records do not change this return or notify HMRC.")}>
          {priorErrorLoadError ? <p role="alert" className="py-2 text-[12px] text-[var(--md-red)]">{priorErrorLoadError}</p> : null}
          {priorErrors ? <div className="divide-y divide-[var(--md-line)] text-[12px]">
            {priorErrors.items.map((item) => <div key={item.id} className="py-3">
              {canManage && externalNotifications && !notifiedErrorIds.has(item.id) ? <label className="mb-2 flex items-center gap-2 text-[11px] text-[var(--md-text)]"><Checkbox aria-label={`${t("Select error for external notification")} ${item.source_reference}`} checked={selectedNotificationIds.includes(item.id)} onCheckedChange={(checked) => setSelectedNotificationIds((current) => checked === true ? [...current, item.id] : current.filter((id) => id !== item.id))} /><span>{t("Include in notification evidence")}</span></label> : null}
              <p className="font-medium text-[var(--md-ink)]" data-i18n-skip>{item.source_reference} · {money.format(Number(item.signed_vat_error_gbp))}</p>
              <p className="mt-1 text-[var(--md-subtle)]">{t("Original return")}: <span data-i18n-skip>{item.original_period_start} – {item.original_period_end}</span> · {t("Discovered")}: <span data-i18n-skip>{item.discovered_on}</span> · {t(item.tax_side === "input" ? "Input VAT" : "Output VAT")} · {t(item.effective_conduct === "reasonable_care" ? "Reasonable care" : item.effective_conduct === "careless" ? "Careless" : item.effective_conduct === "deliberate" ? "Deliberate" : "Conduct not determined")}{item.conduct_reviewed_at ? <> · {t("Reviewed")} <time dateTime={item.conduct_reviewed_at} data-i18n-skip>{dateTime.format(new Date(item.conduct_reviewed_at))}</time></> : <> · {t("Review required")}</>}</p>
              <p className="mt-1 text-[var(--md-text)]" data-i18n-skip>{item.explanation}</p>
              {item.conduct_review_history.length ? <details className="mt-2 text-[11px] text-[var(--md-subtle)]"><summary className="cursor-pointer">{t("Conduct review history")} · <span data-i18n-skip>{item.conduct_review_history.length}</span></summary><div className="mt-2 space-y-2 border-l border-[var(--md-line)] pl-3">{item.conduct_review_history.map((entry) => <p key={entry.reviewId}><time dateTime={entry.reviewedAt} data-i18n-skip>{dateTime.format(new Date(entry.reviewedAt))}</time> · {t(entry.conduct === "reasonable_care" ? "Reasonable care" : entry.conduct === "careless" ? "Careless" : "Deliberate")} · <span data-i18n-skip>{entry.reason}</span></p>)}</div></details> : null}
              {notifiedErrorIds.has(item.id) ? <p className="mt-2 text-[11px] text-[var(--md-subtle)]">{t("Linked to recorded external notification evidence")}</p> : null}
              {canManage && selectedPeriod.status === "draft" ? <Button type="button" size="sm" variant="outline" className="mt-2" disabled={busy} onClick={() => { setPriorConductItemId(item.id); setPriorReviewedConduct(item.effective_conduct === "undetermined" ? "reasonable_care" : item.effective_conduct); setPriorConductReason("") }}>{t(item.conduct_review_id ? "Revise conduct review" : "Review conduct")}</Button> : null}
              {priorConductItemId === item.id && canManage && selectedPeriod.status === "draft" ? <div className="mt-3 grid gap-3 border-t border-[var(--md-line)] pt-3 sm:grid-cols-[180px_minmax(0,1fr)_auto] sm:items-end">
                <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Reviewed conduct")}<Select value={priorReviewedConduct} onValueChange={(value) => setPriorReviewedConduct(value as typeof priorReviewedConduct)}><SelectTrigger aria-label={t("Reviewed conduct")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="reasonable_care">{t("Despite reasonable care")}</SelectItem><SelectItem value="careless">{t("Careless")}</SelectItem><SelectItem value="deliberate">{t("Deliberate")}</SelectItem></SelectContent></Select></label>
                <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Conduct review reason")}<Textarea value={priorConductReason} onChange={(event) => setPriorConductReason(event.target.value)} minLength={10} maxLength={2000} /></label>
                <div className="flex gap-2"><Button type="button" size="sm" disabled={busy || priorConductReason.trim().length < 10} onClick={() => void reviewPriorErrorConduct()}>{t("Save review")}</Button><Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setPriorConductItemId(null)}>{t("Cancel")}</Button></div>
              </div> : null}
              <Button type="button" size="sm" variant="outline" className="mt-2 ml-2" disabled={busy} onClick={() => void openPriorErrorDeadline(item.id)}>{t("Review four-year deadline")}</Button>
              {priorDeadlineItemId === item.id ? <div className="mt-3 space-y-3 border-t border-[var(--md-line)] pt-3">
                {priorDeadlineError ? <p role="alert" className="text-[var(--md-red)]">{priorDeadlineError}</p> : null}
                {priorDeadlineHistory ? <div className="space-y-1 text-[11px] text-[var(--md-subtle)]">
                  <p>{t("Error category")}: {t(item.tax_side === "output" ? Number(item.signed_vat_error_gbp) > 0 ? "Underdeclared output VAT" : "Overdeclared output VAT" : Number(item.signed_vat_error_gbp) > 0 ? "Overclaimed input VAT" : "Underclaimed input VAT")}</p>
                  {priorDeadlineHistory.reviews.map((review) => <p key={review.id}><time dateTime={review.reviewed_at} data-i18n-skip>{dateTime.format(new Date(review.reviewed_at))}</time> · {t("Deadline")}: <span data-i18n-skip>{review.statutory_deadline_on}</span> · {t(review.within_time_limit ? "In time at review" : "Outside ordinary limit at review")} · <span data-i18n-skip>{review.original_return_reference} / {review.evidence_reference}</span></p>)}
                  {!priorDeadlineHistory.reviews.length ? <p>{t("No dated deadline review has been recorded.")}</p> : null}
                </div> : !priorDeadlineError ? <p className="text-[11px] text-[var(--md-subtle)]">{t("Deadline reviews are loading.")}</p> : null}
                {canManage && selectedPeriod.status === "draft" ? <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="grid gap-1">{t("Original filed return reference")}<Input value={priorReturnReference} maxLength={160} onChange={(event) => setPriorReturnReference(event.target.value)} /></label>
                  {item.tax_side === "input" && Number(item.signed_vat_error_gbp) < 0 ? <label className="grid gap-1">{t("Original return due date")}<Input type="date" value={priorReturnDueOn} onChange={(event) => setPriorReturnDueOn(event.target.value)} /></label> : null}
                  <label className="grid gap-1">{t("Supporting evidence reference")}<Input value={priorDeadlineEvidence} maxLength={160} onChange={(event) => setPriorDeadlineEvidence(event.target.value)} /></label>
                  <label className="grid gap-1">{t("Review reason")}<Textarea value={priorDeadlineReason} minLength={10} maxLength={2000} onChange={(event) => setPriorDeadlineReason(event.target.value)} /></label>
                  <div className="flex flex-wrap items-end gap-2"><Button type="button" size="sm" disabled={busy || priorReturnReference.trim().length < 3 || priorDeadlineEvidence.trim().length < 3 || priorDeadlineReason.trim().length < 10 || (item.tax_side === "input" && Number(item.signed_vat_error_gbp) < 0 && !priorReturnDueOn)} onClick={() => void reviewPriorErrorDeadline()}>{t("Record deadline review")}</Button><Button type="button" size="sm" variant="outline" onClick={() => setPriorDeadlineItemId(null)}>{t("Close")}</Button></div>
                </div> : null}
                <p className="text-[11px] text-[var(--md-subtle)]">{t("This assessment does not correct the VAT account, change this return or notify HMRC. Time-of-supply and deliberate-error exceptions need specialist review.")}</p>
              </div> : null}
            </div>)}
            {!priorErrors.items.length ? <p className="py-3 text-[var(--md-subtle)]">{t("No prior-period VAT errors have been recorded for this period.")}</p> : null}
            {priorErrors.total > priorErrors.items.length ? <p className="py-2 text-[var(--md-subtle)]">{t("Showing the first 100 records.")}</p> : null}
          </div> : !priorErrorLoadError ? <p className="py-3 text-[12px] text-[var(--md-subtle)]">{t("Prior-period errors are loading.")}</p> : null}
          {canManage ? <div className="border-t border-[var(--md-line)] py-3 text-[12px]">
            <label className="flex items-center gap-2 text-[var(--md-text)]"><Checkbox checked={priorChooseSeparate} onCheckedChange={(checked) => setPriorChooseSeparate(checked === true)} /><span>{t("Preview voluntary separate notification")}</span></label>
            {priorErrorPreviewError ? <p role="alert" className="mt-2 text-[var(--md-red)]">{priorErrorPreviewError}</p> : null}
            {priorErrorPreview ? <div className="mt-2 space-y-1 text-[var(--md-text)]">
              <p>{t("Net VAT error")}: <strong data-i18n-skip>{money.format(Number(priorErrorPreview.netErrorGbp))}</strong> · {t("Recorded errors")}: <strong data-i18n-skip>{priorErrorPreview.itemCount}</strong></p>
              <p className="font-medium text-[var(--md-ink)]">{t(priorErrorPreview.method === "current_return_adjustment" ? "Potential Method 1: current-return adjustment" : priorErrorPreview.method === "separate_notification" ? "Potential Method 2: separate HMRC notification" : priorErrorPreview.method === "needs_reviewed_current_box6" ? "Review current Box 6 before choosing a method" : priorErrorPreview.method === "external_notification_evidence_recorded" ? "All errors are linked to recorded external notification evidence" : priorErrorPreview.method === "notification_history_review_required" ? "Review new errors alongside the notification history" : "No errors to assess")}</p>
              {priorErrorPreview.externallyNotifiedCount > 0 ? <p>{t("Linked to external notification evidence")}: <strong data-i18n-skip>{priorErrorPreview.externallyNotifiedCount}</strong> · {t("Still unlinked")}: <strong data-i18n-skip>{priorErrorPreview.unnotifiedCount}</strong>. {t("Do not include already notified errors on this return.")}</p> : null}
              {priorErrorPreview.unnotifiedCount > 0 && method1Postings?.postings.length === 0 ? <p role="alert" className="font-medium text-[var(--md-red)]">{t("Unresolved previous-return errors block final VAT declaration and dispatch. Complete and lock a reviewed Method 1 correction, or record evidence only after a separate HMRC notification has actually been sent.")}</p> : null}
              {method1Postings?.postings.length ? <p role="status">{t("A Method 1 correction was posted for this period. Its evidence must be calculated, reconciled and included in the active review lock before filing.")}</p> : null}
              {priorErrorPreview.reviewedBox6Gbp !== null ? <p>{t("Reviewed current Box 6")}: <span data-i18n-skip>{money.format(Number(priorErrorPreview.reviewedBox6Gbp))}</span></p> : null}
              {priorErrorPreview.immediateNotificationReviewRequired && priorErrorPreview.externallyNotifiedCount === 0 ? <p role="alert" className="font-medium text-[var(--md-red)]">{t("An individual error may require immediate Method 2 notification to HMRC. Review and notify without waiting for this VAT period to end.")}</p> : null}
              {priorErrorPreview.conductReviewRequired ? <p role="status">{t("At least one error still needs a conduct decision.")}</p> : null}
              {priorErrorPreview.carelessDisclosureAdvisory ? <p role="status">{t("A careless error may need separate disclosure for penalty reduction, even under Method 1.")}</p> : null}
              {priorErrorPreview.timeLimitReviewRequired ? <p>{t("Check the statutory time limit and original return evidence before any correction is approved.")}</p> : null}
              <p className="text-[var(--md-subtle)]">{t("This is a method preview only. No return has been adjusted and no notification has been sent.")}</p>
            </div> : !priorErrorPreviewError ? <p className="mt-2 text-[var(--md-subtle)]">{t("Correction method preview is loading.")}</p> : null}
          </div> : null}
          <div className="border-t border-[var(--md-line)] py-3 text-[12px]">
            <p className="font-medium text-[var(--md-ink)]">{t("Method 1 posting plan")}</p>
            <p className="mt-1 text-[var(--md-subtle)]">{t("Review every error against the current draft. Enter the change to sales (Box 6) or purchases (Box 7), including zero for a VAT-only correction, and choose an offset account. This plan does not post a journal or change the return.")}</p>
            {method1Error ? <p role="alert" className="mt-2 text-[var(--md-red)]">{method1Error}</p> : null}
            {method1Plans?.plans.length ? <details className="mt-2 text-[11px] text-[var(--md-subtle)]"><summary className="cursor-pointer">{t("Reviewed Method 1 plans")} · <span data-i18n-skip>{method1Plans.plans.length}</span></summary><div className="mt-2 divide-y divide-[var(--md-line)]">{method1Plans.plans.map((plan) => <div key={plan.id} className="py-2"><p><time dateTime={plan.reviewed_at} data-i18n-skip>{dateTime.format(new Date(plan.reviewed_at))}</time> · {t("Net error")}: <span data-i18n-skip>{money.format(Number(plan.net_error_gbp))}</span> · {t("Planned filed Box 6")}: <span data-i18n-skip>{money.format(Number(plan.planned_filed_box6_gbp))}</span> · {t(plan.base_source_digest === detail?.sourceDigest && plan.item_count === priorErrors?.total ? "Base sources unchanged; recheck reviews before posting" : "Sources or error list changed; review again")}</p><p>{t("Items")}: <span data-i18n-skip>{plan.item_count}</span> · <span data-i18n-skip>{plan.plan_fingerprint}</span></p></div>)}</div></details> : null}
            {method1Postings?.postings.map((posting) => <div key={posting.id} className="mt-3 space-y-1 border-t border-[var(--md-line)] pt-3 text-[var(--md-text)]"><p className="font-medium text-[var(--md-ink)]">{t("Method 1 correction posted")} · <time dateTime={posting.postedAt} data-i18n-skip>{dateTime.format(new Date(posting.postedAt))}</time></p><p>{t("Posting batch")}: <span data-i18n-skip>{posting.batchId}</span> · {t("Evidence items")}: <span data-i18n-skip>{posting.itemCount}</span></p><p>{t("Calculate the draft, reconcile the adjustment and review the VAT control before locking the return.")}</p><details><summary className="cursor-pointer">{t("Posting evidence")}</summary><div className="mt-2 space-y-1">{posting.items.map((item) => <p key={item.intakeId} data-i18n-skip>{item.evidenceReference} · {item.intakeId} · {item.evidenceId} · {item.taxPostingLineId}</p>)}</div></details></div>)}
            {canManage && selectedPeriod.status === "draft" && method1Postings?.postings.length === 0 && method1Plans?.plans[0] ? <div className="mt-3 space-y-2 border-t border-[var(--md-line)] pt-3 text-[12px]"><p className="font-medium text-[var(--md-ink)]">{t("Post the latest reviewed Method 1 plan")}</p><p className="text-[var(--md-subtle)]">{t("This creates an immutable balanced journal and VAT evidence. Posting is allowed only after the period ends and the server rechecks every review, source and threshold.")}</p><label className="grid gap-1">{t("Posting reason")}<Textarea value={method1PostReason} minLength={10} maxLength={2000} onChange={(event) => setMethod1PostReason(event.target.value)} /></label><label className="flex items-start gap-2"><Checkbox checked={method1PostConfirmed} onCheckedChange={(checked) => setMethod1PostConfirmed(checked === true)} /><span>{t("I have checked the latest reviewed plan and authorise its ledger posting.")}</span></label><Button type="button" size="sm" disabled={busy || !method1PostConfirmed || method1PostReason.trim().length < 10} onClick={() => void postMethod1Plan()}>{t("Post Method 1 correction")}</Button></div> : null}
            {canManage && selectedPeriod.status === "draft" && method1Postings?.postings.length === 0 && priorErrors?.items.length && priorErrors.total === priorErrors.items.length && !externalNotifications?.notifiedIntakeIds.length && detail ? <div className="mt-3 space-y-3">
              {priorErrors.items.map((item) => <div key={item.id} className="grid gap-3 border-t border-[var(--md-line)] pt-3 sm:grid-cols-3">
                <p className="sm:col-span-3"><strong data-i18n-skip>{item.source_reference}</strong> · {t(item.tax_side === "output" ? "Sales correction" : "Purchase correction")} · <span data-i18n-skip>{money.format(Number(item.signed_vat_error_gbp))}</span> {t("VAT error")}</p>
                <label className="grid gap-1">{t(item.tax_side === "output" ? "Box 6 change (£)" : "Box 7 change (£)")}<Input inputMode="decimal" value={method1Items[item.id]?.boxNetDeltaGbp ?? ""} onChange={(event) => updateMethod1Item(item.id, "boxNetDeltaGbp", event.target.value)} placeholder="0.00" /></label>
                <label className="grid gap-1">{t("Offset nominal account")}<Select value={method1Items[item.id]?.offsetNominalId ?? ""} onValueChange={(value) => updateMethod1Item(item.id, "offsetNominalId", value)}><SelectTrigger aria-label={`${t("Offset nominal account")} ${item.source_reference}`}><SelectValue placeholder={t("Choose an account")} /></SelectTrigger><SelectContent>{method1Offsets?.nominals.map((nominal) => <SelectItem key={nominal.id} value={nominal.id}>{nominal.code} · {nominal.name}</SelectItem>)}</SelectContent></Select></label>
                <label className="grid gap-1">{t("Supporting evidence reference")}<Input value={method1Items[item.id]?.evidenceReference ?? ""} maxLength={160} onChange={(event) => updateMethod1Item(item.id, "evidenceReference", event.target.value)} /></label>
              </div>)}
              <label className="grid gap-1">{t("Method 1 review reason")}<Textarea value={method1Reason} minLength={10} maxLength={2000} onChange={(event) => setMethod1Reason(event.target.value)} /></label>
              <label className="flex items-start gap-2"><Checkbox checked={method1Confirmed} onCheckedChange={(checked) => setMethod1Confirmed(checked === true)} /><span>{t("I have reviewed all errors discovered in this period and the original return evidence. The posting step must recheck this plan.")}</span></label>
              <Button type="button" size="sm" disabled={busy || !method1Confirmed || method1Reason.trim().length < 10 || !method1Offsets || priorErrors.items.some((item) => !/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(method1Items[item.id]?.boxNetDeltaGbp ?? "") || !method1Items[item.id]?.offsetNominalId || (method1Items[item.id]?.evidenceReference.trim().length ?? 0) < 3)} onClick={() => void reviewMethod1Plan()}>{t("Review Method 1 plan")}</Button>
            </div> : null}
          </div>
          <div className="border-t border-[var(--md-line)] py-3 text-[12px]">
            <p className="font-medium text-[var(--md-ink)]">{t("Separate HMRC error notifications")}</p>
            <p className="mt-1 text-[var(--md-subtle)]">{t("Record evidence of a Method 2 notification already sent through HMRC's separate process. This does not send or verify anything with HMRC.")}</p>
            {externalNotificationError ? <p role="alert" className="mt-2 text-[var(--md-red)]">{externalNotificationError}</p> : null}
            {externalNotifications?.items.length ? <div className="mt-2 divide-y divide-[var(--md-line)]">{externalNotifications.items.map((item) => <div key={item.id} className="py-2 text-[var(--md-text)]"><p className="font-medium" data-i18n-skip>{item.evidence_reference}</p><p>{t(item.channel === "hmrc_online" ? "HMRC online" : "Letter")} · {t("Notified")} <span data-i18n-skip>{item.notified_on}</span> · {t("Errors")}: <span data-i18n-skip>{item.item_count}</span> · {t("Net VAT error")}: <span data-i18n-skip>{money.format(Number(item.net_error_gbp))}</span></p><p className="mt-1 text-[var(--md-subtle)]" data-i18n-skip>{item.explanation}</p></div>)}</div> : externalNotifications ? <p className="mt-2 text-[var(--md-subtle)]">{t("No external notification evidence recorded.")}</p> : !externalNotificationError ? <p className="mt-2 text-[var(--md-subtle)]">{t("Notification evidence is loading.")}</p> : null}
            {externalNotifications && externalNotifications.total > externalNotifications.items.length ? <p className="mt-2 text-[var(--md-subtle)]">{t("Showing the first 100 notification records.")}</p> : null}
            {canManage && externalNotifications ? <div className="mt-3 grid gap-3 border-t border-[var(--md-line)] pt-3 sm:grid-cols-2 lg:grid-cols-4">
              <p className="text-[var(--md-text)] sm:col-span-2 lg:col-span-4">{t("Selected errors")}: <strong data-i18n-skip>{selectedNotificationIds.length}</strong>. {t("Each error can be linked to one recorded notification only.")}</p>
              <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Date notified")}<Input type="date" min={selectedNotificationMinDate || undefined} value={notificationDate} onChange={(event) => setNotificationDate(event.target.value)} /></label>
              <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Notification channel")}<Select value={notificationChannel} onValueChange={(value) => setNotificationChannel(value as typeof notificationChannel)}><SelectTrigger aria-label={t("Notification channel")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="hmrc_online">{t("HMRC online")}</SelectItem><SelectItem value="letter">{t("Letter")}</SelectItem></SelectContent></Select></label>
              <label className="grid gap-1 text-[12px] text-[var(--md-text)] sm:col-span-2">{t("Evidence reference")}<Input value={notificationReference} maxLength={160} onChange={(event) => setNotificationReference(event.target.value)} placeholder={t("Online acknowledgement or postal tracking")} /></label>
              <label className="grid gap-1 text-[12px] text-[var(--md-text)] sm:col-span-2 lg:col-span-4">{t("Notification evidence and explanation")}<Textarea value={notificationExplanation} onChange={(event) => setNotificationExplanation(event.target.value)} minLength={10} maxLength={2000} /></label>
              <label className="flex items-center gap-2 text-[12px] text-[var(--md-text)] sm:col-span-2 lg:col-span-4"><Checkbox checked={notificationConfirmed} onCheckedChange={(checked) => setNotificationConfirmed(checked === true)} /><span>{t("I confirm this separate notification was already sent outside Multideck.")}</span></label>
              <Button type="button" className="sm:col-span-2 lg:col-span-4" disabled={busy || !selectedNotificationIds.length || !notificationDate || notificationDate < selectedNotificationMinDate || notificationReference.trim().length < 3 || notificationExplanation.trim().length < 10 || !notificationConfirmed} onClick={() => void recordExternalNotification()}>{t("Record external notification evidence")}</Button>
            </div> : null}
          </div>
          {canManage && selectedPeriod.status === "draft" ? <div className="grid gap-3 border-t border-[var(--md-line)] py-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Original period start")}<Input type="date" value={priorOriginalStart} onChange={(event) => setPriorOriginalStart(event.target.value)} /></label>
            <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Original period end")}<Input type="date" value={priorOriginalEnd} onChange={(event) => setPriorOriginalEnd(event.target.value)} /></label>
            <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Date discovered")}<Input type="date" min={selectedPeriod.start_date} max={selectedPeriod.end_date} value={priorDiscoveredOn} onChange={(event) => setPriorDiscoveredOn(event.target.value)} /></label>
            <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Source reference")}<Input value={priorSourceReference} maxLength={160} onChange={(event) => setPriorSourceReference(event.target.value)} placeholder={t("Invoice or error reference")} /></label>
            <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("VAT side")}<Select value={priorTaxSide} onValueChange={(value) => setPriorTaxSide(value as "input" | "output")}><SelectTrigger aria-label={t("VAT side")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="input">{t("Input VAT")}</SelectItem><SelectItem value="output">{t("Output VAT")}</SelectItem></SelectContent></Select></label>
            <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Signed VAT error (GBP)")}<Input type="text" inputMode="decimal" value={priorSignedVat} onChange={(event) => setPriorSignedVat(event.target.value)} placeholder="12500.00" data-i18n-skip /></label>
            <label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("How the error arose")}<Select value={priorConduct} onValueChange={(value) => setPriorConduct(value as typeof priorConduct)}><SelectTrigger aria-label={t("Error conduct")}><SelectValue /></SelectTrigger><SelectContent><SelectItem value="undetermined">{t("Not determined")}</SelectItem><SelectItem value="reasonable_care">{t("Despite reasonable care")}</SelectItem><SelectItem value="careless">{t("Careless")}</SelectItem><SelectItem value="deliberate">{t("Deliberate")}</SelectItem></SelectContent></Select></label>
            <label className="grid gap-1 text-[12px] text-[var(--md-text)] sm:col-span-2 lg:col-span-4">{t("What went wrong")}<Textarea minLength={10} maxLength={2000} value={priorExplanation} onChange={(event) => setPriorExplanation(event.target.value)} /></label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2 lg:col-span-4"><Button type="button" disabled={busy || !priorOriginalStart || !priorOriginalEnd || priorOriginalEnd < priorOriginalStart || priorOriginalEnd >= selectedPeriod.start_date || !priorDiscoveredOn || priorDiscoveredOn < selectedPeriod.start_date || priorDiscoveredOn > selectedPeriod.end_date || priorSourceReference.trim().length < 3 || !/^-?(?:0|[1-9]\d*)(?:\.\d{1,2})?$/.test(priorSignedVat.trim()) || Number(priorSignedVat) === 0 || priorExplanation.trim().length < 10} onClick={() => void recordPriorError()}>{t("Record error for assessment")}</Button><p className="text-[11px] text-[var(--md-subtle)]">{t("Positive means VAT due to HMRC; negative means VAT due to the business. A reviewer must check time limits, conduct and correction method. Careless errors may need separate disclosure for penalty reduction.")}</p></div>
          </div> : null}
        </SettingsPanel> : null}
        {selectedPeriod ? <SettingsPanel title={t("Supplier input VAT checks")} description={t("Unpaid supplier invoices at this period end may need the six-month input VAT clawback review.")}>
          <div className="flex flex-wrap items-center justify-between gap-3 py-2">
            <p className="text-[12px] text-[var(--md-text)]">{clawback ? <>{t("Potential cases")}: <strong data-i18n-skip>{clawback.totalCandidates}</strong></> : t(clawbackError ? "Supplier VAT checks are unavailable." : "Checking supplier invoices...")}</p>
            <Button type="button" size="sm" variant="outline" disabled={!entityId || !periodId} onClick={() => setClawbackRefresh((value) => value + 1)}><RefreshCw />{t("Refresh checks")}</Button>
          </div>
          {clawbackError ? <p role="alert" className="py-2 text-[12px] text-[var(--md-red)]">{clawbackError}</p> : null}
          {clawback?.items.length ? <div className="divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]">
            {clawback.items.map((item) => <div key={item.document_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[12px]">
              <div className="min-w-0"><p className="font-medium text-[var(--md-ink)]" data-i18n-skip>{item.document_number || item.document_id}</p>
                <p className="mt-1 text-[var(--md-subtle)]">{t("First possible clawback date")}: <span data-i18n-skip>{item.first_possible_clawback_date}</span> · {t("Due")}: <span data-i18n-skip>{item.due_date || item.document_date}</span> · {t("Unpaid at period end")}: <span data-i18n-skip>{item.currency_code} {sourceAmount.format(Number(item.unpaid_at_period_end))}</span></p></div>
              <div className="flex flex-wrap gap-2">
                <Button type="button" size="sm" variant="outline" onClick={() => openSupplierVat(item)}>{t(canManage ? "Review VAT" : "VAT history")}</Button>
                {canOpenPayables ? <Button type="button" size="sm" variant="outline" onClick={() => navigate(`/finance/payables/documents/${item.document_id}`)}>{t("Open invoice")}</Button> : null}
              </div>
            </div>)}
          </div> : clawback && !clawbackError ? <p className="py-2 text-[12px] text-[var(--md-subtle)]">{t("No aged unpaid supplier VAT candidates were found for this period.")}</p> : null}
          {clawback && clawback.totalCandidates > clawback.items.length ? <p className="pt-2 text-[11px] text-[var(--md-subtle)]">{t("Showing the first 50 cases. Review the remaining supplier invoices before calculating this period.")}</p> : null}
          {supplierDocumentId ? <div className="mt-3 space-y-3 border-t border-[var(--md-line)] pt-3 text-[12px] text-[var(--md-text)]">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><p className="font-medium text-[var(--md-ink)]">{t(supplierKind === "first" ? "Six-month input VAT repayment" : "Later supplier payment restoration")}</p>
                <p className="mt-1" data-i18n-skip>{clawback?.items.find((item) => item.document_id === supplierDocumentId)?.document_number || supplierDocumentId}</p></div>
              <Button type="button" size="sm" variant="outline" onClick={() => setSupplierDocumentId(null)}>{t("Close")}</Button>
            </div>
            {supplierError ? <p role="alert" className="text-[var(--md-red)]">{supplierError}</p> : null}
            {!supplierHistory && !supplierError ? <p>{t("Loading supplier VAT history...")}</p> : null}
            {canManage && !supplierSource && !supplierError ? <p>{t("Checking the filed claim and supplier payments...")}</p> : null}
            {supplierSource ? <div className="space-y-1">
              <p>{t("Verified source")} · {supplierKind === "first"
                ? <><span>{t("Originally claimed input VAT")}: </span><strong data-i18n-skip>{money.format(Number(supplierSource.originallyClaimedInputVatGbp || 0))}</strong> · <span>{t("First repayment date")}: </span><span data-i18n-skip>{supplierSource.firstPossibleRepaymentDate}</span></>
                : <><span>{t("Box 4 restoration")}: </span><strong data-i18n-skip>{money.format(Number(supplierSource.restorationBox4Gbp || 0))}</strong> · <span>{t("Outstanding previous repayment")}: </span><span data-i18n-skip>{money.format(Number(supplierSource.priorRepaymentOutstandingGbp || 0))}</span></>}</p>
              {supplierSource.events?.length ? <div className="divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]">{supplierSource.events.map((event) => <p key={event.eventDate} className="py-1"><time dateTime={event.eventDate} data-i18n-skip>{event.eventDate}</time> · <span data-i18n-skip>{money.format(Number(event.signedBox4DeltaGbp))}</span> {t("in Box 4")}</p>)}</div> : null}
              {supplierSource.status === "source_only_no_tax_effect" ? <p>{t("This payment changes the unpaid balance but adds no whole penny to Box 4. It still needs a reviewed confirmation.")}</p> : null}
            </div> : null}
            {supplierHistory?.firstPostings.map((posting) => <p key={posting.postingId} role="status">{t("Six-month repayment posted")} · <time dateTime={posting.postedAt} data-i18n-skip>{dateTime.format(new Date(posting.postedAt))}</time> · <span data-i18n-skip>{money.format(Number(posting.box4DeltaGbp))}</span> {t("in Box 4")}</p>)}
            {supplierHistory?.laterPostings.map((posting) => <p key={posting.postingId} role="status">{t(posting.status === "zero_tax_effect_confirmed" ? "Zero-effect supplier payment confirmed" : "Later supplier VAT restoration posted")} · <time dateTime={posting.postedAt} data-i18n-skip>{dateTime.format(new Date(posting.postedAt))}</time> · <span data-i18n-skip>{money.format(Number(posting.restorationBox4Gbp))}</span> {t("in Box 4")}</p>)}
            {supplierHistory?.firstProposals.length || supplierHistory?.firstReviews.length || supplierHistory?.laterReviews.length ? <details>
              <summary className="cursor-pointer">{t("Review history")}</summary>
              <div className="mt-2 space-y-1">
                {supplierHistory.firstProposals.map((proposal) => <p key={proposal.proposalId}>{t("Repayment prepared")} · <time dateTime={proposal.preparedAt} data-i18n-skip>{dateTime.format(new Date(proposal.preparedAt))}</time> · <span data-i18n-skip>{money.format(Number(proposal.proposedBox4DeltaGbp))}</span></p>)}
                {supplierHistory.firstReviews.map((review) => <p key={review.reviewId}>{t(review.revokedAt ? "Review revoked" : "Repayment reviewed")} · <time dateTime={review.reviewedAt} data-i18n-skip>{dateTime.format(new Date(review.reviewedAt))}</time></p>)}
                {supplierHistory.laterReviews.map((review) => <p key={review.reviewId}>{t("Restoration reviewed")} · <time dateTime={review.reviewedAt} data-i18n-skip>{dateTime.format(new Date(review.reviewedAt))}</time> · <span data-i18n-skip>{money.format(Number(review.restorationBox4Gbp))}</span></p>)}
              </div>
            </details> : null}
            {canManage && selectedPeriod.status === "draft" && selectedPeriod.scheme_code === "standard"
              && supplierSource && supplierHistory && !supplierHasPosting ? <div className="space-y-3 border-t border-[var(--md-line)] pt-3">
                {supplierKind === "first" && !supplierCurrentProposal ? <div className="grid gap-2">
                  <p className="font-medium text-[var(--md-ink)]">{t("1. Prepare the six-month repayment")}</p>
                  <label className="grid gap-1">{t("Preparation reason")}<Textarea minLength={10} maxLength={2000} value={supplierPrepareReason} onChange={(event) => setSupplierPrepareReason(event.target.value)} /></label>
                  <Button type="button" size="sm" disabled={busy || supplierPrepareReason.trim().length < 10} onClick={() => void prepareSupplierVat()}>{t("Prepare repayment")}</Button>
                </div> : null}
                {(supplierKind === "later" || supplierCurrentProposal) && !supplierCurrentReview ? <div className="grid gap-2">
                  <p className="font-medium text-[var(--md-ink)]">{t(supplierKind === "first" ? "2. Review the repayment" : "1. Review the later payment")}</p>
                  {supplierCurrentProposal ? <p>{t("Proposed Box 4 change")}: <strong data-i18n-skip>{money.format(Number(supplierCurrentProposal.proposedBox4DeltaGbp))}</strong></p> : null}
                  <label className="grid gap-1">{t("Offset nominal account")}<Select value={supplierOffsetNominalId} onValueChange={setSupplierOffsetNominalId}><SelectTrigger aria-label={t("Supplier VAT offset nominal account")}><SelectValue placeholder={t("Choose an account")} /></SelectTrigger><SelectContent>{method1Offsets?.nominals.map((nominal) => <SelectItem key={nominal.id} value={nominal.id}>{nominal.code} · {nominal.name}</SelectItem>)}</SelectContent></Select></label>
                  <label className="grid gap-1">{t("Accountant review reason")}<Textarea minLength={10} maxLength={2000} value={supplierReviewReason} onChange={(event) => setSupplierReviewReason(event.target.value)} /></label>
                  <label className="flex items-start gap-2"><Checkbox checked={supplierReviewConfirmed} onCheckedChange={(checked) => setSupplierReviewConfirmed(checked === true)} /><span>{t("I have checked the filed claim, supplier payments and proposed VAT treatment.")}</span></label>
                  <Button type="button" size="sm" disabled={busy || !supplierReviewConfirmed || !supplierOffsetNominalId || supplierReviewReason.trim().length < 10} onClick={() => void reviewSupplierVat()}>{t("Record accountant review")}</Button>
                </div> : null}
                {supplierCurrentReview ? <div className="grid gap-2">
                  <p className="font-medium text-[var(--md-ink)]">{t(supplierKind === "first" ? "3. Post the reviewed repayment" : "2. Record the reviewed restoration")}</p>
                  <p>{t("Posting creates dated VAT evidence and a balanced journal when Box 4 changes. Recalculate and reconcile the return afterwards.")}</p>
                  <label className="grid gap-1">{t("Posting reason")}<Textarea minLength={10} maxLength={2000} value={supplierPostReason} onChange={(event) => setSupplierPostReason(event.target.value)} /></label>
                  <label className="flex items-start gap-2"><Checkbox checked={supplierPostConfirmed} onCheckedChange={(checked) => setSupplierPostConfirmed(checked === true)} /><span>{t("I authorise this reviewed supplier VAT posting.")}</span></label>
                  <Button type="button" size="sm" disabled={busy || !supplierPostConfirmed || supplierPostReason.trim().length < 10} onClick={() => void postSupplierVat()}>{t("Record VAT adjustment")}</Button>
                </div> : null}
              </div> : null}
            {supplierHasPosting ? <p>{t("Recalculate the draft, reconcile the VAT evidence and control account, then review-lock the return before filing.")}</p> : null}
          </div> : null}
          <p className="pt-2 text-[11px] text-[var(--md-subtle)]">{t("Candidates need an accountant's source review. Posting is separate from return reconciliation and filing approval.")}</p>
        </SettingsPanel> : null}
        {detail ? <SettingsPanel title={t("Draft nine-box calculation")} description={t("Source lines are traceable. Dated control review is separate; filing approval remains outstanding.")}>
          <div className="grid gap-2 py-2 sm:grid-cols-3 lg:grid-cols-9">{Array.from({ length: 9 }, (_, index) => <div key={index} className="min-w-0"><p className="text-[11px] text-[var(--md-subtle)]">{t("Box")} {index + 1}</p><p className="text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip>{money.format(Number(detail.boxes[String(index + 1)] || 0))}</p></div>)}</div>
          <p className="mt-2 text-[12px] text-[var(--md-text)]">{t("Source ledger")}: <strong>{t(sourceLedger?.status === "matched" ? "Matched" : "Mismatch")}</strong> · {t("Return approval")}: <strong>{t("Pending")}</strong> · {t("Revision")} <span data-i18n-skip>{detail.revision}</span></p>
          {sourceLedger?.status !== "matched" ? <p role="alert" className="mt-2 text-[12px] text-[var(--md-red)]">{t("Resolve source-to-ledger differences before signing off transactions.")}</p> : null}
          {sourceLedger?.mismatchSample?.length ? <div className="mt-2 divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]">{sourceLedger.mismatchSample.map((item) => <div key={item.evidenceId} className="py-2 text-[11px] text-[var(--md-text)]"><p data-i18n-skip>{item.documentId}</p><p className="mt-1 text-[var(--md-subtle)]">{t("Source VAT")}: <span data-i18n-skip>{money.format(Number(item.vatGbp))}</span> · {t("Posted VAT")}: <span data-i18n-skip>{money.format(Math.abs(Number(item.taxPosted)))}</span> · {t("Expected VAT account")}: <span data-i18n-skip>{item.expectedTaxNominalCode || item.expectedTaxNominalId || "—"}</span> · {t("Posted VAT accounts")}: <span data-i18n-skip>{item.postedTaxNominalCodes.join(", ") || item.postedTaxNominalIds.join(", ") || "—"}</span></p></div>)}</div> : null}
          <div className="mt-4 divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]">{transactions.map((item) => <div key={item.evidence_id} className="flex flex-wrap items-center gap-3 py-3 text-[12px]"><div className="flex min-w-0 flex-1 items-center gap-3">{canSignOff && !item.vat_reconciled_at ? <Checkbox aria-label={`${t("Select VAT transaction")} ${item.document_number || item.evidence_id}`} checked={selected.includes(item.evidence_id)} onCheckedChange={(checked) => setSelected((current) => checked === true ? [...current, item.evidence_id] : current.filter((id) => id !== item.evidence_id))} /> : null}<div><p className="font-medium text-[var(--md-ink)]" data-i18n-skip>{item.document_number || item.document_id || item.evidence_id}</p><p className="mt-1 text-[var(--md-subtle)]">{t("Tax point")}: <span data-i18n-skip>{item.tax_point}</span> · {t("Net")}: <span data-i18n-skip>{money.format(Number(item.net_gbp))}</span> · {t("VAT")}: <span data-i18n-skip>{money.format(Number(item.vat_gbp))}</span></p></div></div>{item.vat_reconciled_at ? <span className="text-[11px] text-[var(--md-subtle)]">{t("VAT reconciled")} <time dateTime={item.vat_reconciled_at} data-i18n-skip>{dateTime.format(new Date(item.vat_reconciled_at))}</time></span> : <span className="text-[11px] text-[var(--md-subtle)]">{t("Awaiting sign-off")}</span>}{item.source_locked ? <span className="text-[11px] text-[var(--md-subtle)]">· {t("Source locked")}</span> : null}</div>)}</div>
          {detail.totalLines > 100 ? <div className="mt-3 flex items-center justify-end gap-2"><Button type="button" size="sm" variant="outline" disabled={busy || offset === 0} onClick={() => void page(Math.max(0, offset - 100))}>{t("Previous")}</Button><span className="text-[11px] text-[var(--md-subtle)]" data-i18n-skip>{offset + 1}–{Math.min(offset + 100, detail.totalLines)} / {detail.totalLines}</span><Button type="button" size="sm" variant="outline" disabled={busy || offset + 100 >= detail.totalLines} onClick={() => void page(offset + 100)}>{t("Next")}</Button></div> : null}
          {canSignOff ? <div className="mt-4 grid gap-3 border-t border-[var(--md-line)] pt-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Transaction sign-off reason")}<Textarea value={signoffReason} onChange={(event) => setSignoffReason(event.target.value)} minLength={10} maxLength={2000} placeholder={t("Explain the source and VAT posting checks completed.")} /></label><Button type="button" disabled={busy || !selected.length || signoffReason.trim().length < 10} onClick={() => void signOff()}><ShieldCheck />{t("Record VAT reconciliation date")}</Button></div> : null}
        </SettingsPanel> : null}
        {detail ? <SettingsPanel title={t("HMRC filing values")} description={t("Compare the calculated pence amounts with proposed whole-pound Boxes 6–9. The rule rounds each total to the nearest pound, with 50 pence rounded away from zero.")}>
          {filingError ? <p role="alert" className="py-2 text-[12px] text-[var(--md-red)]">{filingError}</p> : null}
          {filingPreview?.calculationId === detail.calculationId ? <>
            <div className="grid gap-3 py-3 text-[12px] sm:grid-cols-2 lg:grid-cols-4">{[6, 7, 8, 9].map((box) => <div key={box} className="border-t border-[var(--md-line)] pt-2"><p className="font-medium text-[var(--md-ink)]">{t("Box")} {box}</p><p className="mt-1 text-[var(--md-subtle)]">{t("Calculated")}: <span data-i18n-skip>{money.format(Number(filingPreview.sourceBoxes[String(box)]))}</span></p><p className="mt-1 text-[var(--md-text)]">{t("Proposed for HMRC")}: <strong data-i18n-skip>{money.format(Number(filingPreview.filedBoxes[String(box)]))}</strong></p></div>)}</div>
            {matchingSourceFilingReview ? <p className="py-2 text-[12px] text-[var(--md-text)]">{t("Historical filing-value review for this source")} <time dateTime={matchingSourceFilingReview.reviewed_at} data-i18n-skip>{dateTime.format(new Date(matchingSourceFilingReview.reviewed_at))}</time> · <span data-i18n-skip>{matchingSourceFilingReview.reason}</span></p> : <p className="py-2 text-[12px] text-[var(--md-subtle)]">{t("These values have not been reviewed for this calculation.")}</p>}
            {canManage ? <div className="grid gap-3 border-t border-[var(--md-line)] py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Filing-value review reason")}<Textarea value={filingReason} onChange={(event) => setFilingReason(event.target.value)} minLength={10} maxLength={2000} placeholder={t("Explain the whole-pound figures checked against the VAT account.")} /></label><Button type="button" disabled={busy || !filingPreview.currentDraft || !filingPreview.controlReviewed || filingReason.trim().length < 10} onClick={() => void reviewFilingProjection()}><ShieldCheck />{t("Record filing-value review")}</Button></div> : null}
            {!filingPreview.controlReviewed ? <p className="text-[12px] text-[var(--md-subtle)]">{t("Record a current VAT control review before reviewing filing values.")}</p> : null}
            <p className="text-[11px] text-[var(--md-subtle)]">{t("This is historical review evidence. A later control posting can make it stale; recording a new review rechecks the control. Period approval and submission remain unavailable.")}</p>
          </> : !filingError ? <p className="py-3 text-[12px] text-[var(--md-subtle)]">{t("Filing values are loading.")}</p> : null}
        </SettingsPanel> : null}
        {detail ? <SettingsPanel title={t("Period review lock")} description={t("Freeze this reviewed snapshot for HMRC verification. This is a reversible review lock, not filing approval.")}>
          {lockError ? <p role="alert" className="py-2 text-[12px] text-[var(--md-red)]">{lockError}</p> : null}
          {reviewLocks?.activeLockId ? <>
            {activeReviewLock ? <p className="py-2 text-[12px] text-[var(--md-text)]">{t("Review locked")} <time dateTime={activeReviewLock.locked_at} data-i18n-skip>{dateTime.format(new Date(activeReviewLock.locked_at))}</time> · <span data-i18n-skip>{activeReviewLock.reason}</span></p> : null}
            {canManage ? <div className="grid gap-3 border-t border-[var(--md-line)] py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Reason for reopening")}<Textarea value={reopenReason} onChange={(event) => setReopenReason(event.target.value)} minLength={10} maxLength={2000} placeholder={t("Explain the correction or new evidence requiring review.")} /></label><Button type="button" variant="outline" disabled={busy || reopenReason.trim().length < 10} onClick={() => void reopenReview()}>{t("Reopen review")}</Button></div> : null}
          </> : reviewLocks ? <>
            <p className="py-2 text-[12px] text-[var(--md-subtle)]">{t(matchingSourceFilingReview ? "The reviewed filing values can now be locked after a final recheck." : "Record a filing-value review before locking this period.")}</p>
            {canManage ? <div className="grid gap-3 border-t border-[var(--md-line)] py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Review lock reason")}<Textarea value={lockReason} onChange={(event) => setLockReason(event.target.value)} minLength={10} maxLength={2000} placeholder={t("Explain the calculation and filing values approved for HMRC verification.")} /></label><Button type="button" disabled={busy || selectedPeriod?.status !== "draft" || !matchingSourceFilingReview || lockReason.trim().length < 10} onClick={() => void lockReview()}><ShieldCheck />{t("Lock review snapshot")}</Button></div> : null}
          </> : !lockError ? <p className="py-3 text-[12px] text-[var(--md-subtle)]">{t("Review lock is loading.")}</p> : null}
          <p className="text-[11px] text-[var(--md-subtle)]">{t("HMRC obligation verification, statutory declaration and filing approval remain separate steps.")}</p>
        </SettingsPanel> : null}
        {selectedPeriod?.status === "review_locked" ? <SettingsPanel title={t("HMRC business declaration")} description={t("Confirm the reviewed return only after a fresh HMRC obligation check. Confirmation is audited and does not send the return.")}>
          {lockedFilingValues ? <div className="grid gap-2 border-b border-[var(--md-line)] py-3 sm:grid-cols-3 lg:grid-cols-9">
            {Array.from({ length: 9 }, (_, index) => <div key={index}><p className="text-[11px] text-[var(--md-subtle)]">{t("Box")} {index + 1}</p><p className="text-[13px] font-medium text-[var(--md-ink)]" data-i18n-skip>{money.format(Number(lockedFilingValues.filed_boxes[String(index + 1)] || 0))}</p></div>)}
          </div> : <p className="py-3 text-[12px] text-[var(--md-subtle)]">{t("The locked filing values are loading.")}</p>}
          <p className="py-3 text-[13px] leading-5 text-[var(--md-ink)]">When you submit this VAT information you are making a legal declaration that the information is true and complete. A false declaration can result in prosecution.</p>
          {activeApproval ? <>
            <p className="pb-3 text-[12px] text-[var(--md-text)]">{t("Declaration confirmed")} <time dateTime={activeApproval.confirmedAt} data-i18n-skip>{dateTime.format(new Date(activeApproval.confirmedAt))}</time> · {activeApproval.environment === "sandbox" ? t("Sandbox test") : t("Production")}.</p>
            {canRevokeFiling ? <div className="grid gap-3 border-t border-[var(--md-line)] py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Reason for revoking declaration")}<Textarea value={revocationReason} onChange={(event) => setRevocationReason(event.target.value)} minLength={10} maxLength={2000} placeholder={t("Explain why this approval is no longer valid.")} /></label><Button type="button" variant="outline" disabled={busy || revocationReason.trim().length < 10} onClick={() => void revokeFilingApproval()}>{t("Revoke declaration")}</Button></div> : null}
          </> : canManage ? <>
            <label className="flex items-start gap-3 py-3 text-[12px] text-[var(--md-text)]"><Checkbox checked={declarationConfirmed} disabled={busy || !canConfirmFiling} onCheckedChange={(checked) => setDeclarationConfirmed(checked === true)} aria-label={t("Confirm HMRC business declaration")} /><span>{t("I confirm this declaration for the nine reviewed boxes shown above.")}</span></label>
            <Button type="button" disabled={busy || !canConfirmFiling || !declarationConfirmed} onClick={() => void confirmFilingApproval()}><ShieldCheck />{t("Confirm filing declaration")}</Button>
            {!filingStatus?.obligation?.freshForApproval ? <p role="status" className="pt-3 text-[12px] text-[var(--md-subtle)]">{t("A fresh HMRC obligation check is required before this declaration can be confirmed.")}</p> : null}
          </> : <p className="pb-3 text-[12px] text-[var(--md-subtle)]">{t("A colleague with Compliance Manage permission must confirm this declaration.")}</p>}
          <p className="pt-3 text-[11px] text-[var(--md-subtle)]">{t("HMRC submission remains unavailable. Confirmation can be revoked before a submission attempt; it cannot be changed once HMRC dispatch has started.")}</p>
        </SettingsPanel> : null}
        {selectedPeriod ? <SettingsPanel title={t("HMRC filing status")} description={t("Recorded obligation, declaration and submission evidence for this VAT period. These records do not replace a fresh check with HMRC.")}>
          {filingStatusError ? <p role="alert" className="py-2 text-[12px] text-[var(--md-red)]">{filingStatusError}</p> : null}
          {filingStatus ? <div className="divide-y divide-[var(--md-line)] text-[12px]">
            <div className="py-3"><p className="font-medium text-[var(--md-ink)]">{t("HMRC obligation")}</p>{filingStatus.obligation ? <p className="mt-1 text-[var(--md-text)]">{filingStatus.obligation.environment === "sandbox" ? t("Sandbox evidence") : t("Production evidence")} · {t("Recorded")} <time dateTime={filingStatus.obligation.observedAt} data-i18n-skip>{dateTime.format(new Date(filingStatus.obligation.observedAt))}</time>{!filingStatus.obligation.freshForApproval ? <> · {t("Needs a fresh HMRC check before approval")}</> : null}</p> : <p className="mt-1 text-[var(--md-subtle)]">{t("No HMRC obligation observation recorded.")}</p>}</div>
            <div className="py-3"><p className="font-medium text-[var(--md-ink)]">{t("Filing declaration")}</p>{filingStatus.approval ? <p className="mt-1 text-[var(--md-text)]">{filingStatus.approval.revocation ? t("Declaration confirmation revoked") : t("Declaration confirmation recorded")} · {filingStatus.approval.environment === "sandbox" ? t("Sandbox test") : t("Production")} · <time dateTime={filingStatus.approval.confirmedAt} data-i18n-skip>{dateTime.format(new Date(filingStatus.approval.confirmedAt))}</time></p> : <p className="mt-1 text-[var(--md-subtle)]">{t("No filing declaration confirmed.")}</p>}</div>
            <div className="py-3"><p className="font-medium text-[var(--md-ink)]">{t("Submission outcome")}</p><p role={filingStatus.attempt?.status === "reconciliation_required" || filingStatus.attempt?.status === "dispatching" ? "alert" : undefined} className={`mt-1 ${filingStatus.attempt?.status === "reconciliation_required" || filingStatus.attempt?.status === "dispatching" ? "text-[var(--md-red)]" : "text-[var(--md-text)]"}`}>{t(filingOutcome)}</p>{filingStatus.attempt ? <p className="mt-1 text-[var(--md-subtle)]">{filingStatus.attempt.environment === "sandbox" ? t("Sandbox test") : t("Production")} · {t("Reserved")} <time dateTime={filingStatus.attempt.reservedAt} data-i18n-skip>{dateTime.format(new Date(filingStatus.attempt.reservedAt))}</time></p> : null}</div>
            {filingStatus.receipt ? <div className="py-3"><p className="font-medium text-[var(--md-ink)]">{t("HMRC receipt")}</p><p className="mt-1 text-[var(--md-text)]">{t("Form bundle")}: <span data-i18n-skip>{filingStatus.receipt.formBundleNumber}</span> · {t("HMRC processed")} <time dateTime={filingStatus.receipt.processingDate} data-i18n-skip>{dateTime.format(new Date(filingStatus.receipt.processingDate))}</time></p><p className="mt-1 break-all text-[var(--md-subtle)]">{t("Correlation ID")}: <span data-i18n-skip>{filingStatus.receipt.correlationId}</span></p></div> : null}
            {filingStatus.readback ? <div className="py-3"><p className="font-medium text-[var(--md-ink)]">{t("Latest HMRC return readback")}</p><p className="mt-1 text-[var(--md-text)]">{t(filingStatus.readback.result === "matched" ? "Nine boxes matched" : filingStatus.readback.result === "not_found" ? "Return not found at this check; outcome remains unresolved" : "HMRC return differed from the approved boxes")} · <time dateTime={filingStatus.readback.observedAt} data-i18n-skip>{dateTime.format(new Date(filingStatus.readback.observedAt))}</time></p></div> : null}
          </div> : !filingStatusError ? <p className="py-3 text-[12px] text-[var(--md-subtle)]">{t("Filing status is loading.")}</p> : null}
        </SettingsPanel> : null}
        {detail ? <SettingsPanel title={t("VAT account audit trail")} description={t("Each reviewed source is linked to its draft return boxes. Transaction dates and the period control review are separate audit records. The return is not approved.")}>
          {accountError ? <p role="alert" className="py-2 text-[12px] text-[var(--md-red)]">{accountError}</p> : null}
          {account && account.calculationId === detail.calculationId ? <>
            <p className="py-2 text-[12px] text-[var(--md-text)]">{t("Transactions signed off")}: <strong data-i18n-skip>{account.signedTransactions}/{account.totalTransactions}</strong> · {t("Return approval")}: <strong>{t("Pending")}</strong></p>
            <div className="divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]">{account.rows.map((item) => {
              const originalLedger = item.original_document_type === "sl_invoice" || item.original_document_type === "credit_note"
                ? "receivables" : item.original_document_type === "pl_invoice" || item.original_document_type === "debit_note"
                  ? "payables" : null
              const canOpenOriginal = originalLedger && hasPermission(currentUser,
                originalLedger === "receivables" ? "Finance.Receivables.View" : "Finance.Payables.View")
              const creditOriginalLedger = item.credit_original_document_type === "sl_invoice" ? "receivables"
                : item.credit_original_document_type === "pl_invoice" ? "payables" : null
              const canOpenCreditOriginal = creditOriginalLedger && hasPermission(currentUser,
                creditOriginalLedger === "receivables" ? "Finance.Receivables.View" : "Finance.Payables.View")
              return <div key={item.evidence_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[12px]">
                <div className="min-w-0"><p className="font-medium text-[var(--md-ink)]" data-i18n-skip>{item.document_number || item.document_id || item.evidence_id}</p>
                  <p className="mt-1 text-[var(--md-subtle)]">{t("Tax point")}: <span data-i18n-skip>{item.tax_point}</span> · {t("Net")}: <span data-i18n-skip>{money.format(Number(item.net_gbp))}</span> · {t("VAT")}: <span data-i18n-skip>{money.format(Number(item.vat_gbp))}</span></p>
                  <p className="mt-1 text-[var(--md-subtle)]">{t("Return boxes")}: <span data-i18n-skip>{Object.entries(item.boxes).sort(([a], [b]) => Number(a) - Number(b)).map(([box, amount]) => `${box} ${money.format(Number(amount))}`).join(" · ")}</span></p>
                  {item.reverses_evidence_id && item.original_document_id ? <p className="mt-1 text-[var(--md-text)]">{t("Reverses original transaction")}: {canOpenOriginal ? <button type="button" className="rounded-sm font-medium text-[var(--md-accent)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-accent)]" onClick={() => navigate(`/finance/${originalLedger}/documents/${item.original_document_id}`)} data-i18n-skip>{item.original_document_number || item.original_document_id}</button> : <span data-i18n-skip>{item.original_document_number || item.original_document_id}</span>}{item.original_vat_reconciled_at ? <> · {t("Original VAT reconciled")} <time dateTime={item.original_vat_reconciled_at} data-i18n-skip>{dateTime.format(new Date(item.original_vat_reconciled_at))}</time></> : null}</p> : null}
                  {item.credit_original_evidence_id && item.credit_original_document_id ? <p className="mt-1 text-[var(--md-text)]">{t("Credit linked to original invoice")}: {canOpenCreditOriginal ? <button type="button" className="rounded-sm font-medium text-[var(--md-accent)] underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-accent)]" onClick={() => navigate(`/finance/${creditOriginalLedger}/documents/${item.credit_original_document_id}`)} data-i18n-skip>{item.credit_original_document_number || item.credit_original_document_id}</button> : <span data-i18n-skip>{item.credit_original_document_number || item.credit_original_document_id}</span>}{item.credit_linked_at ? <> · {t("Linked")} <time dateTime={item.credit_linked_at} data-i18n-skip>{dateTime.format(new Date(item.credit_linked_at))}</time></> : null}</p> : null}
                </div>
                <div className="flex flex-wrap items-center gap-2">{item.vat_reconciled_at ? <span className="text-[11px] text-[var(--md-subtle)]">{t("VAT reconciled")} <time dateTime={item.vat_reconciled_at} data-i18n-skip>{dateTime.format(new Date(item.vat_reconciled_at))}</time></span> : <span className="text-[11px] text-[var(--md-subtle)]">{t("Awaiting sign-off")}</span>}{item.source_locked ? <span className="text-[11px] text-[var(--md-subtle)]">· {t("Source locked")}</span> : null}{canManage && (item.document_type === "credit_note" || item.document_type === "debit_note") && !item.reverses_evidence_id && !item.credit_original_evidence_id ? <Button type="button" size="sm" variant="outline" disabled={busy || creditBusy} onClick={() => chooseCreditLink(item.evidence_id)}>{t(creditLinkId === item.evidence_id ? "Cancel link" : "Link original invoice")}</Button> : null}</div>
                {creditLinkId === item.evidence_id ? <div className="w-full border-t border-[var(--md-line)] pt-3">
                  <p className="text-[12px] leading-5 text-[var(--md-text)]">{t("Find the original invoice by number, choose the matching line, then explain the credit. This records an audit link without editing either transaction.")}</p>
                  <div className="mt-3 flex flex-wrap items-end gap-2"><label className="grid min-w-48 flex-1 gap-1 text-[12px] text-[var(--md-text)]">{t("Original invoice number")}<Input value={creditSearch} maxLength={80} onChange={(event) => { creditSearchRequest.current += 1; setCreditSearch(event.target.value); setCreditCandidates(null); setCreditOriginalId(""); setCreditBusy(false) }} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); void searchCreditOriginal() } }} /></label><Button type="button" size="sm" variant="outline" disabled={creditBusy || creditSearch.trim().length < 2} onClick={() => void searchCreditOriginal()}>{creditBusy ? <LoaderCircle className="animate-spin" /> : null}{t("Find invoice")}</Button></div>
                  {creditCandidates ? creditCandidates.length ? <label className="mt-3 grid gap-1 text-[12px] text-[var(--md-text)]">{t("Original invoice line")}<Select value={creditOriginalId} onValueChange={setCreditOriginalId}><SelectTrigger aria-label={t("Original invoice line")}><SelectValue placeholder={t("Choose the matching line")} /></SelectTrigger><SelectContent>{creditCandidates.map((candidate) => <SelectItem key={candidate.evidenceId} value={candidate.evidenceId}><span data-i18n-skip>{candidate.documentNumber || candidate.documentId} · {t("Line")} {candidate.lineNo} · {candidate.documentDate} · {postingAmount(Number(candidate.remainingNet), candidate.currencyCode)} {t("net available")} · {postingAmount(Number(candidate.remainingVat), candidate.currencyCode)} {t("VAT available")}</span></SelectItem>)}</SelectContent></Select></label> : <p className="mt-3 text-[12px] text-[var(--md-subtle)]">{t("No eligible invoice lines match. Check the number, customer, currency and remaining credit amount.")}</p> : null}
                  {creditCandidates?.length ? <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("Credit correction reason")}<Textarea value={creditReason} onChange={(event) => setCreditReason(event.target.value)} minLength={10} maxLength={2000} placeholder={t("Explain why this credit belongs to the selected invoice line.")} /></label><Button type="button" size="sm" disabled={creditBusy || !creditOriginalId || creditReason.trim().length < 10} onClick={() => void saveCreditLink()}>{creditBusy ? <LoaderCircle className="animate-spin" /> : <ShieldCheck />}{t("Record credit link")}</Button></div> : null}
                  {creditError ? <p role="alert" className="mt-2 text-[12px] text-[var(--md-red)]">{creditError}</p> : null}
                </div> : null}
              </div>
            })}</div>
            {account.totalTransactions > 100 ? <div className="mt-3 flex items-center justify-end gap-2"><Button type="button" size="sm" variant="outline" disabled={accountOffset === 0} onClick={() => setAccountOffset(Math.max(0, accountOffset - 100))}>{t("Previous")}</Button><span className="text-[11px] text-[var(--md-subtle)]" data-i18n-skip>{accountOffset + 1}–{Math.min(accountOffset + 100, account.totalTransactions)} / {account.totalTransactions}</span><Button type="button" size="sm" variant="outline" disabled={accountOffset + 100 >= account.totalTransactions} onClick={() => setAccountOffset(accountOffset + 100)}>{t("Next")}</Button></div> : null}
          </> : !accountError ? <p className="py-3 text-[12px] text-[var(--md-subtle)]">{t("VAT account is loading.")}</p> : null}
        </SettingsPanel> : null}
        {detail ? <SettingsPanel title={t("GL VAT posting review")} description={t("Posted tax lines in accounting periods overlapping this VAT period. Accounting dates may differ from VAT tax points, so these figures require review.")}>
          {taxPostingError ? <p role="alert" className="py-2 text-[12px] text-[var(--md-red)]">{taxPostingError}</p> : null}
          {taxPostings && taxPostings.calculationId === detail.calculationId ? <>
            <p className="py-2 text-[12px] text-[var(--md-text)]">{t("Tax postings")}: <strong data-i18n-skip>{taxPostings.totalLines}</strong> · {t("Linked to this draft")}: <strong data-i18n-skip>{taxPostings.linkedLines}</strong> · {t("Other postings to review")}: <strong data-i18n-skip>{taxPostings.unlinkedLines}</strong></p>
            <div className="grid gap-2 pb-3 text-[12px] text-[var(--md-text)] sm:grid-cols-3">
              <p>{t("Draft-linked VAT accounts")}: <strong data-i18n-skip>{money.format(Number(taxPostings.linkedVatAccountDebitGbp) - Number(taxPostings.linkedVatAccountCreditGbp))}</strong></p>
              <p>{t("Other VAT-account postings")}: <strong data-i18n-skip>{money.format(Number(taxPostings.unlinkedVatAccountDebitGbp) - Number(taxPostings.unlinkedVatAccountCreditGbp))}</strong></p>
              <p>{t("Tax postings off VAT accounts")}: <strong data-i18n-skip>{money.format(Number(taxPostings.taxOffVatAccountDebitGbp) - Number(taxPostings.taxOffVatAccountCreditGbp))}</strong></p>
            </div>
            <div className="grid gap-2 border-y border-[var(--md-line)] py-3 text-[12px] text-[var(--md-text)] sm:grid-cols-3">
              <p>{t("Source VAT due before return rounding")}: <strong data-i18n-skip>{preciseMoney.format(Number(taxPostings.controlBridge.sourceVatDueGbp))}</strong></p>
              <p>{t("VAT-account net credit")}: <strong data-i18n-skip>{preciseMoney.format(Number(taxPostings.controlBridge.vatAccountNetCreditGbp))}</strong></p>
              <p>{t("Accounting movement less source VAT")}: <strong data-i18n-skip>{preciseMoney.format(Number(taxPostings.controlBridge.differenceGbp))}</strong></p>
            </div>
            {!taxPostings.controlBridge.accountingCoverageExact ? <p role="status" className="pt-2 text-[12px] text-[var(--md-red)]">{t("Accounting periods do not exactly cover this VAT period")}: <span data-i18n-skip>{taxPostings.controlBridge.daysWithoutOneAccountingPeriod}</span> {t("days with missing or overlapping coverage")}, <span data-i18n-skip>{taxPostings.controlBridge.straddlingAccountingPeriods}</span> {t("periods crossing VAT dates")}.</p> : null}
            {taxPostings.controlBridge.expectedTaxPostingLines !== taxPostings.controlBridge.linkedVatAccountTaxLines ? <p role="status" className="pt-2 text-[12px] text-[var(--md-red)]">{t("Source VAT postings missing from VAT accounts in this accounting period need review")}: <span data-i18n-skip>{taxPostings.controlBridge.linkedVatAccountTaxLines}/{taxPostings.controlBridge.expectedTaxPostingLines}</span>.</p> : null}
            <p className="pb-2 text-[11px] text-[var(--md-subtle)]">{t("Signed GBP debit minus credit in overlapping accounting periods. These totals are a review bridge, not a reconciled VAT control balance.")}</p>
            {taxPostings.nonGbpLines > 0 ? <p role="status" className="pb-2 text-[12px] text-[var(--md-red)]">{t("Non-GBP tax postings need separate currency review")}: <span data-i18n-skip>{taxPostings.nonGbpLines}</span></p> : null}
            {taxPostings.taxLinesOffVatAccounts > 0 ? <p role="status" className="pb-2 text-[12px] text-[var(--md-red)]">{t("Tax-labelled postings outside mapped VAT accounts need review")}: <span data-i18n-skip>{taxPostings.taxLinesOffVatAccounts}</span></p> : null}
            {taxPostings.unlinkedLines > 0 ? <p role="status" className="pb-2 text-[12px] text-[var(--md-red)]">{t("Review unlinked tax postings and any accounting-to-tax-point timing differences before period approval.")}</p> : null}
            {controlReviewError ? <p role="alert" className="pb-2 text-[12px] text-[var(--md-red)]">{controlReviewError}</p> : null}
            {controlReviews?.reviews[0] ? <div className="border-t border-[var(--md-line)] py-3 text-[12px] text-[var(--md-text)]"><p><span className="font-medium text-[var(--md-ink)]">{t("Last recorded VAT control snapshot")}</span> · <time dateTime={controlReviews.reviews[0].reviewed_at} data-i18n-skip>{dateTime.format(new Date(controlReviews.reviews[0].reviewed_at))}</time></p><p className="mt-1" data-i18n-skip>{controlReviews.reviews[0].reason}</p><p className="mt-1 text-[11px] text-[var(--md-subtle)]">{t("This is historical review evidence. A later posting or calculation can make it stale; period approval still requires revalidation.")}</p></div> : null}
            {canManage ? <div className="mb-3 grid gap-3 border-y border-[var(--md-line)] py-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end"><label className="grid gap-1 text-[12px] text-[var(--md-text)]">{t("VAT control review reason")}<Textarea value={controlReason} onChange={(event) => setControlReason(event.target.value)} minLength={10} maxLength={2000} placeholder={t("Explain the accounting-period and VAT control checks completed.")} /></label><Button type="button" disabled={busy || !canReviewControl || controlReason.trim().length < 10} onClick={() => void reviewControl()}><ShieldCheck />{t("Record control review")}</Button></div> : null}
            <div className="divide-y divide-[var(--md-line)] border-t border-[var(--md-line)]">{taxPostings.rows.map((item) => <div key={item.posting_line_id} className="flex flex-wrap items-center justify-between gap-3 py-3 text-[12px]"><div className="min-w-0"><p className="font-medium text-[var(--md-ink)]" data-i18n-skip>{item.nominal_code || item.nominal_name || item.batch_number || item.posting_line_id}</p><p className="mt-1 text-[var(--md-subtle)]">{t("Accounting period")}: <span data-i18n-skip>{item.accounting_start} – {item.accounting_end}</span> · {t("Debit")}: <span data-i18n-skip>{postingAmount(item.debit_gbp, item.currency)}</span> · {t("Credit")}: <span data-i18n-skip>{postingAmount(item.credit_gbp, item.currency)}</span></p><p className="mt-1 text-[var(--md-subtle)]" data-i18n-skip>{item.description || item.batch_source || item.batch_id}</p></div><span className={`text-[11px] ${item.linked_to_draft && (!item.tax_labelled || item.vat_account) ? "text-[var(--md-subtle)]" : "text-[var(--md-red)]"}`}>{t(item.tax_labelled && !item.vat_account ? "Check VAT account" : item.linked_to_draft ? "Linked to draft" : "Needs review")}</span></div>)}</div>
            {taxPostings.totalLines > 100 ? <div className="mt-3 flex items-center justify-end gap-2"><Button type="button" size="sm" variant="outline" disabled={taxPostingOffset === 0} onClick={() => setTaxPostingOffset(Math.max(0, taxPostingOffset - 100))}>{t("Previous")}</Button><span className="text-[11px] text-[var(--md-subtle)]" data-i18n-skip>{taxPostingOffset + 1}–{Math.min(taxPostingOffset + 100, taxPostings.totalLines)} / {taxPostings.totalLines}</span><Button type="button" size="sm" variant="outline" disabled={taxPostingOffset + 100 >= taxPostings.totalLines} onClick={() => setTaxPostingOffset(taxPostingOffset + 100)}>{t("Next")}</Button></div> : null}
          </> : !taxPostingError ? <p className="py-3 text-[12px] text-[var(--md-subtle)]">{t("GL tax postings are loading.")}</p> : null}
        </SettingsPanel> : null}
        <p className="text-[11px] leading-5 text-[var(--md-subtle)]">{t("This workspace does not submit a VAT return. HMRC obligation verification, scheme rules, current control-review revalidation and return approval are required first.")}</p>
      </> : null}
    </div>
  </>
}
