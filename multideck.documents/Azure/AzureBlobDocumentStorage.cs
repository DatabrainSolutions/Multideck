using Azure;
using Azure.Storage.Blobs;
using Azure.Storage.Blobs.Models;
using Azure.Storage.Sas;
using Multideck.Documents.Paths;

namespace Multideck.Documents.Azure;

public sealed class AzureBlobDocumentStorage : IDocumentStorage
{
    private readonly AzureDocumentStorageOptions options;
    private readonly BlobServiceClient service;
    private readonly IDocumentPathPolicy pathPolicy;

    public AzureBlobDocumentStorage(AzureDocumentStorageOptions options, IDocumentPathPolicy? pathPolicy = null)
    {
        options.Validate();
        this.options = options;
        service = new BlobServiceClient(options.ConnectionString);
        this.pathPolicy = pathPolicy ?? new ConcernDocumentPathPolicy(options);
    }

    public async Task<StoredDocument> UploadAsync(DocumentStorageRequest request, Stream content, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(content);
        if (!content.CanRead) throw new ArgumentException("The document content stream must be readable.", nameof(content));
        if (request.ContentLength < 0) throw new ArgumentOutOfRangeException(nameof(request.ContentLength));
        if (string.IsNullOrWhiteSpace(request.Sha256) || request.Sha256.Length != 64) throw new ArgumentException("A SHA-256 checksum is required.", nameof(request));

        var address = pathPolicy.Resolve(request);
        var container = service.GetBlobContainerClient(address.Container);
        await container.CreateIfNotExistsAsync(PublicAccessType.None, cancellationToken: cancellationToken);
        var blob = container.GetBlobClient(address.BlobName);
        var metadata = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase)
        {
            ["documentid"] = request.DocumentId.ToString("N"),
            ["concern"] = request.Concern.ToCode(),
            ["aggregatetype"] = NormaliseMetadata(request.AggregateType),
            ["aggregateid"] = request.AggregateId.ToString("N"),
            ["sha256"] = request.Sha256.ToLowerInvariant(),
        };
        if (request.OrganisationId.HasValue) metadata["organisationid"] = request.OrganisationId.Value.ToString("N");
        if (request.Metadata is not null)
        {
            foreach (var pair in request.Metadata.Where(pair => !string.IsNullOrWhiteSpace(pair.Key) && !string.IsNullOrWhiteSpace(pair.Value)))
                metadata[NormaliseMetadata(pair.Key)] = NormaliseMetadata(pair.Value);
        }

        var response = await blob.UploadAsync(content, new BlobUploadOptions
        {
            Conditions = new BlobRequestConditions { IfNoneMatch = ETag.All },
            HttpHeaders = new BlobHttpHeaders
            {
                ContentType = string.IsNullOrWhiteSpace(request.ContentType) ? "application/octet-stream" : request.ContentType,
                ContentDisposition = ContentDisposition(request.FileName),
                CacheControl = "private, no-store",
            },
            Metadata = metadata,
            TransferOptions = new global::Azure.Storage.StorageTransferOptions
            {
                MaximumConcurrency = 4,
                MaximumTransferSize = 4 * 1024 * 1024,
            },
        }, cancellationToken);

        return new StoredDocument(address, blob.Uri, response.Value.ETag.ToString(), response.Value.VersionId, DateTimeOffset.UtcNow);
    }

    public async Task DownloadToAsync(DocumentStorageAddress address, Stream destination, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(destination);
        await service.GetBlobContainerClient(address.Container).GetBlobClient(address.BlobName)
            .DownloadToAsync(destination, cancellationToken);
    }

    public Task<DocumentReadAccess> CreateReadAccessAsync(DocumentStorageAddress address, string downloadFileName, TimeSpan? lifetime = null, CancellationToken cancellationToken = default)
    {
        cancellationToken.ThrowIfCancellationRequested();
        var blob = service.GetBlobContainerClient(address.Container).GetBlobClient(address.BlobName);
        if (!blob.CanGenerateSasUri)
            throw new InvalidOperationException("The configured Azure credential cannot generate SAS URLs. Use a shared-key connection or add a user-delegation SAS provider.");
        var accessLifetime = lifetime ?? TimeSpan.FromMinutes(options.ReadAccessMinutes);
        if (accessLifetime <= TimeSpan.Zero || accessLifetime > TimeSpan.FromMinutes(60))
            throw new ArgumentOutOfRangeException(nameof(lifetime), "Document read access must expire within 60 minutes.");
        var now = DateTimeOffset.UtcNow;
        var expires = now.Add(accessLifetime);
        var builder = new BlobSasBuilder
        {
            BlobContainerName = address.Container,
            BlobName = address.BlobName,
            Resource = "b",
            StartsOn = now.AddMinutes(-1),
            ExpiresOn = expires,
            Protocol = SasProtocol.Https,
            ContentDisposition = ContentDisposition(downloadFileName),
            CacheControl = "private, no-store",
        };
        builder.SetPermissions(BlobSasPermissions.Read);
        return Task.FromResult(new DocumentReadAccess(blob.GenerateSasUri(builder), expires));
    }

    public async Task DeleteIfExistsAsync(DocumentStorageAddress address, CancellationToken cancellationToken = default) =>
        await service.GetBlobContainerClient(address.Container).GetBlobClient(address.BlobName)
            .DeleteIfExistsAsync(DeleteSnapshotsOption.IncludeSnapshots, cancellationToken: cancellationToken);

    private static string ContentDisposition(string fileName)
    {
        var safe = Path.GetFileName(fileName).Replace("\"", "", StringComparison.Ordinal).Replace("\r", "", StringComparison.Ordinal).Replace("\n", "", StringComparison.Ordinal);
        var ascii = string.Concat(safe.Select(character => character is >= ' ' and <= '~' ? character : '_'));
        return $"attachment; filename=\"{ascii}\"; filename*=UTF-8''{Uri.EscapeDataString(safe)}";
    }

    private static string NormaliseMetadata(string value)
    {
        var safe = string.Concat(value.Trim().Select(character => character <= 127 && (char.IsLetterOrDigit(character) || character is '-' or '_') ? character : '-'));
        return string.IsNullOrWhiteSpace(safe) ? "unknown" : safe[..Math.Min(safe.Length, 256)];
    }
}
