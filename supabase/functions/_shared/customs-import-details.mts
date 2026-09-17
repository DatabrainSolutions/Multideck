// Reference choices observed in the iCustoms import editor, 14 September 2026.
export const customsWarehouseTypes = [
  ["R", "Public customs warehouse — type I"],
  ["S", "Public customs warehouse — type II"],
  ["T", "Public customs warehouse — type III"],
  ["U", "Private customs warehouse"],
  ["Y", "Non-customs warehouse"],
  ["Z", "Free zone"],
] as const;
export const customsFiscalRoles = [
  ["FR1", "Importer VAT number"],
  ["FR2", "Customer VAT number — intra-community acquisition"],
  ["FR3", "Tax representative VAT number"],
  ["FR4", "VAT number of the person granted deferred payment"],
] as const;

export type ImportFiscalParty = { id: string; partyId: string; roleCode: string; useCustomer?: boolean };
type ImportDetails = {
  exchangeRate?: unknown; supervisingOffice?: unknown; presentationOffice?: unknown;
  warehouseType?: unknown; warehouseIdentifier?: unknown; domesticDutyTaxParties?: unknown;
  importerVatNumber?: unknown;
};
const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
export function importFiscalParties(value: unknown): ImportFiscalParty[] {
  if (!Array.isArray(value)) return [{ id: "header-tax-party-1", partyId: "", roleCode: "" }];
  return value.map((entry, index) => {
    const row = entry && typeof entry === "object" ? entry : {};
    return { id: text(row.id) || `header-tax-party-${index + 1}`, partyId: text(row.partyId), roleCode: text(row.roleCode), useCustomer: row.useCustomer === true };
  });
}
export function importDetailsErrors(input: ImportDetails) {
  const errors: { field: string; message: string }[] = [];
  const rate = text(input.exchangeRate);
  if (rate && (!/^\d+(?:\.\d+)?$/.test(rate) || !Number.isFinite(Number(rate)) || Number(rate) <= 0)) errors.push({ field: "exchangeRate", message: "Enter an exchange rate greater than zero." });
  for (const field of ["supervisingOffice", "presentationOffice"] as const) {
    if (text(input[field]) && !/^[A-Z]{2}[A-Z0-9]{6}$/i.test(text(input[field]))) errors.push({ field, message: "Enter an eight-character customs office code." });
  }
  const type = text(input.warehouseType);
  const identifier = text(input.warehouseIdentifier);
  if (type || identifier) {
    if (!customsWarehouseTypes.some(([code]) => code === type)) errors.push({ field: "warehouseType", message: "Select a warehouse type." });
    if (!identifier || identifier.length > 35) errors.push({ field: "warehouseIdentifier", message: "Enter the warehouse identifier (up to 35 characters)." });
  }
  const rows = importFiscalParties(input.domesticDutyTaxParties);
  if (rows.length > 99) errors.push({ field: "domesticDutyTaxParties", message: "Use no more than 99 domestic duty tax parties." });
  rows.forEach((row, index) => {
    const customer = text(input.importerVatNumber);
    if (!row.partyId && !row.roleCode && !row.useCustomer) return;
    if (row.useCustomer && (!customer || customer.length > 17)) errors.push({ field: `domesticDutyTaxParties.${index}.partyId`, message: `Tax party ${index + 1}: add a valid VAT number in the company’s Customs settings, or turn off Use customer to enter it manually.` });
    if (!row.useCustomer && (!row.partyId || row.partyId.length > 17)) errors.push({ field: `domesticDutyTaxParties.${index}.partyId`, message: `Tax party ${index + 1}: enter a VAT identifier (up to 17 characters).` });
    if (!customsFiscalRoles.some(([code]) => code === row.roleCode)) errors.push({ field: `domesticDutyTaxParties.${index}.roleCode`, message: `Tax party ${index + 1}: select a role.` });
  });
  return errors;
}
