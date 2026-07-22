using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;

namespace Multideck.Server.Modules.Warehouse.Inventory;

public sealed class InventoryService(MultideckContext db, IWarehouseContext context) : IInventoryService
{
    public async Task<IReadOnlyList<InventoryBalanceDto>> ListBalancesAsync(
        ClaimsPrincipal user,
        Guid? facilityId,
        Guid? itemId,
        string? search,
        bool includeZero,
        CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentActorAsync(user, cancellationToken);
        if (current.IsCustomer) context.RequireCapability(current, WarehouseCapabilities.InventoryReadOwn);
        var query = db.WmsInventoryBalances
            .AsNoTracking()
            .Where(balance =>
                balance.WmsbalanceFacility.WmsfacilityOrgOffice != null &&
                !balance.WmsbalanceFacility.WmsfacilityIsDeleted &&
                !balance.WmsbalanceItem.WmsitemIsDeleted);

        if (current.IsInternal)
        {
            query = query.Where(balance => balance.WmsbalanceFacility.WmsfacilityOrgOffice!.CompanyId == current.CompanyId);
        }
        else
        {
            var organisationIds = current.OrganisationIds;
            var facilityIds = current.FacilityIds;
            query = query.Where(balance => balance.WmsbalanceCustomerOrgId.HasValue &&
                organisationIds.Contains(balance.WmsbalanceCustomerOrgId.Value) &&
                facilityIds.Contains(balance.WmsbalanceFacilityId));
        }

        if (facilityId.HasValue)
        {
            query = query.Where(balance => balance.WmsbalanceFacilityId == facilityId.Value);
        }

        if (itemId.HasValue)
        {
            query = query.Where(balance => balance.WmsbalanceItemId == itemId.Value);
        }

        if (!includeZero)
        {
            query = query.Where(balance => balance.WmsbalanceOnHandQuantity != 0);
        }

        var term = search?.Trim();
        if (!string.IsNullOrWhiteSpace(term))
        {
            var pattern = $"%{term}%";
            query = query.Where(balance =>
                EF.Functions.ILike(balance.WmsbalanceItem.WmsitemSku, pattern) ||
                EF.Functions.ILike(balance.WmsbalanceItem.WmsitemDescription, pattern) ||
                (balance.WmsbalanceCustomerOrg != null && EF.Functions.ILike(balance.WmsbalanceCustomerOrg.OrgName, pattern)) ||
                EF.Functions.ILike(balance.WmsbalanceFacility.WmsfacilityName, pattern) ||
                EF.Functions.ILike(balance.WmsbalanceInventoryStatusCodeNavigation.WmsinventoryStatusName, pattern) ||
                EF.Functions.ILike(balance.WmsbalanceCustomsStatusCode, pattern) ||
                (balance.WmsbalanceLocation != null && EF.Functions.ILike(balance.WmsbalanceLocation.WmslocationCode, pattern)) ||
                (balance.WmsbalanceLot != null &&
                    (EF.Functions.ILike(balance.WmsbalanceLot.WmslotLotNumber, pattern) ||
                     (balance.WmsbalanceLot.WmslotBatchNumber != null && EF.Functions.ILike(balance.WmsbalanceLot.WmslotBatchNumber, pattern)))));
        }

        return await query
            .OrderBy(balance => balance.WmsbalanceFacility.WmsfacilityName)
            .ThenBy(balance => balance.WmsbalanceItem.WmsitemSku)
            .ThenBy(balance => balance.WmsbalanceLot != null ? balance.WmsbalanceLot.WmslotExpiryDate : null)
            .ThenBy(balance => balance.WmsbalanceLocation != null ? balance.WmsbalanceLocation.WmslocationCode : null)
            .Select(balance => new InventoryBalanceDto(
                balance.WmsbalanceId,
                balance.WmsbalanceFacilityId,
                balance.WmsbalanceFacility.WmsfacilityCode,
                balance.WmsbalanceFacility.WmsfacilityName,
                balance.WmsbalanceCustomerOrgId,
                balance.WmsbalanceCustomerOrg != null ? balance.WmsbalanceCustomerOrg.OrgName : null,
                balance.WmsbalanceItemId,
                balance.WmsbalanceItem.WmsitemSku,
                balance.WmsbalanceItem.WmsitemDescription,
                balance.WmsbalanceLocationId,
                balance.WmsbalanceLocation != null ? balance.WmsbalanceLocation.WmslocationCode : null,
                balance.WmsbalanceLotId,
                balance.WmsbalanceLot != null ? balance.WmsbalanceLot.WmslotLotNumber : null,
                balance.WmsbalanceLot != null ? balance.WmsbalanceLot.WmslotBatchNumber : null,
                balance.WmsbalanceLot != null ? balance.WmsbalanceLot.WmslotManufactureDate : null,
                balance.WmsbalanceLot != null ? balance.WmsbalanceLot.WmslotExpiryDate : null,
                balance.WmsbalanceInventoryStatusCode,
                balance.WmsbalanceInventoryStatusCodeNavigation.WmsinventoryStatusName,
                balance.WmsbalanceCustomsStatusCode,
                balance.WmsbalanceUomcode,
                balance.WmsbalanceOnHandQuantity,
                balance.WmsbalanceReservedQuantity,
                balance.WmsbalanceAllocatedQuantity,
                balance.WmsbalanceHeldQuantity,
                balance.WmsbalanceAvailableQuantity,
                balance.WmsbalanceIsBonded,
                balance.WmsbalanceFirstReceiptAt,
                balance.WmsbalanceLastMovementAt,
                balance.WmsbalanceUpdatedAt))
            .ToListAsync(cancellationToken);
    }

    public async Task<IReadOnlyList<InventoryMovementDto>> ListMovementsAsync(
        ClaimsPrincipal user,
        Guid? facilityId,
        Guid? itemId,
        string? search,
        int take,
        CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentActorAsync(user, cancellationToken);
        if (current.IsCustomer) context.RequireCapability(current, WarehouseCapabilities.InventoryReadOwn);
        var query = db.WmsInventoryTransactions
            .AsNoTracking()
            .Where(transaction =>
                transaction.WmstransactionFacility.WmsfacilityOrgOffice != null);

        if (current.IsInternal)
        {
            query = query.Where(transaction => transaction.WmstransactionFacility.WmsfacilityOrgOffice!.CompanyId == current.CompanyId);
        }
        else
        {
            var organisationIds = current.OrganisationIds;
            var facilityIds = current.FacilityIds;
            query = query.Where(transaction => transaction.WmstransactionCustomerOrgId.HasValue &&
                organisationIds.Contains(transaction.WmstransactionCustomerOrgId.Value) &&
                facilityIds.Contains(transaction.WmstransactionFacilityId));
        }

        if (facilityId.HasValue)
        {
            query = query.Where(transaction => transaction.WmstransactionFacilityId == facilityId.Value);
        }

        if (itemId.HasValue)
        {
            query = query.Where(transaction => transaction.WmstransactionItemId == itemId.Value);
        }

        var term = search?.Trim();
        if (!string.IsNullOrWhiteSpace(term))
        {
            var pattern = $"%{term}%";
            query = query.Where(transaction =>
                EF.Functions.ILike(transaction.WmstransactionItem.WmsitemSku, pattern) ||
                EF.Functions.ILike(transaction.WmstransactionItem.WmsitemDescription, pattern) ||
                EF.Functions.ILike(transaction.WmstransactionFacility.WmsfacilityName, pattern) ||
                (transaction.WmstransactionReference != null && EF.Functions.ILike(transaction.WmstransactionReference, pattern)) ||
                (transaction.WmstransactionNotes != null && EF.Functions.ILike(transaction.WmstransactionNotes, pattern)) ||
                (transaction.WmstransactionFromLocation != null && EF.Functions.ILike(transaction.WmstransactionFromLocation.WmslocationCode, pattern)) ||
                (transaction.WmstransactionToLocation != null && EF.Functions.ILike(transaction.WmstransactionToLocation.WmslocationCode, pattern)) ||
                (transaction.WmstransactionLot != null &&
                    (EF.Functions.ILike(transaction.WmstransactionLot.WmslotLotNumber, pattern) ||
                     (transaction.WmstransactionLot.WmslotBatchNumber != null && EF.Functions.ILike(transaction.WmstransactionLot.WmslotBatchNumber, pattern)))));
        }

        return await query
            .OrderByDescending(transaction => transaction.WmstransactionCreatedAt)
            .Take(Math.Clamp(take, 1, 250))
            .Select(transaction => new InventoryMovementDto(
                transaction.WmstransactionId,
                transaction.WmstransactionFacilityId,
                transaction.WmstransactionFacility.WmsfacilityName,
                transaction.WmstransactionItemId,
                transaction.WmstransactionItem.WmsitemSku,
                transaction.WmstransactionItem.WmsitemDescription,
                transaction.WmstransactionTypeCode,
                transaction.WmstransactionTypeCodeNavigation.WmstransactionTypeName,
                transaction.WmstransactionQuantity,
                transaction.WmstransactionUomcode,
                transaction.WmstransactionFromLocation != null ? transaction.WmstransactionFromLocation.WmslocationCode : null,
                transaction.WmstransactionToLocation != null ? transaction.WmstransactionToLocation.WmslocationCode : null,
                transaction.WmstransactionLot != null ? transaction.WmstransactionLot.WmslotLotNumber : null,
                transaction.WmstransactionLot != null ? transaction.WmstransactionLot.WmslotBatchNumber : null,
                transaction.WmstransactionReference,
                transaction.WmstransactionNotes,
                transaction.WmstransactionCreatedAt))
            .ToListAsync(cancellationToken);
    }
}
