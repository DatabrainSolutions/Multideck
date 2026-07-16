import { apiFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"

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
}

export class CustomerApiError extends Error {}

export async function listCustomers(search?: string) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new CustomerApiError("Sign in again to view customers.")

  const query = search?.trim() ? `?search=${encodeURIComponent(search.trim())}` : ""
  const response = await apiFetch(`/api/v1/customers${query}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
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

  return response.json() as Promise<ApiCustomer[]>
}

export async function createCustomer(input: CreateCustomerInput) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new CustomerApiError("Sign in again to create a customer.")

  const response = await apiFetch("/api/v1/customers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${session.access_token}`,
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

export async function getCustomer(customerId: string) {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new CustomerApiError("Sign in again to view this customer.")

  const response = await apiFetch(`/api/v1/customers/${encodeURIComponent(customerId)}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
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

export async function getCustomerReference() {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new CustomerApiError("Sign in again to create a customer.")

  const response = await apiFetch("/api/v1/customers/reference", {
    headers: { Authorization: `Bearer ${session.access_token}` },
  })
  if (!response.ok) throw new CustomerApiError("We could not load organisation types.")
  return response.json() as Promise<CustomerReference>
}
