/** The header searches through the same bounded, permission-aware reads as each register. */
export type GlobalSearchResult = {
  key: string
  area: string
  title: string
  detail: string
  meta: string
  path: string
  terms: string[]
}

export type GlobalSearchSource = {
  name: string
  search: (query: string) => Promise<GlobalSearchResult[]>
}

const result = (area: string, id: string, title: string, detail: string, meta: string, path: string, terms: Array<string | null | undefined> = []): GlobalSearchResult => ({
  key: `${area}:${id}`, area, title, detail, meta, path, terms: [title, detail, meta, ...terms].filter((value): value is string => Boolean(value)),
})

const identifierFallback = (query: string) => /[a-z]/i.test(query) ? query.match(/\d{4,}/)?.[0] : undefined

export const globalSearchSources: GlobalSearchSource[] = [
  {
    name: "Jobs",
    search: async (query) => {
      const { listLiveBookingsPage } = await import("@/lib/application-data-api")
      let page = await listLiveBookingsPage({ search: query, scope: "All Jobs", filterQuery: { groups: [], match: "all" }, limit: 6, offset: 0 })
      const fallback = !page.rows.length && identifierFallback(query)
      if (fallback) {
        const candidatePage = await listLiveBookingsPage({ search: fallback, scope: "All Jobs", filterQuery: { groups: [], match: "all" }, limit: 6, offset: 0 })
        page = { ...candidatePage, rows: candidatePage.rows.filter((row) => normalize(row.id) === normalize(query) || normalize(row.jobRef) === normalize(query)) }
      }
      return page.rows.map((row) => result("Job", row.id, row.id, `${row.customer} · ${row.route}`, `${row.mode} · ${row.status}`, `/bookings/${encodeURIComponent(row.id.toLowerCase())}`, [row.jobRef, row.customerRef, row.supplierRef, row.invoice, row.container, row.vessel, row.vin]))
    },
  },
  {
    name: "Quotes",
    search: async (query) => {
      const { listSalesQuotesPage } = await import("@/lib/quote-api")
      let page = await listSalesQuotesPage({ search: query, filterQuery: { groups: [], match: "all" }, limit: 6, offset: 0 })
      const fallback = !page.rows.length && identifierFallback(query)
      if (fallback) {
        const candidatePage = await listSalesQuotesPage({ search: fallback, filterQuery: { groups: [], match: "all" }, limit: 6, offset: 0 })
        page = { ...candidatePage, rows: candidatePage.rows.filter((row) => normalize(row.reference) === normalize(query)) }
      }
      return page.rows.map((row) => result("Quote", row.reference, row.reference, [row.customer, row.origin && row.destination ? `${row.origin} → ${row.destination}` : row.origin || row.destination].filter(Boolean).join(" · "), [row.transportMode, row.status].filter(Boolean).join(" · "), `/quotes/${encodeURIComponent(row.reference.toLowerCase())}`, [row.customerPurchaseOrder, row.shipperReference]))
    },
  },
  {
    name: "Companies",
    search: async (query) => {
      const { listAccountsPage } = await import("@/lib/customer-api")
      const page = await listAccountsPage({ organisationType: "company", search: query, limit: 6, offset: 0 })
      return page.rows.map((row) => result("Company", row.id, row.name, row.location || row.industry || "Company", row.relationshipStatus?.replaceAll("_", " ") || "", `/crm/accounts/${row.id}`, [row.accountCode]))
    },
  },
  {
    name: "Contacts",
    search: async (query) => {
      const { listContactsPage } = await import("@/lib/customer-api")
      const page = await listContactsPage({ search: query, limit: 6, offset: 0 })
      return page.rows.map((row) => result("Contact", row.id, row.name, row.accountName, [row.jobTitle, row.email].filter(Boolean).join(" · "), `/crm/contacts/${row.id}`, [row.email, row.phone]))
    },
  },
  {
    name: "Leads",
    search: async (query) => {
      const { listLeadsPage } = await import("@/lib/lead-api")
      const page = await listLeadsPage({ search: query, limit: 6, offset: 0 })
      return page.rows.map((row) => result("Lead", row.id, row.companyName, row.primaryContactName || "Lead", row.statusName, `/crm/leads/${row.id}`, [row.primaryContactEmail, row.tradeLane, row.serviceInterest]))
    },
  },
  {
    name: "Deals",
    search: async (query) => {
      const { listDealsPage } = await import("@/lib/deal-api")
      const page = await listDealsPage({ search: query, limit: 6, offset: 0 })
      return page.rows.map((row) => result("Deal", row.id, row.name, row.companyName, row.stageName, `/crm/deals/${row.id}`, [row.primaryContactName, row.tradeLane, row.serviceInterest]))
    },
  },
  {
    name: "Warehouse items",
    search: async (query) => {
      const { listWarehouseItemsPage } = await import("@/lib/warehouse")
      const page = await listWarehouseItemsPage({ search: query, limit: 6, offset: 0 })
      return page.rows.map((row) => result("Warehouse item", row.id, row.sku, row.description, [row.customerOrgName, row.facilityName].filter(Boolean).join(" · "), `/warehouse/items/${encodeURIComponent(row.sku)}`, [row.hsCode]))
    },
  },
  {
    name: "Warehouse orders",
    search: async (query) => {
      const { listOperationalWarehouseOrdersPage } = await import("@/lib/warehouse")
      const page = await listOperationalWarehouseOrdersPage({ search: query, limit: 6, offset: 0 })
      return page.rows.map((row) => result("Warehouse order", row.id, row.orderNumber, row.customerName, `${row.typeName || row.typeCode} · ${row.statusName || row.statusCode}`, `/warehouse/orders/${encodeURIComponent(row.orderNumber)}`, [row.customerReference, row.facilityName]))
    },
  },
  {
    name: "Documents",
    search: async (query) => {
      const { getGeneratedDocumentsPage } = await import("@/lib/document-builder-api")
      const page = await getGeneratedDocumentsPage({ search: query, limit: 6, offset: 0 })
      return page.rows.map((row) => result("Document", row.id, row.fileName, [row.customerName, row.targetReference].filter(Boolean).join(" · "), `${row.templateName} · ${row.status}`, `/documents?search=${encodeURIComponent(row.fileName)}`, [row.targetReference, row.templateCode]))
    },
  },
  ...(["import", "export"] as const).flatMap((direction) => (["standalone", "job-related"] as const).map((scope): GlobalSearchSource => ({
    name: `${direction} ${scope} declarations`,
    search: async (query) => {
      const { listCustomsDeclarationDraftsPage } = await import("@/lib/customs-drafts-api")
      const page = await listCustomsDeclarationDraftsPage(direction, scope, { search: query, limit: 4, offset: 0 })
      return page.rows.map((row) => result("Customs declaration", row.id, row.reference, [row.customerName, row.bookingReference].filter(Boolean).join(" · ") || `${direction} declaration`, `${direction} · ${row.status}`, `/customs/${scope}/${direction}/${row.id}`, [row.traderReference, row.jobReference]))
    },
  }))),
]

const normalize = (value: string) => value.toLocaleLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^\p{L}\p{N}]+/gu, "")

export function globalSearchMatchHint(item: GlobalSearchResult, query: string) {
  const needle = normalize(query)
  if ([item.title, item.detail, item.meta].some((value) => normalize(value).includes(needle))) return null
  return item.terms.slice(3).find((value) => normalize(value).includes(needle)) || "Record details"
}

export function rankGlobalSearchResults(results: GlobalSearchResult[], query: string) {
  const needle = normalize(query)
  const score = (item: GlobalSearchResult) => {
    const values = item.terms.map(normalize)
    if (normalize(item.title) === needle) return 0
    if (values.some((value) => value === needle)) return 1
    if (normalize(item.title).startsWith(needle)) return 2
    if (values.some((value) => value.startsWith(needle))) return 3
    if (values.some((value) => value.includes(needle))) return 4
    return 5
  }
  const sorted = [...results].sort((a, b) => score(a) - score(b) || a.title.localeCompare(b.title))
  const firstByArea = new Set<string>()
  const spread = sorted.filter((item) => {
    if (firstByArea.has(item.area)) return false
    firstByArea.add(item.area)
    return true
  })
  const shown = new Set(spread.map((item) => item.key))
  return [...spread, ...sorted.filter((item) => !shown.has(item.key))].slice(0, 12)
}
