// @ts-nocheck
import { HttpError, bodyObject, boundedPage, clean, companyFacilityIds, many, requireInternal, uuid } from "../shared/mod.ts";

async function mapPurchaseOrders(admin, rows, context) {
  if (!rows.length) return [];
  const ids = rows.map((row)=>row.WMSPO_ID);
  const [lines, events] = await Promise.all([
    many(admin.from("WMS_PurchaseOrderLines").select("*").in("WMSPOLine_PurchaseOrderID", ids).order("WMSPOLine_LineNo")),
    many(admin.from("WMS_PurchaseOrderEvents").select("*").in("WMSPOEvent_PurchaseOrderID", ids).order("WMSPOEvent_EventAt", { ascending: false })),
  ]);
  const itemIds = [...new Set(lines.map((line)=>line.WMSPOLine_ItemID).filter(Boolean))];
  const contextItems = context.items ?? [];
  const contextItemIds = new Set(contextItems.map((row)=>row.WMSItem_ID));
  const missingItemIds = itemIds.filter((itemId)=>!contextItemIds.has(itemId));
  const scopedItems = missingItemIds.length ? [
    ...contextItems,
    ...await many(admin.from("WMS_Items")
      .select("WMSItem_ID,WMSItem_SKU,WMSItem_Description")
      .in("WMSItem_ID", missingItemIds)
      .eq("WMSItem_IsDeleted", false)),
  ] : contextItems;
  const facilities = new Map(context.facilities.map((row)=>[row.WMSFacility_ID, row]));
  const organisations = new Map(context.organisations.map((row)=>[row.Org_id, row.Org_Name]));
  const items = new Map(scopedItems.map((row)=>[row.WMSItem_ID, row]));
  return rows.map((row)=>{
    const facility = facilities.get(row.WMSPO_FacilityID);
    return {
      id: row.WMSPO_ID,
      facilityId: row.WMSPO_FacilityID,
      facilityCode: facility?.WMSFacility_Code ?? "",
      facilityName: facility?.WMSFacility_Name ?? "",
      customerOrgId: row.WMSPO_CustomerOrgID,
      customerName: organisations.get(row.WMSPO_CustomerOrgID) ?? "",
      supplierOrgId: row.WMSPO_SupplierOrgID,
      supplierName: row.WMSPO_SupplierName,
      warehouseOrderId: row.WMSPO_WarehouseOrderID,
      number: row.WMSPO_Number,
      statusCode: row.WMSPO_StatusCode,
      buyerReference: row.WMSPO_BuyerReference,
      supplierReference: row.WMSPO_SupplierReference,
      issueDate: row.WMSPO_IssueDate,
      expectedDeliveryDate: row.WMSPO_ExpectedDeliveryDate,
      currencyCode: row.WMSPO_CurrencyCode,
      deliveryTerms: row.WMSPO_DeliveryTerms,
      paymentTerms: row.WMSPO_PaymentTerms,
      deliveryAddress: row.WMSPO_DeliveryAddress,
      notes: row.WMSPO_Notes,
      netAmount: Number(row.WMSPO_NetAmount),
      taxAmount: Number(row.WMSPO_TaxAmount),
      totalAmount: Number(row.WMSPO_TotalAmount),
      sourceFileName: row.WMSPO_SourceFileName,
      extractionMode: row.WMSPO_ExtractionModeCode,
      extractionModel: row.WMSPO_ExtractionModel,
      extractionMetadata: row.WMSPO_ExtractionMetadataJSON,
      version: row.WMSPO_Version,
      lineCount: lines.filter((line)=>line.WMSPOLine_PurchaseOrderID === row.WMSPO_ID).length,
      createdAt: row.WMSPO_CreatedAt,
      updatedAt: row.WMSPO_UpdatedAt,
      lines: lines.filter((line)=>line.WMSPOLine_PurchaseOrderID === row.WMSPO_ID).map((line)=>{
        const item = items.get(line.WMSPOLine_ItemID);
        return {
          id: line.WMSPOLine_ID,
          lineNumber: line.WMSPOLine_LineNo,
          itemId: line.WMSPOLine_ItemID,
          sku: line.WMSPOLine_SKU ?? item?.WMSItem_SKU ?? "",
          supplierItemCode: line.WMSPOLine_SupplierItemCode,
          description: line.WMSPOLine_Description,
          quantity: Number(line.WMSPOLine_OrderedQuantity),
          receivedQuantity: Number(line.WMSPOLine_ReceivedQuantity),
          uomCode: line.WMSPOLine_UOMCode,
          unitPrice: Number(line.WMSPOLine_UnitPrice),
          taxRate: Number(line.WMSPOLine_TaxRate),
          netAmount: Number(line.WMSPOLine_NetAmount),
          taxAmount: Number(line.WMSPOLine_TaxAmount),
          totalAmount: Number(line.WMSPOLine_TotalAmount),
          requestedDeliveryDate: line.WMSPOLine_RequestedDeliveryDate,
          metadata: line.WMSPOLine_MetadataJSON,
        };
      }),
      events: events.filter((event)=>event.WMSPOEvent_PurchaseOrderID === row.WMSPO_ID).map((event)=>({
        id: event.WMSPOEvent_ID,
        typeCode: event.WMSPOEvent_EventTypeCode,
        at: event.WMSPOEvent_EventAt,
        fromStatusCode: event.WMSPOEvent_FromStatusCode,
        toStatusCode: event.WMSPOEvent_ToStatusCode,
        notes: event.WMSPOEvent_Notes,
        metadata: event.WMSPOEvent_MetadataJSON,
      })),
    };
  });
}

export async function handlePurchaseOrders(request, path, url, admin, actor) {
  if (request.method === "GET" && path[1] === "reference" && path[2] === "organisations") {
    requireInternal(actor);
    const { limit, offset } = boundedPage(url, 25, 50);
    let query = admin.from("Org_Master").select("Org_id,Org_Name");
    const term = clean(url.searchParams.get("search"), 160);
    if (term) query = query.ilike("Org_Name", `%${term.replace(/[\\%_]/g, "\\$&")}%`);
    const { data, error } = await query.order("Org_Name").order("Org_id").range(offset, offset + limit);
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
    requireInternal(actor);
    const { limit, offset } = boundedPage(url, 25, 50);
    const facilityIds = await companyFacilityIds(admin, actor);
    const requestedFacilityId = clean(url.searchParams.get("facilityId"));
    const requestedCustomerOrgId = clean(url.searchParams.get("customerOrgId"));
    if (!requestedFacilityId || !requestedCustomerOrgId || !facilityIds.includes(requestedFacilityId)) {
      return { rows: [], limit, offset, hasMore: false };
    }
    const { data, error } = await admin.rpc("warehouse_edge_item_selector_page", {
      p_allowed_facility_ids: facilityIds,
      p_allowed_org_ids: null,
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
  if (request.method === "GET" && path[1] === "reference" && url.searchParams.get("scope") === "setup") {
    requireInternal(actor);
    const facilityIds = await companyFacilityIds(admin, actor);
    const facilities = facilityIds.length ? await many(admin.from("WMS_Facilities")
      .select("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name")
      .in("WMSFacility_ID", facilityIds)
      .eq("WMSFacility_IsDeleted", false)
      .eq("WMSFacility_IsActive", true)
      .order("WMSFacility_Name")) : [];
    return {
      facilities: facilities.map((row)=>({ id: row.WMSFacility_ID, code: row.WMSFacility_Code, name: row.WMSFacility_Name })),
      organisations: [],
      organisationsDeferred: true,
      items: [],
      itemsDeferred: true,
      currencies: ["GBP", "EUR", "USD", "CNY", "JPY", "AED"]
    };
  }
  const directPurchaseOrderId = request.method === "GET" && path[1] && !["reference", "next-number"].includes(path[1])
    ? uuid(path[1], "purchase order")
    : null;
  if (directPurchaseOrderId) {
    requireInternal(actor);
    const facilityIds = await companyFacilityIds(admin, actor);
    if (!facilityIds.length) throw new HttpError(404, "This purchase order does not exist in your workspace.");
    const rows = await many(admin.from("WMS_PurchaseOrders")
      .select("*")
      .eq("WMSPO_ID", directPurchaseOrderId)
      .in("WMSPO_FacilityID", facilityIds)
      .eq("WMSPO_IsDeleted", false)
      .limit(1));
    if (!rows.length) throw new HttpError(404, "This purchase order does not exist in your workspace.");
    const row = rows[0];
    const [facilities, organisations] = await Promise.all([
      many(admin.from("WMS_Facilities")
        .select("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name")
        .eq("WMSFacility_ID", row.WMSPO_FacilityID)
        .eq("WMSFacility_IsDeleted", false)
        .limit(1)),
      many(admin.from("Org_Master")
        .select("Org_id,Org_Name")
        .eq("Org_id", row.WMSPO_CustomerOrgID)
        .limit(1)),
    ]);
    return (await mapPurchaseOrders(admin, rows, { facilities, organisations, items: [] }))[0];
  }
  const boundedList = request.method === "GET" && !path[1] && url.searchParams.has("limit");
  if (boundedList) {
    requireInternal(actor);
    const facilityIds = await companyFacilityIds(admin, actor);
    const { limit, offset } = boundedPage(url);
    if (!facilityIds.length) return { rows: [], total: 0, limit, offset, facets: [] };
    const requestedFacilityId = clean(url.searchParams.get("facilityId"));
    if (requestedFacilityId && !facilityIds.includes(requestedFacilityId)) return { rows: [], total: 0, limit, offset, facets: [] };
    const { data, error } = await admin.rpc("warehouse_edge_purchase_orders_page", {
      p_allowed_facility_ids: facilityIds,
      p_facility_id: requestedFacilityId,
      p_status: clean(url.searchParams.get("status"), 60),
      p_open_only: url.searchParams.get("openOnly") === "true",
      p_search: clean(url.searchParams.get("search"), 160),
      p_sort: clean(url.searchParams.get("sort"), 60),
      p_direction: url.searchParams.get("direction") === "asc" ? "asc" : "desc",
      p_limit: limit,
      p_offset: offset
    });
    if (!error) return data ?? { rows: [], total: 0, limit, offset, facets: [] };
    if (["42883", "PGRST202"].includes(error.code ?? "")) {
      throw new HttpError(503, "Warehouse purchase-order paging is still being prepared. Try again shortly.");
    }
    throw new HttpError(500, error.message);
  }
  if (request.method === "GET" && !path[1]) {
    throw new HttpError(400, "Warehouse purchase-order lists require bounded paging.");
  }
  if (request.method === "GET" && path[1] === "next-number") {
    requireInternal(actor);
    const facilityId = uuid(url.searchParams.get("facilityId"), "warehouse");
    const facilityIds = await companyFacilityIds(admin, actor);
    if (!facilityIds.includes(facilityId)) throw new HttpError(403, "You do not have access to this warehouse.");
    const facilities = await many(admin.from("WMS_Facilities")
      .select("WMSFacility_ID,WMSFacility_Code")
      .eq("WMSFacility_ID", facilityId)
      .eq("WMSFacility_IsDeleted", false)
      .limit(1));
    if (!facilities.length) throw new HttpError(404, "This warehouse does not exist in your workspace.");
    const prefix = `PO-${String(facilities[0].WMSFacility_Code ?? "WH").toUpperCase()}-${new Date().getUTCFullYear()}`;
    const { data, error } = await admin.rpc("warehouse_edge_next_purchase_order_number", {
      p_allowed_facility_ids: facilityIds,
      p_facility_id: facilityId,
      p_prefix: prefix
    });
    if (error) {
      if (["42883", "PGRST202"].includes(error.code ?? "")) {
        throw new HttpError(503, "Warehouse purchase-order numbering is still being prepared. Try again shortly.");
      }
      throw new HttpError(500, error.message);
    }
    if (!data) throw new HttpError(403, "You do not have access to this warehouse.");
    return { number: data };
  }
  if (request.method === "GET" && path[1] === "reference") {
    throw new HttpError(400, "Warehouse purchase-order references must use deferred, paged selectors.");
  }
  const purchaseOrderId = path[1] && !["reference", "next-number"].includes(path[1]) ? uuid(path[1], "purchase order") : null;
  const input = request.headers.get("content-type")?.includes("application/json") ? bodyObject(await request.json()) : {};
  const action = !purchaseOrderId && request.method === "POST"
    ? "create"
    : request.method === "PUT"
      ? "update"
      : request.method === "POST" && ["issue","cancel","create-inbound"].includes(path[2])
        ? path[2].replace("-", "_")
        : null;
  if (!action) throw new HttpError(404, "Warehouse purchase order endpoint not found.");
  requireInternal(actor);
  const facilityIds = await companyFacilityIds(admin, actor);
  const { data, error } = await admin.rpc("warehouse_edge_purchase_order_mutation", {
    p_action: action,
    p_purchase_order_id: purchaseOrderId,
    p_payload: input,
    p_actor_user_id: actor.userId,
    p_allowed_facility_ids: facilityIds,
  });
  if (error) {
    const match = error.message.match(/WMS(400|403|404|409|500):\s*(.*)$/s);
    throw new HttpError(match ? Number(match[1]) : 500, match?.[2] ?? "The purchase order could not be saved.");
  }
  const rows = await many(admin.from("WMS_PurchaseOrders")
    .select("*")
    .eq("WMSPO_ID", data)
    .in("WMSPO_FacilityID", facilityIds)
    .eq("WMSPO_IsDeleted", false)
    .limit(1));
  if (!rows.length) throw new HttpError(404, "This purchase order does not exist in your workspace.");
  const [facilities, organisations] = await Promise.all([
    many(admin.from("WMS_Facilities")
      .select("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name")
      .eq("WMSFacility_ID", rows[0].WMSPO_FacilityID)
      .limit(1)),
    many(admin.from("Org_Master")
      .select("Org_id,Org_Name")
      .eq("Org_id", rows[0].WMSPO_CustomerOrgID)
      .limit(1)),
  ]);
  return (await mapPurchaseOrders(admin, rows, { facilities, organisations, items: [] }))[0];
}
