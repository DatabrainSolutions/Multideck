import { assertEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts"
import { fetchTariffExchangeReference } from "./customs-tariff-exchange-reference.ts"
import { TARIFF_EXCHANGE_RATE_SOURCE } from "./customs-tariff-exchange-rate.mts"

const body = JSON.stringify({ data: [{ id: "2299", type: "monetary_exchange_rate", attributes: { child_monetary_unit_code: "GBP", exchange_rate: "0.8572", operation_date: "2026-06-21", validity_start_date: "2026-09-01T00:00:00.000Z" } }] })
Deno.test("tariff reference retains exact source bytes and hashes without arbitrary URLs", async () => {
  const original = globalThis.fetch
  globalThis.fetch = ((url, options) => {
    assertEquals(url, TARIFF_EXCHANGE_RATE_SOURCE)
    assertEquals(options?.redirect, "error")
    return Promise.resolve(new Response(body))
  }) as typeof fetch
  try {
    const result = await fetchTariffExchangeReference("2026-09-14")
    assertEquals(result.publicationJson, body)
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(body))
    assertEquals(result.contentSha256, [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join(""))
    assertEquals(result.selectedRate.rate, "0.8572")
    assertEquals(result.selectedRate.certified, false)
  } finally { globalThis.fetch = original }
})
Deno.test("unavailable, oversized, malformed and missing-period publications fail closed", async () => {
  const original = globalThis.fetch
  try {
    for (const [response, message] of [
      [new Response("unavailable", { status: 503 }), "unavailable"],
      [new Response(" ".repeat(1_000_001)), "supported size"],
      [new Response("not json"), "not valid JSON"],
      [new Response(body), "different month's rate"],
    ] as const) {
      globalThis.fetch = (() => Promise.resolve(response)) as typeof fetch
      await assertRejects(() => fetchTariffExchangeReference("2026-10-01"), Error, message)
    }
  } finally { globalThis.fetch = original }
})
