
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

async function scopedOrder(admin, actor, orderId) {
  const facilities = await companyFacilityIds(admin, actor);
  const row = await oneOrNull(admin.from("WMS_Orders").select("*").eq("WMSOrder_ID", orderId).eq("WMSOrder_IsDeleted", false).maybeSingle());
  if (!row || !facilities.includes(row.WMSOrder_FacilityID) || !actor.companyId && !actor.organisationIds.has(row.WMSOrder_CustomerOrgID)) {
    throw new HttpError(404, "This warehouse order does not exist in your workspace.");
  }
  return row;
}
function mapDocument(row, upload) {
  return {
    id: row.WMSDocument_ID,
    orderId: row.WMSDocument_OrderID,
    title: row.WMSDocument_Title,
    documentTypeCode: row.WMSDocument_DocumentTypeCode,
    statusCode: row.WMSDocument_StatusCode,
    fileName: upload?.PortalUpload_FileName ?? null,
    mimeType: upload?.PortalUpload_MimeType ?? null,
    fileSizeBytes: upload?.PortalUpload_FileSizeBytes ?? null,
    createdAt: row.WMSDocument_CreatedAt
  };
}
export async function handleDocuments(request, path, url, admin, actor) {
  const isReview = request.method === "POST" && path[4] === "review";
  const isUpload = request.method === "POST" && path.length === 3;
  if (actor.companyId) {
    if (isReview || isUpload) requireInternalWarehouseWrite(actor);
    else requireInternalWarehouseRead(actor);
  } else {
    if (isReview) throw new HttpError(403, "This operation is reserved for the warehouse team.");
    requireCapability(actor, isUpload ? "warehouse_documents:upload" : "warehouse_orders:read");
  }
  const orderId = uuid(path[1], "order"), order = await scopedOrder(admin, actor, orderId), documentId = path[3] && path[3] !== "documents" ? uuid(path[3], "document") : null;
  if (request.method === "GET" && path.length === 3) {
    const { limit, offset } = boundedPage(url, 20, 50);
    const { data, error } = await admin.from("WMS_Documents")
      .select("WMSDocument_ID,WMSDocument_OrderID,WMSDocument_Title,WMSDocument_DocumentTypeCode,WMSDocument_StatusCode,WMSDocument_CreatedAt")
      .eq("WMSDocument_OrderID", orderId)
      .order("WMSDocument_CreatedAt", { ascending: false })
      .order("WMSDocument_ID", { ascending: false })
      .range(offset, offset + limit);
    if (error) throw new HttpError(500, error.message);
    const candidates = data ?? [];
    const documents = candidates.slice(0, limit);
    const documentIds = documents.map((row)=>row.WMSDocument_ID);
    const uploads = documentIds.length ? await many(admin.from("Portal_FileUploads")
      .select("PortalUpload_TargetID,PortalUpload_FileName,PortalUpload_MimeType,PortalUpload_FileSizeBytes")
      .in("PortalUpload_TargetID", documentIds)) : [];
    const uploadByDocument = new Map(uploads.map((row)=>[row.PortalUpload_TargetID, row]));
    return {
      rows: documents.map((row)=>mapDocument(row, uploadByDocument.get(row.WMSDocument_ID))),
      limit,
      offset,
      hasMore: candidates.length > limit
    };
  }
  const documents = documentId ? await many(admin.from("WMS_Documents")
    .select("*")
    .eq("WMSDocument_ID", documentId)
    .eq("WMSDocument_OrderID", orderId)
    .limit(1)) : [];
  const document = documents[0] ?? null;
  const uploads = documentId ? await many(admin.from("Portal_FileUploads")
    .select("*")
    .eq("PortalUpload_TargetID", documentId)
    .limit(1)) : [];
  const upload = uploads[0] ?? null;
  if (request.method === "GET" && path[4] === "url") {
    if (!document || !upload?.PortalUpload_StoragePath) {
      throw new HttpError(404, "This warehouse document does not exist.");
    }
    const { data, error } = await admin.storage.from(upload.PortalUpload_StorageBucket || BUCKET).createSignedUrl(upload.PortalUpload_StoragePath, 300, {
      download: upload.PortalUpload_FileName
    });
    if (error) {
      throw new HttpError(404, "The stored warehouse document could not be found.");
    }
    return {
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + 300_000).toISOString()
    };
  }
  if (request.method === "GET" && path[4] === "download") {
    if (!document || !upload?.PortalUpload_StoragePath) {
      throw new HttpError(404, "This warehouse document does not exist.");
    }
    const { data, error } = await admin.storage.from(upload.PortalUpload_StorageBucket || BUCKET).download(upload.PortalUpload_StoragePath);
    if (error) {
      throw new HttpError(404, "The stored warehouse document could not be found.");
    }
    return new Response(data, {
      headers: {
        ...cors(request),
        "Content-Type": upload.PortalUpload_MimeType || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${String(upload.PortalUpload_FileName || document.WMSDocument_Title).replace(/["\r\n]/g, "")}"`
      }
    });
  }
  if (request.method === "POST" && path[4] === "review") {
    if (!document) {
      throw new HttpError(404, "This warehouse document does not exist.");
    }
    const input = bodyObject(await request.json()), status = clean(input.statusCode, 20);
    if (!status || ![
      "accepted",
      "rejected"
    ].includes(status)) {
      throw new HttpError(400, "A document review must be accepted or rejected.");
    }
    await admin.from("WMS_Documents").update({
      WMSDocument_StatusCode: status
    }).eq("WMSDocument_ID", documentId);
    if (upload) {
      await admin.from("Portal_FileUploads").update({
        PortalUpload_StatusCode: status,
        PortalUpload_ReviewedAt: new Date().toISOString(),
        PortalUpload_ReviewedBy: actor.userId,
        PortalUpload_ReviewNotes: clean(input.notes)
      }).eq("PortalUpload_ID", upload.PortalUpload_ID);
    }
    return mapDocument({
      ...document,
      WMSDocument_StatusCode: status
    }, upload);
  }
  if (request.method !== "POST" || path.length !== 3) {
    throw new HttpError(405, "Method not allowed.");
  }
  const form = await request.formData(), file = form.get("file");
  if (!(file instanceof File) || file.size <= 0 || file.size > 25 * 1024 * 1024) throw new HttpError(400, "Upload a file no larger than 25 MB.");
  const fileName = file.name.replace(/^.*[\\/]/, "").slice(-255), extension = fileName.split(".").pop()?.toLowerCase();
  if (!extension || !allowedExtensions.has(extension)) {
    throw new HttpError(400, "Choose a supported warehouse document file.");
  }
  const documentIdNew = id(), storagePath = `${order.WMSOrder_CustomerOrgID}/warehouse-order/${orderId}/${documentIdNew}/${fileName}`, bytes = new Uint8Array(await file.arrayBuffer()), digest = [
    ...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))
  ].map((value)=>value.toString(16).padStart(2, "0")).join("");
  const { error: storageError } = await admin.storage.from(BUCKET).upload(storagePath, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false
  });
  if (storageError) throw new HttpError(500, storageError.message);
  const now = new Date().toISOString(), documentRow = {
    WMSDocument_ID: documentIdNew,
    WMSDocument_FacilityID: order.WMSOrder_FacilityID,
    WMSDocument_OrderID: orderId,
    WMSDocument_DocumentTypeCode: clean(form.get("documentTypeCode"), 80) ?? "supporting_document",
    WMSDocument_Title: fileName.slice(0, 220),
    WMSDocument_StatusCode: "pending_review",
    WMSDocument_FileRef: `storage:${BUCKET}/${storagePath}`,
    WMSDocument_FileHash: digest,
    WMSDocument_CreatedAt: now,
    WMSDocument_CreatedBy: actor.userId
  };
  const uploadRow = {
    PortalUpload_ID: id(),
    PortalUpload_PortalUserID: actor.portalUserId,
    PortalUpload_OrgID: order.WMSOrder_CustomerOrgID,
    PortalUpload_StatusCode: "pending_review",
    PortalUpload_ResourceTypeCode: "warehouse_documents",
    PortalUpload_TargetTable: "WMS_Documents",
    PortalUpload_TargetID: documentIdNew,
    PortalUpload_RequestedTitle: fileName.slice(0, 220),
    PortalUpload_FileName: fileName,
    PortalUpload_MimeType: file.type || "application/octet-stream",
    PortalUpload_FileSizeBytes: file.size,
    PortalUpload_StorageBucket: BUCKET,
    PortalUpload_StoragePath: storagePath,
    PortalUpload_FileHashSHA256: digest,
    PortalUpload_VirusScanStatus: "pending",
    PortalUpload_ExtractedDataJSON: {},
    PortalUpload_RequestedAt: now,
    PortalUpload_RequestedBy: actor.userId,
    PortalUpload_UploadedAt: now
  };
  const { error: docError } = await admin.from("WMS_Documents").insert(documentRow);
  if (docError) {
    await admin.storage.from(BUCKET).remove([
      storagePath
    ]);
    throw new HttpError(500, docError.message);
  }
  const { error: uploadError } = await admin.from("Portal_FileUploads").insert(uploadRow);
  if (uploadError) {
    await admin.from("WMS_Documents").delete().eq("WMSDocument_ID", documentIdNew);
    await admin.storage.from(BUCKET).remove([
      storagePath
    ]);
    throw new HttpError(500, uploadError.message);
  }
  return mapDocument(documentRow, uploadRow);
}
