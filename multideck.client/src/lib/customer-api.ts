import { edgeFetch } from "@/lib/api"
import { invalidateCrmResources, readCachedCrmResource, type CrmReadOptions } from "@/lib/crm-read-cache"
import { fallbackEngagementSignal, getCrmEngagementSignals, type CrmEngagementSignal } from "@/lib/crm-engagement"
import { getSupabaseSession, supabaseFunctionsUrl, supabasePublicApiKey } from "@/lib/supabase"

export type ApiCustomer = {
  id: string
  name: string
  initials: string
  location: string | null
  industry: string
  contactCount: number
  status: "Premium" | "Standard" | "Trial" | "New"
  relationshipStatus: string
  tier: string | null
  segment: string | null
  ownerId: string | null
  ownerName: string | null
  healthScore: number | null
  lastContactAt: string | null
  nextActionDueAt: string | null
  marketingOptIn: boolean
  marketingConsentSource: string | null
  marketingConsentUpdatedAt: string | null
  types: string[]
  engagementSignal?: CrmEngagementSignal
}

export type CreateCustomerInput = {
  name: string
  orgTypeId: string
  addressLine1: string | null
  townCity: string | null
  postZipCode: string | null
  countryCode: string | null
  contactFirstName: string | null
  contactLastName: string | null
  contactEmail: string | null
}

export type CustomerReference = {
  organisationTypes: { id: string; name: string }[]
  owners: { id: string; name: string; email: string }[]
  relationshipStatuses: { code: string; name: string }[]
}

export type ApiCustomerContact = {
  id: string
  accountId: string
  accountName: string
  firstName: string | null
  lastName: string | null
  email: string
}

export type ApiRecentEmail = {
  id: string
  threadId: string
  direction: "inbound" | "outbound"
  subject: string
  preview: string | null
  occurredAt: string
  contactName: string | null
  contactEmail: string | null
  hasAttachments: boolean
}

export type ApiContact = {
  id: string
  accountId: string
  accountName: string
  firstName: string | null
  lastName: string | null
  name: string
  initials: string
  email: string | null
  phone: string | null
  jobTitle: string | null
  department: string | null
  location: string | null
  role: string | null
  influenceLevel: string | null
  relationshipStrength: number | null
  preferredChannel: string | null
  preferredLanguage: string | null
  consentSalesContact: boolean
  consentMarketing: boolean
  marketingConsentSource: string | null
  marketingConsentUpdatedAt: string | null
  lastContactAt: string | null
  notes: string | null
  trainingAllowed: boolean
  metadata: Record<string, unknown>
}

export type ApiContactDetail = ApiContact & {
  editVersion: number
  consentHistory: { id: string; status: string; lawfulBasis: string | null; source: string | null; reason: string | null; effectiveAt: string }[]
  activities: { id: string; subject: string; summary: string | null; occurredAt: string; type: string }[]
  recentEmails: { available: boolean; items: ApiRecentEmail[] }
}

export type ApiCustomerDetail = ApiCustomer & {
  editVersion: number
  status: string
  customerSince: string
  vertical: string | null
  primaryMode: string | null
  primaryTradeLane: string | null
  growthState: string | null
  churnRiskScore: number | null
  lifetimeValue: number | null
  currencyCode: string | null
  summary: string | null
  strategic: boolean
  trainingAllowed: boolean
  metadata: Record<string, unknown>
  address: { id: string; line1: string | null; line2: string | null; townCity: string | null; countyState: string | null; postZipCode: string | null; countryCode: string | null; mainEmail: string | null; mainPhone: string | null } | null
  engagement: { preferredChannel: string | null; allowThankYouMessages: boolean; allowFollowupMessages: boolean; allowWhatsApp: boolean; doNotOverContact: boolean; minHoursBetweenNonUrgentMessages: number; notes: string | null } | null
  contacts: ApiContact[]
  activeShipments: { id: string; reference: string; route: string; mode: string | null; status: string | null; eta: string | null; openExceptionCount: number }[]
  activities: { id: string; subject: string; summary: string | null; occurredAt: string; type: string }[]
  recentEmails: { available: boolean; items: ApiRecentEmail[] }
  documents?: ApiCustomerDocument[]
}

export type UpdateAccountInput = {
  name: string
  relationshipStatus: string
  tier: string | null
  segment: string | null
  vertical: string | null
  primaryMode: string | null
  primaryTradeLane: string | null
  growthState: string | null
  healthScore: number | null
  churnRiskScore: number | null
  summary: string | null
  strategic: boolean
  trainingAllowed: boolean
  marketingOptIn: boolean
  marketingConsentReason?: string | null
  metadata: Record<string, unknown>
  address: Omit<NonNullable<ApiCustomerDetail["address"]>, "id">
  engagement: NonNullable<ApiCustomerDetail["engagement"]>
}

export type UpdateContactInput = {
  firstName: string | null
  lastName: string | null
  email: string | null
  phone: string | null
  jobTitle: string | null
  department: string | null
  role: string | null
  influenceLevel: string | null
  relationshipStrength: number | null
  preferredChannel: string | null
  preferredLanguage: string | null
  consentSalesContact: boolean
  marketingOptIn: boolean
  marketingConsentReason?: string | null
  notes: string | null
  trainingAllowed: boolean
  metadata: Record<string, unknown>
}

export type ApiCustomerDocument = {
  id: string
  fileName: string
  mimeType: string
  fileSizeBytes: number
  status: "ready" | "pending_review" | "failed" | string
  safetyStatus: "clean" | "unscanned" | "blocked" | string
  createdAt: string
  sourceMessageId: string
  sourceAttachmentId: string
}

export type ApiCustomerDocumentListing = {
  customer: { id: string; name: string }
  documents: ApiCustomerDocument[]
  total: number
  limit: number
  offset: number
}

export class CustomerApiError extends Error {
  readonly status: number | undefined

  constructor(message: string, status?: number) {
    super(message)
    this.name = "CustomerApiError"
    this.status = status
  }
}

export type RegisterSort = { id: string; direction: "asc" | "desc" }

export type AccountRegisterPage = {
  rows: ApiCustomer[]
  total: number
  summary: { accounts: number; contacts: number; needsAttention: number; marketingOptedIn: number; unassigned: number; healthy: number }
  facets: { relationships: string[]; owners: Array<{ id: string; name: string }>; hasUnassigned: boolean }
}

export type CustomerDirectoryStatus = "All" | "Premium" | "Standard" | "Trial" | "New"

export type CustomerDirectoryPage = {
  rows: ApiCustomer[]
  total: number
  scopeTotal: number
  statusCounts: Record<CustomerDirectoryStatus, number>
}

export type ContactRegisterPage = {
  rows: ApiContact[]
  total: number
  summary: { contacts: number; recentlyContacted: number; marketingOptedIn: number; marketingOptedOut: number }
  facets: { accounts: Array<{ id: string; name: string }>; channels: string[] }
}

function countryCode(value: string | null | undefined) {
  const code = value?.trim().toUpperCase() || null
  if (code && !/^[A-Z]{2}$/.test(code)) throw new CustomerApiError("Enter a two-letter ISO country code, such as GB.")
  return code
}

function registerQuery(values: Record<string, string | number | null | undefined>) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(values)) {
    if (value !== null && value !== undefined && value !== "") params.set(key, String(value))
  }
  return `?${params.toString()}`
}

export async function listCustomerDirectoryPage(input: {
  scope: "all" | "mine"
  status: CustomerDirectoryStatus
  limit: number
  offset: number
}, options?: CrmReadOptions) {
  const session = await requireCustomerSession("Sign in again to view customers.")
  const query = registerQuery({
    scope: input.scope,
    status: input.status,
    limit: input.limit,
    offset: input.offset,
  })
  return readCachedCrmResource(
    session.user.id,
    `customer-directory:page:${query}`,
    () => customerRequest<CustomerDirectoryPage>(`/directory${query}`, session.access_token),
    options,
  )
}

export async function listAccountsPage(input: {
  search?: string
  marketingScope?: "all" | "opted_in" | "opted_out"
  relationship?: string
  owner?: string
  sort?: RegisterSort | null
  limit: number
  offset: number
}, options?: CrmReadOptions) {
  const session = await requireCustomerSession("Sign in again to view accounts.")
  const query = registerQuery({
    search: input.search?.trim(),
    marketingScope: input.marketingScope,
    relationship: input.relationship,
    owner: input.owner,
    sort: input.sort?.id ?? "account",
    direction: input.sort?.direction ?? "asc",
    limit: input.limit,
    offset: input.offset,
  })
  return readCachedCrmResource(
    session.user.id,
    `accounts:page:${query}`,
    async () => {
      const page = await customerRequest<AccountRegisterPage>(query, session.access_token)
      try {
        const signals = await getCrmEngagementSignals({ accountIds: page.rows.map((account) => account.id) })
        return { ...page, rows: page.rows.map((account) => ({ ...account, engagementSignal: signals.accounts.get(account.id) ?? fallbackEngagementSignal(account.id, account.lastContactAt) })) }
      } catch (error) {
        console.warn("Account engagement temperature fell back to last-contact recency.", error)
        return { ...page, rows: page.rows.map((account) => ({ ...account, engagementSignal: fallbackEngagementSignal(account.id, account.lastContactAt) })) }
      }
    },
    options,
  )
}

export async function listContactsPage(input: {
  search?: string
  consentScope?: "all" | "opted_in" | "opted_out"
  accountId?: string
  channel?: string
  sort?: RegisterSort | null
  limit: number
  offset: number
}, options?: CrmReadOptions) {
  const session = await requireCustomerSession("Sign in again to view contacts.")
  const query = registerQuery({
    search: input.search?.trim(),
    consentScope: input.consentScope,
    accountId: input.accountId,
    channel: input.channel,
    sort: input.sort?.id ?? "contact",
    direction: input.sort?.direction ?? "asc",
    limit: input.limit,
    offset: input.offset,
  })
  return readCachedCrmResource(
    session.user.id,
    `contacts:page:${query}`,
    async () => {
      return customerRequest<ContactRegisterPage>(`/contacts${query}`, session.access_token)
    },
    options,
  )
}

export async function getContact(contactId: string, options?: CrmReadOptions) {
  const session = await requireCustomerSession("Sign in again to view this contact.")
  return readCachedCrmResource(
    session.user.id,
    `contact-detail:${contactId}`,
    () => customerRequest<ApiContactDetail>(`/contacts/${encodeURIComponent(contactId)}`, session.access_token),
    options,
  )
}

export async function updateContact(contactId: string, input: UpdateContactInput, expectedVersion: number) {
  const session = await requireCustomerSession("Sign in again to update this contact.")
  const contact = await customerRequest<ApiContactDetail>(`/contacts/${encodeURIComponent(contactId)}`, session.access_token, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...input, expectedVersion }),
  })
  invalidateCrmResources(session.user.id, ["accounts:", "contacts:", `account-detail:${contact.accountId}`, `contact-detail:${contactId}`])
  invalidateCrmResources(session.user.id, ["customer-directory:"])
  return contact
}

export async function createCustomer(input: CreateCustomerInput) {
  const payload = { ...input, countryCode: countryCode(input.countryCode) }
  const session = await requireCustomerSession("Sign in again to create an account.")
  const customer = await customerRequest<ApiCustomer>("", session.access_token, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
  })
  invalidateCrmResources(session.user.id, ["accounts:", "customer-directory:"])
  return customer
}

export async function createCustomerContact(customerId: string, input: { firstName: string | null; lastName: string | null; email: string; role?: string | null; jobTitle?: string | null; department?: string | null; marketingOptIn?: boolean; marketingConsentReason?: string | null }) {
  const session = await requireCustomerSession("Sign in again to create this contact.")
  const contact = await customerRequest<ApiCustomerContact>(`/${encodeURIComponent(customerId)}/contacts`, session.access_token, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  })
  invalidateCrmResources(session.user.id, ["accounts:", "contacts:", "customer-directory:", `account-detail:${customerId}`])
  return contact
}

export async function getCustomer(customerId: string, options?: CrmReadOptions) {
  const session = await requireCustomerSession("Sign in again to view this account.")
  return readCachedCrmResource(
    session.user.id,
    `account-detail:${customerId}`,
    () => customerRequest<ApiCustomerDetail>(`/${encodeURIComponent(customerId)}`, session.access_token),
    options,
  )
}

export async function updateAccount(accountId: string, input: UpdateAccountInput, expectedVersion: number) {
  const payload = { ...input, address: { ...input.address, countryCode: countryCode(input.address.countryCode) } }
  const session = await requireCustomerSession("Sign in again to update this account.")
  const account = await customerRequest<ApiCustomerDetail>(`/${encodeURIComponent(accountId)}`, session.access_token, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...payload, expectedVersion }),
  })
  invalidateCrmResources(session.user.id, ["accounts:", "contacts:", `account-detail:${accountId}`])
  invalidateCrmResources(session.user.id, ["customer-directory:"])
  return account
}

export async function getCustomerDocumentUrl(customerId: string, documentId: string) {
  const session = await requireCustomerSession("Sign in again to open this account document.")
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) throw new CustomerApiError("Account documents are not configured for this workspace.")
  const response = await fetch(`${supabaseFunctionsUrl}/customer-documents`, {
    method: "POST",
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabasePublicApiKey, Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify({ customerId, documentId }),
  })
  return parseResponse<{ url: string; expiresAt: string }>(response)
}

export async function listCustomerDocuments(customerId: string, options: { limit?: number; offset?: number } = {}) {
  const session = await requireCustomerSession("Sign in again to view account documents.")
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) throw new CustomerApiError("Account documents are not configured for this workspace.")
  const limit = Math.max(1, Math.min(options.limit ?? 20, 50))
  const offset = Math.max(0, options.offset ?? 0)
  const params = new URLSearchParams({ customerId, limit: String(limit), offset: String(offset) })
  const response = await fetch(`${supabaseFunctionsUrl}/customer-documents?${params.toString()}`, {
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabasePublicApiKey, Accept: "application/json" },
  })
  const payload = await parseResponse<Partial<ApiCustomerDocumentListing>>(response)
  return {
    customer: { id: typeof payload.customer?.id === "string" ? payload.customer.id : customerId, name: typeof payload.customer?.name === "string" ? payload.customer.name : "" },
    documents: Array.isArray(payload.documents) ? payload.documents : [],
    total: Number.isFinite(payload.total) ? Number(payload.total) : 0,
    limit: Number.isFinite(payload.limit) ? Number(payload.limit) : limit,
    offset: Number.isFinite(payload.offset) ? Number(payload.offset) : offset,
  }
}

export async function getCustomerReference() {
  const session = await requireCustomerSession("Sign in again to manage accounts.")
  return readCachedCrmResource(
    session.user.id,
    "account-reference",
    () => customerRequest<CustomerReference>("/reference", session.access_token),
  )
}

async function requireCustomerSession(message: string) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new CustomerApiError(message)
  return session
}

async function customerRequest<T>(path: string, accessToken: string, init?: RequestInit) {
  return parseResponse<T>(await edgeFetch("customers", path, accessToken, init))
}

async function parseResponse<T>(response: Response) {
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim()
    try {
      const problem = await response.json()
      message = problem.detail || problem.title || problem.message || message
    } catch {
      // Keep the HTTP fallback for a non-JSON response.
    }
    throw new CustomerApiError(message, response.status)
  }
  return response.json() as Promise<T>
}
