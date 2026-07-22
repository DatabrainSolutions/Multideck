using Multideck.Documents;

namespace Multideck.Server.Modules.Documents;

public sealed record StoreDocumentObjectCommand(
    DocumentConcern Concern,
    Guid? OrganisationId,
    string AggregateType,
    Guid AggregateId,
    string FileName,
    string ContentType,
    long ContentLength,
    string Sha256,
    Guid? CreatedBy,
    Guid? CreatedByPortalUserId,
    string StatusCode = "active");

public sealed record DocumentObjectReference(
    Guid Id,
    string ConcernCode,
    Guid? OrganisationId,
    string AggregateType,
    Guid AggregateId,
    string Container,
    string BlobName,
    string OriginalFileName,
    string MimeType,
    long FileSizeBytes,
    string Sha256,
    string StatusCode,
    DateTime CreatedAt)
{
    public DocumentStorageAddress Address => new(Container, BlobName);
}

public sealed record DocumentObjectReadUrl(string Url, DateTimeOffset ExpiresAt);
