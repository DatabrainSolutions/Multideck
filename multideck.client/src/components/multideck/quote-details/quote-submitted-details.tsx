import { Surface } from "@/components/multideck/surface"
import { useLanguage } from "@/i18n/language-provider"
import { quoteVersionSnapshot } from "@/lib/quote-version-presentation"
import type { QuoteWorkflowVersion } from "@/lib/quote-workflow-api"

type Fields = Array<readonly [string, unknown]>
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {}
const text = (value: unknown) =>
  typeof value === "string" ? value : typeof value === "number" && Number.isFinite(value) ? String(value) : ""
const location = (value: unknown) =>
  typeof value === "string"
    ? value
    : [record(value).place, record(value).unlocode, record(value).countryName || record(value).countryCode]
        .map(text)
        .filter(Boolean)
        .join(" · ")
const amount = (value: unknown, currency: unknown) =>
  text(value) ? [text(value), text(currency)].filter(Boolean).join(" ") : ""

// A saved list is either rendered in full or visibly reported as unreadable.
// Never fabricate rows from today's lookups or silently discard invalid entries.
function savedList(value: unknown): Record<string, unknown>[] | null {
  if (value === undefined || value === null || value === "") return []
  try {
    const parsed = typeof value === "string" ? JSON.parse(value) : value
    return Array.isArray(parsed) && parsed.every((item) => item && typeof item === "object" && !Array.isArray(item))
      ? parsed
      : null
  } catch {
    return null
  }
}

/** Assembled internal record view, not a customer-facing quote or an editor. */
export function QuoteSubmittedDetails({
  version,
  reference,
  overview = false,
  chargesOnly = false,
}: {
  version: QuoteWorkflowVersion
  reference: string
  overview?: boolean
  chargesOnly?: boolean
}) {
  const { t, language } = useLanguage()
  const quote = quoteVersionSnapshot(version)
  if (!quote)
    return (
      <Surface>
        <p role="alert">
          {t(
            "This version’s saved details are unavailable. Check Documents or reload the Quote; current details have not been substituted.",
          )}
        </p>
      </Surface>
    )
  const facts = record(quote.shipmentFacts)
  const cargo = savedList(facts.cargoLines)
  const routes = savedList(facts.routingLegs)
  const containers = savedList(facts.containerRequests)
  const suppliers = savedList(facts.supplierOptionsJson)
  const charges = savedList(quote.charges)
  const date = (value: unknown) => {
    const raw = text(value)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
    const parsed = new Date(`${raw}T00:00:00Z`)
    return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw
      ? raw
      : new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
          parsed,
        )
  }
  const fields = (items: Fields) => (
    <dl className="grid min-w-0 gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
      {items.map(([label, value]) => (
        <div key={label} className="min-w-0 space-y-1">
          <dt className="text-[12px] text-[var(--md-text)]">{t(label)}</dt>
          <dd
            className="m-0 whitespace-pre-wrap break-words text-[13px] leading-relaxed text-[var(--md-ink)] [overflow-wrap:anywhere]"
            data-i18n-skip
            dir="auto"
          >
            {typeof value === "boolean" ? t(value ? "Yes" : "No") : text(value) || t("Not recorded")}
          </dd>
        </div>
      ))}
    </dl>
  )
  const section = (title: string, items: Fields) => (
    <section className="min-w-0 space-y-3">
      <h3 className="text-[14px] font-medium text-[var(--md-ink)]">{t(title)}</h3>
      {fields(items)}
    </section>
  )
  const listError = (label: string) => (
    <p role="alert" className="text-[13px] text-[var(--md-red)]">
      {t(`${label} could not be read from this version. Check its saved PDF in Documents.`)}
    </p>
  )
  const party = (title: string, source: unknown, extras: Fields = []) => {
    const item = record(source)
    return section(title, [
      ["Organisation", item.name],
      ["Account code", item.code],
      ["Address", item.address],
      ["Contact", item.contact],
      ["Email", item.email],
      ...extras,
    ])
  }
  return (
    <Surface padding="md" className="space-y-8" data-quote-version-id={version.CusQuoteVersion_ID}>
      <header className="space-y-2">
        <p className="text-[12px] font-medium text-[var(--md-accent)]">{t("Submitted version · read-only record")}</p>
        <h2 className="break-words text-[18px] font-medium text-[var(--md-ink)]" data-i18n-skip>
          {reference}
          {version.CusQuoteVersion_Number > 1 ? ` - V${version.CusQuoteVersion_Number}` : ""}
        </h2>
        <p className="max-w-prose text-[13px] leading-relaxed text-[var(--md-text)]">
          {t(
            "These are the details saved with this version. Missing information stays marked as not recorded; current organisation details and terms are not substituted. Use the version menu to compare versions, or New version to revise.",
          )}
        </p>
        <p className="text-[12px] text-[var(--md-text)]">
          {t("Internal record. Charge lines are in Quote charges; the customer’s issued PDF is in Documents.")}
        </p>
        {fields([
          ["Submitted at", version.CusQuoteVersion_SubmittedAt ?? version.CusQuoteVersion_IssuedAt],
          ["Version status", version.CusQuoteVersion_StatusCode.replaceAll("_", " ")],
        ])}
      </header>
      {chargesOnly ? (
        <section className="space-y-6">
          <h3 className="text-[14px] font-medium">{t("Saved charge lines")}</h3>
          <p className="max-w-prose text-[13px] leading-relaxed text-[var(--md-text)]">
            {t(
              "Amounts and exchange rates are from this submitted version, not today’s rate table. Costs and internal notes are for operators only; use Documents for the customer’s issued PDF.",
            )}
          </p>
          {charges === null ? (
            listError("Charge lines")
          ) : charges.length ? (
            <ol className="space-y-8">
              {charges.map((line, index) => (
                <li key={`${index}:${text(line.id)}`} className="space-y-3">
                  <h4 className="text-[13px] font-medium">
                    {t("Charge line")} {index + 1}
                  </h4>
                  <p
                    className="max-w-prose whitespace-pre-wrap break-words text-[13px] leading-relaxed [overflow-wrap:anywhere]"
                    data-i18n-skip
                    dir="auto"
                  >
                    {text(line.description) || t("Not recorded")}
                  </p>
                  {fields([
                    ["Supplier / source", line.sourceLabel],
                    ["Calculation basis", line.calculationBasis],
                    ["Quantity", line.quantity],
                    ["Cost", amount(line.costAmount, line.costCurrency)],
                    ["Sell", amount(line.sellAmount, line.sellCurrency)],
                    ["Cost rate of exchange", line.costRoe],
                    ["Sell rate of exchange", line.sellRoe],
                    ["Saved base cost", amount(line.costLocal, quote.currency)],
                    ["Saved base sell", amount(line.sellLocal, quote.currency)],
                    ["Shown to customer", line.showToCustomer],
                    ["Customer notes", line.customerNotes],
                    ["Internal notes", line.internalNotes],
                  ])}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-[13px] text-[var(--md-text)]">{t("No charge lines were recorded in this version.")}</p>
          )}
        </section>
      ) : overview ? (
        <>
          {section("At a glance", [
            ["Customer", quote.customerName],
            ["Bill to / payer", quote.payer?.name],
            ["Mode", quote.mode],
            ["Direction", quote.direction],
            ["Shipment type", quote.shipmentType],
            ["Service level", quote.serviceLevel],
            ["Origin", quote.loadingPoint],
            ["Destination", quote.dischargePoint],
            ["ETD", date(facts.estimatedDeparture ?? quote.estimatedDeparture)],
            ["ETA", date(facts.estimatedArrival ?? quote.estimatedArrival)],
            ["Valid to", date(quote.validTo)],
            ["Incoterms", quote.incoterm],
          ])}
          <p className="text-[13px] text-[var(--md-text)]">
            {t("Open Details for the complete saved parties, cargo, routing and customer terms.")}
          </p>
        </>
      ) : (
        <>
          {section("Service & schedule", [
            ["Mode", quote.mode],
            ["Direction", quote.direction],
            ["Shipment type", quote.shipmentType],
            ["Service level", quote.serviceLevel],
            ["Origin", quote.loadingPoint],
            ["Destination", quote.dischargePoint],
            ["ETD", date(facts.estimatedDeparture ?? quote.estimatedDeparture)],
            ["ETA", date(facts.estimatedArrival ?? quote.estimatedArrival)],
            ["Valid from", date(quote.validFrom)],
            ["Valid to", date(quote.validTo)],
            ["Incoterms", quote.incoterm],
            ["Named place", facts.namedPlace],
            ["HBL mode", facts.hblMode],
            ["Via", facts.routingVia],
            ["Frequency", facts.frequency],
            ["Frequency notes", facts.frequencyNotes],
          ])}
          {routes === null ? (
            listError("Routing legs")
          ) : routes.length > 0 ? (
            <section className="space-y-4">
              <h3 className="text-[14px] font-medium">{t("Routing legs")}</h3>
              <ol className="space-y-6">
                {routes.map((leg, index) => (
                  <li key={text(leg.id) || index} className="space-y-2">
                    <h4 className="text-[13px] font-medium">
                      {t("Leg")} {index + 1}
                    </h4>
                    {fields([
                      ["Mode", leg.mode],
                      ["Origin", location(leg.origin)],
                      ["Destination", location(leg.destination)],
                      ["ETD", date(leg.estimatedDeparture)],
                      ["ETA", date(leg.estimatedArrival)],
                      ["Carrier", leg.carrierName],
                      ["Service level", leg.serviceLevel],
                    ])}
                  </li>
                ))}
              </ol>
            </section>
          ) : null}
          {party(
            "Customer",
            {
              name: quote.customerName,
              code: facts.clientCode,
              address: facts.customerAddress,
              contact: quote.contactName,
              email: quote.contactEmail,
            },
            [
              ["Customer reference", quote.customerReference],
              ["Customer PO", facts.customerPO],
            ],
          )}
          {party("Bill to / payer", quote.payer)}
          {party("Shipper", { ...record(quote.shipper), code: facts.shipperCode, email: facts.shipperEmail }, [
            ["Collection address", quote.collectionAddress],
            ["Collection required", facts.collectionRequired],
            ["Reference", facts.shipperReference],
          ])}
          {party(
            "Consignee",
            {
              ...record(quote.consignee),
              code: facts.consigneeCode,
              contact: facts.consigneeContact,
              email: facts.consigneeEmail,
            },
            [
              ["Delivery address", quote.deliveryAddress],
              ["Delivery required", facts.deliveryRequired],
              ["Reference", facts.consigneeReference],
            ],
          )}
          {party(
            "Overseas agent",
            {
              name: facts.agentName,
              code: facts.agentCode,
              address: facts.agentAddress,
              contact: facts.agentContact,
              email: facts.agentEmail,
            },
            [["Reference", facts.agentReference]],
          )}
          {section("Shipment goods", [
            ["Goods value", amount(facts.goodsValue, facts.goodsValueCurrency)],
            ["Insurance value", amount(facts.insuranceValue, facts.insuranceValueCurrency)],
            ["Cargo characteristics", facts.knownCargo],
            ["Entries", facts.entries],
            ["Invoice lines", facts.invoiceLines],
          ])}
          <section className="space-y-4">
            <h3 className="text-[14px] font-medium">{t("Cargo lines")}</h3>
            {cargo === null ? (
              listError("Cargo lines")
            ) : cargo.length ? (
              <ol className="space-y-6">
                {cargo.map((line, index) => (
                  <li key={text(line.id) || index} className="space-y-3">
                    <h4 className="text-[13px] font-medium">
                      {t("Cargo line")} {index + 1}
                    </h4>
                    <p
                      className="max-w-prose whitespace-pre-wrap break-words text-[13px] leading-relaxed [overflow-wrap:anywhere]"
                      data-i18n-skip
                      dir="auto"
                    >
                      {text(line.description) || t("Not recorded")}
                    </p>
                    {fields([
                      ["Commodity", line.commodity],
                      ["Packages / pieces", line.packageQuantity],
                      ["Package type", line.packageType],
                      ["Gross weight (kg)", line.grossWeightKg],
                      ["Net weight (kg)", line.netWeightKg],
                      ["Volume (CBM)", line.volumeCbm],
                      ["Chargeable weight (kg)", line.chargeableWeightKg],
                      ["Length", line.length],
                      ["Width", line.width],
                      ["Height", line.height],
                      ["Dimension unit", line.lengthUnit],
                      ["HS code", line.hsCode],
                      ["Country of origin", line.countryOfOrigin],
                      ["Hazardous", line.isHazardous],
                      ["Temperature controlled", line.isTemperatureControlled],
                    ])}
                  </li>
                ))}
              </ol>
            ) : facts.cargoLines === undefined ? (
              <>
                {fields([
                  ["Commodity", facts.commodity],
                  ["Packages / pieces", facts.packageQuantity],
                  ["Package type", facts.packageType],
                  ["Gross weight (kg)", facts.grossWeightKg],
                  ["Volume (CBM)", facts.volumeCbm],
                  ["Chargeable weight (kg)", facts.chargeableWeightKg],
                ])}
                <p className="text-[12px] text-[var(--md-text)]">
                  {t("This version saved shipment totals, not individual cargo allocations.")}
                </p>
              </>
            ) : (
              <p className="text-[13px] text-[var(--md-text)]">{t("No cargo lines were recorded in this version.")}</p>
            )}
          </section>
          {containers === null ? (
            listError("Container requests")
          ) : containers.length ? (
            <section className="space-y-3">
              <h3 className="text-[14px] font-medium">{t("Container requests")}</h3>
              {containers.map((item, index) => (
                <div key={`${index}:${text(item.id)}`}>
                  {fields([
                    ["Quantity", item.quantity],
                    ["Container type", item.type],
                  ])}
                </div>
              ))}
            </section>
          ) : facts.containerRequests === undefined && text(facts.container) ? (
            section("Container request", [["Requested equipment", facts.container]])
          ) : null}
          {section("Customer terms", [
            ["Terms and conditions", quote.terms],
            ["Subject to rate / space", facts.subjectToTerms],
            ["Customer notes", quote.customerNotes],
            ["Response deadline", date(quote.deadline)],
            ["Saved terms source", facts.customerTermsSource],
          ])}
          <details className="space-y-5">
            <summary className="cursor-pointer rounded-[var(--md-radius-md)] py-2 text-[13px] font-medium text-[var(--md-accent)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--md-accent)]">
              {t("Internal service, handling & control details")}
            </summary>
            {section("Carrier & supplier", [
              ["Carrier", quote.carrierName],
              ["Carrier office", facts.carrierOffice],
              ["Carrier reference", facts.carrierReference],
              ["Supplier", quote.supplierName],
              ["Supplier office", facts.supplierOffice],
              ["Rate source", quote.rateSourceLabel ?? quote.rateSourceType],
            ])}
            {suppliers === null
              ? listError("Supplier options")
              : suppliers.map((supplier, index) => {
                  const carriers = savedList(supplier.carriers)
                  return (
                    <section key={text(supplier.id) || index} className="space-y-3">
                      <h3 className="text-[14px] font-medium">
                        {t("Supplier option")} {index + 1}
                      </h3>
                      {fields([
                        ["Supplier", supplier.supplierName],
                        ["Office", supplier.supplierOffice],
                        ["Contact", supplier.contact],
                      ])}
                      {carriers === null
                        ? listError("Carrier options")
                        : carriers.map((carrier, index) => (
                            <div key={text(carrier.id) || index}>
                              {fields([
                                ["Carrier", carrier.carrierName],
                                ["Office", carrier.carrierOffice],
                                ["Reference", carrier.reference],
                                ["Service level", carrier.serviceLevel],
                                ["Rate source", carrier.rateSource],
                              ])}
                            </div>
                          ))}
                    </section>
                  )
                })}
            {section("Customs", [
              ["Customs included", facts.customsIncluded],
              ["Origin customs agent", facts.originCustomsAgentName],
              ["Destination customs agent", facts.destinationCustomsAgentName],
            ])}
            {section("Recorded dangerous-goods details", [
              ["UN number", facts.hazardousUnNumber],
              ["Class", facts.hazardousClass],
              ["Packing group", facts.hazardousPackingGroup],
              ["Proper shipping name", facts.hazardousShippingName],
              ["Emergency contact", facts.hazardousEmergencyContact],
              ["Net weight (kg)", facts.hazardousNetWeightKg],
              ["Marine pollutant", facts.hazardousMarinePollutant],
              ["Limited quantity", facts.hazardousLimitedQuantity],
              ["Handling notes", facts.hazardousNotes],
            ])}
            {section("Control & provenance", [
              ["Branch", facts.branch],
              ["Department", facts.department],
              ["Sales owner", facts.salesRep],
              ["Operations owner", facts.opsRep],
              ["Revision reason", facts.revisionReason],
              ["Copied from Quote", facts.copiedFromQuoteReference],
              ["Internal notes", quote.internalNotes],
            ])}
          </details>
        </>
      )}
    </Surface>
  )
}
