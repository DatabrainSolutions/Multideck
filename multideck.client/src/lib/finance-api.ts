import { edgeFetch } from "@/lib/api"
import { getSupabaseSession } from "@/lib/supabase"
import { invalidateCachedCrmResources, readCachedCrmResource } from "@/lib/crm-read-cache"

export type ApiFinanceCurrency = {
  code: string
  name: string
  symbol: string
  decimalPlaces: number
  isActive: boolean
}

export type ApiFinanceCurrenciesResponse = {
  currencies: ApiFinanceCurrency[]
  asOf: string | null
}

export type ApiFinanceExchangeRate = {
  baseCurrency: string
  currency: string
  rate: number | null
  costRate?: number | null
  sellRate?: number | null
  source: "live" | "manual" | "reference"
  status: "current" | "stale" | "unavailable"
  provider: string | null
  effectiveAt: string | null
}

export type ApiFinanceExchangeRatesResponse = {
  baseCurrency: string
  rates: ApiFinanceExchangeRate[]
  asOf: string | null
}

export class FinanceApiError extends Error {}

async function parseFinanceApiError(response: Response) {
  const fallback = `${response.status} ${response.statusText}`.trim()

  try {
    const problem = await response.json()
    return problem.detail || problem.title || problem.message || fallback
  } catch {
    return fallback
  }
}

async function authenticatedFinanceGet<T>(path: string): Promise<T> {
  const session = await getSupabaseSession()
  if (!session?.access_token) throw new FinanceApiError("Sign in again to load finance rates.")

  return readCachedCrmResource(session.user.id, `finance-reference:${path}`, () => loadFinanceReference<T>(path, session.access_token))
}

async function loadFinanceReference<T>(path: string, accessToken: string): Promise<T> {

  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 8000)

  try {
    const response = await edgeFetch("finance", path, accessToken, { signal: controller.signal })

    if (!response.ok) throw new FinanceApiError(await parseFinanceApiError(response))
    return response.json() as Promise<T>
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new FinanceApiError("Finance rates took too long to respond.")
    }
    throw error
  } finally {
    window.clearTimeout(timeoutId)
  }
}

export function invalidateFinanceReferenceReads() {
  invalidateCachedCrmResources(null, ["finance-reference:", "quote-sources"])
}

export function listFinanceCurrencies() {
  return authenticatedFinanceGet<ApiFinanceCurrenciesResponse>("/currencies")
}

export function getFinanceExchangeRates(baseCurrency: string) {
  const base = baseCurrency.trim().toUpperCase()
  return authenticatedFinanceGet<ApiFinanceExchangeRatesResponse>(
    `/exchange-rates?base=${encodeURIComponent(base)}`,
  )
}
