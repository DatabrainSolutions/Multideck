using System.Security.Claims;

namespace Multideck.Server.Modules.Warehouse.Inventory;

public interface IInventoryService
{
    Task<IReadOnlyList<InventoryBalanceDto>> ListBalancesAsync(
        ClaimsPrincipal user,
        Guid? facilityId,
        Guid? itemId,
        string? search,
        bool includeZero,
        CancellationToken cancellationToken);

    Task<IReadOnlyList<InventoryMovementDto>> ListMovementsAsync(
        ClaimsPrincipal user,
        Guid? facilityId,
        Guid? itemId,
        string? search,
        int take,
        CancellationToken cancellationToken);
}
