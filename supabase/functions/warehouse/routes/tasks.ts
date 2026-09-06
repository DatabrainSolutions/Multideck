// @ts-nocheck
import {
  HttpError,
  bodyObject,
  boundedPage,
  clean,
  companyFacilityIds,
  many,
  oneOrNull,
  requireInternalWarehouseRead,
  requireInternalWarehouseWrite,
  uuid,
} from "../shared/mod.ts";

async function enrichTasks(admin, rows) {
  if (!rows.length) return [];
  const facilityIds = [...new Set(rows.map((row) => row.WMSTask_FacilityID).filter(Boolean))];
  const orderIds = [...new Set(rows.map((row) => row.WMSTask_OrderID).filter(Boolean))];
  const itemIds = [...new Set(rows.map((row) => row.WMSTask_ItemID).filter(Boolean))];
  const locationIds = [...new Set(rows.flatMap((row) => [row.WMSTask_SourceLocationID, row.WMSTask_TargetLocationID]).filter(Boolean))];
  const lotIds = [...new Set(rows.map((row) => row.WMSTask_LotID).filter(Boolean))];
  const completedByIds = [...new Set(rows.map((row) => row.WMSTask_CompletedBy).filter(Boolean))];
  const [facilities, orders, items, locations, lots, users] = await Promise.all([
    facilityIds.length ? many(admin.from("WMS_Facilities").select("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name").in("WMSFacility_ID", facilityIds)) : [],
    orderIds.length ? many(admin.from("WMS_Orders").select("WMSOrder_ID,WMSOrder_OrderNumber,WMSOrder_CustomerOrgID").in("WMSOrder_ID", orderIds)) : [],
    itemIds.length ? many(admin.from("WMS_Items").select("WMSItem_ID,WMSItem_SKU,WMSItem_Description").in("WMSItem_ID", itemIds)) : [],
    locationIds.length ? many(admin.from("WMS_Locations").select("WMSLocation_ID,WMSLocation_Code").in("WMSLocation_ID", locationIds)) : [],
    lotIds.length ? many(admin.from("WMS_InventoryLots").select("WMSLot_ID,WMSLot_LotNumber").in("WMSLot_ID", lotIds)) : [],
    completedByIds.length ? many(admin.from("cmp_Users").select("User_ID,User_FirstName,User_LastName").in("User_ID", completedByIds)) : [],
  ]);
  const customerIds = [...new Set(orders.map((row) => row.WMSOrder_CustomerOrgID).filter(Boolean))];
  const customers = customerIds.length ? await many(admin.from("Org_Master").select("Org_id,Org_Name").in("Org_id", customerIds)) : [];
  const facilityMap = new Map(facilities.map((row) => [row.WMSFacility_ID, row]));
  const orderMap = new Map(orders.map((row) => [row.WMSOrder_ID, row]));
  const itemMap = new Map(items.map((row) => [row.WMSItem_ID, row]));
  const locationMap = new Map(locations.map((row) => [row.WMSLocation_ID, row.WMSLocation_Code]));
  const lotMap = new Map(lots.map((row) => [row.WMSLot_ID, row.WMSLot_LotNumber]));
  const customerMap = new Map(customers.map((row) => [row.Org_id, row.Org_Name]));
  const userMap = new Map(users.map((row) => [row.User_ID, [row.User_FirstName, row.User_LastName].filter(Boolean).join(" ")]));
  return rows.map((row) => {
    const facility = facilityMap.get(row.WMSTask_FacilityID);
    const order = orderMap.get(row.WMSTask_OrderID);
    const item = itemMap.get(row.WMSTask_ItemID);
    return {
      id: row.WMSTask_ID,
      type: row.WMSTask_TypeCode,
      statusCode: row.WMSTask_StatusCode,
      facilityId: row.WMSTask_FacilityID,
      facilityCode: facility?.WMSFacility_Code ?? "",
      facilityName: facility?.WMSFacility_Name ?? "",
      orderId: row.WMSTask_OrderID,
      orderNumber: order?.WMSOrder_OrderNumber ?? null,
      orderLineId: row.WMSTask_OrderLineID,
      itemId: row.WMSTask_ItemID,
      sku: item?.WMSItem_SKU ?? "",
      description: item?.WMSItem_Description ?? "",
      customerOrgId: order?.WMSOrder_CustomerOrgID ?? null,
      customerName: customerMap.get(order?.WMSOrder_CustomerOrgID) ?? "",
      quantity: row.WMSTask_Quantity,
      completedQuantity: row.WMSTask_CompletedQuantity ?? 0,
      uomCode: row.WMSTask_UOMCode,
      sourceBalanceId: row.WMSTask_BalanceID,
      sourceLocationId: row.WMSTask_SourceLocationID,
      sourceLocationCode: locationMap.get(row.WMSTask_SourceLocationID) ?? null,
      targetLocationId: row.WMSTask_TargetLocationID,
      targetLocationCode: locationMap.get(row.WMSTask_TargetLocationID) ?? null,
      lotId: row.WMSTask_LotID,
      lotNumber: lotMap.get(row.WMSTask_LotID) ?? null,
      createdAt: row.WMSTask_CreatedAt,
      completedAt: row.WMSTask_CompletedAt,
      completedBy: row.WMSTask_CompletedBy,
      completedByName: userMap.get(row.WMSTask_CompletedBy) ?? null,
    };
  });
}

export async function handleTasks(request, path, url, admin, actor) {
  requireInternalWarehouseRead(actor);
  const facilityIds = await companyFacilityIds(admin, actor);
  if (!facilityIds.length) {
    if (request.method === "GET" && path.length === 1) return { rows: [], total: 0, limit: 20, offset: 0 };
    throw new HttpError(404, "This warehouse task does not exist in your workspace.");
  }

  const taskId = path[1] ? uuid(path[1], "task") : null;
  if (request.method === "GET" && taskId) {
    const task = await oneOrNull(admin.from("WMS_Tasks").select("*").eq("WMSTask_ID", taskId).in("WMSTask_FacilityID", facilityIds).maybeSingle());
    if (!task) throw new HttpError(404, "This warehouse task does not exist in your workspace.");
    return (await enrichTasks(admin, [task]))[0];
  }

  if (request.method === "GET" && path.length === 1) {
    const { limit, offset } = boundedPage(url);
    const facilityId = clean(url.searchParams.get("facilityId"));
    if (facilityId && !facilityIds.includes(facilityId)) return { rows: [], total: 0, limit, offset };
    const type = clean(url.searchParams.get("type"));
    if (type && !["putaway", "pick"].includes(type)) throw new HttpError(400, "Choose putaway or pick tasks.");
    const orderId = clean(url.searchParams.get("orderId"));
    let query = admin.from("WMS_Tasks").select("*", { count: "exact" }).in("WMSTask_FacilityID", facilityId ? [facilityId] : facilityIds);
    if (type) query = query.eq("WMSTask_TypeCode", type);
    if (orderId) query = query.eq("WMSTask_OrderID", uuid(orderId, "order"));
    const status = clean(url.searchParams.get("status"));
    if (!status || status === "open") query = query.not("WMSTask_StatusCode", "in", "(complete,cancelled)");
    else query = query.eq("WMSTask_StatusCode", status);
    const { data, error, count } = await query.order("WMSTask_CreatedAt", { ascending: true }).order("WMSTask_ID", { ascending: true }).range(offset, offset + limit - 1);
    if (error) throw new HttpError(500, error.message);
    return { rows: await enrichTasks(admin, data ?? []), total: count ?? 0, limit, offset };
  }

  if (request.method === "POST" && taskId && path[2] === "confirm") {
    requireInternalWarehouseWrite(actor);
    const input = bodyObject(await request.json());
    const { data, error } = await admin.rpc("warehouse_edge_confirm_task_mutation", {
      p_task_id: taskId,
      p_payload: input,
      p_actor_user_id: actor.userId,
      p_allowed_facility_ids: facilityIds,
    });
    if (error) {
      const status = error.message.includes("WMS400:") ? 400 : error.message.includes("WMS403:") ? 403 : error.message.includes("WMS404:") ? 404 : error.message.includes("WMS409:") ? 409 : 500;
      throw new HttpError(status, error.message.replace(/^.*WMS(?:400|403|404|409|500):\s*/, ""));
    }
    const task = await oneOrNull(admin.from("WMS_Tasks").select("*").eq("WMSTask_ID", data).in("WMSTask_FacilityID", facilityIds).maybeSingle());
    if (!task) throw new HttpError(404, "The updated warehouse task could not be reloaded.");
    return (await enrichTasks(admin, [task]))[0];
  }

  throw new HttpError(404, "Warehouse endpoint not found.");
}
