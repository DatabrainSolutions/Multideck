
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

export async function handleInventory(path, url, admin, actor) {
  requireCapability(actor, "warehouse_inventory:read");
  const facilityIds = await companyFacilityIds(admin, actor), requestedFacility = clean(url.searchParams.get("facilityId")), allowed = requestedFacility ? facilityIds.filter((value)=>value === requestedFacility) : facilityIds;
  if (!allowed.length) return [];
  const [facilities, items, locations, lots, orgs, handlingUnits] = await Promise.all([
    many(admin.from("WMS_Facilities").select("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name").in("WMSFacility_ID", allowed)),
    many(admin.from("WMS_Items").select("WMSItem_ID,WMSItem_SKU,WMSItem_Description,WMSItem_CustomerOrgID").eq("WMSItem_IsDeleted", false)),
    many(admin.from("WMS_Locations").select("WMSLocation_ID,WMSLocation_Code")),
    many(admin.from("WMS_InventoryLots").select("*")),
    many(admin.from("Org_Master").select("Org_id,Org_Name")),
    many(admin.from("WMS_HandlingUnits").select("WMSHU_ID,WMSHU_Code,WMSHU_TypeCode,WMSHU_LifecycleStatusCode"))
  ]);
  const fm = new Map(facilities.map((r)=>[
      r.WMSFacility_ID,
      r
    ])), im = new Map(items.map((r)=>[
      r.WMSItem_ID,
      r
    ])), lm = new Map(locations.map((r)=>[
      r.WMSLocation_ID,
      r.WMSLocation_Code
    ])), lotm = new Map(lots.map((r)=>[
      r.WMSLot_ID,
      r
    ])), om = new Map(orgs.map((r)=>[
      r.Org_id,
      r.Org_Name
    ])), hum = new Map(handlingUnits.map((r)=>[
      r.WMSHU_ID,
      r
    ])), term = clean(url.searchParams.get("search"))?.toLowerCase(), itemId = clean(url.searchParams.get("itemId"));
  if (path[1] === "exceptions") {
    if (!actor.companyId) throw new HttpError(403, "Warehouse exceptions are available only to the warehouse team.");
    let exceptions = await many(admin.from("WMS_Exceptions").select("*").in("WMSException_FacilityID", allowed).order("WMSException_RaisedAt", {
      ascending: false
    }).limit(500));
    if (url.searchParams.get("openOnly") !== "false") exceptions = exceptions.filter((row)=>row.WMSException_StatusCode !== "resolved");
    const requestedStatus = clean(url.searchParams.get("statusCode"));
    if (requestedStatus) exceptions = exceptions.filter((row)=>row.WMSException_StatusCode === requestedStatus);
    return exceptions.filter((row)=>!term || [
        row.WMSException_Title,
        row.WMSException_Description,
        row.WMSException_TypeCode,
        row.WMSException_SeverityCode,
        lm.get(row.WMSException_ExpectedLocationID),
        lm.get(row.WMSException_ActualLocationID)
      ].some((value)=>String(value ?? "").toLowerCase().includes(term))).map((row)=>({
        id: row.WMSException_ID,
        facilityId: row.WMSException_FacilityID,
        typeCode: row.WMSException_TypeCode,
        statusCode: row.WMSException_StatusCode,
        severityCode: row.WMSException_SeverityCode,
        balanceId: row.WMSException_BalanceID,
        title: row.WMSException_Title,
        description: row.WMSException_Description,
        expectedLocationId: row.WMSException_ExpectedLocationID,
        expectedLocationCode: lm.get(row.WMSException_ExpectedLocationID) ?? null,
        actualLocationId: row.WMSException_ActualLocationID,
        actualLocationCode: lm.get(row.WMSException_ActualLocationID) ?? null,
        movementGroupId: row.WMSException_MovementGroupID,
        raisedAt: row.WMSException_RaisedAt,
        resolvedAt: row.WMSException_ResolvedAt,
        metadata: row.WMSException_MetadataJSON
      }));
  }
  if (path[1] === "movements") {
    let rows = await many(admin.from("WMS_InventoryTransactions").select("*").in("WMSTransaction_FacilityID", allowed).order("WMSTransaction_CreatedAt", {
      ascending: false
    }).limit(Math.min(250, Math.max(1, Number(url.searchParams.get("take")) || 100))));
    if (!actor.companyId) {
      rows = rows.filter((r)=>actor.organisationIds.has(r.WMSTransaction_CustomerOrgID));
    }
    if (itemId) rows = rows.filter((r)=>r.WMSTransaction_ItemID === itemId);
    return rows.filter((r)=>{
      const item = im.get(r.WMSTransaction_ItemID), facility = fm.get(r.WMSTransaction_FacilityID), lot = lotm.get(r.WMSTransaction_LotID);
      return !term || [
        item?.WMSItem_SKU,
        item?.WMSItem_Description,
        facility?.WMSFacility_Name,
        r.WMSTransaction_Reference,
        r.WMSTransaction_Notes,
        lm.get(r.WMSTransaction_FromLocationID),
        lm.get(r.WMSTransaction_ToLocationID),
        lot?.WMSLot_LotNumber,
        lot?.WMSLot_BatchNumber
      ].some((v)=>String(v ?? "").toLowerCase().includes(term));
    }).map((r)=>{
      const item = im.get(r.WMSTransaction_ItemID), facility = fm.get(r.WMSTransaction_FacilityID), lot = lotm.get(r.WMSTransaction_LotID);
      return {
        id: r.WMSTransaction_ID,
        facilityId: r.WMSTransaction_FacilityID,
        facilityName: facility?.WMSFacility_Name ?? "",
        itemId: r.WMSTransaction_ItemID,
        sku: item?.WMSItem_SKU ?? "",
        itemDescription: item?.WMSItem_Description ?? "",
        typeCode: r.WMSTransaction_TypeCode,
        typeName: r.WMSTransaction_TypeCode,
        quantity: r.WMSTransaction_Quantity,
        uomCode: r.WMSTransaction_UOMCode,
        fromLocationCode: lm.get(r.WMSTransaction_FromLocationID) ?? null,
        toLocationCode: lm.get(r.WMSTransaction_ToLocationID) ?? null,
        lotNumber: lot?.WMSLot_LotNumber ?? null,
        batchNumber: lot?.WMSLot_BatchNumber ?? null,
        reference: r.WMSTransaction_Reference,
        notes: r.WMSTransaction_Notes,
        handlingUnitId: r.WMSTransaction_HU_ID,
        handlingUnitCode: hum.get(r.WMSTransaction_HU_ID)?.WMSHU_Code ?? null,
        movementGroupId: r.WMSTransaction_MovementGroupID ?? null,
        reasonCode: r.WMSTransaction_ReasonCode ?? null,
        metadata: r.WMSTransaction_MetadataJSON ?? {},
        createdAt: r.WMSTransaction_CreatedAt
      };
    });
  }
  let rows = await many(admin.from("WMS_InventoryBalances").select("*").in("WMSBalance_FacilityID", allowed));
  if (!actor.companyId) {
    rows = rows.filter((r)=>actor.organisationIds.has(r.WMSBalance_CustomerOrgID));
  }
  if (itemId) rows = rows.filter((r)=>r.WMSBalance_ItemID === itemId);
  if (url.searchParams.get("includeZero") !== "true") {
    rows = rows.filter((r)=>Number(r.WMSBalance_OnHandQuantity) !== 0);
  }
  return rows.filter((r)=>{
    const item = im.get(r.WMSBalance_ItemID), facility = fm.get(r.WMSBalance_FacilityID), lot = lotm.get(r.WMSBalance_LotID);
    return !term || [
      item?.WMSItem_SKU,
      item?.WMSItem_Description,
      om.get(r.WMSBalance_CustomerOrgID),
      facility?.WMSFacility_Name,
      r.WMSBalance_InventoryStatusCode,
      r.WMSBalance_CustomsStatusCode,
      lm.get(r.WMSBalance_LocationID),
      lot?.WMSLot_LotNumber,
      lot?.WMSLot_BatchNumber
    ].some((v)=>String(v ?? "").toLowerCase().includes(term));
  }).map((r)=>{
    const item = im.get(r.WMSBalance_ItemID), facility = fm.get(r.WMSBalance_FacilityID), lot = lotm.get(r.WMSBalance_LotID);
    return {
      id: r.WMSBalance_ID,
      facilityId: r.WMSBalance_FacilityID,
      facilityCode: facility?.WMSFacility_Code ?? "",
      facilityName: facility?.WMSFacility_Name ?? "",
      customerOrgId: r.WMSBalance_CustomerOrgID,
      customerName: om.get(r.WMSBalance_CustomerOrgID) ?? null,
      itemId: r.WMSBalance_ItemID,
      sku: item?.WMSItem_SKU ?? "",
      itemDescription: item?.WMSItem_Description ?? "",
      locationId: r.WMSBalance_LocationID,
      locationCode: lm.get(r.WMSBalance_LocationID) ?? null,
      handlingUnitId: r.WMSBalance_HU_ID,
      handlingUnitCode: hum.get(r.WMSBalance_HU_ID)?.WMSHU_Code ?? null,
      handlingUnitTypeCode: hum.get(r.WMSBalance_HU_ID)?.WMSHU_TypeCode ?? null,
      lotId: r.WMSBalance_LotID,
      lotNumber: lot?.WMSLot_LotNumber ?? null,
      batchNumber: lot?.WMSLot_BatchNumber ?? null,
      manufactureDate: lot?.WMSLot_ManufactureDate ?? null,
      expiryDate: lot?.WMSLot_ExpiryDate ?? null,
      inventoryStatusCode: r.WMSBalance_InventoryStatusCode,
      inventoryStatusName: r.WMSBalance_InventoryStatusCode,
      customsStatusCode: r.WMSBalance_CustomsStatusCode,
      uomCode: r.WMSBalance_UOMCode,
      onHandQuantity: r.WMSBalance_OnHandQuantity,
      reservedQuantity: r.WMSBalance_ReservedQuantity,
      allocatedQuantity: r.WMSBalance_AllocatedQuantity,
      heldQuantity: r.WMSBalance_HeldQuantity,
      availableQuantity: r.WMSBalance_AvailableQuantity,
      isBonded: r.WMSBalance_IsBonded,
      firstReceiptAt: r.WMSBalance_FirstReceiptAt,
      lastMovementAt: r.WMSBalance_LastMovementAt,
      updatedAt: r.WMSBalance_UpdatedAt
    };
  });
}
