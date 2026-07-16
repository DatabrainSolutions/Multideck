using System.ComponentModel;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Server.Modules.Warehouse;

namespace Multideck.Server.Modules.AgentDexter;

internal sealed class WarehouseDexterTools(MultideckContext db, WarehouseUser current)
{
    private readonly SemaphoreSlim queryGate = new(1, 1);

    [Description("Get a concise operational overview of the user's warehouse estate, including open orders, tasks, exceptions, and held stock.")]
    public async Task<WarehouseOverviewResult> GetOverviewAsync(CancellationToken cancellationToken = default)
    {
        await queryGate.WaitAsync(cancellationToken);
        try
        {
            var facilities = CompanyFacilities();
            var activeFacilities = await facilities.CountAsync(facility => facility.WmsfacilityIsActive, cancellationToken);
            var openOrders = await db.WmsOrders.AsNoTracking().CountAsync(order =>
                !order.WmsorderIsDeleted &&
                order.WmsorderFacility.WmsfacilityOrgOffice != null &&
                order.WmsorderFacility.WmsfacilityOrgOffice.CompanyId == current.CompanyId &&
                order.WmsorderStatusCodeNavigation.WmsorderStatusIsOpen,
                cancellationToken);
            var openTasks = await db.WmsTasks.AsNoTracking().CountAsync(task =>
                task.WmstaskFacility.WmsfacilityOrgOffice != null &&
                task.WmstaskFacility.WmsfacilityOrgOffice.CompanyId == current.CompanyId &&
                task.WmstaskStatusCodeNavigation.WmstaskStatusIsOpen,
                cancellationToken);
            var openExceptions = await db.WmsExceptions.AsNoTracking().CountAsync(exception =>
                exception.WmsexceptionResolvedAt == null &&
                exception.WmsexceptionFacility.WmsfacilityOrgOffice != null &&
                exception.WmsexceptionFacility.WmsfacilityOrgOffice.CompanyId == current.CompanyId,
                cancellationToken);
            var heldStock = await db.WmsInventoryBalances.AsNoTracking()
                .Where(balance =>
                    balance.WmsbalanceFacility.WmsfacilityOrgOffice != null &&
                    balance.WmsbalanceFacility.WmsfacilityOrgOffice.CompanyId == current.CompanyId)
                .SumAsync(balance => balance.WmsbalanceHeldQuantity, cancellationToken);

            return new WarehouseOverviewResult(activeFacilities, openOrders, openTasks, openExceptions, heldStock);
        }
        finally
        {
            queryGate.Release();
        }
    }

    [Description("Search warehouse orders. Use this for inbound/outbound workload, late or open orders, customer references, containers, and release-gate questions.")]
    public async Task<IReadOnlyList<WarehouseOrderResult>> SearchOrdersAsync(
        [Description("Order number, customer name, customer reference, container number, or free-text search. Leave empty for all relevant orders.")] string? search = null,
        [Description("When true, return only orders whose configured status is open.")] bool openOnly = true,
        [Description("Maximum rows to return, from 1 to 25.")] int take = 10,
        CancellationToken cancellationToken = default)
    {
        await queryGate.WaitAsync(cancellationToken);
        try
        {
            var query = db.WmsOrders.AsNoTracking().Where(order =>
                !order.WmsorderIsDeleted &&
                order.WmsorderFacility.WmsfacilityOrgOffice != null &&
                order.WmsorderFacility.WmsfacilityOrgOffice.CompanyId == current.CompanyId);

            if (openOnly)
            {
                query = query.Where(order => order.WmsorderStatusCodeNavigation.WmsorderStatusIsOpen);
            }

            var term = search?.Trim();
            if (!string.IsNullOrWhiteSpace(term))
            {
                var pattern = $"%{term}%";
                query = query.Where(order =>
                    EF.Functions.ILike(order.WmsorderOrderNumber, pattern) ||
                    EF.Functions.ILike(order.WmsorderCustomerOrg.OrgName, pattern) ||
                    (order.WmsorderCustomerReference != null && EF.Functions.ILike(order.WmsorderCustomerReference, pattern)) ||
                    (order.WmsorderContainerNumber != null && EF.Functions.ILike(order.WmsorderContainerNumber, pattern)));
            }

            return await query
                .OrderBy(order => order.WmsorderRequestedDate ?? DateOnly.MaxValue)
                .ThenByDescending(order => order.WmsorderUpdatedAt)
                .Take(Math.Clamp(take, 1, 25))
                .Select(order => new WarehouseOrderResult(
                    order.WmsorderOrderNumber,
                    order.WmsorderTypeCode,
                    order.WmsorderStatusCode,
                    order.WmsorderPriorityCode,
                    order.WmsorderFacility.WmsfacilityCode,
                    order.WmsorderFacility.WmsfacilityName,
                    order.WmsorderCustomerOrg.OrgName,
                    order.WmsorderCustomerReference,
                    order.WmsorderRequestedDate,
                    order.WmsorderContainerNumber,
                    order.WmsorderReleaseGateStatusCode,
                    order.WmsOrderLines.Count,
                    order.WmsExceptions.Count(exception => exception.WmsexceptionResolvedAt == null)))
                .ToListAsync(cancellationToken);
        }
        finally
        {
            queryGate.Release();
        }
    }

    [Description("Search current warehouse inventory balances by SKU, description, location, lot, batch, customer, or facility.")]
    public async Task<WarehouseInventorySearchResult> SearchInventoryAsync(
        [Description("SKU, item description, location, lot, batch, or customer. Leave empty when the operator only named a facility.")] string? search = null,
        [Description("Optional facility code or facility name. Use this when the operator names a warehouse.")] string? facility = null,
        [Description("When true, return only balances with held quantity greater than zero.")] bool heldOnly = false,
        [Description("Maximum rows to return, from 1 to 25.")] int take = 10,
        CancellationToken cancellationToken = default)
    {
        await queryGate.WaitAsync(cancellationToken);
        try
        {
            var query = db.WmsInventoryBalances.AsNoTracking().Where(balance =>
                balance.WmsbalanceFacility.WmsfacilityOrgOffice != null &&
                balance.WmsbalanceFacility.WmsfacilityOrgOffice.CompanyId == current.CompanyId &&
                !balance.WmsbalanceFacility.WmsfacilityIsDeleted &&
                !balance.WmsbalanceItem.WmsitemIsDeleted);

            if (heldOnly)
            {
                query = query.Where(balance => balance.WmsbalanceHeldQuantity > 0);
            }

            var facilityTerm = facility?.Trim();
            if (!string.IsNullOrWhiteSpace(facilityTerm))
            {
                var facilityPattern = $"%{facilityTerm}%";
                query = query.Where(balance =>
                    EF.Functions.ILike(balance.WmsbalanceFacility.WmsfacilityCode, facilityPattern) ||
                    EF.Functions.ILike(balance.WmsbalanceFacility.WmsfacilityName, facilityPattern));
            }

            var term = search?.Trim();
            if (!string.IsNullOrWhiteSpace(term))
            {
                var pattern = $"%{term}%";
                query = query.Where(balance =>
                    EF.Functions.ILike(balance.WmsbalanceItem.WmsitemSku, pattern) ||
                    EF.Functions.ILike(balance.WmsbalanceItem.WmsitemDescription, pattern) ||
                    EF.Functions.ILike(balance.WmsbalanceFacility.WmsfacilityCode, pattern) ||
                    EF.Functions.ILike(balance.WmsbalanceFacility.WmsfacilityName, pattern) ||
                    (balance.WmsbalanceCustomerOrg != null && EF.Functions.ILike(balance.WmsbalanceCustomerOrg.OrgName, pattern)) ||
                    (balance.WmsbalanceLocation != null && EF.Functions.ILike(balance.WmsbalanceLocation.WmslocationCode, pattern)) ||
                    (balance.WmsbalanceLot != null &&
                        (EF.Functions.ILike(balance.WmsbalanceLot.WmslotLotNumber, pattern) ||
                         (balance.WmsbalanceLot.WmslotBatchNumber != null && EF.Functions.ILike(balance.WmsbalanceLot.WmslotBatchNumber, pattern)))));
            }

            var totalBalanceRows = await query.CountAsync(cancellationToken);
            var distinctSkuCount = await query
                .Select(balance => balance.WmsbalanceItem.WmsitemSku)
                .Distinct()
                .CountAsync(cancellationToken);
            var balances = await query
                .OrderByDescending(balance => balance.WmsbalanceUpdatedAt)
                .Take(Math.Clamp(take, 1, 25))
                .Select(balance => new WarehouseInventoryResult(
                    balance.WmsbalanceItem.WmsitemSku,
                    balance.WmsbalanceItem.WmsitemDescription,
                    balance.WmsbalanceFacility.WmsfacilityCode,
                    balance.WmsbalanceLocation != null ? balance.WmsbalanceLocation.WmslocationCode : null,
                    balance.WmsbalanceLot != null ? balance.WmsbalanceLot.WmslotLotNumber : null,
                    balance.WmsbalanceCustomerOrg != null ? balance.WmsbalanceCustomerOrg.OrgName : null,
                    balance.WmsbalanceInventoryStatusCode,
                    balance.WmsbalanceCustomsStatusCode,
                    balance.WmsbalanceOnHandQuantity,
                    balance.WmsbalanceAvailableQuantity,
                    balance.WmsbalanceReservedQuantity,
                    balance.WmsbalanceHeldQuantity,
                    balance.WmsbalanceUomcode,
                    balance.WmsbalanceIsBonded,
                    balance.WmsbalanceLastMovementAt))
                .ToListAsync(cancellationToken);

            return new WarehouseInventorySearchResult(
                totalBalanceRows,
                distinctSkuCount,
                balances.Count,
                balances);
        }
        finally
        {
            queryGate.Release();
        }
    }

    [Description("Find unresolved warehouse exceptions and operational risks, optionally filtered by severity or free text.")]
    public async Task<IReadOnlyList<WarehouseExceptionResult>> FindExceptionsAsync(
        [Description("Optional severity code such as high, medium, or low.")] string? severity = null,
        [Description("Optional title, description, order number, facility, or customer search.")] string? search = null,
        [Description("Maximum rows to return, from 1 to 25.")] int take = 10,
        CancellationToken cancellationToken = default)
    {
        await queryGate.WaitAsync(cancellationToken);
        try
        {
            var query = db.WmsExceptions.AsNoTracking().Where(exception =>
                exception.WmsexceptionResolvedAt == null &&
                exception.WmsexceptionFacility.WmsfacilityOrgOffice != null &&
                exception.WmsexceptionFacility.WmsfacilityOrgOffice.CompanyId == current.CompanyId);

            if (!string.IsNullOrWhiteSpace(severity))
            {
                query = query.Where(exception => exception.WmsexceptionSeverityCode == severity.Trim().ToLower());
            }

            var term = search?.Trim();
            if (!string.IsNullOrWhiteSpace(term))
            {
                var pattern = $"%{term}%";
                query = query.Where(exception =>
                    EF.Functions.ILike(exception.WmsexceptionTitle, pattern) ||
                    (exception.WmsexceptionDescription != null && EF.Functions.ILike(exception.WmsexceptionDescription, pattern)) ||
                    EF.Functions.ILike(exception.WmsexceptionFacility.WmsfacilityCode, pattern) ||
                    (exception.WmsexceptionOrder != null && EF.Functions.ILike(exception.WmsexceptionOrder.WmsorderOrderNumber, pattern)) ||
                    (exception.WmsexceptionOrder != null && EF.Functions.ILike(exception.WmsexceptionOrder.WmsorderCustomerOrg.OrgName, pattern)));
            }

            return await query
                .OrderByDescending(exception => exception.WmsexceptionRaisedAt)
                .Take(Math.Clamp(take, 1, 25))
                .Select(exception => new WarehouseExceptionResult(
                    exception.WmsexceptionTitle,
                    exception.WmsexceptionTypeCode,
                    exception.WmsexceptionSeverityCode,
                    exception.WmsexceptionStatusCode,
                    exception.WmsexceptionFacility.WmsfacilityCode,
                    exception.WmsexceptionOrder != null ? exception.WmsexceptionOrder.WmsorderOrderNumber : null,
                    exception.WmsexceptionOrder != null ? exception.WmsexceptionOrder.WmsorderCustomerOrg.OrgName : null,
                    exception.WmsexceptionDescription,
                    exception.WmsexceptionRaisedAt))
                .ToListAsync(cancellationToken);
        }
        finally
        {
            queryGate.Release();
        }
    }

    [Description("Get the latest physical inventory movements for operational traceability.")]
    public async Task<IReadOnlyList<WarehouseMovementResult>> GetRecentMovementsAsync(
        [Description("Optional warehouse facility code.")] string? facilityCode = null,
        [Description("Maximum rows to return, from 1 to 25.")] int take = 10,
        CancellationToken cancellationToken = default)
    {
        await queryGate.WaitAsync(cancellationToken);
        try
        {
            var query = db.WmsInventoryTransactions.AsNoTracking().Where(transaction =>
                transaction.WmstransactionFacility.WmsfacilityOrgOffice != null &&
                transaction.WmstransactionFacility.WmsfacilityOrgOffice.CompanyId == current.CompanyId);

            if (!string.IsNullOrWhiteSpace(facilityCode))
            {
                query = query.Where(transaction => transaction.WmstransactionFacility.WmsfacilityCode == facilityCode.Trim());
            }

            return await query
                .OrderByDescending(transaction => transaction.WmstransactionCreatedAt)
                .Take(Math.Clamp(take, 1, 25))
                .Select(transaction => new WarehouseMovementResult(
                    transaction.WmstransactionCreatedAt,
                    transaction.WmstransactionFacility.WmsfacilityCode,
                    transaction.WmstransactionItem.WmsitemSku,
                    transaction.WmstransactionTypeCode,
                    transaction.WmstransactionQuantity,
                    transaction.WmstransactionUomcode,
                    transaction.WmstransactionFromLocation != null ? transaction.WmstransactionFromLocation.WmslocationCode : null,
                    transaction.WmstransactionToLocation != null ? transaction.WmstransactionToLocation.WmslocationCode : null,
                    transaction.WmstransactionReference))
                .ToListAsync(cancellationToken);
        }
        finally
        {
            queryGate.Release();
        }
    }

    private IQueryable<Multideck.Persistence.Entities.WmsFacility> CompanyFacilities() =>
        db.WmsFacilities.AsNoTracking().Where(facility =>
            !facility.WmsfacilityIsDeleted &&
            facility.WmsfacilityOrgOffice != null &&
            facility.WmsfacilityOrgOffice.CompanyId == current.CompanyId);
}

internal sealed record WarehouseOverviewResult(
    int ActiveFacilities,
    int OpenOrders,
    int OpenTasks,
    int OpenExceptions,
    decimal HeldStockQuantity);

internal sealed record WarehouseOrderResult(
    string OrderNumber,
    string Type,
    string Status,
    string Priority,
    string FacilityCode,
    string FacilityName,
    string Customer,
    string? CustomerReference,
    DateOnly? RequestedDate,
    string? ContainerNumber,
    string ReleaseGateStatus,
    int LineCount,
    int OpenExceptionCount);

internal sealed record WarehouseInventoryResult(
    string Sku,
    string Description,
    string FacilityCode,
    string? LocationCode,
    string? LotNumber,
    string? Customer,
    string InventoryStatus,
    string CustomsStatus,
    decimal OnHand,
    decimal Available,
    decimal Reserved,
    decimal Held,
    string Uom,
    bool IsBonded,
    DateTime? LastMovementAt);

internal sealed record WarehouseInventorySearchResult(
    int TotalBalanceRows,
    int DistinctSkuCount,
    int ReturnedBalanceRows,
    IReadOnlyList<WarehouseInventoryResult> Balances);

internal sealed record WarehouseExceptionResult(
    string Title,
    string Type,
    string Severity,
    string Status,
    string FacilityCode,
    string? OrderNumber,
    string? Customer,
    string? Description,
    DateTime RaisedAt);

internal sealed record WarehouseMovementResult(
    DateTime OccurredAt,
    string FacilityCode,
    string Sku,
    string MovementType,
    decimal Quantity,
    string Uom,
    string? FromLocation,
    string? ToLocation,
    string? Reference);
