
// @ts-nocheck
import {
  BUCKET,
  HttpError,
  allowedExtensions,
  bodyObject,
  bool,
  boundedPage,
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
  requireInternalWarehouseRead,
  requireInternalWarehouseWrite,
  required,
  uuid,
} from "../shared/mod.ts";

async function mapOrders(admin, rows, context) {
  if (!rows.length) return [];
  const ids = rows.map((r)=>r.WMSOrder_ID), [lines, receipts, dispatches, tasks] = await Promise.all([
    many(admin.from("WMS_OrderLines").select("*").in("WMSOrderLine_OrderID", ids)),
    many(admin.from("WMS_Receipts").select("*").in("WMSReceipt_OrderID", ids)),
    many(admin.from("WMS_Dispatches").select("*").in("WMSDispatch_OrderID", ids)),
    many(admin.from("WMS_Tasks").select("*").in("WMSTask_OrderID", ids).in("WMSTask_TypeCode", ["putaway", "pick"]).order("WMSTask_CreatedAt"))
  ]);
  const itemIds = [...new Set(lines.map((line)=>line.WMSOrderLine_ItemID).filter(Boolean))];
  const locationIds = [...new Set(lines.flatMap((line)=>[line.WMSOrderLine_SourceLocationID, line.WMSOrderLine_TargetLocationID]).filter(Boolean))];
  const contextItems = context.items ?? [], contextLocations = context.locations ?? [];
  const contextItemIds = new Set(contextItems.map((row)=>row.WMSItem_ID));
  const contextLocationIds = new Set(contextLocations.map((row)=>row.WMSLocation_ID));
  const missingItemIds = itemIds.filter((itemId)=>!contextItemIds.has(itemId));
  const missingLocationIds = locationIds.filter((locationId)=>!contextLocationIds.has(locationId));
  const [missingItems, missingLocations] = await Promise.all([
    missingItemIds.length ? many(admin.from("WMS_Items")
      .select("WMSItem_ID,WMSItem_SKU,WMSItem_Description")
      .in("WMSItem_ID", missingItemIds)
      .eq("WMSItem_IsDeleted", false)) : Promise.resolve([]),
    missingLocationIds.length ? many(admin.from("WMS_Locations")
      .select("WMSLocation_ID,WMSLocation_Code")
      .in("WMSLocation_ID", missingLocationIds)
      .eq("WMSLocation_IsDeleted", false)) : Promise.resolve([])
  ]);
  const scopedItems = [...contextItems, ...missingItems], scopedLocations = [...contextLocations, ...missingLocations];
  const fm = new Map(context.facilities.map((r)=>[
      r.WMSFacility_ID,
      r
    ])), om = new Map(context.orgs.map((r)=>[
      r.Org_id,
      r.Org_Name
    ])), im = new Map(scopedItems.map((r)=>[
      r.WMSItem_ID,
      r
    ])), lm = new Map(scopedLocations.map((r)=>[
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
      sourceTypeCode: r.WMSOrder_SourceTypeCode ?? "manual_exception",
      sourceReference: r.WMSOrder_SourceReference ?? r.WMSOrder_CustomerReference ?? r.WMSOrder_OrderNumber,
      sourceRecordId: r.WMSOrder_SourceRecordID ?? null,
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
          remainingQuantity: l.WMSOrderLine_StatusCode === "short" ? 0 : Math.max(0, Number(l.WMSOrderLine_OrderedQuantity) - progressed),
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
        })),
      tasks: tasks.filter((x)=>x.WMSTask_OrderID === r.WMSOrder_ID).map((x)=>({
          id: x.WMSTask_ID,
          type: x.WMSTask_TypeCode,
          statusCode: x.WMSTask_StatusCode,
          orderLineId: x.WMSTask_OrderLineID,
          itemId: x.WMSTask_ItemID,
          quantity: x.WMSTask_Quantity,
          completedQuantity: x.WMSTask_CompletedQuantity ?? 0,
          uomCode: x.WMSTask_UOMCode,
          sourceBalanceId: x.WMSTask_BalanceID,
          sourceLocationId: x.WMSTask_SourceLocationID,
          targetLocationId: x.WMSTask_TargetLocationID,
          createdAt: x.WMSTask_CreatedAt,
          completedAt: x.WMSTask_CompletedAt
        }))
    };
  });
}
async function exactOrderContext(admin, row) {
  const [facilities, orgs, types, statuses] = await Promise.all([
    many(admin.from("WMS_Facilities")
      .select("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name")
      .eq("WMSFacility_ID", row.WMSOrder_FacilityID)
      .eq("WMSFacility_IsDeleted", false)
      .limit(1)),
    many(admin.from("Org_Master")
      .select("Org_id,Org_Name")
      .eq("Org_id", row.WMSOrder_CustomerOrgID)
      .limit(1)),
    many(admin.from("sys_WMSOrderTypes")
      .select("WMSOrderType_Code,WMSOrderType_Name")
      .eq("WMSOrderType_Code", row.WMSOrder_TypeCode)
      .limit(1)),
    many(admin.from("sys_WMSOrderStatuses")
      .select("WMSOrderStatus_Code,WMSOrderStatus_Name")
      .eq("WMSOrderStatus_Code", row.WMSOrder_StatusCode)
      .limit(1))
  ]);
  return { facilities, orgs, items: [], locations: [], types, statuses };
}

async function mapExactOrder(admin, row) {
  return (await mapOrders(admin, [row], await exactOrderContext(admin, row)))[0];
}

async function loadExactOrderById(admin, actor, facilityIds, orderId) {
  if (!facilityIds.length || (!actor.companyId && actor.organisationIds.size === 0)) return null;
  let query = admin.from("WMS_Orders")
    .select("*")
    .eq("WMSOrder_ID", orderId)
    .in("WMSOrder_FacilityID", facilityIds)
    .eq("WMSOrder_IsDeleted", false)
    .limit(1);
  if (!actor.companyId) query = query.in("WMSOrder_CustomerOrgID", [...actor.organisationIds]);
  const rows = await many(query);
  return rows[0] ?? null;
}

export async function handleOrders(request, path, url, admin, actor) {
  requireCapability(actor, "warehouse_orders:read");
  if (request.method === "GET" && path[1] === "reference" && path[2] === "customers") {
    const { limit, offset } = boundedPage(url, 25, 50);
    if (!actor.companyId && actor.organisationIds.size === 0) return { rows: [], limit, offset, hasMore: false };
    let query = admin.from("Org_Master")
      .select("Org_id,Org_Name");
    if (!actor.companyId) query = query.in("Org_id", [...actor.organisationIds]);
    const term = clean(url.searchParams.get("search"), 160);
    if (term) query = query.ilike("Org_Name", `%${term.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, error } = await query
      .order("Org_Name")
      .order("Org_id")
      .range(offset, offset + limit);
    if (error) throw new HttpError(500, error.message);
    const candidates = data ?? [];
    return {
      rows: candidates.slice(0, limit).map((row)=>({ id: row.Org_id, name: row.Org_Name })),
      limit,
      offset,
      hasMore: candidates.length > limit
    };
  }
  if (request.method === "GET" && path[1] === "reference" && path[2] === "items") {
    const { limit, offset } = boundedPage(url, 25, 50);
    const facilityIds = await companyFacilityIds(admin, actor);
    const requestedFacilityId = clean(url.searchParams.get("facilityId"));
    const requestedCustomerOrgId = clean(url.searchParams.get("customerOrgId"));
    if (!requestedFacilityId || !requestedCustomerOrgId || !facilityIds.includes(requestedFacilityId)) {
      return { rows: [], limit, offset, hasMore: false };
    }
    const { data, error } = await admin.rpc("warehouse_edge_item_selector_page", {
      p_allowed_facility_ids: facilityIds,
      p_allowed_org_ids: actor.companyId ? null : [...actor.organisationIds],
      p_facility_id: requestedFacilityId,
      p_customer_org_id: requestedCustomerOrgId,
      p_search: clean(url.searchParams.get("search"), 160),
      p_limit: limit,
      p_offset: offset
    });
    if (!error) return data ?? { rows: [], limit, offset, hasMore: false };
    if (["42883", "PGRST202"].includes(error.code ?? "")) {
      throw new HttpError(503, "Warehouse item search is still being prepared. Try again shortly.");
    }
    throw new HttpError(500, error.message);
  }
  if (request.method === "GET" && path[1] === "reference" && path[2] === "locations") {
    requireInternalWarehouseRead(actor);
    const { limit, offset } = boundedPage(url, 25, 50);
    const facilityIds = await companyFacilityIds(admin, actor);
    const requestedFacilityId = clean(url.searchParams.get("facilityId"));
    if (!requestedFacilityId || !facilityIds.includes(requestedFacilityId)) {
      return { rows: [], limit, offset, hasMore: false };
    }
    const { data, error } = await admin.rpc("warehouse_edge_location_selector_page", {
      p_allowed_facility_ids: facilityIds,
      p_facility_id: requestedFacilityId,
      p_search: clean(url.searchParams.get("search"), 160),
      p_limit: limit,
      p_offset: offset
    });
    if (!error) return data ?? { rows: [], limit, offset, hasMore: false };
    if (["42883", "PGRST202"].includes(error.code ?? "")) {
      throw new HttpError(503, "Warehouse location search is still being prepared. Try again shortly.");
    }
    throw new HttpError(500, error.message);
  }
  if (request.method === "GET" && path[1] === "reference" && url.searchParams.get("scope") === "setup") {
    const facilityIds = await companyFacilityIds(admin, actor);
    const [facilities, types, statuses, customs] = await Promise.all([
      facilityIds.length ? many(admin.from("WMS_Facilities")
        .select("WMSFacility_ID,WMSFacility_OrgOfficeID,WMSFacility_Code,WMSFacility_Name")
        .in("WMSFacility_ID", facilityIds)
        .eq("WMSFacility_IsDeleted", false)
        .order("WMSFacility_Name")) : Promise.resolve([]),
      many(admin.from("sys_WMSOrderTypes").select("*").eq("WMSOrderType_IsActive", true)),
      many(admin.from("sys_WMSOrderStatuses").select("*").eq("WMSOrderStatus_IsActive", true)),
      many(admin.from("sys_WMSCustomsStatuses").select("*").eq("WMSCustomsStatus_IsActive", true))
    ]);
    return {
      facilities: facilities.map((row)=>({
        id: row.WMSFacility_ID,
        officeId: row.WMSFacility_OrgOfficeID,
        code: row.WMSFacility_Code,
        name: row.WMSFacility_Name
      })),
      customers: [],
      customersDeferred: true,
      items: [],
      itemsDeferred: true,
      locations: [],
      locationsDeferred: true,
      types: types.filter((row)=>["inbound", "outbound"].includes(row.WMSOrderType_Code)).map((row)=>({
        code: row.WMSOrderType_Code,
        name: row.WMSOrderType_Name,
        directionCode: row.WMSOrderType_DirectionCode
      })),
      statuses: statuses.map((row)=>({
        code: row.WMSOrderStatus_Code,
        name: row.WMSOrderStatus_Name,
        isOpen: row.WMSOrderStatus_IsOpen,
        isFinal: row.WMSOrderStatus_IsFinal
      })),
      customsStatuses: customs.map((row)=>({
        code: row.WMSCustomsStatus_Code,
        name: row.WMSCustomsStatus_Name,
        isDutySuspended: row.WMSCustomsStatus_IsDutySuspended
      }))
    };
  }
  if (request.method === "POST" && path[1] === "availability-check") {
    requireCapability(actor, "warehouse_orders:create_outbound");
    const input = bodyObject(await request.json());
    const facilityId = uuid(input.facilityId, "facility");
    const customerOrgId = uuid(input.customerOrgId, "customer");
    requireCustomerScope(actor, customerOrgId, facilityId);
    const facilityIds = await companyFacilityIds(admin, actor);
    if (!facilityIds.includes(facilityId)) throw new HttpError(403, "Choose a warehouse you can access.");
    if (!Array.isArray(input.queries) || input.queries.length > 100) {
      throw new HttpError(400, "Check no more than 100 stock choices at a time.");
    }
    const queries = input.queries.map((entry, index)=>{
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) throw new HttpError(400, "Check the stock choices and try again.");
      const key = clean(entry.key, 120);
      if (!key) throw new HttpError(400, `Stock choice ${index + 1} needs a key.`);
      return {
        key,
        itemId: uuid(entry.itemId, "item"),
        locationId: entry.locationId ? uuid(entry.locationId, "location") : null,
        lotNumber: clean(entry.lotNumber, 120),
        customsStatusCode: clean(entry.customsStatusCode, 60) ?? "free_circulation",
        uomCode: clean(entry.uomCode, 20) ?? "EA"
      };
    });
    if (!queries.length) return [];
    const { data, error } = await admin.rpc("warehouse_edge_draft_order_availability", {
      p_allowed_facility_ids: facilityIds,
      p_allowed_org_ids: actor.companyId ? null : [...actor.organisationIds],
      p_facility_id: facilityId,
      p_customer_org_id: customerOrgId,
      p_queries: queries
    });
    if (!error) return data ?? [];
    if (["42883", "PGRST202"].includes(error.code ?? "")) {
      throw new HttpError(503, "Warehouse availability checks are still being prepared. Try again shortly.");
    }
    throw new HttpError(500, error.message);
  }
  const availabilityOrderId = request.method === "GET" && path[2] === "availability"
    ? uuid(path[1], "order")
    : null;
  if (availabilityOrderId) {
    requireInternalWarehouseRead(actor);
    const facilityIds = await companyFacilityIds(admin, actor);
    if (!facilityIds.length) return [];
    const { data, error } = await admin.rpc("warehouse_edge_order_availability", {
      p_allowed_facility_ids: facilityIds,
      p_order_id: availabilityOrderId,
      p_limit_per_item: 25,
      p_total_limit: 500
    });
    if (!error) return data ?? [];
    if (["42883", "PGRST202"].includes(error.code ?? "")) {
      throw new HttpError(503, "Warehouse stock choices are still being prepared. Try again shortly.");
    }
    throw new HttpError(500, error.message);
  }
  const directOrderNumber = request.method === "GET" && path[1] === "detail"
    ? clean(url.searchParams.get("number"), 120)
    : null;
  if (directOrderNumber) {
    const facilityIds = await companyFacilityIds(admin, actor);
    if (!facilityIds.length || (!actor.companyId && actor.organisationIds.size === 0)) {
      throw new HttpError(404, "This warehouse order does not exist in your workspace.");
    }
    const literalOrderNumber = directOrderNumber.replace(/[\\%_]/g, "\\$&");
    let query = admin.from("WMS_Orders")
      .select("*")
      .in("WMSOrder_FacilityID", facilityIds)
      .eq("WMSOrder_IsDeleted", false)
      .ilike("WMSOrder_OrderNumber", literalOrderNumber)
      .limit(1);
    if (!actor.companyId) query = query.in("WMSOrder_CustomerOrgID", [...actor.organisationIds]);
    const rows = await many(query);
    if (!rows.length) throw new HttpError(404, "This warehouse order does not exist in your workspace.");
    return await mapExactOrder(admin, rows[0]);
  }
  const boundedList = request.method === "GET" && !path[1] && url.searchParams.has("limit");
  if (boundedList) {
    const facilityIds = await companyFacilityIds(admin, actor);
    const { limit, offset } = boundedPage(url);
    if (!facilityIds.length) return { rows: [], total: 0, limit, offset, facets: [] };
    const requestedFacilityId = clean(url.searchParams.get("facilityId"));
    if (requestedFacilityId && !facilityIds.includes(requestedFacilityId)) return { rows: [], total: 0, limit, offset, facets: [] };
    const { data, error } = await admin.rpc("warehouse_edge_orders_page", {
      p_allowed_facility_ids: facilityIds,
      p_allowed_org_ids: actor.companyId ? null : Array.from(actor.organisationIds),
      p_facility_id: requestedFacilityId,
      p_type_code: clean(url.searchParams.get("typeCode"), 60),
      p_status: clean(url.searchParams.get("status"), 80),
      p_open_only: url.searchParams.get("openOnly") === "true",
      p_search: clean(url.searchParams.get("search"), 160),
      p_sort: clean(url.searchParams.get("sort"), 60),
      p_direction: url.searchParams.get("direction") === "asc" ? "asc" : "desc",
      p_limit: limit,
      p_offset: offset
    });
    if (!error) return data ?? { rows: [], total: 0, limit, offset, facets: [] };
    if (["42883", "PGRST202"].includes(error.code ?? "")) {
      throw new HttpError(503, "Warehouse order paging is still being prepared. Try again shortly.");
    }
    throw new HttpError(500, error.message);
  }
  if (request.method === "GET" && !path[1]) {
    throw new HttpError(400, "Warehouse order lists require bounded paging.");
  }
  if (request.method === "GET" && path[1] === "reference") {
    throw new HttpError(400, "Warehouse order reference data requires the bounded setup and search endpoints.");
  }
  const orderId = path[1] && path[1] !== "reference" ? uuid(path[1], "order") : null;
  if (request.method === "GET" && orderId) {
    const facilityIds = await companyFacilityIds(admin, actor);
    const found = await loadExactOrderById(admin, actor, facilityIds, orderId);
    if (!found) throw new HttpError(404, "This warehouse order does not exist in your workspace.");
    return await mapExactOrder(admin, found);
  }
  if (request.method === "GET") {
    throw new HttpError(404, "Warehouse endpoint not found.");
  }
  const input = ["POST", "PUT"].includes(request.method) && request.headers.get("content-type")?.includes("application/json") ? bodyObject(await request.json()) : {};
  const action = request.method === "PUT" && orderId && path.length === 2 ? "update" : !orderId ? "create" : path[2] === "receive" ? "receive" : path[2] === "release" ? "release" : path[2] === "dispatch" ? "dispatch" : path[2] === "cancel" ? "cancel" : path[2] === "reschedule" ? "reschedule" : null;
  if (!action) throw new HttpError(404, "Warehouse endpoint not found.");
  const facilityIds = await companyFacilityIds(admin, actor);
  if (!facilityIds.length) throw new HttpError(403, "Choose a warehouse you can access.");
  const existingOrder = orderId ? await loadExactOrderById(admin, actor, facilityIds, orderId) : null;
  if (orderId && !existingOrder) throw new HttpError(404, "This warehouse order does not exist in your workspace.");
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
  } else {
    requireInternalWarehouseWrite(actor);
  }
  const targetCustomerOrgId = action === "create"
    ? uuid(input.customerOrgId, "customer")
    : existingOrder.WMSOrder_CustomerOrgID;
  const allowedOrganisationIds = [targetCustomerOrgId];
  const { data, error } = action === "receive" ? await admin.rpc("warehouse_edge_receive_mutation", {
    p_order_id: orderId,
    p_payload: input,
    p_actor_user_id: actor.userId,
    p_allowed_facility_ids: facilityIds,
    p_allowed_organisation_ids: allowedOrganisationIds
  }) : action === "release" ? await admin.rpc("warehouse_edge_release_order_mutation", {
    p_order_id: orderId,
    p_payload: input,
    p_actor_user_id: actor.userId,
    p_allowed_facility_ids: facilityIds,
    p_allowed_organisation_ids: allowedOrganisationIds
  }) : action === "dispatch" ? await admin.rpc("warehouse_edge_dispatch_mutation", {
    p_order_id: orderId,
    p_payload: input,
    p_actor_user_id: actor.userId,
    p_allowed_facility_ids: facilityIds,
    p_allowed_organisation_ids: allowedOrganisationIds
  }) : action === "create" ? await admin.rpc("warehouse_edge_create_order_mutation", {
    p_payload: input,
    p_actor_user_id: actor.userId,
    p_actor_portal_user_id: actor.portalUserId,
    p_allowed_facility_ids: facilityIds,
    p_allowed_organisation_ids: allowedOrganisationIds
  }) : action === "cancel" ? await admin.rpc("warehouse_edge_cancel_order_mutation", {
    p_order_id: orderId,
    p_actor_user_id: actor.userId,
    p_allowed_facility_ids: facilityIds,
    p_allowed_organisation_ids: allowedOrganisationIds
  }) : action === "update" ? await admin.rpc("warehouse_edge_update_order_mutation", {
    p_order_id: orderId,
    p_payload: input,
    p_actor_user_id: actor.userId,
    p_allowed_facility_ids: facilityIds,
    p_allowed_organisation_ids: allowedOrganisationIds
  }) : await admin.rpc("warehouse_edge_order_mutation", {
    p_action: action,
    p_order_id: orderId,
    p_payload: input,
    p_actor_user_id: actor.userId,
    p_actor_portal_user_id: actor.portalUserId,
    p_allowed_facility_ids: facilityIds,
    p_allowed_organisation_ids: allowedOrganisationIds
  });
  if (error) {
    const status = error.message.includes("WMS400:") ? 400 : error.message.includes("WMS403:") ? 403 : error.message.includes("WMS404:") ? 404 : error.message.includes("WMS409:") ? 409 : 500;
    throw new HttpError(status, error.message.replace(/^.*WMS(?:400|403|404|409|500):\s*/, ""));
  }
  const refreshed = await loadExactOrderById(admin, actor, facilityIds, data);
  if (!refreshed) throw new HttpError(404, "The updated warehouse order could not be reloaded.");
  return await mapExactOrder(admin, refreshed);
}
