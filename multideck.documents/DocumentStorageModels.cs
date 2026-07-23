namespace Multideck.Documents;

public sealed record DocumentStorageAddress(string Container, string BlobName)
{
    // These names are retained because they are already persisted in DOC_StoredObjects.
    // For Supabase Storage they represent the bucket and object path respectively.
    public string Bucket => Container;
    public string ObjectPath => BlobName;

    public override string ToString() => $"supabase-storage://{Bucket}/{ObjectPath}";
}

public sealed record DocumentStorageRequest(
    DocumentConcern Concern,
    Guid DocumentId,
    Guid? OrganisationId,
    string AggregateType,
    Guid AggregateId,
    string FileName,
    string ContentType,
    long ContentLength,
    string Sha256,
    DateTimeOffset CreatedAt,
    IReadOnlyDictionary<string, string>? Metadata = null);

public sealed record StoredDocument(
    DocumentStorageAddress Address,
    Uri ObjectUri,
    string? ETag,
    string? VersionId,
    DateTimeOffset CreatedAt);

public sealed record DocumentReadAccess(Uri Uri, DateTimeOffset ExpiresAt);

public interface IDocumentStorage
{
    Task<StoredDocument> UploadAsync(DocumentStorageRequest request, Stream content, CancellationToken cancellationToken = default);
    Task DownloadToAsync(DocumentStorageAddress address, Stream destination, CancellationToken cancellationToken = default);
    Task<DocumentReadAccess> CreateReadAccessAsync(DocumentStorageAddress address, string downloadFileName, TimeSpan? lifetime = null, CancellationToken cancellationToken = default);
    Task DeleteIfExistsAsync(DocumentStorageAddress address, CancellationToken cancellationToken = default);
}
