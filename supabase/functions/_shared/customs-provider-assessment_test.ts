import { compareFinalProviderAssessment } from "./customs-provider-assessment.mts";
import { compareDeclarationAssessment } from "./customs-duty-calculation.mts";
import type { CalculationResult } from "./customs-duty-calculation.mts";
import type { extractProviderTaxEvidence } from "./customs-provider-tax-evidence.mts";

const assert = (condition: unknown) => { if (!condition) throw new Error("Assertion failed"); };
function fixture() {
  const result: CalculationResult = { version: "fixture", precisionPolicy: "estimate", date: "2026-09-15", autoPopulationAllowed: false, issues: [], totals: { duty: "180.00", vat: "416.00" }, lines: [
    { itemId: "one", status: "estimate", issues: [], duty: "180.00", vat: "416.00", customsValue: "1500.00", vatBase: "2080.00", taxes: [{ taxType: "A00", amount: "180.00", disposition: "payable", reference: "fixture" }], allocations: [], workings: [] },
  ] };
  const notice: ReturnType<typeof extractProviderTaxEvidence>["notices"][number] = { notificationId: "fixture", classification: "final", statusCode: "4", validationIssues: [], issues: [], facts: [
    { sequence: "1", itemId: "one", taxType: "A00", assessedAmount: "180.00", paymentAmount: "180.00", baseAmount: "1500.00", rate: "12", dutyRegime: "100", deductionAmount: "0", rateUnit: "P1", currency: "GBP" },
    { sequence: "1", itemId: "one", taxType: "B00", assessedAmount: "416.00", paymentAmount: "416.00", baseAmount: "2080.00", rate: "20", dutyRegime: "100", deductionAmount: "0", rateUnit: "P1", currency: "GBP" },
  ] };
  return { result, notice };
}
Deno.test("final ordinary assessment compares exact liabilities and bases without certifying the estimate", () => {
  const { notice, result } = fixture(), before = JSON.stringify({ notice, result });
  const comparison = compareFinalProviderAssessment(notice, result);
  assert(comparison.comparison?.status === "matched");
  assert(comparison.totalsBasis === "assessed-items");
  assert(!result.autoPopulationAllowed);
  assert(JSON.stringify({ notice, result }) === before);
  notice.facts[0].assessedAmount = notice.facts[0].paymentAmount = "180.01";
  const difference = compareFinalProviderAssessment(notice, result);
  assert(difference.comparison?.status === "cds-difference");
  assert(difference.comparison?.differences?.duty === "0.01");
});
Deno.test("unverified currencies, units, relief, timing and specialist measures fail closed", () => {
  for (const patch of [{ currency: null }, { rateUnit: null }, { rateUnit: "KGM" }, { deductionAmount: null }, { deductionAmount: "1" }, { paymentAmount: "0" }, { dutyRegime: "320" }, { taxType: "MDC" }, { assessedAmount: "180.001" }, { itemId: null }]) {
    const { notice, result } = fixture(); Object.assign(notice.facts[0], patch);
    assert(compareFinalProviderAssessment(notice, result).comparison === null);
  }
});
Deno.test("partial, duplicate, provisional and structurally invalid notices never match", () => {
  for (const change of [
    (n: ReturnType<typeof fixture>["notice"]) => { n.classification = "provisional"; n.statusCode = "115"; },
    (n: ReturnType<typeof fixture>["notice"]) => { n.facts.pop(); },
    (n: ReturnType<typeof fixture>["notice"]) => { n.facts.push({ ...n.facts[0] }); },
    (n: ReturnType<typeof fixture>["notice"]) => { n.validationIssues.push("Invalid source"); },
    (n: ReturnType<typeof fixture>["notice"]) => { n.facts.forEach(f => f.itemId = "unknown"); },
  ]) { const { notice, result } = fixture(); change(notice); assert(compareFinalProviderAssessment(notice, result).comparison === null); }
});
Deno.test("an unresolved saved calculation stays incomplete even when amounts match", () => {
  const { notice, result } = fixture(); result.issues.push("Missing evidence");
  assert(compareFinalProviderAssessment(notice, result).comparison?.status === "incomplete");
});

function niFixture() {
  const { result, notice } = fixture();
  const line = result.lines[0]; line.taxes[0].taxType = "A50";
  line.vatTaxes = [{ taxType: "B00", base: "1900.00", amount: "380.00", exact: { numerator: "380", denominator: "1" } }, { taxType: "B05", base: "180.00", amount: "36.00", exact: { numerator: "36", denominator: "1" } }];
  notice.facts[0].taxType = "A50";
  notice.facts[1].assessedAmount = notice.facts[1].paymentAmount = "380.00";
  notice.facts[1].baseAmount = "1900.00";
  notice.facts.push({ ...notice.facts[1], taxType: "B05", assessedAmount: "36.00", paymentAmount: "36.00", baseAmount: "180.00" });
  return { result, notice };
}
Deno.test("NI final assessment compares B00 and B05 independently, including equal-total differences", () => {
  const { result, notice } = niFixture(), before = JSON.stringify({ result, notice });
  const matched = compareFinalProviderAssessment(notice, result);
  assert(matched.comparison?.status === "matched");
  assert(matched.comparison?.complete);
  assert(JSON.stringify({ result, notice }) === before);
  notice.facts[1].assessedAmount = notice.facts[1].paymentAmount = "379.99";
  notice.facts[2].assessedAmount = notice.facts[2].paymentAmount = "36.01";
  const different = compareFinalProviderAssessment(notice, result);
  assert(different.comparison?.differences?.vat === "0.00");
  assert(different.comparison?.status === "cds-difference");
  const comparedLine = different.comparison!.lines[0];
  assert("vatTaxDifferences" in comparedLine && comparedLine.vatTaxDifferences?.find(row => row.taxType === "B05")?.amountDifference === "0.01");
  notice.facts[1].baseAmount = "1899.99"; notice.facts[2].baseAmount = "180.01";
  assert(compareFinalProviderAssessment(notice, result).comparison?.status === "cds-difference");
});
Deno.test("NI assessment does not invent missing historical splits or accept other liability treatments", () => {
  for (const change of [
    (n: ReturnType<typeof niFixture>["notice"]) => { n.facts.pop(); },
    (n: ReturnType<typeof niFixture>["notice"]) => { n.facts.push({ ...n.facts[2] }); },
    (n: ReturnType<typeof niFixture>["notice"]) => { n.facts[2].paymentAmount = "0"; },
    (n: ReturnType<typeof niFixture>["notice"]) => { n.facts[2].rate = "5"; },
    (n: ReturnType<typeof niFixture>["notice"]) => { n.facts[2].rate = "not-a-rate"; },
    (n: ReturnType<typeof niFixture>["notice"]) => { n.facts[2].taxType = "A80"; },
  ]) { const { result, notice } = niFixture(); change(notice); assert(compareFinalProviderAssessment(notice, result).comparison === null); }
  const { result, notice } = niFixture(); delete result.lines[0].vatTaxes;
  assert(compareFinalProviderAssessment(notice, result).comparison === null);
});
Deno.test("matching aggregate NI VAT without its tax rows is incomplete evidence", () => {
  const { result } = niFixture();
  const comparison = compareDeclarationAssessment(result, [{ itemId: "one", currency: "GBP", duty: "180.00", vat: "416.00", customsValue: "1500.00", vatBase: "2080.00", taxes: [{ taxType: "A50", disposition: "payable", amount: "180.00" }] }], { currency: "GBP", duty: "180.00", vat: "416.00" });
  assert(comparison.status === "incomplete" && !comparison.complete);
});
