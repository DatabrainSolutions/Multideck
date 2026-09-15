// iCustoms guarantee choices, observed 14 September 2026.
export const customsGuaranteeTypes = [
  ["0", "Guarantee waiver"], ["1", "Comprehensive guarantee"],
  ["2", "Individual guarantee — guarantor undertaking"],
  ["3", "Individual guarantee — cash deposit or equivalent"],
  ["4", "Individual guarantee — vouchers"],
  ["5", "Guarantee waiver — below the statistical threshold"],
  ["7", "Individual guarantee — other equivalent assurance"],
  ["8", "Guarantee not required — certain public bodies"],
  ["B", "TIR guarantee"],
  ["C", "Guarantee not required — fixed transport installations"],
  ["D", "Temporary admission exemption — Article 81(a)"],
  ["E", "Temporary admission exemption — Article 81(b)"],
  ["F", "Temporary admission exemption — Article 81(c)"],
  ["G", "Temporary admission exemption — Article 81(d)"],
  ["H", "Union transit exemption — Article 89(8)(d)"],
  ["X", "Excise guarantee"], ["Y", "Cash account — payment or security"],
] as const;

export type CustomsGuarantee = {
  id: string; type: string; grn: string; guaranteeId: string;
  accessCode: string; office: string; amount: string; currency: string;
};
type GuaranteeDraft = {
  guarantees?: unknown; guaranteeType?: unknown; guaranteeReference?: unknown;
  guaranteeAccessCode?: unknown; guaranteeOffice?: unknown; guaranteeAmount?: unknown; guaranteeCurrency?: unknown;
};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export const emptyCustomsGuarantee = (id: string): CustomsGuarantee => ({ id, type: "", grn: "", guaranteeId: "", accessCode: "", office: "", amount: "", currency: "" });
export function guaranteesForDraft(draft: GuaranteeDraft): CustomsGuarantee[] {
  if (Array.isArray(draft.guarantees)) return draft.guarantees.map((value, index) => {
    const row = value && typeof value === "object" ? value : {};
    const result = emptyCustomsGuarantee(text(row.id) || `guarantee-${index + 1}`);
    for (const field of ["type", "grn", "guaranteeId", "accessCode", "office", "amount", "currency"] as const) result[field] = text(row[field]);
    return result;
  });
  // An explicit array, including [], always supersedes legacy single fields.
  return [{ ...emptyCustomsGuarantee("guarantee-1"), type: text(draft.guaranteeType), grn: text(draft.guaranteeReference), accessCode: text(draft.guaranteeAccessCode), office: text(draft.guaranteeOffice), amount: text(draft.guaranteeAmount), currency: text(draft.guaranteeCurrency) }];
}
export const hasGuaranteeValues = (row: CustomsGuarantee) => Object.entries(row).some(([key, value]) => key !== "id" && value.trim());
export function guaranteeErrors(draft: GuaranteeDraft) {
  const errors: { field: string; message: string }[] = [];
  const rows = guaranteesForDraft(draft);
  if (rows.length > 99) errors.push({ field: "guarantees", message: "Use no more than 99 guarantees." });
  rows.forEach((row, index) => {
    if (!hasGuaranteeValues(row)) return;
    const add = (field: string, message: string) => errors.push({ field: `guarantees.${index}.${field}`, message: `Guarantee ${index + 1}: ${message}` });
    if (!customsGuaranteeTypes.some(([code]) => code === row.type)) add("type", "select a guarantee type.");
    if (row.amount && (!/^\d+(?:\.\d{1,2})?$/.test(row.amount) || !Number.isFinite(Number(row.amount)))) add("amount", "enter a non-negative amount with up to two decimal places.");
    if (row.amount && !/^[A-Z]{3}$/.test(row.currency)) add("currency", "select the amount currency.");
    if (row.currency && !row.amount) add("amount", "enter the amount for this currency.");
    if (row.office && !/^[A-Z]{2}[A-Z0-9]{6}$/.test(row.office)) add("office", "enter an eight-character customs office code.");
  });
  return errors;
}
