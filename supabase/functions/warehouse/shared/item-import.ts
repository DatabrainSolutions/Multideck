import type { ImportColumn, ImportValue } from "./spreadsheet-import.ts";
import { HttpError } from "./http.ts";

export const itemImportColumns: ImportColumn[] = [
  { header: "SKU", key: "sku", required: true, maxLength: 120, example: "ITEM-001", description: "Unique for the selected customer. Keep as text." },
  { header: "Description", key: "description", required: true, maxLength: 240, example: "Example item" },
  { header: "Base UOM", key: "baseUomCode", maxLength: 20, example: "EA", description: "Defaults to EA (each)." },
  { header: "Commodity description", key: "commodityDescription", maxLength: 500 },
  { header: "HS Code", key: "hsCode", maxLength: 20, description: "Keep as text to preserve leading zeros." },
  { header: "Country of origin", key: "countryOfOriginCode", maxLength: 2, example: "GB", description: "Two-letter country code, for example GB." },
  { header: "Quantity basis", key: "quantityBasisCode", choices: ["count", "weight", "volume"], example: "count", description: "count, weight or volume. Defaults to count." },
  { header: "Quantity scale", key: "quantityScale", kind: "number", integer: true, min: 0, max: 6, description: "Decimal places, 0–6. Defaults to 0 for count or 3 for weight/volume." },
  { header: "Minimum movement quantity", key: "minimumMovementQuantity", kind: "number", min: 0.000001, max: 999999999999, decimalPlaces: 6, description: "Greater than zero. Defaults to 1 for count or 0.001 for weight/volume." },
  { header: "Allows fractional quantity", key: "allowsFractionalQuantity", kind: "boolean", description: "Defaults to No for count. Always Yes for weight/volume." },
  ...[["Length M", "lengthM"], ["Width M", "widthM"], ["Height M", "heightM"], ["Net weight KG", "netWeightKg"], ["Gross weight KG", "grossWeightKg"]].map(([header, key]): ImportColumn => ({ header, key, kind: "number", min: 0, max: 999999999999, decimalPlaces: 6 })),
  ...[["Dangerous goods", "isDangerousGoods"], ["Excise goods", "isExciseGoods"], ["High value", "isHighValue"], ["Bonded eligible", "isBondedEligible"], ["Requires lot", "requiresLot"], ["Requires serial", "requiresSerial"], ["Requires expiry", "requiresExpiry"]].map(([header, key]): ImportColumn => ({ header, key, kind: "boolean", example: "No" })),
  { header: "Minimum temperature C", key: "temperatureMinC", kind: "number", min: -999999, max: 999999, decimalPlaces: 3 },
  { header: "Maximum temperature C", key: "temperatureMaxC", kind: "number", min: -999999, max: 999999, decimalPlaces: 3 },
];

export function prepareItemImportInput(values: Record<string, ImportValue>) {
  const input = { ...values };
  for (const key of ["lengthM", "widthM", "heightM", "netWeightKg", "grossWeightKg", "temperatureMinC", "temperatureMaxC"]) {
    const value = input[key];
    if (value === null || value === undefined) continue;
    const temperature = key.startsWith("temperature");
    const scale = temperature ? 3 : 6;
    const limit = temperature ? 999999 : 999999999999;
    const scaled = Number(value) * 10 ** scale;
    if (Math.abs(Number(value)) > limit || Math.abs(scaled - Math.round(scaled)) > 0.00001) {
      const label = itemImportColumns.find((column) => column.key === key)?.header ?? key;
      throw new HttpError(400, `${label}: use at most ${scale} decimal places and a value no greater than ${limit}.`);
    }
  }
  input.quantityBasisCode ??= "count";
  input.quantityScale ??= input.quantityBasisCode === "count" ? 0 : 3;
  input.minimumMovementQuantity ??= input.quantityBasisCode === "count" ? 1 : 0.001;
  input.baseUomCode = String(input.baseUomCode ?? "EA").toUpperCase();
  if (input.countryOfOriginCode && !/^[a-z]{2}$/i.test(String(input.countryOfOriginCode))) throw new HttpError(400, "Country of origin: enter a two-letter country code.");
  if (input.countryOfOriginCode) input.countryOfOriginCode = String(input.countryOfOriginCode).toUpperCase();
  if (input.quantityBasisCode !== "count" && input.allowsFractionalQuantity === false) throw new HttpError(400, "Weight and volume tracking require fractional quantities. Set Allows fractional quantity to Yes or leave it blank.");
  input.allowsFractionalQuantity ??= input.quantityBasisCode !== "count";
  if (input.allowsFractionalQuantity && input.quantityScale === 0) throw new HttpError(400, "Fractional quantities need a quantity scale greater than zero.");
  if (!input.allowsFractionalQuantity && !Number.isInteger(input.minimumMovementQuantity)) throw new HttpError(400, "Minimum movement quantity must be a whole number when fractional quantities are disabled.");
  const scaled = Number(input.minimumMovementQuantity) * 10 ** Number(input.quantityScale);
  if (Math.abs(scaled - Math.round(scaled)) > 1e-7) throw new HttpError(400, "Minimum movement quantity has more decimal places than the quantity scale allows.");
  for (const column of itemImportColumns.filter((column) => column.kind === "boolean")) input[column.key] ??= false;
  return input;
}
