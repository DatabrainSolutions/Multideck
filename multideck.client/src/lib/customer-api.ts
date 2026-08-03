import { edgeFetch } from "@/lib/api"
import { getSupabaseSession, supabaseFunctionsUrl, supabasePublicApiKey } from "@/lib/supabase"

export type ApiCustomer = {
  id: string
  name: string
  initials: string
  location: string | null
  industry: string
  contactCount: number
  status: "Premium" | "Standard" | "Trial" | "New"
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
}

export type ApiCustomerContact = {
  id: string
  accountId: string
  accountName: string
  firstName: string | null
  lastName: string | null
  email: string
}

export type ApiCustomerDetail = {
  id: string
  name: string
  initials: string
  location: string | null
  industry: string
  status: string
  customerSince: string
  tier: string | null
  segment: string | null
  primaryMode: string | null
  primaryTradeLane: string | null
  healthScore: number | null
  lifetimeValue: number | null
  currencyCode: string | null
  summary: string | null
  contacts: { id: string; name: string; initials: string; email: string | null; role: string | null; preferredChannel: string | null; lastContactAt: string | null }[]
  activeShipments: { id: string; reference: string; route: string; mode: string | null; status: string | null; eta: string | null; openExceptionCount: number }[]
  activities: { id: string; subject: string; summary: string | null; occurredAt: string; type: string }[]
  documents?: ApiCustomerDocument[]
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

export async function listCustomers(search?: string) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new CustomerApiError("Sign in again to view customers.")

  const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""
  const response = await edgeFetch("customers", query, session.access_token)

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim()
    try {
      const problem = await response.json()
      message = problem.detail || problem.title || message
    } catch {
      // The status text remains the useful fallback for a non-JSON response.
    }
    throw new CustomerApiError(message)
  }

  return response.json() as Promise<ApiCustomer[]>
}

export async function createCustomer(input: CreateCustomerInput) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new CustomerApiError("Sign in again to create a customer.")

  const response = await edgeFetch("customers", "", session.access_token, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
  })

  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim()
    try {
      const problem = await response.json()
      message = problem.detail || problem.title || message
    } catch {
      // The status text remains the useful fallback for a non-JSON response.
    }
    throw new CustomerApiError(message)
  }

  return response.json() as Promise<ApiCustomer>
}

export async function createCustomerContact(customerId: string, input: { firstName: string | null; lastName: string | null; email: string }) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new CustomerApiError("Sign in again to create this contact.")

  const response = await edgeFetch("customers", `/${encodeURIComponent(customerId)}/contacts`, session.access_token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  })
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim()
    try {
      const problem = await response.json()
      message = problem.detail || problem.title || message
    } catch {
      // Keep the HTTP fallback for a non-JSON response.
    }
    throw new CustomerApiError(message)
  }
  return response.json() as Promise<ApiCustomerContact>
}

export async function getCustomer(customerId: string) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new CustomerApiError("Sign in again to view this customer.")

  const response = await edgeFetch("customers", `/${encodeURIComponent(customerId)}`, session.access_token)
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim()
    try {
      const problem = await response.json()
      message = problem.detail || problem.title || message
    } catch { /* Keep the HTTP status fallback. */ }
    throw new CustomerApiError(message)
  }
  return response.json() as Promise<ApiCustomerDetail>
}

export async function getCustomerDocumentUrl(customerId: string, documentId: string) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new CustomerApiError("Sign in again to open this customer document.")
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) throw new CustomerApiError("Customer documents are not configured for this workspace.")
  const response = await fetch(`${supabaseFunctionsUrl}/customer-documents`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublicApiKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ customerId, documentId }),
  })
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim()
    try {
      const problem = await response.json()
      message = problem.detail || problem.title || message
    } catch { /* Keep the HTTP status fallback. */ }
    throw new CustomerApiError(message)
  }
  return response.json() as Promise<{ url: string; expiresAt: string }>
}

export async function listCustomerDocuments(customerId: string) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new CustomerApiError("Sign in again to view customer documents.")
  if (!supabaseFunctionsUrl || !supabasePublicApiKey) throw new CustomerApiError("Customer documents are not configured for this workspace.")
  const response = await fetch(`${supabaseFunctionsUrl}/customer-documents?customerId=${encodeURIComponent(customerId)}`, {
    headers: {
      Authorization: `Bearer ${session.access_token}`,
      apikey: supabasePublicApiKey,
      Accept: "application/json",
    },
  })
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`.trim()
    try {
      const problem = await response.json()
      message = problem.detail || problem.title || problem.message || message
    } catch { /* Keep the HTTP status fallback. */ }
    throw new CustomerApiError(message)
  }
  const payload = await response.json() as Partial<ApiCustomerDocumentListing>
  return {
    customer: {
      id: typeof payload.customer?.id === "string" ? payload.customer.id : customerId,
      name: typeof payload.customer?.name === "string" ? payload.customer.name : "",
    },
    documents: Array.isArray(payload.documents) ? payload.documents : [],
  }
}

export async function getCustomerReference() {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new CustomerApiError("Sign in again to create a customer.")

  const response = await edgeFetch("customers", "/reference", session.access_token)
  if (!response.ok) throw new CustomerApiError("We could not load organisation types.")
  return response.json() as Promise<CustomerReference>
}
