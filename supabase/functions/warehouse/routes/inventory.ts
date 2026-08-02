
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
  const [facilities, items, locations, lots, orgs] = await Promise.all([
    many(admin.from("WMS_Facilities").select("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name").in("WMSFacility_ID", allowed)),
    many(admin.from("WMS_Items").select("WMSItem_ID,WMSItem_SKU,WMSItem_Description,WMSItem_CustomerOrgID").eq("WMSItem_IsDeleted", false)),
    many(admin.from("WMS_Locations").select("WMSLocation_ID,WMSLocation_Code")),
    many(admin.from("WMS_InventoryLots").select("*")),
    many(admin.from("Org_Master").select("Org_id,Org_Name"))
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
    ])), term = clean(url.searchParams.get("search"))?.toLowerCase(), itemId = clean(url.searchParams.get("itemId"));
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
