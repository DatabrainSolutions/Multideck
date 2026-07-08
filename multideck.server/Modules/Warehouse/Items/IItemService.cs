using System.Security.Claims;

namespace Multideck.Server.Modules.Warehouse.Items;

public interface IItemService
{
    Task<IReadOnlyList<ItemDto>> ListAsync(ClaimsPrincipal user, Guid? facilityId, string? search, bool includeInactive, CancellationToken cancellationToken);
    Task<ItemDto> GetAsync(ClaimsPrincipal user, Guid itemId, CancellationToken cancellationToken);
    Task<ItemDto> CreateAsync(ClaimsPrincipal user, CreateItemRequest request, CancellationToken cancellationToken);
    Task<ItemDto> UpdateAsync(ClaimsPrincipal user, Guid itemId, UpdateItemRequest request, CancellationToken cancellationToken);
    Task DeleteAsync(ClaimsPrincipal user, Guid itemId, CancellationToken cancellationToken);
    Task<ItemReferenceResponse> GetReferenceAsync(ClaimsPrincipal user, CancellationToken cancellationToken);
    Task<ImportItemsResponse> ImportAsync(ClaimsPrincipal user, Guid customerOrgId, Guid facilityId, IReadOnlyList<ImportItemRow> rows, CancellationToken cancellationToken);
}
