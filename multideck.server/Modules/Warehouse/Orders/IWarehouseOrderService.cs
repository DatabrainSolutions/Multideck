using System.Security.Claims;

namespace Multideck.Server.Modules.Warehouse.Orders;

public interface IWarehouseOrderService
{
    Task<IReadOnlyList<WarehouseOrderDto>> ListAsync(ClaimsPrincipal user, Guid? facilityId, string? typeCode, string? statusCode, bool openOnly, string? search, CancellationToken cancellationToken);
    Task<WarehouseOrderDto> GetAsync(ClaimsPrincipal user, Guid orderId, CancellationToken cancellationToken);
    Task<WarehouseOrderReferenceResponse> GetReferenceAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<WarehouseOrderDto> CreateAsync(ClaimsPrincipal user, CreateWarehouseOrderRequest request, CancellationToken cancellationToken);
    Task<WarehouseOrderDto> ReceiveAsync(ClaimsPrincipal user, Guid orderId, ReceiveWarehouseOrderRequest request, CancellationToken cancellationToken);
    Task<WarehouseOrderDto> DispatchAsync(ClaimsPrincipal user, Guid orderId, DispatchWarehouseOrderRequest request, CancellationToken cancellationToken);
    Task<WarehouseOrderDto> CancelAsync(ClaimsPrincipal user, Guid orderId, CancellationToken cancellationToken);
}
