// @ts-nocheck
import { HttpError, bodyObject, clean, companyFacilityIds, many, requireInternal, uuid } from "../shared/mod.ts";

async function purchaseOrderContext(admin, actor) {
  requireInternal(actor);
  const facilityIds = await companyFacilityIds(admin, actor);
  const [facilities, organisations, items] = await Promise.all([
    facilityIds.length ? many(admin.from("WMS_Facilities").select("WMSFacility_ID,WMSFacility_Code,WMSFacility_Name").in("WMSFacility_ID", facilityIds).eq("WMSFacility_IsDeleted", false).eq("WMSFacility_IsActive", true)) : Promise.resolve([]),
    many(admin.from("Org_Master").select("Org_id,Org_Name").order("Org_Name")),
    facilityIds.length ? many(admin.from("WMS_Items").select("WMSItem_ID,WMSItem_CustomerOrgID,WMSItem_DefaultFacilityID,WMSItem_SKU,WMSItem_Description,WMSItem_BaseUOMCode,WMSItem_QuantityBasisCode,WMSItem_AllowsFractionalQuantity").in("WMSItem_DefaultFacilityID", facilityIds).eq("WMSItem_IsDeleted", false).eq("WMSItem_IsActive", true)) : Promise.resolve([]),
  ]);
  return { facilityIds, facilities, organisations, items };
}

async function loadPurchaseOrders(admin, context) {
  if (!context.facilityIds.length) return [];
  return await many(admin.from("WMS_PurchaseOrders").select("*").in("WMSPO_FacilityID", context.facilityIds).eq("WMSPO_IsDeleted", false).order("WMSPO_UpdatedAt", { ascending: false }).limit(500));
}

async function mapPurchaseOrders(admin, rows, context) {
  if (!rows.length) return [];
  const ids = rows.map((row)=>row.WMSPO_ID);
  const [lines, events] = await Promise.all([
    many(admin.from("WMS_PurchaseOrderLines").select("*").in("WMSPOLine_PurchaseOrderID", ids).order("WMSPOLine_LineNo")),
    many(admin.from("WMS_PurchaseOrderEvents").select("*").in("WMSPOEvent_PurchaseOrderID", ids).order("WMSPOEvent_EventAt", { ascending: false })),
  ]);
  const facilities = new Map(context.facilities.map((row)=>[row.WMSFacility_ID, row]));
  const organisations = new Map(context.organisations.map((row)=>[row.Org_id, row.Org_Name]));
  const items = new Map(context.items.map((row)=>[row.WMSItem_ID, row]));
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
  const context = await purchaseOrderContext(admin, actor);
  if (request.method === "GET" && path[1] === "reference") {
    return {
      facilities: context.facilities.map((row)=>({ id: row.WMSFacility_ID, code: row.WMSFacility_Code, name: row.WMSFacility_Name })),
      organisations: context.organisations.map((row)=>({ id: row.Org_id, name: row.Org_Name })),
      items: context.items.map((row)=>({
        id: row.WMSItem_ID,
        customerOrgId: row.WMSItem_CustomerOrgID,
        facilityId: row.WMSItem_DefaultFacilityID,
        sku: row.WMSItem_SKU,
        description: row.WMSItem_Description,
        uomCode: row.WMSItem_BaseUOMCode,
        quantityBasisCode: row.WMSItem_QuantityBasisCode ?? "count",
        allowsFractionalQuantity: row.WMSItem_AllowsFractionalQuantity ?? false,
      })),
      currencies: ["GBP", "EUR", "USD", "CNY", "JPY", "AED"],
    };
  }

  let rows = await loadPurchaseOrders(admin, context);
  const purchaseOrderId = path[1] && path[1] !== "reference" ? uuid(path[1], "purchase order") : null;
  if (request.method === "GET" && purchaseOrderId) {
    const found = rows.filter((row)=>row.WMSPO_ID === purchaseOrderId);
    if (!found.length) throw new HttpError(404, "This purchase order does not exist in your workspace.");
    return (await mapPurchaseOrders(admin, found, context))[0];
  }
  if (request.method === "GET") {
    const facilityId = clean(url.searchParams.get("facilityId"));
    const statusCode = clean(url.searchParams.get("statusCode"));
    const term = clean(url.searchParams.get("search"))?.toLowerCase();
    rows = rows.filter((row)=>(!facilityId || row.WMSPO_FacilityID === facilityId) && (!statusCode || row.WMSPO_StatusCode === statusCode) && (!term || [row.WMSPO_Number,row.WMSPO_SupplierName,row.WMSPO_BuyerReference,row.WMSPO_SupplierReference].some((value)=>String(value ?? "").toLowerCase().includes(term))));
    return await mapPurchaseOrders(admin, rows, context);
  }

  const input = request.headers.get("content-type")?.includes("application/json") ? bodyObject(await request.json()) : {};
  const action = !purchaseOrderId && request.method === "POST"
    ? "create"
    : request.method === "PUT"
      ? "update"
      : request.method === "POST" && ["issue","cancel","create-inbound"].includes(path[2])
        ? path[2].replace("-", "_")
        : null;
  if (!action) throw new HttpError(404, "Warehouse purchase order endpoint not found.");
  const { data, error } = await admin.rpc("warehouse_edge_purchase_order_mutation", {
    p_action: action,
    p_purchase_order_id: purchaseOrderId,
    p_payload: input,
    p_actor_user_id: actor.userId,
    p_allowed_facility_ids: context.facilityIds,
  });
  if (error) {
    const match = error.message.match(/WMS(400|403|404|409|500):\s*(.*)$/s);
    throw new HttpError(match ? Number(match[1]) : 500, match?.[2] ?? "The purchase order could not be saved.");
  }
  rows = await loadPurchaseOrders(admin, context);
  const found = rows.filter((row)=>row.WMSPO_ID === data);
  return (await mapPurchaseOrders(admin, found, context))[0];
}
