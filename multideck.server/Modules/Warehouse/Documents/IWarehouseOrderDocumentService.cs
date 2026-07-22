using System.Security.Claims;

namespace Multideck.Server.Modules.Warehouse.Documents;

public interface IWarehouseOrderDocumentService
{
    Task<IReadOnlyList<WarehouseOrderDocumentDto>> ListAsync(ClaimsPrincipal principal, Guid orderId, CancellationToken cancellationToken);
    Task<WarehouseOrderDocumentDto> UploadAsync(ClaimsPrincipal principal, Guid orderId, IFormFile file, string? documentTypeCode, CancellationToken cancellationToken);
    Task<WarehouseDocumentContent> DownloadAsync(ClaimsPrincipal principal, Guid orderId, Guid documentId, CancellationToken cancellationToken);
    Task<WarehouseDocumentReadUrlDto> CreateReadUrlAsync(ClaimsPrincipal principal, Guid orderId, Guid documentId, CancellationToken cancellationToken);
    Task<WarehouseOrderDocumentDto> ReviewAsync(ClaimsPrincipal principal, Guid orderId, Guid documentId, ReviewWarehouseDocumentRequest request, CancellationToken cancellationToken);
}
