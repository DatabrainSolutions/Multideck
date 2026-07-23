using Microsoft.EntityFrameworkCore;
using Multideck.Documents;
using Multideck.Persistence;
using Multideck.Persistence.Entities;

namespace Multideck.Server.Modules.Documents;

public sealed class DocumentObjectService(MultideckContext db, IDocumentStorage storage) : IDocumentObjectService
{
    public async Task<DocumentObjectReference> UploadAndTrackAsync(StoreDocumentObjectCommand command, Stream content, CancellationToken cancellationToken)
    {
        Validate(command, content);
        var objectId = Guid.NewGuid();
        var createdAt = DateTime.UtcNow;
        var stored = await storage.UploadAsync(new DocumentStorageRequest(
            command.Concern,
            objectId,
            command.OrganisationId,
            command.AggregateType,
            command.AggregateId,
            command.FileName,
            command.ContentType,
            command.ContentLength,
            command.Sha256,
            createdAt), content, cancellationToken);
        var entity = new DocStoredObject
        {
            DocStoredObjectId = objectId,
            DocStoredObjectConcernCode = command.Concern.ToCode(),
            DocStoredObjectOrganisationId = command.OrganisationId,
            DocStoredObjectAggregateType = command.AggregateType.Trim().ToLowerInvariant(),
            DocStoredObjectAggregateId = command.AggregateId,
            DocStoredObjectProviderCode = "supabase_storage",
            DocStoredObjectContainer = stored.Address.Container,
            DocStoredObjectBlobName = stored.Address.BlobName,
            DocStoredObjectOriginalFileName = SafeFileName(command.FileName),
            DocStoredObjectMimeType = string.IsNullOrWhiteSpace(command.ContentType) ? "application/octet-stream" : command.ContentType,
            DocStoredObjectFileSizeBytes = command.ContentLength,
            DocStoredObjectSha256 = command.Sha256.ToLowerInvariant(),
            DocStoredObjectEtag = stored.ETag,
            DocStoredObjectVersionId = stored.VersionId,
            DocStoredObjectStatusCode = command.StatusCode,
            DocStoredObjectCreatedAt = createdAt,
            DocStoredObjectCreatedBy = command.CreatedBy,
            DocStoredObjectCreatedByPortalUserId = command.CreatedByPortalUserId,
        };
        db.DocStoredObjects.Add(entity);
        return ToReference(entity);
    }

    public async Task<byte[]> DownloadAsync(DocumentObjectReference document, CancellationToken cancellationToken)
    {
        EnsureSupabaseDocument(document);
        await using var output = new MemoryStream(document.FileSizeBytes is > 0 and <= int.MaxValue ? (int)document.FileSizeBytes : 0);
        await storage.DownloadToAsync(document.Address, output, cancellationToken);
        return output.ToArray();
    }

    public async Task<DocumentObjectReadUrl> CreateReadUrlAsync(DocumentObjectReference document, TimeSpan? lifetime, CancellationToken cancellationToken)
    {
        EnsureSupabaseDocument(document);
        var access = await storage.CreateReadAccessAsync(document.Address, document.OriginalFileName, lifetime, cancellationToken);
        return new DocumentObjectReadUrl(access.Uri.ToString(), access.ExpiresAt);
    }

    public async Task<DocumentObjectReference?> FindByIdAsync(Guid id, CancellationToken cancellationToken)
    {
        var entity = await db.DocStoredObjects.AsNoTracking().FirstOrDefaultAsync(value =>
            value.DocStoredObjectId == id && value.DocStoredObjectStatusCode != "deleted", cancellationToken);
        return entity is null ? null : ToReference(entity);
    }

    public async Task<DocumentObjectReference?> FindByAddressAsync(string container, string blobName, CancellationToken cancellationToken)
    {
        var entity = await db.DocStoredObjects.AsNoTracking().FirstOrDefaultAsync(value =>
            value.DocStoredObjectContainer == container &&
            value.DocStoredObjectBlobName == blobName &&
            value.DocStoredObjectStatusCode != "deleted", cancellationToken);
        return entity is null ? null : ToReference(entity);
    }

    public Task DeleteContentIfExistsAsync(DocumentObjectReference document, CancellationToken cancellationToken)
    {
        EnsureSupabaseDocument(document);
        return storage.DeleteIfExistsAsync(document.Address, cancellationToken);
    }

    private static DocumentObjectReference ToReference(DocStoredObject value) => new(
        value.DocStoredObjectId,
        value.DocStoredObjectProviderCode,
        value.DocStoredObjectConcernCode,
        value.DocStoredObjectOrganisationId,
        value.DocStoredObjectAggregateType,
        value.DocStoredObjectAggregateId,
        value.DocStoredObjectContainer,
        value.DocStoredObjectBlobName,
        value.DocStoredObjectOriginalFileName,
        value.DocStoredObjectMimeType,
        value.DocStoredObjectFileSizeBytes,
        value.DocStoredObjectSha256,
        value.DocStoredObjectStatusCode,
        value.DocStoredObjectCreatedAt);

    private static void EnsureSupabaseDocument(DocumentObjectReference document)
    {
        if (!string.Equals(document.ProviderCode, "supabase_storage", StringComparison.OrdinalIgnoreCase))
        {
            throw new InvalidOperationException(
                $"Document '{document.Id}' uses the legacy '{document.ProviderCode}' storage provider and must be migrated before Supabase Storage can serve it.");
        }
    }

    private static string SafeFileName(string value)
    {
        var fileName = Path.GetFileName(value);
        return fileName.Length <= 255 ? fileName : fileName[..255];
    }

    private static void Validate(StoreDocumentObjectCommand command, Stream content)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (!content.CanRead) throw new ArgumentException("The document content stream must be readable.", nameof(content));
        if (!Enum.IsDefined(command.Concern)) throw new ArgumentOutOfRangeException(nameof(command.Concern));
        if (string.IsNullOrWhiteSpace(command.AggregateType) || command.AggregateType.Trim().Length > 80)
            throw new ArgumentException("A document aggregate type of up to 80 characters is required.", nameof(command));
        if (string.IsNullOrWhiteSpace(Path.GetFileName(command.FileName)))
            throw new ArgumentException("A document filename is required.", nameof(command));
        if (command.ContentLength < 0)
            throw new ArgumentOutOfRangeException(nameof(command.ContentLength));
        if (command.Sha256.Length != 64 || command.Sha256.Any(character => !Uri.IsHexDigit(character)))
            throw new ArgumentException("A 64-character SHA-256 checksum is required.", nameof(command));
        if (command.StatusCode is not ("active" or "quarantined" or "deleted"))
            throw new ArgumentException("The document storage status is invalid.", nameof(command));
    }
}
