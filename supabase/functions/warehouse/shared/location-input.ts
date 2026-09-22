// @ts-nocheck
import { HttpError } from "./http.ts";

export const locationImportColumns = [
  { header: "Code", key: "code", required: true, maxLength: 80 },
  { header: "Type", key: "typeCode", maxLength: 60 },
  { header: "Status", key: "statusCode", maxLength: 60 },
  { header: "Zone", key: "zoneTypeCode", maxLength: 60 },
  { header: "Barcode", key: "barcode", maxLength: 160 },
  ...["Aisle", "Bay", "Level", "Position"].map((header) => ({ header, key: header.toLowerCase(), maxLength: 40 })),
  ...[["Length M", "lengthM"], ["Width M", "widthM"], ["Height M", "heightM"],
    ["Max weight KG", "maxWeightKg"], ["Max volume CBM", "maxVolumeCbm"]]
    .map(([header, key]) => ({ header, key, kind: "number", min: 0, max: 999999999999, decimalPlaces: 6 })),
  { header: "Minimum temperature C", key: "temperatureMinC", kind: "number", min: -999999, max: 999999, decimalPlaces: 3 },
  { header: "Maximum temperature C", key: "temperatureMaxC", kind: "number", min: -999999, max: 999999, decimalPlaces: 3 },
  { header: "Allows multiple SKUs", key: "allowsMultiSku", kind: "boolean" },
  { header: "Allows bonded stock", key: "allowsBondedStock", kind: "boolean" },
];

// Both the editor and spreadsheet import pass through this validation before a
// zone or location is written, so a failed row cannot leave a newly created zone.
export function validateLocationInput(input, references, defaultTypeCode = null) {
  const values = {};
  for (const column of locationImportColumns) {
    const raw = input[column.key];
    if (raw === undefined || raw === null || raw === "") { values[column.key] = null; continue; }
    if (column.kind === "boolean") {
      if (typeof raw !== "boolean") throw new HttpError(400, `${column.header} must be Yes or No.`);
      values[column.key] = raw;
    } else if (column.kind === "number") {
      if ((typeof raw !== "number" && typeof raw !== "string") || (typeof raw === "string" && !/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(raw.trim()))) {
        throw new HttpError(400, `${column.header} must be a valid number.`);
      }
      const value = Number(raw);
      if (!Number.isFinite(value) || value < column.min || value > column.max) throw new HttpError(400, `${column.header} is outside the supported range.`);
      const scaled = value * 10 ** column.decimalPlaces;
      if (Math.abs(scaled - Math.round(scaled)) > 0.00001) throw new HttpError(400, `${column.header} must use no more than ${column.decimalPlaces} decimal places.`);
      values[column.key] = value;
    } else {
      if (typeof raw !== "string") throw new HttpError(400, `${column.header} must be text.`);
      const value = raw.trim();
      if (value.length > column.maxLength) throw new HttpError(400, `${column.header} must be ${column.maxLength} characters or fewer.`);
      values[column.key] = value || null;
    }
  }
  if (!values.code) throw new HttpError(400, "Enter a location code.");
  values.typeCode ??= defaultTypeCode;
  values.statusCode ??= "available";
  values.allowsMultiSku ??= true;
  values.allowsBondedStock ??= false;
  if (!references.types.some((row) => row.WMSLocationType_Code === values.typeCode)) throw new HttpError(400, "Choose a valid location type.");
  if (!references.statuses.some((row) => row.WMSLocationStatus_Code === values.statusCode)) throw new HttpError(400, "Choose a valid location status.");
  if (values.zoneTypeCode && !references.zoneTypes.some((row) => row.WMSZoneType_Code === values.zoneTypeCode)) throw new HttpError(400, "Choose a valid zone.");
  if (values.temperatureMinC !== null && values.temperatureMaxC !== null && values.temperatureMaxC < values.temperatureMinC) {
    throw new HttpError(400, "Maximum temperature cannot be below the minimum temperature.");
  }
  return values;
}
