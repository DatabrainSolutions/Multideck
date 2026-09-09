import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import test from "node:test"

const finance = readFileSync(new URL("../functions/finance/index.ts", import.meta.url), "utf8")
const migration = readFileSync(new URL("../migrations/20260819133000_finance_latest_exchange_rates.sql", import.meta.url), "utf8")

test("finance reads one database-resolved rate per currency pair", () => {
  assert.match(finance, /rpc\("multideck_finance_latest_exchange_rates"/)
  assert.doesNotMatch(finance, /from\("FIN_ExchangeRates"\)\.select\("\*"\)/)
  assert.doesNotMatch(finance, /providerMap/)
  assert.match(finance, /Current exchange rates are still being prepared/)
})

test("latest rate lookup is indexed, capped and service-role-only", () => {
  assert.match(migration, /IX_FIN_ExchangeRates_LatestApprovedPair/)
  assert.match(migration, /distinct on \(rate\."FINRate_FromCurrencyCode", rate\."FINRate_ToCurrencyCode"\)/)
  assert.match(migration, /limit 64/)
  assert.match(migration, /FINRateProvider_IsActive/)
  assert.match(migration, /revoke all on function public\.multideck_finance_latest_exchange_rates[\s\S]*authenticated/)
  assert.match(migration, /grant execute on function public\.multideck_finance_latest_exchange_rates[\s\S]*service_role/)
})
