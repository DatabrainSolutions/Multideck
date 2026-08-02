import { authenticate, corsHeaders, currentInternalUser, failure, HttpError, json, requirePermission, routeParts } from "../_shared/backend.ts"

function businessDaysOld(date: string) {
  const from = new Date(`${date}T00:00:00Z`); const to = new Date(); let count = 0
  for (const day = new Date(from.getTime() + 86400000); day <= to; day.setUTCDate(day.getUTCDate() + 1)) if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) count++
  return count
}

function resolve(rates: any[], from: string, to: string) {
  const direct = rates.find((rate) => rate.FINRate_FromCurrencyCode === from && rate.FINRate_ToCurrencyCode === to)
  if (direct) return { rate: Number(direct.FINRate_MidRate), row: direct, source: direct.FINRate_IsOfficial ? "reference" : direct.FINRate_ImportID ? "live" : "manual" }
  const inverse = rates.find((rate) => rate.FINRate_FromCurrencyCode === to && rate.FINRate_ToCurrencyCode === from)
  if (inverse) return { rate: 1 / Number(inverse.FINRate_MidRate), row: inverse, source: inverse.FINRate_IsOfficial ? "reference" : inverse.FINRate_ImportID ? "live" : "manual" }
  const baseLeg = from === "EUR" ? null : rates.find((rate) => rate.FINRate_FromCurrencyCode === "EUR" && rate.FINRate_ToCurrencyCode === from)
  const targetLeg = to === "EUR" ? null : rates.find((rate) => rate.FINRate_FromCurrencyCode === "EUR" && rate.FINRate_ToCurrencyCode === to)
  const base = from === "EUR" ? 1 : Number(baseLeg?.FINRate_MidRate); const target = to === "EUR" ? 1 : Number(targetLeg?.FINRate_MidRate)
  if (!(base > 0) || !(target > 0)) return null
  const rows = [baseLeg, targetLeg].filter(Boolean); const row = rows.sort((a, b) => String(a.FINRate_RateDate).localeCompare(String(b.FINRate_RateDate)))[0]
  return { rate: target / base, row, source: rows.every((item) => item.FINRate_IsOfficial) ? "reference" : "live", provider: [...new Set(rows.map((item) => item.provider?.FINRateProvider_Name).filter(Boolean))].join(" / ") }
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(request) })
  try {
    if (request.method !== "GET") throw new HttpError(405, "Method not allowed.")
    const { admin, user } = await authenticate(request); const current = await currentInternalUser(admin, user); await requirePermission(admin, current.User_ID, "Quotes.Read")
    const parts = routeParts(request, "finance")
    const { data: settings, error } = await admin.from("FIN_CurrencySettings").select("*").eq("FINCurSet_IsActive", true).eq("FINCurSet_IsPermittedForQuote", true).order("FINCurSet_CurrencyCode")
    if (error) throw new HttpError(500, error.message)
    const codes = (settings ?? []).map((item: any) => item.FINCurSet_CurrencyCode)
    const { data: currencies } = codes.length ? await admin.from("sys_Currency").select("*").in("Currency_Code", codes) : { data: [] }
    const currencyMap = new Map((currencies ?? []).map((item: any) => [item.Currency_Code, item]))
    const { data: latest } = await admin.from("FIN_ExchangeRates").select("FINRate_RateDate").eq("FINRate_IsApproved", true).not("FINRate_MidRate", "is", null).order("FINRate_RateDate", { ascending: false }).limit(1).maybeSingle()
    if (parts[0] === "currencies") return json(request, { currencies: (settings ?? []).map((item: any) => { const currency = currencyMap.get(item.FINCurSet_CurrencyCode); return { code: item.FINCurSet_CurrencyCode, name: currency?.Currency_Name ?? item.FINCurSet_Name, symbol: currency?.Currency_Symbol ?? item.FINCurSet_CurrencyCode, decimalPlaces: item.FINCurSet_DecimalPlaces, isActive: item.FINCurSet_IsActive, unitName: currency?.Currency_UnitName ?? null, subunitName: currency?.Currency_SubUnitName ?? null, subunitRatio: currency?.Currency_SubUnitRatio ?? null, symbolPosition: null } }), asOf: latest?.FINRate_RateDate ?? null })
    if (parts[0] === "exchange-rates") {
      const base = (new URL(request.url).searchParams.get("base") || "GBP").trim().toUpperCase(); if (!/^[A-Z]{3}$/.test(base)) throw new HttpError(400, "Base currency must be a three-letter ISO code."); if (!codes.includes(base)) throw new HttpError(400, `${base} is not enabled for quotes in this workspace.`)
      const lookup = [...new Set([...codes, "EUR"])]; const { data: providers } = await admin.from("FIN_ExchangeRateProviders").select("FINRateProvider_ID,FINRateProvider_Name,FINRateProvider_IsActive").eq("FINRateProvider_IsActive", true); const providerMap = new Map((providers ?? []).map((item: any) => [item.FINRateProvider_ID, item]))
      const { data: stored, error: rateError } = await admin.from("FIN_ExchangeRates").select("*").eq("FINRate_IsApproved", true).gt("FINRate_MidRate", 0).in("FINRate_FromCurrencyCode", lookup).in("FINRate_ToCurrencyCode", lookup).order("FINRate_RateDate", { ascending: false }).order("FINRate_IsOfficial", { ascending: false }).order("FINRate_ImportedAt", { ascending: false })
      if (rateError) throw new HttpError(500, rateError.message); const rates = (stored ?? []).filter((item: any) => providerMap.has(item.FINRate_ProviderID)).map((item: any) => ({ ...item, provider: providerMap.get(item.FINRate_ProviderID) }))
      const result = codes.map((currency: string) => { if (currency === base) return { baseCurrency: base, currency, rate: 1, costRate: 1, sellRate: 1, source: "reference", status: "current", provider: null, effectiveAt: null, businessDaysOld: 0, sourceReference: "Base currency" }; const found = resolve(rates, base, currency); if (!found) return { baseCurrency: base, currency, rate: null, costRate: null, sellRate: null, source: "reference", status: "unavailable", provider: null, effectiveAt: null, businessDaysOld: null, sourceReference: null }; const age = businessDaysOld(found.row.FINRate_RateDate); return { baseCurrency: base, currency, rate: found.rate, costRate: found.rate, sellRate: found.rate, source: found.source, status: age <= 1 ? "current" : "stale", provider: found.provider ?? found.row.provider?.FINRateProvider_Name ?? null, effectiveAt: found.row.FINRate_RateDate, businessDaysOld: age, sourceReference: found.row.FINRate_SourceReference ?? null } })
      const asOf = result.map((item: any) => item.effectiveAt).filter(Boolean).sort().at(-1) ?? null; return json(request, { baseCurrency: base, rates: result, asOf })
    }
    throw new HttpError(404, "Finance endpoint not found.")
  } catch (error) { return failure(request, error) }
})
