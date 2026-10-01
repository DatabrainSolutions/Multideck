import { useCallback, useEffect, useState } from "react"
import { ArrowLeft, LoaderCircle, RefreshCw } from "@/components/icons/hugeicons"
import { SettingsPageHeader, SettingsPanel } from "@/components/multideck/settings-components"
import { InlineNotice } from "@/components/multideck/inline-notice"
import { StatusPill } from "@/components/multideck/status-pill"
import { Button } from "@/components/ui/button"
import { useLanguage } from "@/i18n/language-provider"
import { getFinanceCash, getFinanceDocuments, type FinanceCashTransaction, type FinanceDocument } from "@/lib/finance-subledger-api"

export function FinancePaymentPage({ paymentId, navigate }: { paymentId: string; navigate: (path: string) => void }) {
  const { t, language } = useLanguage()
  const [payment, setPayment] = useState<FinanceCashTransaction | null>(null)
  const [documents, setDocuments] = useState<FinanceDocument[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState("")
  const [documentError, setDocumentError] = useState("")
  const load = useCallback(async (signal: AbortSignal) => {
    setLoading(true); setError(""); setDocumentError(""); setPayment(null); setDocuments([])
    try {
      const result = await getFinanceCash("payables")
      if (signal.aborted) return
      const found = result.cashTransactions.find((item) => item.FINCash_ID === paymentId && item.FINCash_TypeCode === "supplier_payment")
      if (!found) throw new Error("Supplier payment not found or unavailable to your account.")
      setPayment(found)
      try {
        const result = await getFinanceDocuments("payables")
        if (!signal.aborted) setDocuments(result.documents.filter((item) => item.FINDoc_LegalEntityID === found.FINCash_LegalEntityID
          && item.FINDoc_PartyOrgID === found.FINCash_PartyOrgID && item.FINDoc_CurrencyCodeSnapshot === found.FINCash_CurrencyCodeSnapshot
          && item.FINDoc_TypeCode === "pl_invoice" && ["approved", "submitted"].includes(item.FINDoc_StatusCode) && Number(item.FINDoc_OutstandingAmount) > 0))
      } catch (cause) { if (!signal.aborted) setDocumentError(cause instanceof Error ? cause.message : "Open invoices could not be loaded.") }
    } catch (cause) { if (!signal.aborted) setError(cause instanceof Error ? cause.message : "Supplier payment could not be loaded.") }
    finally { if (!signal.aborted) setLoading(false) }
  }, [paymentId])
  const [version, setVersion] = useState(0)
  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort() }, [load, version])
  const format = (amount: number) => new Intl.NumberFormat(language, { style: "currency", currency: payment?.FINCash_CurrencyCodeSnapshot ?? "GBP" }).format(amount)
  const date = (value: string) => new Intl.DateTimeFormat(language).format(new Date(`${value}T00:00:00`))
  return <>
    <SettingsPageHeader title={payment?.FINCash_Number || t("Supplier payment")} actions={<div className="flex gap-2"><Button type="button" variant="outline" disabled={loading} onClick={() => setVersion((value) => value + 1)}><RefreshCw />{t("Refresh")}</Button><Button type="button" variant="outline" onClick={() => navigate("/finance/payables/cash")}><ArrowLeft />{t("Supplier payments")}</Button></div>} />
    <div className="mt-[var(--md-page-stack-gap)] space-y-[var(--md-page-stack-gap)]">
      {error ? <InlineNotice tone="error">{t(error)}</InlineNotice> : null}
      {loading ? <div role="status" className="grid min-h-48 place-items-center"><LoaderCircle className="size-5 animate-spin text-[var(--md-accent)]" /><span className="sr-only">{t("Loading payment…")}</span></div> : payment ? <>
        <SettingsPanel title={t("Payment details")}>
          <dl className="grid gap-x-6 gap-y-4 px-5 py-4 text-[13px] sm:grid-cols-2 lg:grid-cols-3">
            {[["Supplier", payment.partyName], ["Payment date", date(payment.FINCash_TransactionDate)], ["Bank reference", payment.FINCash_Reference || "—"], ["Amount", format(Number(payment.FINCash_Amount))], ["Allocated", format(Number(payment.FINCash_Amount) - Number(payment.FINCash_UnallocatedAmount))], ["Unallocated", format(Number(payment.FINCash_UnallocatedAmount))]].map(([label, value]) => <div key={label}><dt className="text-[12px] text-[var(--md-subtle)]">{t(label)}</dt><dd className="mt-1 break-words tabular-nums text-[var(--md-ink)]" data-i18n-skip>{value}</dd></div>)}
          </dl>
          <div className="flex flex-wrap gap-3 px-5 pb-4 text-[12px]">{[["Status", payment.FINCash_StatusCode], ["Ledger", payment.FINCash_NativePostingStatusCode], ["Mirror", payment.FINCash_ExportStatusCode]].map(([label, value]) => <span key={label} className="flex items-center gap-2">{t(label)}<StatusPill>{t(value.replaceAll("_", " "))}</StatusPill></span>)}</div>
        </SettingsPanel>
        {Number(payment.FINCash_UnallocatedAmount) > 0 ? <InlineNotice>{t(payment.FINCash_NativePostingStatusCode === "posted" ? "This payment has an unallocated balance. Its posted allocations are locked to protect accounting and VAT history. A separate audited correction flow is required to allocate it to further invoices." : "This payment has an unallocated balance. Updating allocations on an existing payment is not yet supported; allocation is currently available when recording a new payment.")}</InlineNotice> : null}
        {documentError ? <InlineNotice tone="error">{t(documentError)}</InlineNotice> : <SettingsPanel title={t("Open supplier invoices")} description={t("Approved open invoices for this payment’s supplier, legal entity and currency. Viewing an invoice does not allocate the payment.")}>
          {documents.length ? <div className="divide-y divide-[var(--md-line)]">{documents.map((document) => <div key={document.FINDoc_ID} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3"><div><button type="button" onClick={() => navigate(`/finance/payables/documents/${document.FINDoc_ID}`)} className="text-[13px] text-[var(--md-accent)] hover:underline focus-visible:outline-2 focus-visible:outline-[var(--md-accent)]" data-i18n-skip>{document.FINDoc_Number || t("Unnumbered")}</button><p className="mt-1 text-[12px] text-[var(--md-subtle)]">{document.FINDoc_DueDate ? `${t("Due")} ${date(document.FINDoc_DueDate)}` : t("No due date")}</p></div><span className="text-[13px] tabular-nums" data-i18n-skip>{format(Number(document.FINDoc_OutstandingAmount))}</span></div>)}</div> : <p className="px-5 py-6 text-[13px] text-[var(--md-subtle)]">{t("No approved open invoices match this supplier and currency.")}</p>}
        </SettingsPanel>}
      </> : null}
    </div>
  </>
}
