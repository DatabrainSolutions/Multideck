
// @ts-nocheck
import {
  BUCKET,
  HttpError,
  allowedExtensions,
  bodyObject,
  bool,
  clean,
  companyFacilityIds,
  cors,
  id,
  many,
  numberOrNull,
  one,
  oneOrNull,
  requireCapability,
  requireCustomerScope,
  requireInternal,
  required,
  uuid,
} from "../shared/mod.ts";

function mapFacility(row, typeNames, officeNames) {
  return {
    id: row.WMSFacility_ID,
    code: row.WMSFacility_Code,
    name: row.WMSFacility_Name,
    typeCode: row.WMSFacility_TypeCode,
    typeName: typeNames.get(row.WMSFacility_TypeCode) ?? null,
    officeId: row.WMSFacility_OrgOfficeID,
    officeName: officeNames.get(row.WMSFacility_OrgOfficeID) ?? null,
    unlocode: row.WMSFacility_UNLOCODE,
    address1: row.WMSFacility_Address1,
    address2: row.WMSFacility_Address2,
    townCity: row.WMSFacility_TownCity,
    countyState: row.WMSFacility_CountyState,
    postZipCode: row.WMSFacility_PostZipCode,
    countryCode: row.WMSFacility_CountryCode,
    timeZone: row.WMSFacility_TimeZone,
    isBonded: row.WMSFacility_IsBonded,
    defaultCustomsStatusCode: row.WMSFacility_DefaultCustomsStatusCode,
    isActive: row.WMSFacility_IsActive,
    createdAt: row.WMSFacility_CreatedAt,
    updatedAt: row.WMSFacility_UpdatedAt
  };
}
async function facilityRows(admin, actor) {
  requireInternal(actor);
  const ids = await companyFacilityIds(admin, actor);
  return ids.length ? await many(admin.from("WMS_Facilities").select("*").in("WMSFacility_ID", ids).eq("WMSFacility_IsDeleted", false)) : [];
}
export async function handleFacilities(request, path, url, admin, actor) {
  const rows = await facilityRows(admin, actor);
  const types = await many(admin.from("sys_WMSFacilityTypes").select("*").eq("WMSFacilityType_IsActive", true));
  const offices = await many(admin.from("cmp_Offices").select("Office_ID,Office_Name,Office_Address1,Company_ID").eq("Company_ID", actor.companyId));
  const typeNames = new Map(types.map((row)=>[
      row.WMSFacilityType_Code,
      row.WMSFacilityType_Name
    ]));
  const officeNames = new Map(offices.map((row)=>[
      row.Office_ID,
      row.Office_Name
    ]));
  if (request.method === "GET" && path[1] === "reference") {
    const customs = await many(admin.from("sys_WMSCustomsStatuses").select("*").eq("WMSCustomsStatus_IsActive", true));
    return {
      types: types.sort((a, b)=>a.WMSFacilityType_SortOrder - b.WMSFacilityType_SortOrder).map((row)=>({
          code: row.WMSFacilityType_Code,
          name: row.WMSFacilityType_Name,
          isBondedCandidate: row.WMSFacilityType_IsBondedCandidate
        })),
      customsStatuses: customs.sort((a, b)=>a.WMSCustomsStatus_SortOrder - b.WMSCustomsStatus_SortOrder).map((row)=>({
          code: row.WMSCustomsStatus_Code,
          name: row.WMSCustomsStatus_Name,
          isDutySuspended: row.WMSCustomsStatus_IsDutySuspended
        })),
      offices: offices.map((row)=>({
          id: row.Office_ID,
          name: row.Office_Name,
          address: row.Office_Address1
        }))
    };
  }
  if (request.method === "GET" && path.length === 1) {
    const term = clean(url.searchParams.get("search"))?.toLowerCase();
    return rows.filter((row)=>url.searchParams.get("includeInactive") === "true" || row.WMSFacility_IsActive).filter((row)=>!term || [
        row.WMSFacility_Code,
        row.WMSFacility_Name,
        row.WMSFacility_TownCity,
        row.WMSFacility_CountryCode,
        row.WMSFacility_UNLOCODE,
        row.WMSFacility_PostZipCode,
        row.WMSFacility_Address1
      ].some((value)=>String(value ?? "").toLowerCase().includes(term))).sort((a, b)=>a.WMSFacility_Name.localeCompare(b.WMSFacility_Name)).map((row)=>mapFacility(row, typeNames, officeNames));
  }
  const facilityId = path[1] ? uuid(path[1], "facility") : null;
  if (request.method === "GET" && facilityId) {
    const row = rows.find((value)=>value.WMSFacility_ID === facilityId);
    if (!row) {
      throw new HttpError(404, "This facility does not exist in your workspace.");
    }
    return mapFacility(row, typeNames, officeNames);
  }
  if (request.method === "DELETE" && facilityId) {
    const hasItems = await oneOrNull(admin.from("WMS_Items").select("WMSItem_ID").eq("WMSItem_DefaultFacilityID", facilityId).eq("WMSItem_IsDeleted", false).limit(1).maybeSingle());
    const hasStock = await oneOrNull(admin.from("WMS_InventoryBalances").select("WMSBalance_ID").eq("WMSBalance_FacilityID", facilityId).neq("WMSBalance_OnHandQuantity", 0).limit(1).maybeSingle());
    const openOrder = await oneOrNull(admin.from("WMS_Orders").select("WMSOrder_ID").eq("WMSOrder_FacilityID", facilityId).eq("WMSOrder_IsDeleted", false).not("WMSOrder_StatusCode", "in", '("complete","cancelled")').limit(1).maybeSingle());
    if (hasItems || hasStock || openOrder) {
      throw new HttpError(409, "Move or remove the stock and items, and complete open orders before deleting this facility.");
    }
    await one(admin.from("WMS_Facilities").update({
      WMSFacility_IsDeleted: true,
      WMSFacility_IsActive: false,
      WMSFacility_UpdatedAt: new Date().toISOString(),
      WMSFacility_UpdatedBy: actor.userId
    }).eq("WMSFacility_ID", facilityId).select().single(), "This facility does not exist in your workspace.");
    return undefined;
  }
  if (request.method !== "POST" && request.method !== "PUT") {
    throw new HttpError(405, "Method not allowed.");
  }
  const input = bodyObject(await request.json());
  const code = required(input.code, "Enter a facility code.", "code", 40);
  const name = required(input.name, "Enter a facility name.", "name", 180);
  const typeCode = required(input.typeCode, "Choose a facility type.", "typeCode", 60);
  if (!types.some((row)=>row.WMSFacilityType_Code === typeCode)) {
    throw new HttpError(400, `'${typeCode}' is not a valid facility type.`);
  }
  const officeId = clean(input.officeId, 80) ?? offices[0]?.Office_ID;
  if (!officeId || !offices.some((row)=>row.Office_ID === officeId)) {
    throw new HttpError(403, "Choose an office that belongs to your company.");
  }
  const payload = {
    WMSFacility_Code: code,
    WMSFacility_Name: name,
    WMSFacility_TypeCode: typeCode,
    WMSFacility_OrgOfficeID: officeId,
    WMSFacility_UNLOCODE: clean(input.unlocode, 5)?.toUpperCase() ?? null,
    WMSFacility_Address1: clean(input.address1, 180),
    WMSFacility_Address2: clean(input.address2, 180),
    WMSFacility_TownCity: clean(input.townCity, 120),
    WMSFacility_CountyState: clean(input.countyState, 120),
    WMSFacility_PostZipCode: clean(input.postZipCode, 40),
    WMSFacility_CountryCode: clean(input.countryCode, 2)?.toUpperCase() ?? null,
    WMSFacility_TimeZone: clean(input.timeZone, 80) ?? "UTC",
    WMSFacility_IsBonded: bool(input.isBonded),
    WMSFacility_DefaultCustomsStatusCode: clean(input.defaultCustomsStatusCode, 60) ?? "free_circulation",
    WMSFacility_SettingsJSON: {},
    WMSFacility_IsActive: request.method === "POST" ? true : bool(input.isActive, true),
    WMSFacility_UpdatedAt: new Date().toISOString(),
    WMSFacility_UpdatedBy: actor.userId
  };
  const saved = request.method === "POST" ? await one(admin.from("WMS_Facilities").insert({
    WMSFacility_ID: id(),
    ...payload,
    WMSFacility_CreatedBy: actor.userId
  }).select().single(), "Could not create the facility.") : await one(admin.from("WMS_Facilities").update(payload).eq("WMSFacility_ID", facilityId).in("WMSFacility_ID", rows.map((row)=>row.WMSFacility_ID)).select().single(), "This facility does not exist in your workspace.");
  return mapFacility(saved, typeNames, officeNames);
}

