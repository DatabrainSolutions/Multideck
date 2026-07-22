namespace Multideck.Server.Modules.Documents;

public interface IDocumentObjectService
{
    /// <summary>Uploads the binary and tracks its catalogue row in the current DbContext unit of work.</summary>
    Task<DocumentObjectReference> UploadAndTrackAsync(StoreDocumentObjectCommand command, Stream content, CancellationToken cancellationToken);
    Task<byte[]> DownloadAsync(DocumentObjectReference document, CancellationToken cancellationToken);
    Task<DocumentObjectReadUrl> CreateReadUrlAsync(DocumentObjectReference document, TimeSpan? lifetime, CancellationToken cancellationToken);
    Task<DocumentObjectReference?> FindByIdAsync(Guid id, CancellationToken cancellationToken);
    Task<DocumentObjectReference?> FindByAddressAsync(string container, string blobName, CancellationToken cancellationToken);
    Task DeleteContentIfExistsAsync(DocumentObjectReference document, CancellationToken cancellationToken);
}
