import { edgeFetch } from "@/lib/api"
import { invalidateCrmResources, readCachedCrmResource, type CrmReadOptions } from "@/lib/crm-read-cache"
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
  consentHistory: { id: string; status: string; lawfulBasis: string | null; source: string | null; reason: string | null; effectiveAt: string }[]
  activities: { id: string; subject: string; summary: string | null; occurredAt: string; type: string }[]
  recentEmails: { available: boolean; items: ApiRecentEmail[] }
}

export type ApiCustomerDetail = ApiCustomer & {
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
}

export class CustomerApiError extends Error {}

export async function listCustomers(search?: string, options?: CrmReadOptions) {
  const session = await requireCustomerSession("Sign in again to view accounts.")
  const normalizedSearch = search?.trim() ?? ""
  const query = normalizedSearch ? `?search=${encodeURIComponent(normalizedSearch)}` : ""
  return readCachedCrmResource(
    session.user.id,
    `accounts:${normalizedSearch.toLocaleLowerCase()}`,
    () => customerRequest<ApiCustomer[]>(query, session.access_token),
    options,
  )
}

export async function listContacts(search?: string, options?: CrmReadOptions) {
  const session = await requireCustomerSession("Sign in again to view contacts.")
  const normalizedSearch = search?.trim() ?? ""
  const query = normalizedSearch ? `?search=${encodeURIComponent(normalizedSearch)}` : ""
  return readCachedCrmResource(
    session.user.id,
    `contacts:${normalizedSearch.toLocaleLowerCase()}`,
    () => customerRequest<ApiContact[]>(`/contacts${query}`, session.access_token),
    options,
  )
}

export async function getContact(contactId: string) {
  const session = await requireCustomerSession("Sign in again to view this contact.")
  return customerRequest<ApiContactDetail>(`/contacts/${encodeURIComponent(contactId)}`, session.access_token)
}

export async function updateContact(contactId: string, input: UpdateContactInput) {
  const session = await requireCustomerSession("Sign in again to update this contact.")
  const contact = await customerRequest<ApiContactDetail>(`/contacts/${encodeURIComponent(contactId)}`, session.access_token, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  })
  invalidateCrmResources(session.user.id, ["accounts:", "contacts:"])
  return contact
}

export async function createCustomer(input: CreateCustomerInput) {
  const session = await requireCustomerSession("Sign in again to create an account.")
  const customer = await customerRequest<ApiCustomer>("", session.access_token, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  })
  invalidateCrmResources(session.user.id, ["accounts:"])
  return customer
}

export async function createCustomerContact(customerId: string, input: { firstName: string | null; lastName: string | null; email: string; role?: string | null; jobTitle?: string | null; department?: string | null; marketingOptIn?: boolean; marketingConsentReason?: string | null }) {
  const session = await requireCustomerSession("Sign in again to create this contact.")
  const contact = await customerRequest<ApiCustomerContact>(`/${encodeURIComponent(customerId)}/contacts`, session.access_token, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  })
  invalidateCrmResources(session.user.id, ["accounts:", "contacts:"])
  return contact
}

export async function getCustomer(customerId: string) {
  const session = await requireCustomerSession("Sign in again to view this account.")
  return customerRequest<ApiCustomerDetail>(`/${encodeURIComponent(customerId)}`, session.access_token)
}

export async function updateAccount(accountId: string, input: UpdateAccountInput) {
  const session = await requireCustomerSession("Sign in again to update this account.")
  const account = await customerRequest<ApiCustomerDetail>(`/${encodeURIComponent(accountId)}`, session.access_token, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(input),
  })
  invalidateCrmResources(session.user.id, ["accounts:", "contacts:"])
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

export async function listCustomerDocuments(customerId: string) {
  const session = await requireCustomerSession("Sign in again to view account documents.")
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) throw new CustomerApiError("Account documents are not configured for this workspace.")
  const response = await fetch(`${supabaseFunctionsUrl}/customer-documents?customerId=${encodeURIComponent(customerId)}`, {
    headers: { Authorization: `Bearer ${session.access_token}`, apikey: supabasePublicApiKey, Accept: "application/json" },
  })
  const payload = await parseResponse<Partial<ApiCustomerDocumentListing>>(response)
  return {
    customer: { id: typeof payload.customer?.id === "string" ? payload.customer.id : customerId, name: typeof payload.customer?.name === "string" ? payload.customer.name : "" },
    documents: Array.isArray(payload.documents) ? payload.documents : [],
  }
}

export async function getCustomerReference() {
  const session = await requireCustomerSession("Sign in again to manage accounts.")
  return customerRequest<CustomerReference>("/reference", session.access_token)
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
    throw new CustomerApiError(message)
  }
  return response.json() as Promise<T>
}
