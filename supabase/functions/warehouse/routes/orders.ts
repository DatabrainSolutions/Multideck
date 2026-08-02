
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

async function orderContext(admin, actor) {
  requireCapability(actor, "warehouse_orders:read");
  const facilityIds = await companyFacilityIds(admin, actor);
  const [facilities, orgs, items, locations, types, statuses, customs] = await Promise.all([
    facilityIds.length ? many(admin.from("WMS_Facilities").select("*").in("WMSFacility_ID", facilityIds).eq("WMSFacility_IsDeleted", false)) : Promise.resolve([]),
    many(admin.from("Org_Master").select("Org_ID,Org_Name")),
    many(admin.from("WMS_Items").select("*").eq("WMSItem_IsDeleted", false).eq("WMSItem_IsActive", true)),
    many(admin.from("WMS_Locations").select("WMSLocation_ID,WMSLocation_FacilityID,WMSLocation_Code,WMSLocation_ZoneID").eq("WMSLocation_IsDeleted", false).eq("WMSLocation_IsActive", true)),
    many(admin.from("sys_WMSOrderTypes").select("*")),
    many(admin.from("sys_WMSOrderStatuses").select("*")),
    many(admin.from("sys_WMSCustomsStatuses").select("*"))
  ]);
  const allowedOrgs = actor.companyId ? new Set(orgs.map((r)=>r.Org_ID)) : actor.organisationIds;
  return {
    facilityIds,
    facilities,
    orgs: orgs.filter((r)=>allowedOrgs.has(r.Org_ID)),
    items: items.filter((r)=>facilityIds.includes(r.WMSItem_DefaultFacilityID) && allowedOrgs.has(r.WMSItem_CustomerOrgID)),
    locations: actor.companyId ? locations.filter((r)=>facilityIds.includes(r.WMSLocation_FacilityID)) : [],
    types,
    statuses,
    customs
  };
}
async function loadOrders(admin, actor, context) {
  if (!context.facilityIds.length) return [];
  let orders = await many(admin.from("WMS_Orders").select("*").in("WMSOrder_FacilityID", context.facilityIds).eq("WMSOrder_IsDeleted", false).order("WMSOrder_CreatedAt", {
    ascending: false
  }).limit(500));
  if (!actor.companyId) {
    orders = orders.filter((r)=>actor.organisationIds.has(r.WMSOrder_CustomerOrgID));
  }
  return orders;
}
async function mapOrders(admin, rows, context) {
  if (!rows.length) return [];
  const ids = rows.map((r)=>r.WMSOrder_ID), [lines, receipts, dispatches] = await Promise.all([
    many(admin.from("WMS_OrderLines").select("*").in("WMSOrderLine_OrderID", ids)),
    many(admin.from("WMS_Receipts").select("*").in("WMSReceipt_OrderID", ids)),
    many(admin.from("WMS_Dispatches").select("*").in("WMSDispatch_OrderID", ids))
  ]);
  const fm = new Map(context.facilities.map((r)=>[
      r.WMSFacility_ID,
      r
    ])), om = new Map(context.orgs.map((r)=>[
      r.Org_ID,
      r.Org_Name
    ])), im = new Map(context.items.map((r)=>[
      r.WMSItem_ID,
      r
    ])), lm = new Map(context.locations.map((r)=>[
      r.WMSLocation_ID,
      r.WMSLocation_Code
    ])), tm = new Map(context.types.map((r)=>[
      r.WMSOrderType_Code,
      r.WMSOrderType_Name
    ])), sm = new Map(context.statuses.map((r)=>[
      r.WMSOrderStatus_Code,
      r.WMSOrderStatus_Name
    ]));
  return rows.map((r)=>{
    const facility = fm.get(r.WMSOrder_FacilityID), orderLines = lines.filter((l)=>l.WMSOrderLine_OrderID === r.WMSOrder_ID).sort((a, b)=>a.WMSOrderLine_LineNo - b.WMSOrderLine_LineNo);
    return {
      id: r.WMSOrder_ID,
      facilityId: r.WMSOrder_FacilityID,
      facilityCode: facility?.WMSFacility_Code ?? "",
      facilityName: facility?.WMSFacility_Name ?? "",
      officeId: r.WMSOrder_OrgOfficeID,
      officeName: null,
      customerOrgId: r.WMSOrder_CustomerOrgID,
      customerName: om.get(r.WMSOrder_CustomerOrgID) ?? "",
      orderNumber: r.WMSOrder_OrderNumber,
      typeCode: r.WMSOrder_TypeCode,
      typeName: tm.get(r.WMSOrder_TypeCode) ?? null,
      statusCode: r.WMSOrder_StatusCode,
      statusName: sm.get(r.WMSOrder_StatusCode) ?? null,
      priorityCode: r.WMSOrder_PriorityCode,
      customerReference: r.WMSOrder_CustomerReference,
      requestedDate: r.WMSOrder_RequestedDate,
      appointmentStartAt: r.WMSOrder_AppointmentStartAt,
      appointmentEndAt: r.WMSOrder_AppointmentEndAt,
      vehicleReg: r.WMSOrder_VehicleReg,
      containerNumber: r.WMSOrder_ContainerNumber,
      sealNumber: r.WMSOrder_SealNumber,
      instructions: r.WMSOrder_Instructions,
      createdAt: r.WMSOrder_CreatedAt,
      updatedAt: r.WMSOrder_UpdatedAt,
      lines: orderLines.map((l)=>{
        const item = im.get(l.WMSOrderLine_ItemID), progressed = r.WMSOrder_TypeCode === "inbound" ? Number(l.WMSOrderLine_ReceivedQuantity) : Number(l.WMSOrderLine_DispatchedQuantity);
        return {
          id: l.WMSOrderLine_ID,
          lineNumber: l.WMSOrderLine_LineNo,
          itemId: l.WMSOrderLine_ItemID,
          sku: item?.WMSItem_SKU ?? "",
          description: item?.WMSItem_Description ?? "",
          statusCode: l.WMSOrderLine_StatusCode,
          orderedQuantity: l.WMSOrderLine_OrderedQuantity,
          receivedQuantity: l.WMSOrderLine_ReceivedQuantity,
          pickedQuantity: l.WMSOrderLine_PickedQuantity,
          packedQuantity: l.WMSOrderLine_PackedQuantity,
          dispatchedQuantity: l.WMSOrderLine_DispatchedQuantity,
          remainingQuantity: Math.max(0, Number(l.WMSOrderLine_OrderedQuantity) - progressed),
          uomCode: l.WMSOrderLine_UOMCode,
          lotNumber: l.WMSOrderLine_LotNumber,
          expiryDate: l.WMSOrderLine_ExpiryDate,
          sourceLocationId: l.WMSOrderLine_SourceLocationID,
          sourceLocationCode: lm.get(l.WMSOrderLine_SourceLocationID) ?? null,
          targetLocationId: l.WMSOrderLine_TargetLocationID,
          targetLocationCode: lm.get(l.WMSOrderLine_TargetLocationID) ?? null,
          inventoryStatusCode: l.WMSOrderLine_InventoryStatusCode,
          customsStatusCode: l.WMSOrderLine_CustomsStatusCode,
          goodsValue: l.WMSOrderLine_GoodsValue,
          currencyCode: l.WMSOrderLine_CurrencyCode,
          instructions: l.WMSOrderLine_Instructions
        };
      }),
      receipts: receipts.filter((x)=>x.WMSReceipt_OrderID === r.WMSOrder_ID).map((x)=>({
          id: x.WMSReceipt_ID,
          receiptNumber: x.WMSReceipt_ReceiptNumber,
          statusCode: x.WMSReceipt_StatusCode,
          receivedAt: x.WMSReceipt_ReceivedAt,
          hasDiscrepancy: x.WMSReceipt_HasDiscrepancy,
          notes: x.WMSReceipt_Notes
        })),
      dispatches: dispatches.filter((x)=>x.WMSDispatch_OrderID === r.WMSOrder_ID).map((x)=>({
          id: x.WMSDispatch_ID,
          dispatchNumber: x.WMSDispatch_DispatchNumber,
          statusCode: x.WMSDispatch_StatusCode,
          dispatchedAt: x.WMSDispatch_DispatchedAt,
          vehicleReg: x.WMSDispatch_VehicleReg,
          containerNumber: x.WMSDispatch_ContainerNumber,
          sealNumber: x.WMSDispatch_SealNumber
        }))
    };
  });
}
export async function handleOrders(request, path, url, admin, actor) {
  const context = await orderContext(admin, actor);
  if (request.method === "GET" && path[1] === "reference") {
    return {
      facilities: context.facilities.map((r)=>({
          id: r.WMSFacility_ID,
          officeId: r.WMSFacility_OrgOfficeID,
          code: r.WMSFacility_Code,
          name: r.WMSFacility_Name
        })),
      customers: context.orgs.map((r)=>({
          id: r.Org_ID,
          name: r.Org_Name
        })),
      items: context.items.map((r)=>({
          id: r.WMSItem_ID,
          customerOrgId: r.WMSItem_CustomerOrgID,
          facilityId: r.WMSItem_DefaultFacilityID,
          sku: r.WMSItem_SKU,
          description: r.WMSItem_Description,
          uomCode: r.WMSItem_BaseUOMCode,
          requiresLot: r.WMSItem_RequiresLot,
          requiresExpiry: r.WMSItem_RequiresExpiry
        })),
      locations: context.locations.map((r)=>({
          id: r.WMSLocation_ID,
          facilityId: r.WMSLocation_FacilityID,
          code: r.WMSLocation_Code,
          zoneName: null
        })),
      types: context.types.filter((r)=>r.WMSOrderType_IsActive && [
          "inbound",
          "outbound"
        ].includes(r.WMSOrderType_Code)).map((r)=>({
          code: r.WMSOrderType_Code,
          name: r.WMSOrderType_Name,
          directionCode: r.WMSOrderType_DirectionCode
        })),
      statuses: context.statuses.filter((r)=>r.WMSOrderStatus_IsActive).map((r)=>({
          code: r.WMSOrderStatus_Code,
          name: r.WMSOrderStatus_Name,
          isOpen: r.WMSOrderStatus_IsOpen,
          isFinal: r.WMSOrderStatus_IsFinal
        })),
      customsStatuses: context.customs.filter((r)=>r.WMSCustomsStatus_IsActive).map((r)=>({
          code: r.WMSCustomsStatus_Code,
          name: r.WMSCustomsStatus_Name,
          isDutySuspended: r.WMSCustomsStatus_IsDutySuspended
        }))
    };
  }
  let rows = await loadOrders(admin, actor, context);
  const orderId = path[1] && path[1] !== "reference" ? uuid(path[1], "order") : null;
  if (request.method === "GET" && orderId) {
    const found = rows.filter((r)=>r.WMSOrder_ID === orderId);
    if (!found.length) {
      throw new HttpError(404, "This warehouse order does not exist in your workspace.");
    }
    return (await mapOrders(admin, found, context))[0];
  }
  if (request.method === "GET") {
    const facility = clean(url.searchParams.get("facilityId")), type = clean(url.searchParams.get("typeCode")), status = clean(url.searchParams.get("statusCode")), term = clean(url.searchParams.get("search"))?.toLowerCase(), final = new Set(context.statuses.filter((r)=>r.WMSOrderStatus_IsFinal).map((r)=>r.WMSOrderStatus_Code));
    rows = rows.filter((r)=>(!facility || r.WMSOrder_FacilityID === facility) && (!type || r.WMSOrder_TypeCode === type) && (!status || r.WMSOrder_StatusCode === status) && (url.searchParams.get("openOnly") !== "true" || !final.has(r.WMSOrder_StatusCode)) && (!term || [
        r.WMSOrder_OrderNumber,
        r.WMSOrder_CustomerReference,
        r.WMSOrder_ContainerNumber,
        r.WMSOrder_VehicleReg
      ].some((v)=>String(v ?? "").toLowerCase().includes(term))));
    return await mapOrders(admin, rows, context);
  }
  const input = request.method === "POST" && request.headers.get("content-type")?.includes("application/json") ? bodyObject(await request.json()) : {};
  const action = !orderId ? "create" : path[2] === "receive" ? "receive" : path[2] === "dispatch" ? "dispatch" : path[2] === "cancel" ? "cancel" : null;
  if (!action) throw new HttpError(404, "Warehouse endpoint not found.");
  if (!actor.companyId) {
    if (action === "create") {
      const org = uuid(input.customerOrgId, "customer"), facility = uuid(input.facilityId, "facility"), type = clean(input.typeCode);
      requireCapability(actor, `warehouse_orders:${type === "inbound" ? "create_inbound" : "create_outbound"}`);
      requireCustomerScope(actor, org, facility);
    } else if (action === "cancel") {
      requireCapability(actor, "warehouse_orders:cancel");
    } else {
      throw new HttpError(403, "This operation is reserved for the warehouse team.");
    }
  }
  const { data, error } = await admin.rpc("warehouse_edge_order_mutation", {
    p_action: action,
    p_order_id: orderId,
    p_payload: input,
    p_actor_user_id: actor.userId,
    p_actor_portal_user_id: actor.portalUserId,
    p_allowed_facility_ids: context.facilityIds,
    p_allowed_organisation_ids: actor.companyId ? context.orgs.map((r)=>r.Org_ID) : [
      ...actor.organisationIds
    ]
  });
  if (error) {
    throw new HttpError(error.message.includes("WMS400:") ? 400 : error.message.includes("WMS409:") ? 409 : 500, error.message.replace(/^.*WMS(?:400|409):\s*/, ""));
  }
  const refreshed = await loadOrders(admin, actor, context), found = refreshed.filter((r)=>r.WMSOrder_ID === data);
  return (await mapOrders(admin, found, context))[0];
}
