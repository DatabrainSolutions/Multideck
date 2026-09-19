import { customsImporterProfileErrors, importDefermentIssues } from "./customs-importer-profile.ts"
Deno.test("company customs settings validate registered EORI shape, methods and DAN without inventing defaults", () => {
  for (const profile of [{}, { eoriNumber: "GB123456789000", addressEoris: { office: "FR123456789", another: "" }, defermentAccount: "1234567", dutyPaymentMethod: "E", cguHolderEori: "GB123456789000", cguDocumentId: "GBCGU123456" }]) {
    if (customsImporterProfileErrors(profile).length) throw new Error("Valid optional customs profile rejected")
  }
  for (const profile of [{ eoriNumber: "GB123" }, { addressEoris: [] }, { addressEoris: { office: 42 } }, { dutyPaymentMethod: "EE" }, { defermentAccount: "123" }, { cguHolderEori: "not an EORI" }, { dpoDocumentId: "<script>" }]) {
    if (!customsImporterProfileErrors(profile).length) throw new Error("Invalid customs profile accepted")
  }
})

Deno.test("deferment validation distinguishes duty from VAT and never accepts missing authorities silently", () => {
  const vat = { items: [{ dutyCalculations: [{ taxType: "B00", paymentMethod: "E" }] }] }
  const vatIssues = importDefermentIssues(vat)
  if (vatIssues.length !== 1 || vatIssues[0].field !== "primaryDefermentAccount") throw new Error("VAT-only deferment must require DAN, not CGU/DPO")
  const duty = { items: [{ dutyCalculations: [{ taxType: "A00", paymentMethod: "E" }] }] }
  if (importDefermentIssues(duty).length !== 5) throw new Error("Duty deferment requires DAN, C505, C506, CGU and DPO")
  if (importDefermentIssues({ items: [{ dutyCalculations: [{ taxType: "A00", paymentMethod: "A" }] }] }).length) throw new Error("Non-deferment tax was changed")
})
