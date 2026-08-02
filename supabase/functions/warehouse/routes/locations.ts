
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

export async function handleLocations(request, path, url, admin, actor) {
  requireInternal(actor);
  const facilityId = uuid(path[1], "facility"), scoped = await companyFacilityIds(admin, actor);
  if (!scoped.includes(facilityId)) {
    throw new HttpError(404, "This facility does not exist in your workspace.");
  }
  const locationIndex = path.indexOf("locations"), tail = path.slice(locationIndex + 1);
  const types = await many(admin.from("sys_WMSLocationTypes").select("*")), statuses = await many(admin.from("sys_WMSLocationStatuses").select("*")), zoneTypes = await many(admin.from("sys_WMSZoneTypes").select("*")), zones = await many(admin.from("WMS_Zones").select("*").eq("WMSZone_FacilityID", facilityId).eq("WMSZone_IsDeleted", false));
  const typeNames = new Map(types.map((row)=>[
      row.WMSLocationType_Code,
      row.WMSLocationType_Name
    ])), statusNames = new Map(statuses.map((row)=>[
      row.WMSLocationStatus_Code,
      row.WMSLocationStatus_Name
    ])), zoneById = new Map(zones.map((row)=>[
      row.WMSZone_ID,
      row
    ]));
  const map = (row)=>{
    const zone = zoneById.get(row.WMSLocation_ZoneID);
    return {
      id: row.WMSLocation_ID,
      facilityId,
      code: row.WMSLocation_Code,
      barcode: row.WMSLocation_Barcode,
      typeCode: row.WMSLocation_TypeCode,
      typeName: typeNames.get(row.WMSLocation_TypeCode) ?? null,
      statusCode: row.WMSLocation_StatusCode,
      statusName: statusNames.get(row.WMSLocation_StatusCode) ?? null,
      zoneId: row.WMSLocation_ZoneID,
      zoneTypeCode: zone?.WMSZone_TypeCode ?? null,
      zoneName: zone?.WMSZone_Name ?? null,
      aisle: row.WMSLocation_Aisle,
      bay: row.WMSLocation_Bay,
      level: row.WMSLocation_Level,
      position: row.WMSLocation_Position,
      lengthM: row.WMSLocation_LengthM,
      widthM: row.WMSLocation_WidthM,
      heightM: row.WMSLocation_HeightM,
      maxWeightKg: row.WMSLocation_MaxWeightKG,
      maxVolumeCbm: row.WMSLocation_MaxVolumeCBM,
      temperatureMinC: row.WMSLocation_TemperatureMinC,
      temperatureMaxC: row.WMSLocation_TemperatureMaxC,
      allowsMultiSku: row.WMSLocation_AllowsMultiSKU,
      allowsBondedStock: row.WMSLocation_AllowsBondedStock,
      isActive: row.WMSLocation_IsActive,
      createdAt: row.WMSLocation_CreatedAt,
      updatedAt: row.WMSLocation_UpdatedAt
    };
  };
  if (request.method === "GET" && tail[0] === "reference") {
    return {
      types: types.filter((row)=>row.WMSLocationType_IsActive).map((row)=>({
          code: row.WMSLocationType_Code,
          name: row.WMSLocationType_Name,
          isPickable: row.WMSLocationType_IsPickable
        })),
      statuses: statuses.filter((row)=>row.WMSLocationStatus_IsActive).map((row)=>({
          code: row.WMSLocationStatus_Code,
          name: row.WMSLocationStatus_Name,
          isUsable: row.WMSLocationStatus_IsUsable
        })),
      zones: zoneTypes.filter((row)=>row.WMSZoneType_IsActive).map((row)=>({
          code: row.WMSZoneType_Code,
          name: row.WMSZoneType_Name,
          allowsStock: row.WMSZoneType_AllowsStock
        }))
    };
  }
  const rows = await many(admin.from("WMS_Locations").select("*").eq("WMSLocation_FacilityID", facilityId).eq("WMSLocation_IsDeleted", false));
  if (request.method === "GET" && !tail.length) {
    const term = clean(url.searchParams.get("search"))?.toLowerCase();
    return rows.filter((row)=>url.searchParams.get("includeInactive") === "true" || row.WMSLocation_IsActive).filter((row)=>!term || [
        row.WMSLocation_Code,
        row.WMSLocation_Barcode,
        row.WMSLocation_Aisle,
        row.WMSLocation_Bay,
        row.WMSLocation_Level,
        row.WMSLocation_Position,
        zoneById.get(row.WMSLocation_ZoneID)?.WMSZone_Name
      ].some((value)=>String(value ?? "").toLowerCase().includes(term))).sort((a, b)=>a.WMSLocation_Code.localeCompare(b.WMSLocation_Code)).map(map);
  }
  const locationId = tail[0] ? uuid(tail[0], "location") : null, existing = rows.find((row)=>row.WMSLocation_ID === locationId);
  if (request.method === "GET") {
    if (!existing) {
      throw new HttpError(404, "This location does not exist in this facility.");
    }
    return map(existing);
  }
  if (request.method === "DELETE") {
    if (!existing) {
      throw new HttpError(404, "This location does not exist in this facility.");
    }
    const stock = await oneOrNull(admin.from("WMS_InventoryBalances").select("WMSBalance_ID").eq("WMSBalance_LocationID", locationId).neq("WMSBalance_OnHandQuantity", 0).limit(1).maybeSingle());
    if (stock) {
      throw new HttpError(409, "Move or dispatch the stock in this location before deleting it.");
    }
    const usedLines = await many(admin.from("WMS_OrderLines").select("WMSOrderLine_OrderID").or(`WMSOrderLine_SourceLocationID.eq.${locationId},WMSOrderLine_TargetLocationID.eq.${locationId}`));
    if (usedLines.length) {
      const openOrder = await oneOrNull(admin.from("WMS_Orders").select("WMSOrder_ID").in("WMSOrder_ID", usedLines.map((row)=>row.WMSOrderLine_OrderID)).eq("WMSOrder_IsDeleted", false).not("WMSOrder_StatusCode", "in", '("complete","cancelled")').limit(1).maybeSingle());
      if (openOrder) {
        throw new HttpError(409, "This location is still used by an open warehouse order.");
      }
    }
    await admin.from("WMS_Locations").update({
      WMSLocation_IsDeleted: true,
      WMSLocation_IsActive: false,
      WMSLocation_UpdatedAt: new Date().toISOString()
    }).eq("WMSLocation_ID", locationId);
    return undefined;
  }
  const input = bodyObject(await request.json()), code = required(input.code, "Enter a location code.", "code", 80), typeCode = required(input.typeCode, "Choose a location type.", "typeCode", 60), statusCode = clean(input.statusCode, 60) ?? "available", zoneTypeCode = clean(input.zoneTypeCode, 60);
  if (!types.some((row)=>row.WMSLocationType_Code === typeCode) || !statuses.some((row)=>row.WMSLocationStatus_Code === statusCode)) throw new HttpError(400, "Choose valid location type and status values.");
  let zoneId = null;
  if (zoneTypeCode) {
    const definition = zoneTypes.find((row)=>row.WMSZoneType_Code === zoneTypeCode);
    if (!definition) {
      throw new HttpError(400, `'${zoneTypeCode}' is not a valid zone.`);
    }
    let zone = zones.find((row)=>row.WMSZone_TypeCode === zoneTypeCode);
    if (!zone) {
      zone = await one(admin.from("WMS_Zones").insert({
        WMSZone_ID: id(),
        WMSZone_FacilityID: facilityId,
        WMSZone_Code: zoneTypeCode.slice(0, 50),
        WMSZone_Name: definition.WMSZoneType_Name,
        WMSZone_TypeCode: zoneTypeCode,
        WMSZone_StatusCode: "available",
        WMSZone_SettingsJSON: {},
        WMSZone_IsActive: true,
        WMSZone_IsDeleted: false,
        WMSZone_CreatedBy: actor.userId
      }).select().single(), "Could not create the warehouse zone.");
    }
    zoneId = zone.WMSZone_ID;
  }
  const min = numberOrNull(input.temperatureMinC), max = numberOrNull(input.temperatureMaxC);
  if (min !== null && max !== null && max < min) {
    throw new HttpError(400, "Maximum temperature cannot be below the minimum temperature.");
  }
  const payload = {
    WMSLocation_FacilityID: facilityId,
    WMSLocation_ZoneID: zoneId,
    WMSLocation_Code: code,
    WMSLocation_Barcode: clean(input.barcode, 160),
    WMSLocation_TypeCode: typeCode,
    WMSLocation_StatusCode: statusCode,
    WMSLocation_Aisle: clean(input.aisle, 40),
    WMSLocation_Bay: clean(input.bay, 40),
    WMSLocation_Level: clean(input.level, 40),
    WMSLocation_Position: clean(input.position, 40),
    WMSLocation_LengthM: numberOrNull(input.lengthM),
    WMSLocation_WidthM: numberOrNull(input.widthM),
    WMSLocation_HeightM: numberOrNull(input.heightM),
    WMSLocation_MaxWeightKG: numberOrNull(input.maxWeightKg),
    WMSLocation_MaxVolumeCBM: numberOrNull(input.maxVolumeCbm),
    WMSLocation_TemperatureMinC: min,
    WMSLocation_TemperatureMaxC: max,
    WMSLocation_AllowsMultiSKU: bool(input.allowsMultiSku),
    WMSLocation_AllowsBondedStock: bool(input.allowsBondedStock),
    WMSLocation_AllowedCustomsStatusesJSON: [],
    WMSLocation_IsActive: request.method === "POST" ? true : bool(input.isActive, true),
    WMSLocation_UpdatedAt: new Date().toISOString()
  };
  const saved = request.method === "POST" ? await one(admin.from("WMS_Locations").insert({
    WMSLocation_ID: id(),
    ...payload,
    WMSLocation_CreatedBy: actor.userId
  }).select().single(), "Could not create the location.") : await one(admin.from("WMS_Locations").update(payload).eq("WMSLocation_ID", locationId).select().single(), "This location does not exist in this facility.");
  return map(saved);
}
