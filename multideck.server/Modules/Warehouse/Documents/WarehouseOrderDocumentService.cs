using System.Security.Claims;
using System.Security.Cryptography;
using Microsoft.EntityFrameworkCore;
using Multideck.Documents;
using Multideck.Persistence;
using Multideck.Persistence.Entities;
using Multideck.Server.Modules.Documents;

namespace Multideck.Server.Modules.Warehouse.Documents;

public sealed class WarehouseOrderDocumentService(
    MultideckContext db,
    IWarehouseContext warehouseContext,
    IDocumentObjectService documents) : IWarehouseOrderDocumentService
{
    private const long MaxFileBytes = 25 * 1024 * 1024;
    private static readonly IReadOnlyDictionary<string, string> ContentTypesByExtension = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
    {
        [".eml"] = "message/rfc822",
        [".msg"] = "application/vnd.ms-outlook",
        [".pdf"] = "application/pdf",
        [".doc"] = "application/msword",
        [".docx"] = "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        [".xls"] = "application/vnd.ms-excel",
        [".xlsx"] = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        [".ppt"] = "application/vnd.ms-powerpoint",
        [".pptx"] = "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        [".csv"] = "text/csv",
        [".txt"] = "text/plain",
        [".rtf"] = "application/rtf",
        [".png"] = "image/png",
        [".jpg"] = "image/jpeg",
        [".jpeg"] = "image/jpeg",
        [".gif"] = "image/gif",
        [".webp"] = "image/webp",
        [".tif"] = "image/tiff",
        [".tiff"] = "image/tiff",
        [".zip"] = "application/zip",
    };

    public async Task<IReadOnlyList<WarehouseOrderDocumentDto>> ListAsync(ClaimsPrincipal principal, Guid orderId, CancellationToken cancellationToken)
    {
        var actor = await warehouseContext.RequireCurrentActorAsync(principal, cancellationToken);
        var order = await RequireOrderAsync(actor, orderId, cancellationToken);
        if (actor.IsCustomer) warehouseContext.RequireCapability(actor, WarehouseCapabilities.OrdersReadOwn, order.WmsorderCustomerOrgId);
        return await Query(orderId).OrderByDescending(value => value.WmsdocumentCreatedAt).Select(value => new WarehouseOrderDocumentDto(
            value.WmsdocumentId, orderId, value.WmsdocumentTitle, value.WmsdocumentDocumentTypeCode, value.WmsdocumentStatusCode,
            db.PortalFileUploads.Where(upload => upload.PortalUploadTargetId == value.WmsdocumentId).Select(upload => upload.PortalUploadFileName).FirstOrDefault(),
            db.PortalFileUploads.Where(upload => upload.PortalUploadTargetId == value.WmsdocumentId).Select(upload => upload.PortalUploadMimeType).FirstOrDefault(),
            db.PortalFileUploads.Where(upload => upload.PortalUploadTargetId == value.WmsdocumentId).Select(upload => upload.PortalUploadFileSizeBytes).FirstOrDefault(),
            value.WmsdocumentCreatedAt)).ToListAsync(cancellationToken);
    }

    public async Task<WarehouseOrderDocumentDto> UploadAsync(ClaimsPrincipal principal, Guid orderId, IFormFile file, string? documentTypeCode, CancellationToken cancellationToken)
    {
        var actor = await warehouseContext.RequireCurrentActorAsync(principal, cancellationToken);
        var order = await RequireOrderAsync(actor, orderId, cancellationToken);
        if (actor.IsCustomer) warehouseContext.RequireCapability(actor, WarehouseCapabilities.DocumentsUploadOwn, order.WmsorderCustomerOrgId);
        if (file.Length <= 0 || file.Length > MaxFileBytes) throw WarehouseException.BadRequest("Upload a file no larger than 25 MB.");
        var fileName = SafeFileName(file.FileName);
        if (string.IsNullOrWhiteSpace(fileName)) throw WarehouseException.BadRequest("Choose a file to upload.");
        var contentType = ResolveContentType(fileName, file.ContentType);

        await using var source = file.OpenReadStream();
        await using var buffered = new MemoryStream();
        await source.CopyToAsync(buffered, cancellationToken);
        var bytes = buffered.ToArray();
        var hash = Convert.ToHexString(SHA256.HashData(bytes)).ToLowerInvariant();
        buffered.Position = 0;
        var now = DateTime.UtcNow;
        var title = fileName;
        if (title.Length > 220) title = title[..220];
        var documentType = Normalize(documentTypeCode) ?? "supporting_document";
        if (documentType.Length > 80) throw WarehouseException.BadRequest("The document type is too long.");
        var stored = await documents.UploadAndTrackAsync(new StoreDocumentObjectCommand(
            DocumentConcern.Warehouse,
            order.WmsorderCustomerOrgId,
            "warehouse-order",
            orderId,
            fileName,
            contentType,
            file.Length,
            hash,
            actor.UserId,
            actor.PortalUserId), buffered, cancellationToken);
        var document = new WmsDocument
        {
            WmsdocumentId = Guid.NewGuid(),
            WmsdocumentFacilityId = order.WmsorderFacilityId,
            WmsdocumentOrderId = orderId,
            WmsdocumentDocumentTypeCode = documentType,
            WmsdocumentTitle = title,
            WmsdocumentStatusCode = "pending_review",
            WmsdocumentFileRef = $"doc-object:{stored.Id:N}",
            WmsdocumentFileHash = hash,
            WmsdocumentCreatedAt = now,
            WmsdocumentCreatedBy = actor.UserId,
        };
        db.WmsDocuments.Add(document);
        db.PortalFileUploads.Add(new PortalFileUpload
        {
            PortalUploadSiteId = actor.PortalUserId.HasValue ? await db.PortalUsers.Where(value => value.PortalUserId == actor.PortalUserId).Select(value => value.PortalUserDefaultSiteId).FirstOrDefaultAsync(cancellationToken) : null,
            PortalUploadPortalUserId = actor.PortalUserId,
            PortalUploadOrgId = order.WmsorderCustomerOrgId,
            PortalUploadStatusCode = "pending_review",
            PortalUploadResourceTypeCode = "warehouse_documents",
            PortalUploadTargetTable = "WMS_Documents",
            PortalUploadTargetId = document.WmsdocumentId,
            PortalUploadRequestedTitle = document.WmsdocumentTitle,
            PortalUploadFileName = fileName,
            PortalUploadMimeType = contentType,
            PortalUploadFileSizeBytes = file.Length,
            PortalUploadStorageBucket = stored.Container,
            PortalUploadStoragePath = stored.BlobName,
            PortalUploadFileHashSha256 = hash,
            PortalUploadVirusScanStatus = "pending",
            PortalUploadExtractedDataJson = "{}",
            PortalUploadRequestedAt = now,
            PortalUploadRequestedBy = actor.UserId,
            PortalUploadUploadedAt = now,
        });
        try
        {
            await db.SaveChangesAsync(cancellationToken);
        }
        catch
        {
            await documents.DeleteContentIfExistsAsync(stored, CancellationToken.None);
            throw;
        }
        return new WarehouseOrderDocumentDto(document.WmsdocumentId, orderId, document.WmsdocumentTitle, document.WmsdocumentDocumentTypeCode, document.WmsdocumentStatusCode, fileName, contentType, file.Length, now);
    }

    public async Task<WarehouseDocumentContent> DownloadAsync(ClaimsPrincipal principal, Guid orderId, Guid documentId, CancellationToken cancellationToken)
    {
        var actor = await warehouseContext.RequireCurrentActorAsync(principal, cancellationToken);
        var order = await RequireOrderAsync(actor, orderId, cancellationToken);
        if (actor.IsCustomer) warehouseContext.RequireCapability(actor, WarehouseCapabilities.OrdersReadOwn, order.WmsorderCustomerOrgId);
        var document = await Query(orderId).FirstOrDefaultAsync(value => value.WmsdocumentId == documentId, cancellationToken)
            ?? throw WarehouseException.NotFound("This warehouse document does not exist.");
        var upload = await db.PortalFileUploads.AsNoTracking().FirstOrDefaultAsync(value => value.PortalUploadTargetId == documentId, cancellationToken);
        var stored = await ResolveStoredDocumentAsync(order, upload, cancellationToken);
        return new WarehouseDocumentContent(await documents.DownloadAsync(stored, cancellationToken), stored.MimeType, stored.OriginalFileName);
    }

    public async Task<WarehouseDocumentReadUrlDto> CreateReadUrlAsync(ClaimsPrincipal principal, Guid orderId, Guid documentId, CancellationToken cancellationToken)
    {
        var actor = await warehouseContext.RequireCurrentActorAsync(principal, cancellationToken);
        var order = await RequireOrderAsync(actor, orderId, cancellationToken);
        if (actor.IsCustomer) warehouseContext.RequireCapability(actor, WarehouseCapabilities.OrdersReadOwn, order.WmsorderCustomerOrgId);
        _ = await Query(orderId).FirstOrDefaultAsync(value => value.WmsdocumentId == documentId, cancellationToken)
            ?? throw WarehouseException.NotFound("This warehouse document does not exist.");
        var upload = await db.PortalFileUploads.AsNoTracking().FirstOrDefaultAsync(value => value.PortalUploadTargetId == documentId, cancellationToken);
        var stored = await ResolveStoredDocumentAsync(order, upload, cancellationToken);
        var access = await documents.CreateReadUrlAsync(stored, null, cancellationToken);
        return new WarehouseDocumentReadUrlDto(access.Url, access.ExpiresAt);
    }

    public async Task<WarehouseOrderDocumentDto> ReviewAsync(ClaimsPrincipal principal, Guid orderId, Guid documentId, ReviewWarehouseDocumentRequest request, CancellationToken cancellationToken)
    {
        var internalUser = await warehouseContext.RequireCurrentUserAsync(principal, cancellationToken);
        var actor = await warehouseContext.RequireCurrentActorAsync(principal, cancellationToken);
        await RequireOrderAsync(actor, orderId, cancellationToken);
        var status = Normalize(request.StatusCode);
        if (status is not ("accepted" or "rejected")) throw WarehouseException.BadRequest("A document review must be accepted or rejected.");
        var document = await db.WmsDocuments.FirstOrDefaultAsync(value => value.WmsdocumentId == documentId && value.WmsdocumentOrderId == orderId, cancellationToken)
            ?? throw WarehouseException.NotFound("This warehouse document does not exist.");
        var upload = await db.PortalFileUploads.FirstOrDefaultAsync(value => value.PortalUploadTargetId == documentId, cancellationToken);
        document.WmsdocumentStatusCode = status;
        if (upload is not null)
        {
            upload.PortalUploadStatusCode = status;
            upload.PortalUploadReviewedAt = DateTime.UtcNow;
            upload.PortalUploadReviewedBy = internalUser.UserId;
            upload.PortalUploadReviewNotes = string.IsNullOrWhiteSpace(request.Notes) ? null : request.Notes.Trim();
        }
        await db.SaveChangesAsync(cancellationToken);
        return (await ListAsync(principal, orderId, cancellationToken)).First(value => value.Id == documentId);
    }

    private IQueryable<WmsDocument> Query(Guid orderId) => db.WmsDocuments.AsNoTracking().Where(value => value.WmsdocumentOrderId == orderId);

    private async Task<DocumentObjectReference> ResolveStoredDocumentAsync(WmsOrder order, PortalFileUpload? upload, CancellationToken cancellationToken)
    {
        if (upload is null || string.IsNullOrWhiteSpace(upload.PortalUploadStorageBucket) || string.IsNullOrWhiteSpace(upload.PortalUploadStoragePath))
            throw WarehouseException.NotFound("This warehouse document has no stored file.");
        var stored = await documents.FindByAddressAsync(upload.PortalUploadStorageBucket, upload.PortalUploadStoragePath, cancellationToken)
            ?? throw WarehouseException.NotFound("The stored warehouse document could not be found.");
        if (stored.ConcernCode != "warehouse" || stored.OrganisationId != order.WmsorderCustomerOrgId || stored.AggregateType != "warehouse-order" || stored.AggregateId != order.WmsorderId)
            throw WarehouseException.NotFound("The stored warehouse document could not be found.");
        return stored;
    }

    private async Task<WmsOrder> RequireOrderAsync(WarehouseActor actor, Guid orderId, CancellationToken cancellationToken)
    {
        var query = db.WmsOrders.AsNoTracking().Where(value => value.WmsorderId == orderId && !value.WmsorderIsDeleted);
        if (actor.IsInternal) query = query.Where(value => value.WmsorderFacility.WmsfacilityOrgOffice != null && value.WmsorderFacility.WmsfacilityOrgOffice.CompanyId == actor.CompanyId);
        else { var orgIds = actor.OrganisationIds; var facilityIds = actor.FacilityIds; query = query.Where(value => orgIds.Contains(value.WmsorderCustomerOrgId) && facilityIds.Contains(value.WmsorderFacilityId)); }
        return await query.FirstOrDefaultAsync(cancellationToken) ?? throw WarehouseException.NotFound("This warehouse order does not exist in your workspace.");
    }

    private static string? Normalize(string? value) => string.IsNullOrWhiteSpace(value) ? null : value.Trim().ToLowerInvariant();

    private static string ResolveContentType(string fileName, string? suppliedContentType)
    {
        var extension = Path.GetExtension(fileName);
        if (ContentTypesByExtension.TryGetValue(extension, out var knownContentType)) return knownContentType;
        var contentType = suppliedContentType?.Split(';', 2)[0].Trim().ToLowerInvariant();
        return !string.IsNullOrWhiteSpace(contentType) && contentType.Length <= 160 && contentType.Contains('/')
            ? contentType
            : "application/octet-stream";
    }

    private static string SafeFileName(string suppliedFileName)
    {
        var fileName = Path.GetFileName(suppliedFileName).Trim();
        if (fileName.Length <= 255) return fileName;
        var extension = Path.GetExtension(fileName);
        if (extension.Length >= 255) return fileName[..255];
        var stemLength = Math.Max(1, 255 - extension.Length);
        return $"{Path.GetFileNameWithoutExtension(fileName)[..stemLength]}{extension}";
    }
}
