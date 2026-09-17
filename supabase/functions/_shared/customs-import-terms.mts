// Options observed in the iCustoms import editor, 14 September 2026.
// Keep this module pure: it is also used by the operator form.
export const customsTradeTerms = [
  ["EXW", "Ex works"], ["FCA", "Free carrier"],
  ["CPT", "Carriage paid to"], ["CIP", "Carriage and insurance paid to"],
  ["DAP", "Delivered at place"], ["DPU", "Delivered at place unloaded"],
  ["DDP", "Delivered duty paid"], ["FOB", "Free on board"],
  ["CFR", "Cost and freight"], ["CIF", "Cost, insurance and freight"],
  ["FAS", "Free alongside ship"], ["XXX", "Other delivery terms"],
] as const;

export const customsAdjustmentCodes = [
  ["AB", "Selling commission and brokerage"],
  ["AC", "Selling commission and brokerage (%)"],
  ["AD", "Containers and packing"],
  ["AE", "Materials and parts in the goods"],
  ["AF", "Production tools and moulds"],
  ["AX", "Production tools and moulds (%)"],
  ["AG", "Materials used up in production"],
  ["AH", "Design, development and engineering"],
  ["AZ", "Design, development and engineering (%)"],
  ["AI", "Royalties and licence fees"],
  ["AM", "Royalties and licence fees (%)"],
  ["AJ", "Seller’s share of later resale or use"],
  ["AK", "Insurance"],
  ["AL", "Indirect and other payments"],
  ["AP", "Freight — by value"],
  ["AQ", "Freight — by gross weight"],
  ["AR", "Air freight addition — by value"],
  ["AS", "Air freight addition — by gross weight"],
  ["AT", "Other charges"],
  ["AV", "VAT adjustment — by value"],
  ["AW", "VAT adjustment — by gross weight"],
  ["BA", "Post-arrival freight and insurance deduction — by value"],
  ["BU", "Post-arrival freight and insurance deduction — by gross weight"],
  ["BB", "Post-import assembly, maintenance and technical work"],
  ["BD", "Interest deduction"], ["BL", "Interest deduction (%)"],
  ["BF", "Buying commission deduction (%)"], ["BM", "Buying commission deduction"],
  ["BH", "Discount"],
  ["BI", "Discount (%)"],
  ["BR", "Air freight deduction — by value"],
  ["BS", "Air freight deduction — by gross weight"],
  ["BT", "Other deductions"],
] as const;

export type CustomsImportAdjustment = { id: string; code: string; amount: string; currency: string };
type LegacyCosts = {
  importAdjustments?: unknown;
  freightChargeAmount?: unknown; freightChargeCurrency?: unknown; freightChargeApportionment?: unknown;
  vatValueAdjustmentAmount?: unknown; vatValueAdjustmentCurrency?: unknown; vatValueAdjustmentApportionment?: unknown;
  insuranceCostAmount?: unknown; insuranceCostCurrency?: unknown;
  containerPackingCostAmount?: unknown; containerPackingCostCurrency?: unknown;
};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export const isPercentageAdjustment = (code: string) => ["AC", "AX", "AZ", "AM", "BL", "BF", "BI"].includes(code);
export const adjustmentUsesMass = (code: string) => ["AQ", "AS", "AW", "BS", "BU"].includes(code);
export const isFreightAdjustment = (code: string) => ["AP", "AQ", "AR", "AS"].includes(code);
export const isCustomsTradeTerm = (code: string) => customsTradeTerms.some(([value]) => value === code);

function withPredefinedRows(rows: CustomsImportAdjustment[]) {
  const remaining = [...rows];
  const predefined = [["import-vat", "AV"], ["import-freight", "AP"], ["import-insurance", "AK"], ["import-air", "AR"]];
  const result = predefined.map(([id, code]) => {
    const index = remaining.findIndex((row) => row.code === code);
    const existing = index >= 0 ? remaining.splice(index, 1)[0] : undefined;
    return { id, code, amount: existing?.amount ?? "", currency: existing?.currency ?? "" };
  });
  // Preserve previously edited starter codes as extra rows, including their values.
  return [...result, ...remaining.map((row) => ({ ...row, id: predefined.some(([id]) => id === row.id) ? `additional-${row.id}` : row.id }))];
}

export function importAdjustmentsForDraft(draft: LegacyCosts): CustomsImportAdjustment[] {
  if (Array.isArray(draft.importAdjustments)) return withPredefinedRows(draft.importAdjustments.map((value, index) => {
    const row = value && typeof value === "object" ? value as Record<string, unknown> : {};
    return { id: text(row.id) || `adjustment-${index}`, code: text(row.code), amount: text(row.amount), currency: text(row.currency) };
  }));
  // Old drafts remain readable. Once edited, the explicit array is authoritative,
  // including an empty array; never resurrect removed legacy amounts.
  const rows = [
    { id: "import-vat", code: draft.vatValueAdjustmentApportionment === "gross_mass" ? "AW" : "AV", amount: text(draft.vatValueAdjustmentAmount), currency: text(draft.vatValueAdjustmentCurrency) },
    { id: "import-freight", code: draft.freightChargeApportionment === "gross_mass" ? "AQ" : "AP", amount: text(draft.freightChargeAmount), currency: text(draft.freightChargeCurrency) },
    { id: "import-insurance", code: "AK", amount: text(draft.insuranceCostAmount), currency: text(draft.insuranceCostCurrency) },
  ];
  if (text(draft.containerPackingCostAmount) || text(draft.containerPackingCostCurrency)) rows.push({ id: "import-packing", code: "AD", amount: text(draft.containerPackingCostAmount), currency: text(draft.containerPackingCostCurrency) });
  return withPredefinedRows(rows);
}

export function importAdjustmentErrors(rows: CustomsImportAdjustment[]) {
  const errors: Array<{ index: number; field: "code" | "amount" | "currency"; message: string }> = [];
  if (rows.length > 99) errors.push({ index: 99, field: "code", message: "Use no more than 99 additions and deductions." });
  rows.forEach((row, index) => {
    // Blank fixed rows are not declared zero-value costs.
    if (!row.amount.trim() && !row.currency.trim()) return;
    if (!customsAdjustmentCodes.some(([code]) => code === row.code)) errors.push({ index, field: "code", message: "Choose an addition or deduction code." });
    if (!/^\d{1,14}(?:\.\d{1,2})?$/.test(row.amount) || Number(row.amount) <= 0) errors.push({ index, field: "amount", message: "Enter a positive amount with no more than two decimal places." });
    if (!isPercentageAdjustment(row.code) && !/^[A-Z]{3}$/.test(row.currency)) errors.push({ index, field: "currency", message: "Choose the currency for this amount." });
  });
  const active = rows.filter((row) => Number(row.amount) > 0);
  const byValue = active.some((row) => ["AP", "AR", "AV", "BA", "BR"].includes(row.code));
  if (byValue) rows.forEach((row, index) => {
    if (Number(row.amount) > 0 && adjustmentUsesMass(row.code)) errors.push({ index, field: "code", message: "Use the same freight apportionment basis throughout: by value or by gross weight." });
  });
  return errors;
}
