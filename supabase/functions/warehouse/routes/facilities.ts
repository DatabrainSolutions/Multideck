
// @ts-nocheck
import {
  BUCKET,
  HttpError,
  allowedExtensions,
  boundedPage,
  bodyObject,
  bool,
  clean,
  companyFacilityIds,
  companyOfficeIds,
  cors,
  id,
  many,
  numberOrNull,
  one,
  oneOrNull,
  postgrestSearchPattern,
  requireCapability,
  requireCustomerScope,
  requireInternalWarehouseRead,
  requireInternalWarehouseWrite,
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
export async function handleFacilities(request, path, url, admin, actor) {
  if (request.method === "GET") requireInternalWarehouseRead(actor);
  else requireInternalWarehouseWrite(actor);
  const types = await many(admin.from("sys_WMSFacilityTypes").select("*").eq("WMSFacilityType_IsActive", true));
  const officeIds = await companyOfficeIds(admin, actor);
  const offices = officeIds.length ? await many(admin.from("cmp_Offices")
    .select("Office_ID,Office_Name,Office_Address,Company_ID")
    .eq("Company_ID", actor.companyId)
    .in("Office_ID", officeIds)) : [];
  const typeNames = new Map(types.map((row)=>[
      row.WMSFacilityType_Code,
      row.WMSFacilityType_Name
    ]));
  const officeNames = new Map(offices.map((row)=>[
      row.Office_ID,
      row.Office_Name
    ]));
  if (request.method === "GET" && path.length === 1 && url.searchParams.has("limit")) {
    const facilityIds = await companyFacilityIds(admin, actor);
    const { limit, offset } = boundedPage(url);
    if (!facilityIds.length) return { rows: [], total: 0, limit, offset };

    let query = admin.from("WMS_Facilities")
      .select("*", { count: "exact" })
      .in("WMSFacility_ID", facilityIds)
      .eq("WMSFacility_IsDeleted", false);
    if (url.searchParams.get("includeInactive") !== "true") query = query.eq("WMSFacility_IsActive", true);
    const pattern = postgrestSearchPattern(url.searchParams.get("search"));
    if (pattern) query = query.or([
      `WMSFacility_Code.ilike.${pattern}`,
      `WMSFacility_Name.ilike.${pattern}`,
      `WMSFacility_TownCity.ilike.${pattern}`,
      `WMSFacility_CountryCode.ilike.${pattern}`,
      `WMSFacility_UNLOCODE.ilike.${pattern}`,
      `WMSFacility_PostZipCode.ilike.${pattern}`,
      `WMSFacility_Address1.ilike.${pattern}`
    ].join(","));
    const sortColumns = { code: "WMSFacility_Code", facility: "WMSFacility_Name", location: "WMSFacility_TownCity", bonded: "WMSFacility_IsBonded", status: "WMSFacility_IsActive" };
    const sortColumn = sortColumns[clean(url.searchParams.get("sort"), 40)] ?? "WMSFacility_Name";
    const ascending = url.searchParams.get("direction") !== "desc";
    const { data, error, count } = await query
      .order(sortColumn, { ascending, nullsFirst: false })
      .order("WMSFacility_ID", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error) throw new HttpError(500, error.message);
    return { rows: (data ?? []).map((row)=>mapFacility(row, typeNames, officeNames)), total: count ?? 0, limit, offset };
  }
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
          address: row.Office_Address
        }))
    };
  }
  if (request.method === "GET" && path.length === 1) {
    throw new HttpError(400, "Warehouse facility lists require bounded paging.");
  }
  const facilityId = path[1] ? uuid(path[1], "facility") : null;
  const facilityIds = facilityId ? await companyFacilityIds(admin, actor) : [];
  const existing = facilityId && facilityIds.includes(facilityId) ? await oneOrNull(admin.from("WMS_Facilities")
    .select("*")
    .eq("WMSFacility_ID", facilityId)
    .eq("WMSFacility_IsDeleted", false)
    .limit(1)
    .maybeSingle()) : null;
  if (request.method === "GET" && facilityId) {
    if (!existing) {
      throw new HttpError(404, "This facility does not exist in your workspace.");
    }
    return mapFacility(existing, typeNames, officeNames);
  }
  if (request.method === "DELETE" && facilityId) {
    if (!existing) throw new HttpError(404, "This facility does not exist in your workspace.");
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
  if (request.method === "PUT" && !existing) throw new HttpError(404, "This facility does not exist in your workspace.");
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
  }).select().single(), "Could not create the facility.") : await one(admin.from("WMS_Facilities").update(payload).eq("WMSFacility_ID", facilityId).select().single(), "This facility does not exist in your workspace.");
  return mapFacility(saved, typeNames, officeNames);
}
