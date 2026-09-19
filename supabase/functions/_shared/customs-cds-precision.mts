import { Decimal, sum } from "./customs-calculation-decimal.mts"

/** Explicit stages from HMRC's Tax Calculation Processing - Rounding in CDS
 * v1.5. Not a certified policy: conversion sequencing still needs fixture review.
 * Do not substitute this for the legacy estimate policy on historical records. */
export const CDS_PRECISION_SOURCE = {
  url: "https://developer.service.hmrc.gov.uk/guides/customs-declarations-end-to-end-service-guide/documentation/resources/CDS_Technical_Documentation.zip",
  document: "Tax Calculation Processing - Rounding in CDS v1.5.docx",
  sha256: "6ab821b62841d7a8c7fd72c329cfcce1741867d2712d6870132e0fd1760b580f",
  certified: false,
} as const

export function cdsPrecisionStage(stage: "apportioned-charge" | "tax-amount" | "eu-tariff-exchange-rate", input: Decimal) {
  if (input.n < 0n) throw new Error("Apply CDS truncation to a non-negative amount before applying its addition or deduction sign.")
  if (!["apportioned-charge", "tax-amount", "eu-tariff-exchange-rate"].includes(stage)) throw new Error("Unrecognised CDS precision stage.")
  const places = stage === "eu-tariff-exchange-rate" ? 4 : 2
  const value = input.truncate(places)
  return { stage, places, value, before: input.evidence(), after: value.evidence(), discarded: input.sub(value).evidence(), source: CDS_PRECISION_SOURCE }
}

/** Takes already established shares, not raw item weights. Share derivation and
 * FX sequencing belong to the selected policy and must not be silently guessed.
 * The unallocated remainder is evidence, never assigned to a convenient item. */
export function cdsApportionedCharges(total: Decimal, shares: { itemId: string; share: Decimal }[]) {
  if (total.n < 0n || !shares.length || shares.some(row => !row.itemId.trim() || row.share.n < 0n) || new Set(shares.map(row => row.itemId)).size !== shares.length) throw new Error("Select unique items with non-negative reviewed allocation shares and charge amount.")
  if (sum(shares.map(row => row.share)).compare(Decimal.parse("1")) > 0) throw new Error("Allocation shares exceed the complete charge.")
  const lines = shares.map(row => ({ itemId: row.itemId, share: row.share.evidence(), ...cdsPrecisionStage("apportioned-charge", total.mul(row.share)) }))
  const allocated = sum(lines.map(line => line.value))
  return { lines, allocated, unallocated: total.sub(allocated), source: CDS_PRECISION_SOURCE }
}
