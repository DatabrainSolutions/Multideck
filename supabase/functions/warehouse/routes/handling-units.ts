// @ts-nocheck
import { clean, companyFacilityIds, HttpError, many, requireCapability } from "../shared/mod.ts";

export async function handleHandlingUnits(path, url, admin, actor) {
  requireCapability(actor, "warehouse_inventory:read");
  const facilityIds = await companyFacilityIds(admin, actor);
  const requestedFacility = clean(url.searchParams.get("facilityId"));
  const allowed = requestedFacility ? facilityIds.filter((id) => id === requestedFacility) : facilityIds;
  if (!allowed.length) return path[1] === "reference" ? { types: [], locations: [], statuses: [] } : [];

  const [types, locations, statuses] = await Promise.all([
    many(admin.from("sys_WMSHandlingUnitTypes").select("*").eq("WMSHUType_IsActive", true).order("WMSHUType_SortOrder")),
    many(admin.from("WMS_Locations").select("WMSLocation_ID,WMSLocation_FacilityID,WMSLocation_Code,WMSLocation_StatusCode,WMSLocation_TypeCode").in("WMSLocation_FacilityID", allowed).eq("WMSLocation_IsDeleted", false).eq("WMSLocation_IsActive", true)),
    many(admin.from("sys_WMSInventoryStatuses").select("*").eq("WMSInventoryStatus_IsActive", true).order("WMSInventoryStatus_SortOrder")),
  ]);
  if (path[1] === "reference") {
    return {
      types: types.map((row) => ({ code: row.WMSHUType_Code, name: row.WMSHUType_Name, isContainer: row.WMSHUType_IsContainer })),
      locations: locations.map((row) => ({ id: row.WMSLocation_ID, facilityId: row.WMSLocation_FacilityID, code: row.WMSLocation_Code, statusCode: row.WMSLocation_StatusCode, typeCode: row.WMSLocation_TypeCode })),
      statuses: statuses.map((row) => ({ code: row.WMSInventoryStatus_Code, name: row.WMSInventoryStatus_Name, available: row.WMSInventoryStatus_IsAvailableCandidate })),
    };
  }

  let units = await many(admin.from("WMS_HandlingUnits").select("*").in("WMSHU_FacilityID", allowed).eq("WMSHU_IsDeleted", false).order("WMSHU_UpdatedAt", { ascending: false }).limit(500));
  if (!actor.companyId) units = units.filter((row) => actor.organisationIds.has(row.WMSHU_CustomerOrgID));
  const unitIds = units.map((row) => row.WMSHU_ID);
  const [balances, items, lots, orgs, events] = await Promise.all([
    unitIds.length ? many(admin.from("WMS_InventoryBalances").select("*").in("WMSBalance_HU_ID", unitIds).gt("WMSBalance_OnHandQuantity", 0)) : Promise.resolve([]),
    many(admin.from("WMS_Items").select("WMSItem_ID,WMSItem_SKU,WMSItem_Description")),
    many(admin.from("WMS_InventoryLots").select("WMSLot_ID,WMSLot_LotNumber,WMSLot_BatchNumber")),
    many(admin.from("Org_Master").select("Org_id,Org_Name")),
    unitIds.length ? many(admin.from("WMS_HandlingUnitEvents").select("*").in("WMSHUEvent_HU_ID", unitIds).order("WMSHUEvent_EventAt", { ascending: false }).limit(500)) : Promise.resolve([]),
  ]);
  const itemMap = new Map(items.map((row) => [row.WMSItem_ID, row]));
  const lotMap = new Map(lots.map((row) => [row.WMSLot_ID, row]));
  const orgMap = new Map(orgs.map((row) => [row.Org_id, row.Org_Name]));
  const locationMap = new Map(locations.map((row) => [row.WMSLocation_ID, row.WMSLocation_Code]));
  const typeMap = new Map(types.map((row) => [row.WMSHUType_Code, row.WMSHUType_Name]));
  const statusMap = new Map(statuses.map((row) => [row.WMSInventoryStatus_Code, row.WMSInventoryStatus_Name]));
  const term = clean(url.searchParams.get("search"))?.toLowerCase();
  const includeConsumed = url.searchParams.get("includeConsumed") === "true";
  const requestedId = path[1] && path[1] !== "reference" ? path[1] : null;
  const filtered = units.filter((row) => includeConsumed || row.WMSHU_LifecycleStatusCode !== "consumed").filter((row) => !requestedId || row.WMSHU_ID === requestedId).filter((row) => !term || [row.WMSHU_Code, row.WMSHU_SSCC, row.WMSHU_ExternalReference, orgMap.get(row.WMSHU_CustomerOrgID), locationMap.get(row.WMSHU_LocationID)].some((value) => String(value ?? "").toLowerCase().includes(term)));
  if (requestedId && !filtered.length) throw new HttpError(404, "This warehouse object does not exist in your workspace.");
  const mapped = filtered.map((row) => ({
    id: row.WMSHU_ID,
    facilityId: row.WMSHU_FacilityID,
    parentHandlingUnitId: row.WMSHU_ParentHU_ID,
    typeCode: row.WMSHU_TypeCode,
    typeName: typeMap.get(row.WMSHU_TypeCode) ?? row.WMSHU_TypeCode,
    code: row.WMSHU_Code,
    sscc: row.WMSHU_SSCC,
    externalReference: row.WMSHU_ExternalReference,
    customerOrgId: row.WMSHU_CustomerOrgID,
    customerName: orgMap.get(row.WMSHU_CustomerOrgID) ?? null,
    locationId: row.WMSHU_LocationID,
    locationCode: locationMap.get(row.WMSHU_LocationID) ?? null,
    inventoryStatusCode: row.WMSHU_InventoryStatusCode,
    inventoryStatusName: statusMap.get(row.WMSHU_InventoryStatusCode) ?? row.WMSHU_InventoryStatusCode,
    customsStatusCode: row.WMSHU_CustomsStatusCode,
    lifecycleStatusCode: row.WMSHU_LifecycleStatusCode,
    consumedIntoHandlingUnitId: row.WMSHU_ConsumedIntoHU_ID,
    grossWeightKg: row.WMSHU_GrossWeightKG,
    netWeightKg: row.WMSHU_NetWeightKG,
    volumeCbm: row.WMSHU_VolumeCBM,
    sealed: row.WMSHU_IsSealed,
    updatedAt: row.WMSHU_UpdatedAt,
    contents: balances.filter((balance) => balance.WMSBalance_HU_ID === row.WMSHU_ID).map((balance) => {
      const item = itemMap.get(balance.WMSBalance_ItemID), lot = lotMap.get(balance.WMSBalance_LotID);
      return { balanceId: balance.WMSBalance_ID, itemId: balance.WMSBalance_ItemID, sku: item?.WMSItem_SKU ?? "", description: item?.WMSItem_Description ?? "", quantity: balance.WMSBalance_OnHandQuantity, uomCode: balance.WMSBalance_UOMCode, statusCode: balance.WMSBalance_InventoryStatusCode, customsStatusCode: balance.WMSBalance_CustomsStatusCode, lotNumber: lot?.WMSLot_LotNumber ?? null, batchNumber: lot?.WMSLot_BatchNumber ?? null };
    }),
    events: events.filter((event) => event.WMSHUEvent_HU_ID === row.WMSHU_ID).slice(0, 25).map((event) => ({ id: event.WMSHUEvent_ID, typeCode: event.WMSHUEvent_EventTypeCode, at: event.WMSHUEvent_EventAt, locationId: event.WMSHUEvent_LocationID, notes: event.WMSHUEvent_Notes, metadata: event.WMSHUEvent_MetadataJSON })),
  }));
  return requestedId ? mapped[0] : mapped;
}
