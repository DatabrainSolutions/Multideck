// @ts-nocheck
import { HttpError } from "./http.ts";
import { many } from "./database.ts";
import { validateLocationInput } from "./location-input.ts";

export async function importLocationRows({ rows, references, defaultTypeCode, admin, facilityId, preview, saveBatch }) {
  if (!references.types.some((row) => row.WMSLocationType_Code === defaultTypeCode)) throw new HttpError(400, "Choose a valid default location type.");
  const counts = new Map();
  for (const row of rows) {
    const code = row.values.code;
    if (code) counts.set(code, (counts.get(code) ?? 0) + 1);
  }
  const codes = [...counts.keys()];
  const existing = new Set();
  // The unique constraint also reserves deleted codes. Check those too, and
  // bound each query so a large import never fetches the whole location register.
  for (let offset = 0; offset < codes.length; offset += 100) {
    const matches = await many(admin.from("WMS_Locations").select("WMSLocation_Code")
      .eq("WMSLocation_FacilityID", facilityId).in("WMSLocation_Code", codes.slice(offset, offset + 100)).limit(100));
    for (const match of matches) existing.add(match.WMSLocation_Code);
  }
  const results = rows.map((row) => {
    const result = { row: row.row, code: row.values.code ?? "", success: false, error: null, values: row.values };
    try {
      if (row.error) throw new HttpError(400, row.error);
      result.values = validateLocationInput(row.values, references, defaultTypeCode);
      if (counts.get(result.code) > 1) throw new HttpError(400, "This location code appears more than once in the spreadsheet.");
      if (existing.has(result.code)) throw new HttpError(409, "This location code already exists in this facility.");
      result.success = true;
    } catch (error) { result.error = error.message ?? "Check this row and try again."; }
    return result;
  });
  let created = 0;
  // Validate the entire spreadsheet before the first write, even when a client
  // bypasses preview. A preview has no side effects, including zone creation.
  if (!preview && !results.some((row) => !row.success)) {
    for (let offset = 0; offset < results.length; offset += 100) {
      const batch = results.slice(offset, offset + 100);
      try {
        await saveBatch(batch.map((result) => result.values));
        created += batch.length;
      } catch (error) {
        for (const result of batch) {
          result.success = false;
          result.error = `This group was not created. ${error.message ?? "Could not create these locations."}`;
        }
      }
    }
  } else if (!preview) {
    for (const result of results) {
      if (result.success) {
        result.success = false;
        result.error = "Not created. Correct the reported rows and upload the spreadsheet again.";
      }
    }
  }
  return { created, failed: results.filter((row) => !row.success).length, total: rows.length, preview, results };
}
