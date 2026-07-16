using System.Security.Claims;
using Microsoft.EntityFrameworkCore;
using Multideck.Persistence;
using Multideck.Persistence.Entities;

namespace Multideck.Server.Modules.Warehouse.Orders;

public sealed class WarehouseOrderService(MultideckContext db, IWarehouseContext context) : IWarehouseOrderService
{
    private const string Inbound = "inbound";
    private const string Outbound = "outbound";
    private const string Available = "available";
    private const string Damaged = "damaged";
    private const string FreeCirculation = "free_circulation";

    public async Task<IReadOnlyList<WarehouseOrderDto>> ListAsync(
        ClaimsPrincipal user,
        Guid? facilityId,
        string? typeCode,
        string? statusCode,
        string? search,
        CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        var query = ScopedOrders(current.CompanyId).AsNoTracking();

        if (facilityId.HasValue) query = query.Where(order => order.WmsorderFacilityId == facilityId.Value);
        if (!string.IsNullOrWhiteSpace(typeCode)) query = query.Where(order => order.WmsorderTypeCode == typeCode.Trim());
        if (!string.IsNullOrWhiteSpace(statusCode)) query = query.Where(order => order.WmsorderStatusCode == statusCode.Trim());

        var term = search?.Trim();
        if (!string.IsNullOrWhiteSpace(term))
        {
            var pattern = $"%{term}%";
            query = query.Where(order =>
                EF.Functions.ILike(order.WmsorderOrderNumber, pattern) ||
                (order.WmsorderCustomerReference != null && EF.Functions.ILike(order.WmsorderCustomerReference, pattern)) ||
                EF.Functions.ILike(order.WmsorderCustomerOrg.OrgName, pattern) ||
                order.WmsOrderLines.Any(line => EF.Functions.ILike(line.WmsorderLineItem.WmsitemSku, pattern)));
        }

        var orders = await IncludeOrderGraph(query)
            .OrderByDescending(order => order.WmsorderCreatedAt)
            .Take(500)
            .ToListAsync(cancellationToken);

        return orders.Select(ToDto).ToList();
    }

    public async Task<WarehouseOrderDto> GetAsync(ClaimsPrincipal user, Guid orderId, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        var order = await LoadScopedAsync(current.CompanyId, orderId, trackChanges: false, cancellationToken);
        return ToDto(order);
    }

    public async Task<WarehouseOrderReferenceResponse> GetReferenceAsync(ClaimsPrincipal user, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);

        var facilities = await db.WmsFacilities
            .AsNoTracking()
            .Where(facility =>
                !facility.WmsfacilityIsDeleted && facility.WmsfacilityIsActive &&
                facility.WmsfacilityOrgOffice != null && facility.WmsfacilityOrgOffice.CompanyId == current.CompanyId)
            .OrderBy(facility => facility.WmsfacilityName)
            .Select(facility => new WarehouseOrderFacilityOption(facility.WmsfacilityId, facility.WmsfacilityOrgOfficeId, facility.WmsfacilityCode, facility.WmsfacilityName))
            .ToListAsync(cancellationToken);

        var customers = await db.OrgMasters
            .AsNoTracking()
            .OrderBy(org => org.OrgName)
            .Select(org => new WarehouseOrderCustomerOption(org.OrgId, org.OrgName))
            .ToListAsync(cancellationToken);

        var items = await db.WmsItems
            .AsNoTracking()
            .Where(item =>
                !item.WmsitemIsDeleted && item.WmsitemIsActive &&
                item.WmsitemDefaultFacility != null &&
                item.WmsitemDefaultFacility.WmsfacilityOrgOffice != null &&
                item.WmsitemDefaultFacility.WmsfacilityOrgOffice.CompanyId == current.CompanyId)
            .OrderBy(item => item.WmsitemSku)
            .Select(item => new WarehouseOrderItemOption(
                item.WmsitemId,
                item.WmsitemCustomerOrgId,
                item.WmsitemDefaultFacilityId,
                item.WmsitemSku,
                item.WmsitemDescription,
                item.WmsitemBaseUomcode,
                item.WmsitemRequiresLot,
                item.WmsitemRequiresExpiry))
            .ToListAsync(cancellationToken);

        var locations = await db.WmsLocations
            .AsNoTracking()
            .Where(location =>
                !location.WmslocationIsDeleted && location.WmslocationIsActive &&
                location.WmslocationFacility.WmsfacilityOrgOffice != null &&
                location.WmslocationFacility.WmsfacilityOrgOffice.CompanyId == current.CompanyId)
            .OrderBy(location => location.WmslocationCode)
            .Select(location => new WarehouseOrderLocationOption(
                location.WmslocationId,
                location.WmslocationFacilityId,
                location.WmslocationCode,
                location.WmslocationZone != null ? location.WmslocationZone.WmszoneName : null))
            .ToListAsync(cancellationToken);

        var types = await db.SysWmsorderTypes
            .AsNoTracking()
            .Where(type => type.WmsorderTypeIsActive && (type.WmsorderTypeCode == Inbound || type.WmsorderTypeCode == Outbound))
            .OrderBy(type => type.WmsorderTypeSortOrder)
            .Select(type => new WarehouseOrderTypeOption(type.WmsorderTypeCode, type.WmsorderTypeName, type.WmsorderTypeDirectionCode))
            .ToListAsync(cancellationToken);

        var statuses = await db.SysWmsorderStatuses
            .AsNoTracking()
            .Where(status => status.WmsorderStatusIsActive)
            .OrderBy(status => status.WmsorderStatusSortOrder)
            .Select(status => new WarehouseOrderStatusOption(status.WmsorderStatusCode, status.WmsorderStatusName, status.WmsorderStatusIsOpen, status.WmsorderStatusIsFinal))
            .ToListAsync(cancellationToken);

        var customsStatuses = await db.SysWmscustomsStatuses
            .AsNoTracking()
            .Where(status => status.WmscustomsStatusIsActive)
            .OrderBy(status => status.WmscustomsStatusSortOrder)
            .Select(status => new WarehouseCustomsStatusOption(status.WmscustomsStatusCode, status.WmscustomsStatusName, status.WmscustomsStatusIsDutySuspended))
            .ToListAsync(cancellationToken);

        return new WarehouseOrderReferenceResponse(facilities, customers, items, locations, types, statuses, customsStatuses);
    }

    public async Task<WarehouseOrderDto> CreateAsync(ClaimsPrincipal user, CreateWarehouseOrderRequest request, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        var facility = await RequireFacilityAsync(current.CompanyId, request.FacilityId, cancellationToken);
        await RequireCustomerAsync(request.CustomerOrgId, cancellationToken);

        var typeCode = request.TypeCode.Trim().ToLowerInvariant();
        if (typeCode is not (Inbound or Outbound))
        {
            throw WarehouseException.BadRequest("Warehouse orders must be inbound or outbound.");
        }

        await RequireLookupAsync(db.SysWmsorderTypes.AnyAsync(type => type.WmsorderTypeCode == typeCode && type.WmsorderTypeIsActive, cancellationToken), "The selected order type is not available.");
        await RequireLookupAsync(db.SysWmsorderStatuses.AnyAsync(status => status.WmsorderStatusCode == "booked", cancellationToken), "Warehouse order status reference data is missing.");
        await RequireLookupAsync(db.SysWmsorderLineStatuses.AnyAsync(status => status.WmsorderLineStatusCode == "open", cancellationToken), "Warehouse order-line status reference data is missing.");
        await RequireLookupAsync(db.SysWmsinventoryStatuses.AnyAsync(status => status.WmsinventoryStatusCode == Available, cancellationToken), "Warehouse inventory status reference data is missing.");

        var lineItemIds = request.Lines.Select(line => line.ItemId).Distinct().ToList();
        var items = await db.WmsItems
            .Where(item => lineItemIds.Contains(item.WmsitemId) && !item.WmsitemIsDeleted && item.WmsitemIsActive)
            .ToDictionaryAsync(item => item.WmsitemId, cancellationToken);

        if (items.Count != lineItemIds.Count)
        {
            throw WarehouseException.BadRequest("One or more selected items are not available.");
        }

        var customsCodes = request.Lines.Select(line => Normalize(line.CustomsStatusCode) ?? facility.WmsfacilityDefaultCustomsStatusCode).Distinct().ToList();
        var validCustomsCodes = await db.SysWmscustomsStatuses.Where(status => customsCodes.Contains(status.WmscustomsStatusCode)).Select(status => status.WmscustomsStatusCode).ToListAsync(cancellationToken);
        if (validCustomsCodes.Count != customsCodes.Count) throw WarehouseException.BadRequest("One or more customs statuses are not valid.");

        var locationIds = request.Lines.SelectMany(line => new[] { line.SourceLocationId, line.TargetLocationId }).Where(id => id.HasValue).Select(id => id!.Value).Distinct().ToList();
        await RequireLocationsAsync(request.FacilityId, locationIds, cancellationToken);

        foreach (var line in request.Lines)
        {
            var item = items[line.ItemId];
            if (item.WmsitemCustomerOrgId != request.CustomerOrgId)
            {
                throw WarehouseException.BadRequest($"Item '{item.WmsitemSku}' does not belong to the selected customer.");
            }

            if (item.WmsitemDefaultFacilityId != request.FacilityId)
            {
                throw WarehouseException.BadRequest($"Item '{item.WmsitemSku}' is not assigned to this warehouse.");
            }

            if (typeCode == Inbound && item.WmsitemRequiresLot && string.IsNullOrWhiteSpace(line.LotNumber))
            {
                // The lot may still be supplied during receiving, so no failure here.
            }
        }

        if (typeCode == Outbound)
        {
            await RequireOutboundAvailabilityAsync(request, facility.WmsfacilityDefaultCustomsStatusCode, items, cancellationToken);
        }

        var now = DateTime.UtcNow;
        var orderId = Guid.NewGuid();
        var order = new WmsOrder
        {
            WmsorderId = orderId,
            WmsorderFacilityId = request.FacilityId,
            WmsorderOrgOfficeId = facility.WmsfacilityOrgOfficeId,
            WmsorderCustomerOrgId = request.CustomerOrgId,
            WmsorderOrderNumber = await CreateUniqueNumberAsync(request.FacilityId, typeCode == Inbound ? "IN" : "OUT", cancellationToken),
            WmsorderTypeCode = typeCode,
            WmsorderStatusCode = "booked",
            WmsorderPriorityCode = Normalize(request.PriorityCode) ?? "normal",
            WmsorderCustomerReference = Normalize(request.CustomerReference),
            WmsorderRequestedDate = request.RequestedDate,
            WmsorderAppointmentStartAt = request.AppointmentStartAt,
            WmsorderAppointmentEndAt = request.AppointmentEndAt,
            WmsorderVehicleReg = Normalize(request.VehicleReg),
            WmsorderContainerNumber = Normalize(request.ContainerNumber)?.ToUpperInvariant(),
            WmsorderSealNumber = Normalize(request.SealNumber),
            WmsorderRequiresCustomsRelease = false,
            WmsorderRequiresComplianceRelease = false,
            WmsorderRequiresFinanceRelease = false,
            WmsorderReleaseGateStatusCode = "not_checked",
            WmsorderInstructions = Normalize(request.Instructions),
            WmsorderMetadataJson = "{}",
            WmsorderCreatedAt = now,
            WmsorderCreatedBy = current.UserId,
            WmsorderUpdatedAt = now,
            WmsorderUpdatedBy = current.UserId,
            WmsorderIsDeleted = false,
        };

        for (var index = 0; index < request.Lines.Count; index++)
        {
            var requestLine = request.Lines[index];
            var item = items[requestLine.ItemId];
            order.WmsOrderLines.Add(new WmsOrderLine
            {
                WmsorderLineId = Guid.NewGuid(),
                WmsorderLineLineNo = index + 1,
                WmsorderLineItemId = requestLine.ItemId,
                WmsorderLineStatusCode = "open",
                WmsorderLineOrderedQuantity = requestLine.Quantity,
                WmsorderLineReceivedQuantity = 0,
                WmsorderLineAllocatedQuantity = 0,
                WmsorderLinePickedQuantity = 0,
                WmsorderLinePackedQuantity = 0,
                WmsorderLineDispatchedQuantity = 0,
                WmsorderLineUomcode = Normalize(requestLine.UomCode)?.ToUpperInvariant() ?? item.WmsitemBaseUomcode,
                WmsorderLineLotNumber = Normalize(requestLine.LotNumber),
                WmsorderLineExpiryDate = requestLine.ExpiryDate,
                WmsorderLineSourceLocationId = requestLine.SourceLocationId,
                WmsorderLineTargetLocationId = requestLine.TargetLocationId,
                WmsorderLineInventoryStatusCode = Available,
                WmsorderLineCustomsStatusCode = Normalize(requestLine.CustomsStatusCode) ?? facility.WmsfacilityDefaultCustomsStatusCode,
                WmsorderLineGoodsValue = requestLine.GoodsValue,
                WmsorderLineCurrencyCode = Normalize(requestLine.CurrencyCode)?.ToUpperInvariant(),
                WmsorderLineInstructions = Normalize(requestLine.Instructions),
                WmsorderLineMetadataJson = "{}",
                WmsorderLineCreatedAt = now,
            });
        }

        db.WmsOrders.Add(order);
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(user, orderId, cancellationToken);
    }

    private async Task RequireOutboundAvailabilityAsync(
        CreateWarehouseOrderRequest request,
        string defaultCustomsStatusCode,
        IReadOnlyDictionary<Guid, WmsItem> items,
        CancellationToken cancellationToken)
    {
        var itemIds = items.Keys.ToList();
        var balances = await db.WmsInventoryBalances
            .AsNoTracking()
            .Include(balance => balance.WmsbalanceLocation)
            .Include(balance => balance.WmsbalanceLot)
            .Where(balance =>
                balance.WmsbalanceFacilityId == request.FacilityId &&
                balance.WmsbalanceCustomerOrgId == request.CustomerOrgId &&
                itemIds.Contains(balance.WmsbalanceItemId) &&
                balance.WmsbalanceInventoryStatusCode == Available &&
                balance.WmsbalanceAvailableQuantity > 0)
            .ToListAsync(cancellationToken);

        var remainingByBalanceId = balances.ToDictionary(
            balance => balance.WmsbalanceId,
            balance => balance.WmsbalanceAvailableQuantity);

        var linesBySpecificity = request.Lines
            .Select((line, index) => new { Line = line, Index = index })
            .OrderByDescending(entry =>
                (entry.Line.SourceLocationId.HasValue ? 1 : 0) +
                (!string.IsNullOrWhiteSpace(entry.Line.LotNumber) ? 1 : 0))
            .ThenBy(entry => entry.Index);

        foreach (var entry in linesBySpecificity)
        {
            var line = entry.Line;
            var item = items[line.ItemId];
            var uomCode = Normalize(line.UomCode)?.ToUpperInvariant() ?? item.WmsitemBaseUomcode;
            var customsStatusCode = Normalize(line.CustomsStatusCode) ?? defaultCustomsStatusCode;
            var lotNumber = Normalize(line.LotNumber);
            var eligibleBalances = balances
                .Where(balance =>
                    balance.WmsbalanceItemId == line.ItemId &&
                    string.Equals(balance.WmsbalanceUomcode, uomCode, StringComparison.OrdinalIgnoreCase) &&
                    balance.WmsbalanceCustomsStatusCode == customsStatusCode &&
                    (!line.SourceLocationId.HasValue || balance.WmsbalanceLocationId == line.SourceLocationId) &&
                    (lotNumber is null || string.Equals(balance.WmsbalanceLot?.WmslotLotNumber, lotNumber, StringComparison.OrdinalIgnoreCase)) &&
                    remainingByBalanceId[balance.WmsbalanceId] > 0)
                .OrderBy(balance => balance.WmsbalanceLot?.WmslotExpiryDate)
                .ThenBy(balance => balance.WmsbalanceFirstReceiptAt)
                .ToList();

            var availableQuantity = eligibleBalances.Sum(balance => remainingByBalanceId[balance.WmsbalanceId]);
            if (line.Quantity > availableQuantity)
            {
                var scope = line.SourceLocationId.HasValue ? " at the selected location" : " across this warehouse";
                throw WarehouseException.BadRequest($"Only {availableQuantity:0.######} {uomCode} of '{item.WmsitemSku}' is available{scope}. Reduce the quantity before placing the outbound order.");
            }

            var quantityToAssign = line.Quantity;
            foreach (var balance in eligibleBalances)
            {
                if (quantityToAssign <= 0) break;

                var balanceAvailable = remainingByBalanceId[balance.WmsbalanceId];
                var assignedQuantity = Math.Min(quantityToAssign, balanceAvailable);
                remainingByBalanceId[balance.WmsbalanceId] = balanceAvailable - assignedQuantity;
                quantityToAssign -= assignedQuantity;
            }
        }
    }

    public async Task<WarehouseOrderDto> ReceiveAsync(ClaimsPrincipal user, Guid orderId, ReceiveWarehouseOrderRequest request, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        var strategy = db.Database.CreateExecutionStrategy();
        var receiptId = Guid.NewGuid();

        await strategy.ExecuteInTransactionAsync(
            async () =>
            {
                db.ChangeTracker.Clear();
                var order = await LoadScopedAsync(current.CompanyId, orderId, trackChanges: true, cancellationToken);
                EnsureActionable(order, Inbound, "receive");
                EnsureDistinctLines(request.Lines.Select(line => line.OrderLineId));

                var locationIds = request.Lines.Select(line => line.TargetLocationId).Append(request.ReceivingLocationId).Where(id => id.HasValue).Select(id => id!.Value).Distinct().ToList();
                await RequireLocationsAsync(order.WmsorderFacilityId, locationIds, cancellationToken);
                await RequirePostingLookupsAsync(includeDamaged: request.Lines.Any(line => line.DamagedQuantity > 0), cancellationToken);

                var now = DateTime.UtcNow;
                var receipt = new WmsReceipt
                {
                    WmsreceiptId = receiptId,
                    WmsreceiptFacilityId = order.WmsorderFacilityId,
                    WmsreceiptOrderId = order.WmsorderId,
                    WmsreceiptJobId = order.WmsorderJobId,
                    WmsreceiptReceiptNumber = await CreateUniqueReceiptNumberAsync(order.WmsorderFacilityId, cancellationToken),
                    WmsreceiptStatusCode = "complete",
                    WmsreceiptReceivingLocationId = request.ReceivingLocationId,
                    WmsreceiptReceivedAt = now,
                    WmsreceiptReceivedBy = current.UserId,
                    WmsreceiptHasDiscrepancy = false,
                    WmsreceiptNotes = Normalize(request.Notes),
                    WmsreceiptMetadataJson = "{}",
                    WmsreceiptCreatedAt = now,
                    WmsreceiptCreatedBy = current.UserId,
                };
                db.WmsReceipts.Add(receipt);

                for (var index = 0; index < request.Lines.Count; index++)
                {
                    var input = request.Lines[index];
                    var line = order.WmsOrderLines.FirstOrDefault(candidate => candidate.WmsorderLineId == input.OrderLineId)
                        ?? throw WarehouseException.BadRequest("A received line does not belong to this order.");
                    var outstanding = Math.Max(0, line.WmsorderLineOrderedQuantity - line.WmsorderLineReceivedQuantity);
                    var targetLocationId = input.TargetLocationId ?? line.WmsorderLineTargetLocationId ?? request.ReceivingLocationId;
                    if (!targetLocationId.HasValue) throw WarehouseException.BadRequest($"Choose a receiving location for line {line.WmsorderLineLineNo}.");

                    var lot = await ResolveLotAsync(order, line, input, cancellationToken);
                    var customsStatus = line.WmsorderLineCustomsStatusCode;
                    var goodQuantity = input.Quantity - input.DamagedQuantity;
                    WmsInventoryTransaction? primaryTransaction = null;

                    if (goodQuantity > 0)
                    {
                        primaryTransaction = await PostReceiptBalanceAsync(order, line, receipt, targetLocationId.Value, lot, Available, goodQuantity, input, current.UserId, now, cancellationToken);
                    }

                    if (input.DamagedQuantity > 0)
                    {
                        primaryTransaction ??= await PostReceiptBalanceAsync(order, line, receipt, targetLocationId.Value, lot, Damaged, input.DamagedQuantity, input, current.UserId, now, cancellationToken);
                    }

                    var over = Math.Max(0, input.Quantity - outstanding);
                    var shortQuantity = Math.Max(0, outstanding - input.Quantity);
                    receipt.WmsreceiptHasDiscrepancy |= input.DamagedQuantity > 0 || over > 0;
                    receipt.WmsReceiptLines.Add(new WmsReceiptLine
                    {
                        WmsreceiptLineId = Guid.NewGuid(),
                        WmsreceiptLineOrderLineId = line.WmsorderLineId,
                        WmsreceiptLineItemId = line.WmsorderLineItemId,
                        WmsreceiptLineLineNo = index + 1,
                        WmsreceiptLineExpectedQuantity = outstanding,
                        WmsreceiptLineReceivedQuantity = input.Quantity,
                        WmsreceiptLineDamagedQuantity = input.DamagedQuantity,
                        WmsreceiptLineOverQuantity = over,
                        WmsreceiptLineShortQuantity = shortQuantity,
                        WmsreceiptLineUomcode = line.WmsorderLineUomcode,
                        WmsreceiptLineLotNumber = lot?.WmslotLotNumber,
                        WmsreceiptLineExpiryDate = lot?.WmslotExpiryDate ?? input.ExpiryDate,
                        WmsreceiptLineTargetLocationId = targetLocationId,
                        WmsreceiptLineInventoryTransactionId = primaryTransaction?.WmstransactionId,
                        WmsreceiptLineCustomsStatusCode = customsStatus,
                        WmsreceiptLineCreatedAt = now,
                    });

                    line.WmsorderLineReceivedQuantity += input.Quantity;
                    line.WmsorderLineStatusCode = line.WmsorderLineReceivedQuantity >= line.WmsorderLineOrderedQuantity ? "received" : "open";
                }

                UpdateOrderStatus(order, Inbound, current.UserId, now);
                await db.SaveChangesAsync(cancellationToken);
            },
            async () => await db.WmsReceipts.AsNoTracking().AnyAsync(receipt => receipt.WmsreceiptId == receiptId, cancellationToken));

        return await GetAsync(user, orderId, cancellationToken);
    }

    public async Task<WarehouseOrderDto> DispatchAsync(ClaimsPrincipal user, Guid orderId, DispatchWarehouseOrderRequest request, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        var strategy = db.Database.CreateExecutionStrategy();
        var dispatchId = Guid.NewGuid();

        await strategy.ExecuteInTransactionAsync(
            async () =>
            {
                db.ChangeTracker.Clear();
                var order = await LoadScopedAsync(current.CompanyId, orderId, trackChanges: true, cancellationToken);
                EnsureActionable(order, Outbound, "dispatch");
                EnsureDistinctLines(request.Lines.Select(line => line.OrderLineId));
                await RequirePostingLookupsAsync(includeDamaged: false, cancellationToken);

                var locationIds = request.Lines.Where(line => line.SourceLocationId.HasValue).Select(line => line.SourceLocationId!.Value).Distinct().ToList();
                await RequireLocationsAsync(order.WmsorderFacilityId, locationIds, cancellationToken);

                var now = DateTime.UtcNow;
                var dispatch = new WmsDispatch
                {
                    WmsdispatchId = dispatchId,
                    WmsdispatchFacilityId = order.WmsorderFacilityId,
                    WmsdispatchOrderId = order.WmsorderId,
                    WmsdispatchJobId = order.WmsorderJobId,
                    WmsdispatchDispatchNumber = await CreateUniqueDispatchNumberAsync(order.WmsorderFacilityId, cancellationToken),
                    WmsdispatchStatusCode = "complete",
                    WmsdispatchCarrierOrgId = order.WmsorderCarrierOrgId,
                    WmsdispatchVehicleReg = Normalize(request.VehicleReg) ?? order.WmsorderVehicleReg,
                    WmsdispatchContainerNumber = Normalize(request.ContainerNumber)?.ToUpperInvariant() ?? order.WmsorderContainerNumber,
                    WmsdispatchSealNumber = Normalize(request.SealNumber) ?? order.WmsorderSealNumber,
                    WmsdispatchDispatchedAt = now,
                    WmsdispatchDispatchedBy = current.UserId,
                    WmsdispatchMetadataJson = string.IsNullOrWhiteSpace(request.Notes) ? "{}" : System.Text.Json.JsonSerializer.Serialize(new { notes = request.Notes.Trim() }),
                    WmsdispatchCreatedAt = now,
                };
                db.WmsDispatches.Add(dispatch);

                foreach (var input in request.Lines)
                {
                    var line = order.WmsOrderLines.FirstOrDefault(candidate => candidate.WmsorderLineId == input.OrderLineId)
                        ?? throw WarehouseException.BadRequest("A dispatch line does not belong to this order.");
                    var outstanding = Math.Max(0, line.WmsorderLineOrderedQuantity - line.WmsorderLineDispatchedQuantity);
                    if (input.Quantity > outstanding)
                    {
                        throw WarehouseException.BadRequest($"Line {line.WmsorderLineLineNo} only has {outstanding:0.######} {line.WmsorderLineUomcode} left to dispatch.");
                    }

                    var balancesQuery = db.WmsInventoryBalances
                        .Where(balance =>
                            balance.WmsbalanceFacilityId == order.WmsorderFacilityId &&
                            balance.WmsbalanceCustomerOrgId == order.WmsorderCustomerOrgId &&
                            balance.WmsbalanceItemId == line.WmsorderLineItemId &&
                            balance.WmsbalanceInventoryStatusCode == Available &&
                            balance.WmsbalanceCustomsStatusCode == line.WmsorderLineCustomsStatusCode &&
                            balance.WmsbalanceAvailableQuantity > 0);

                    var sourceLocationId = input.SourceLocationId ?? line.WmsorderLineSourceLocationId;
                    if (sourceLocationId.HasValue) balancesQuery = balancesQuery.Where(balance => balance.WmsbalanceLocationId == sourceLocationId.Value);
                    if (input.LotId.HasValue) balancesQuery = balancesQuery.Where(balance => balance.WmsbalanceLotId == input.LotId.Value);
                    else if (!string.IsNullOrWhiteSpace(line.WmsorderLineLotNumber)) balancesQuery = balancesQuery.Where(balance => balance.WmsbalanceLot != null && balance.WmsbalanceLot.WmslotLotNumber == line.WmsorderLineLotNumber);

                    var balances = await balancesQuery
                        .Include(balance => balance.WmsbalanceLot)
                        .OrderBy(balance => balance.WmsbalanceLot != null ? balance.WmsbalanceLot.WmslotExpiryDate : null)
                        .ThenBy(balance => balance.WmsbalanceFirstReceiptAt)
                        .ToListAsync(cancellationToken);

                    if (balances.Sum(balance => balance.WmsbalanceAvailableQuantity) < input.Quantity)
                    {
                        throw WarehouseException.Conflict($"There is not enough available stock to dispatch {input.Quantity:0.######} {line.WmsorderLineUomcode} of {line.WmsorderLineItem.WmsitemSku}.");
                    }

                    var remaining = input.Quantity;
                    foreach (var balance in balances)
                    {
                        if (remaining <= 0) break;
                        var quantity = Math.Min(remaining, balance.WmsbalanceAvailableQuantity);
                        var before = balance.WmsbalanceOnHandQuantity;
                        balance.WmsbalanceOnHandQuantity -= quantity;
                        balance.WmsbalanceAvailableQuantity = CalculateAvailable(balance);
                        balance.WmsbalanceLastMovementAt = now;
                        balance.WmsbalanceUpdatedAt = now;

                        db.WmsInventoryTransactions.Add(new WmsInventoryTransaction
                        {
                            WmstransactionId = Guid.NewGuid(),
                            WmstransactionFacilityId = order.WmsorderFacilityId,
                            WmstransactionBalanceId = balance.WmsbalanceId,
                            WmstransactionTypeCode = "dispatch",
                            WmstransactionItemId = line.WmsorderLineItemId,
                            WmstransactionCustomerOrgId = order.WmsorderCustomerOrgId,
                            WmstransactionFromLocationId = balance.WmsbalanceLocationId,
                            WmstransactionLotId = balance.WmsbalanceLotId,
                            WmstransactionQuantity = quantity,
                            WmstransactionUomcode = line.WmsorderLineUomcode,
                            WmstransactionBeforeOnHandQuantity = before,
                            WmstransactionAfterOnHandQuantity = balance.WmsbalanceOnHandQuantity,
                            WmstransactionInventoryStatusCode = balance.WmsbalanceInventoryStatusCode,
                            WmstransactionCustomsStatusCode = balance.WmsbalanceCustomsStatusCode,
                            WmstransactionOrderId = order.WmsorderId,
                            WmstransactionOrderLineId = line.WmsorderLineId,
                            WmstransactionSourceTable = "WMS_Dispatches",
                            WmstransactionSourceId = dispatch.WmsdispatchId,
                            WmstransactionReference = dispatch.WmsdispatchDispatchNumber,
                            WmstransactionNotes = Normalize(request.Notes),
                            WmstransactionMetadataJson = "{}",
                            WmstransactionCreatedAt = now,
                            WmstransactionCreatedBy = current.UserId,
                        });
                        remaining -= quantity;
                    }

                    line.WmsorderLineAllocatedQuantity = Math.Max(line.WmsorderLineAllocatedQuantity, line.WmsorderLineDispatchedQuantity + input.Quantity);
                    line.WmsorderLinePickedQuantity = Math.Max(line.WmsorderLinePickedQuantity, line.WmsorderLineDispatchedQuantity + input.Quantity);
                    line.WmsorderLinePackedQuantity = Math.Max(line.WmsorderLinePackedQuantity, line.WmsorderLineDispatchedQuantity + input.Quantity);
                    line.WmsorderLineDispatchedQuantity += input.Quantity;
                    line.WmsorderLineStatusCode = line.WmsorderLineDispatchedQuantity >= line.WmsorderLineOrderedQuantity ? "dispatched" : "open";
                }

                UpdateOrderStatus(order, Outbound, current.UserId, now);
                await db.SaveChangesAsync(cancellationToken);
            },
            async () => await db.WmsDispatches.AsNoTracking().AnyAsync(dispatch => dispatch.WmsdispatchId == dispatchId, cancellationToken));

        return await GetAsync(user, orderId, cancellationToken);
    }

    public async Task<WarehouseOrderDto> CancelAsync(ClaimsPrincipal user, Guid orderId, CancellationToken cancellationToken)
    {
        var current = await context.RequireCurrentUserAsync(user, cancellationToken);
        var order = await LoadScopedAsync(current.CompanyId, orderId, trackChanges: true, cancellationToken);
        if (order.WmsorderStatusCode is "complete" or "cancelled") throw WarehouseException.Conflict("This order is already final.");
        if (order.WmsOrderLines.Any(line => line.WmsorderLineReceivedQuantity > 0 || line.WmsorderLineDispatchedQuantity > 0))
        {
            throw WarehouseException.Conflict("An order with posted stock movements cannot be cancelled.");
        }

        order.WmsorderStatusCode = "cancelled";
        order.WmsorderUpdatedAt = DateTime.UtcNow;
        order.WmsorderUpdatedBy = current.UserId;
        foreach (var line in order.WmsOrderLines) line.WmsorderLineStatusCode = "cancelled";
        await db.SaveChangesAsync(cancellationToken);
        return await GetAsync(user, orderId, cancellationToken);
    }

    private IQueryable<WmsOrder> ScopedOrders(Guid companyId) => db.WmsOrders.Where(order =>
        !order.WmsorderIsDeleted &&
        order.WmsorderFacility.WmsfacilityOrgOffice != null &&
        order.WmsorderFacility.WmsfacilityOrgOffice.CompanyId == companyId);

    private static IQueryable<WmsOrder> IncludeOrderGraph(IQueryable<WmsOrder> query) => query
        .Include(order => order.WmsorderFacility).ThenInclude(facility => facility.WmsfacilityOrgOffice)
        .Include(order => order.WmsorderCustomerOrg)
        .Include(order => order.WmsorderTypeCodeNavigation)
        .Include(order => order.WmsorderStatusCodeNavigation)
        .Include(order => order.WmsOrderLines).ThenInclude(line => line.WmsorderLineItem)
        .Include(order => order.WmsOrderLines).ThenInclude(line => line.WmsorderLineSourceLocation)
        .Include(order => order.WmsOrderLines).ThenInclude(line => line.WmsorderLineTargetLocation)
        .Include(order => order.WmsReceipts)
        .Include(order => order.WmsDispatches)
        .AsSplitQuery();

    private async Task<WmsOrder> LoadScopedAsync(Guid companyId, Guid orderId, bool trackChanges, CancellationToken cancellationToken)
    {
        var query = IncludeOrderGraph(ScopedOrders(companyId));
        if (!trackChanges) query = query.AsNoTracking();
        return await query.FirstOrDefaultAsync(order => order.WmsorderId == orderId, cancellationToken)
            ?? throw WarehouseException.NotFound("This warehouse order does not exist in your workspace.");
    }

    private async Task<WmsInventoryLot?> ResolveLotAsync(WmsOrder order, WmsOrderLine line, ReceiveWarehouseOrderLineRequest input, CancellationToken cancellationToken)
    {
        var lotNumber = Normalize(input.LotNumber) ?? line.WmsorderLineLotNumber;
        if (line.WmsorderLineItem.WmsitemRequiresLot && string.IsNullOrWhiteSpace(lotNumber))
            throw WarehouseException.BadRequest($"Enter a lot or batch number for {line.WmsorderLineItem.WmsitemSku}.");
        if (line.WmsorderLineItem.WmsitemRequiresExpiry && !input.ExpiryDate.HasValue && !line.WmsorderLineExpiryDate.HasValue)
            throw WarehouseException.BadRequest($"Enter an expiry date for {line.WmsorderLineItem.WmsitemSku}.");
        if (string.IsNullOrWhiteSpace(lotNumber) && string.IsNullOrWhiteSpace(input.BatchNumber)) return null;

        lotNumber ??= input.BatchNumber!.Trim();
        var lot = await db.WmsInventoryLots.FirstOrDefaultAsync(candidate =>
            candidate.WmslotFacilityId == order.WmsorderFacilityId &&
            candidate.WmslotItemId == line.WmsorderLineItemId &&
            candidate.WmslotLotNumber == lotNumber, cancellationToken);

        if (lot is null)
        {
            lot = new WmsInventoryLot
            {
                WmslotId = Guid.NewGuid(),
                WmslotFacilityId = order.WmsorderFacilityId,
                WmslotCustomerOrgId = order.WmsorderCustomerOrgId,
                WmslotItemId = line.WmsorderLineItemId,
                WmslotLotNumber = lotNumber,
                WmslotBatchNumber = Normalize(input.BatchNumber) ?? lotNumber,
                WmslotManufactureDate = input.ManufactureDate,
                WmslotExpiryDate = input.ExpiryDate ?? line.WmsorderLineExpiryDate,
                WmslotCountryOfOriginCode = line.WmsorderLineItem.WmsitemCountryOfOriginCode,
                WmslotCustomsStatusCode = line.WmsorderLineCustomsStatusCode,
                WmslotAttributesJson = "{}",
                WmslotCreatedAt = DateTime.UtcNow,
            };
            db.WmsInventoryLots.Add(lot);
        }
        else
        {
            lot.WmslotBatchNumber ??= Normalize(input.BatchNumber);
            lot.WmslotManufactureDate ??= input.ManufactureDate;
            lot.WmslotExpiryDate ??= input.ExpiryDate ?? line.WmsorderLineExpiryDate;
        }

        return lot;
    }

    private async Task<WmsInventoryTransaction> PostReceiptBalanceAsync(
        WmsOrder order,
        WmsOrderLine line,
        WmsReceipt receipt,
        Guid locationId,
        WmsInventoryLot? lot,
        string inventoryStatus,
        decimal quantity,
        ReceiveWarehouseOrderLineRequest input,
        Guid userId,
        DateTime now,
        CancellationToken cancellationToken)
    {
        var balance = await db.WmsInventoryBalances.FirstOrDefaultAsync(candidate =>
            candidate.WmsbalanceFacilityId == order.WmsorderFacilityId &&
            candidate.WmsbalanceCustomerOrgId == order.WmsorderCustomerOrgId &&
            candidate.WmsbalanceItemId == line.WmsorderLineItemId &&
            candidate.WmsbalanceLocationId == locationId &&
            candidate.WmsbalanceLotId == (lot == null ? null : lot.WmslotId) &&
            candidate.WmsbalanceInventoryStatusCode == inventoryStatus &&
            candidate.WmsbalanceCustomsStatusCode == line.WmsorderLineCustomsStatusCode &&
            candidate.WmsbalanceUomcode == line.WmsorderLineUomcode, cancellationToken);

        if (balance is null)
        {
            balance = new WmsInventoryBalance
            {
                WmsbalanceId = Guid.NewGuid(),
                WmsbalanceFacilityId = order.WmsorderFacilityId,
                WmsbalanceCustomerOrgId = order.WmsorderCustomerOrgId,
                WmsbalanceItemId = line.WmsorderLineItemId,
                WmsbalanceLocationId = locationId,
                WmsbalanceLotId = lot?.WmslotId,
                WmsbalanceInventoryStatusCode = inventoryStatus,
                WmsbalanceCustomsStatusCode = line.WmsorderLineCustomsStatusCode,
                WmsbalanceUomcode = line.WmsorderLineUomcode,
                WmsbalanceOnHandQuantity = 0,
                WmsbalanceReservedQuantity = 0,
                WmsbalanceAllocatedQuantity = 0,
                WmsbalanceHeldQuantity = inventoryStatus == Available ? 0 : quantity,
                WmsbalanceAvailableQuantity = 0,
                WmsbalanceFirstReceiptAt = now,
                WmsbalanceIsBonded = line.WmsorderLineCustomsStatusCode != FreeCirculation,
                WmsbalanceMetadataJson = "{}",
                WmsbalanceCreatedAt = now,
                WmsbalanceUpdatedAt = now,
            };
            db.WmsInventoryBalances.Add(balance);
        }

        var before = balance.WmsbalanceOnHandQuantity;
        balance.WmsbalanceOnHandQuantity += quantity;
        if (inventoryStatus != Available && before > 0) balance.WmsbalanceHeldQuantity += quantity;
        balance.WmsbalanceAvailableQuantity = CalculateAvailable(balance);
        balance.WmsbalanceLastMovementAt = now;
        balance.WmsbalanceUpdatedAt = now;

        var transaction = new WmsInventoryTransaction
        {
            WmstransactionId = Guid.NewGuid(),
            WmstransactionFacilityId = order.WmsorderFacilityId,
            WmstransactionBalanceId = balance.WmsbalanceId,
            WmstransactionTypeCode = "receipt",
            WmstransactionItemId = line.WmsorderLineItemId,
            WmstransactionCustomerOrgId = order.WmsorderCustomerOrgId,
            WmstransactionToLocationId = locationId,
            WmstransactionLotId = lot?.WmslotId,
            WmstransactionQuantity = quantity,
            WmstransactionUomcode = line.WmsorderLineUomcode,
            WmstransactionBeforeOnHandQuantity = before,
            WmstransactionAfterOnHandQuantity = balance.WmsbalanceOnHandQuantity,
            WmstransactionInventoryStatusCode = inventoryStatus,
            WmstransactionCustomsStatusCode = line.WmsorderLineCustomsStatusCode,
            WmstransactionOrderId = order.WmsorderId,
            WmstransactionOrderLineId = line.WmsorderLineId,
            WmstransactionReceiptId = receipt.WmsreceiptId,
            WmstransactionSourceTable = "WMS_Receipts",
            WmstransactionSourceId = receipt.WmsreceiptId,
            WmstransactionReference = receipt.WmsreceiptReceiptNumber,
            WmstransactionNotes = inventoryStatus == Damaged ? "Received as damaged stock." : Normalize(receipt.WmsreceiptNotes),
            WmstransactionMetadataJson = "{}",
            WmstransactionCreatedAt = now,
            WmstransactionCreatedBy = userId,
        };
        db.WmsInventoryTransactions.Add(transaction);
        return transaction;
    }

    private async Task RequirePostingLookupsAsync(bool includeDamaged, CancellationToken cancellationToken)
    {
        var requiredInventory = includeDamaged ? new[] { Available, Damaged } : new[] { Available };
        var inventoryCount = await db.SysWmsinventoryStatuses.CountAsync(status => requiredInventory.Contains(status.WmsinventoryStatusCode), cancellationToken);
        if (inventoryCount != requiredInventory.Length) throw WarehouseException.Conflict("Warehouse inventory status reference data is missing. Apply the warehouse operations seed migration.");
        var transactionCount = await db.SysWmstransactionTypes.CountAsync(type => type.WmstransactionTypeCode == "receipt" || type.WmstransactionTypeCode == "dispatch", cancellationToken);
        if (transactionCount < 2) throw WarehouseException.Conflict("Warehouse transaction reference data is missing. Apply the warehouse operations seed migration.");
    }

    private async Task<WmsFacility> RequireFacilityAsync(Guid companyId, Guid facilityId, CancellationToken cancellationToken) =>
        await db.WmsFacilities.FirstOrDefaultAsync(facility =>
            facility.WmsfacilityId == facilityId && !facility.WmsfacilityIsDeleted && facility.WmsfacilityIsActive &&
            facility.WmsfacilityOrgOffice != null && facility.WmsfacilityOrgOffice.CompanyId == companyId, cancellationToken)
        ?? throw WarehouseException.BadRequest("Choose a warehouse in your workspace.");

    private async Task RequireCustomerAsync(Guid customerOrgId, CancellationToken cancellationToken)
    {
        if (!await db.OrgMasters.AnyAsync(org => org.OrgId == customerOrgId, cancellationToken))
            throw WarehouseException.BadRequest("Choose a valid customer.");
    }

    private async Task RequireLocationsAsync(Guid facilityId, IReadOnlyCollection<Guid> locationIds, CancellationToken cancellationToken)
    {
        if (locationIds.Count == 0) return;
        var count = await db.WmsLocations.CountAsync(location =>
            locationIds.Contains(location.WmslocationId) && location.WmslocationFacilityId == facilityId &&
            !location.WmslocationIsDeleted && location.WmslocationIsActive, cancellationToken);
        if (count != locationIds.Count) throw WarehouseException.BadRequest("Choose active locations inside the selected warehouse.");
    }

    private static async Task RequireLookupAsync(Task<bool> existsTask, string message)
    {
        if (!await existsTask) throw WarehouseException.Conflict(message);
    }

    private static void EnsureActionable(WmsOrder order, string expectedType, string action)
    {
        if (order.WmsorderTypeCode != expectedType) throw WarehouseException.BadRequest($"Only {expectedType} orders can be {action}d.");
        if (order.WmsorderStatusCode is "complete" or "cancelled") throw WarehouseException.Conflict("This order is already final.");
    }

    private static void EnsureDistinctLines(IEnumerable<Guid> lineIds)
    {
        var ids = lineIds.ToList();
        if (ids.Count != ids.Distinct().Count()) throw WarehouseException.BadRequest("Each order line can only appear once in this posting.");
    }

    private static void UpdateOrderStatus(WmsOrder order, string typeCode, Guid userId, DateTime now)
    {
        var complete = typeCode == Inbound
            ? order.WmsOrderLines.All(line => line.WmsorderLineReceivedQuantity >= line.WmsorderLineOrderedQuantity)
            : order.WmsOrderLines.All(line => line.WmsorderLineDispatchedQuantity >= line.WmsorderLineOrderedQuantity);
        var progressed = typeCode == Inbound
            ? order.WmsOrderLines.Any(line => line.WmsorderLineReceivedQuantity > 0)
            : order.WmsOrderLines.Any(line => line.WmsorderLineDispatchedQuantity > 0);
        order.WmsorderStatusCode = complete ? "complete" : progressed ? "part_complete" : "booked";
        order.WmsorderUpdatedAt = now;
        order.WmsorderUpdatedBy = userId;
    }

    private async Task<string> CreateUniqueNumberAsync(Guid facilityId, string prefix, CancellationToken cancellationToken)
    {
        for (var attempt = 0; attempt < 5; attempt++)
        {
            var number = $"{prefix}-{DateTime.UtcNow:yyyyMMdd-HHmmss}-{Random.Shared.Next(1000, 9999)}";
            if (!await db.WmsOrders.AnyAsync(order => order.WmsorderFacilityId == facilityId && order.WmsorderOrderNumber == number, cancellationToken)) return number;
        }
        throw WarehouseException.Conflict("Could not generate a unique warehouse order number. Try again.");
    }

    private async Task<string> CreateUniqueReceiptNumberAsync(Guid facilityId, CancellationToken cancellationToken)
    {
        var number = $"GRN-{DateTime.UtcNow:yyyyMMdd-HHmmss}-{Random.Shared.Next(1000, 9999)}";
        return await db.WmsReceipts.AnyAsync(receipt => receipt.WmsreceiptFacilityId == facilityId && receipt.WmsreceiptReceiptNumber == number, cancellationToken)
            ? $"GRN-{Guid.NewGuid():N}"[..20]
            : number;
    }

    private async Task<string> CreateUniqueDispatchNumberAsync(Guid facilityId, CancellationToken cancellationToken)
    {
        var number = $"DSP-{DateTime.UtcNow:yyyyMMdd-HHmmss}-{Random.Shared.Next(1000, 9999)}";
        return await db.WmsDispatches.AnyAsync(dispatch => dispatch.WmsdispatchFacilityId == facilityId && dispatch.WmsdispatchDispatchNumber == number, cancellationToken)
            ? $"DSP-{Guid.NewGuid():N}"[..20]
            : number;
    }

    private static decimal CalculateAvailable(WmsInventoryBalance balance) =>
        Math.Max(0, balance.WmsbalanceOnHandQuantity - balance.WmsbalanceReservedQuantity - balance.WmsbalanceAllocatedQuantity - balance.WmsbalanceHeldQuantity);

    private static WarehouseOrderDto ToDto(WmsOrder order)
    {
        var lines = order.WmsOrderLines.OrderBy(line => line.WmsorderLineLineNo).Select(line => new WarehouseOrderLineDto(
            line.WmsorderLineId,
            line.WmsorderLineLineNo,
            line.WmsorderLineItemId,
            line.WmsorderLineItem.WmsitemSku,
            line.WmsorderLineItem.WmsitemDescription,
            line.WmsorderLineStatusCode,
            line.WmsorderLineOrderedQuantity,
            line.WmsorderLineReceivedQuantity,
            line.WmsorderLinePickedQuantity,
            line.WmsorderLinePackedQuantity,
            line.WmsorderLineDispatchedQuantity,
            Math.Max(0, line.WmsorderLineOrderedQuantity - (order.WmsorderTypeCode == Inbound ? line.WmsorderLineReceivedQuantity : line.WmsorderLineDispatchedQuantity)),
            line.WmsorderLineUomcode,
            line.WmsorderLineLotNumber,
            line.WmsorderLineExpiryDate,
            line.WmsorderLineSourceLocationId,
            line.WmsorderLineSourceLocation?.WmslocationCode,
            line.WmsorderLineTargetLocationId,
            line.WmsorderLineTargetLocation?.WmslocationCode,
            line.WmsorderLineInventoryStatusCode,
            line.WmsorderLineCustomsStatusCode,
            line.WmsorderLineGoodsValue,
            line.WmsorderLineCurrencyCode,
            line.WmsorderLineInstructions)).ToList();

        var receipts = order.WmsReceipts.OrderByDescending(receipt => receipt.WmsreceiptCreatedAt).Select(receipt => new WarehouseReceiptSummaryDto(
            receipt.WmsreceiptId, receipt.WmsreceiptReceiptNumber, receipt.WmsreceiptStatusCode, receipt.WmsreceiptReceivedAt, receipt.WmsreceiptHasDiscrepancy, receipt.WmsreceiptNotes)).ToList();
        var dispatches = order.WmsDispatches.OrderByDescending(dispatch => dispatch.WmsdispatchCreatedAt).Select(dispatch => new WarehouseDispatchSummaryDto(
            dispatch.WmsdispatchId, dispatch.WmsdispatchDispatchNumber, dispatch.WmsdispatchStatusCode, dispatch.WmsdispatchDispatchedAt, dispatch.WmsdispatchVehicleReg, dispatch.WmsdispatchContainerNumber, dispatch.WmsdispatchSealNumber)).ToList();

        return new WarehouseOrderDto(
            order.WmsorderId,
            order.WmsorderFacilityId,
            order.WmsorderFacility.WmsfacilityCode,
            order.WmsorderFacility.WmsfacilityName,
            order.WmsorderOrgOfficeId,
            order.WmsorderFacility.WmsfacilityOrgOffice?.OfficeName,
            order.WmsorderCustomerOrgId,
            order.WmsorderCustomerOrg.OrgName,
            order.WmsorderOrderNumber,
            order.WmsorderTypeCode,
            order.WmsorderTypeCodeNavigation?.WmsorderTypeName,
            order.WmsorderStatusCode,
            order.WmsorderStatusCodeNavigation?.WmsorderStatusName,
            order.WmsorderPriorityCode,
            order.WmsorderCustomerReference,
            order.WmsorderRequestedDate,
            order.WmsorderAppointmentStartAt,
            order.WmsorderAppointmentEndAt,
            order.WmsorderVehicleReg,
            order.WmsorderContainerNumber,
            order.WmsorderSealNumber,
            order.WmsorderInstructions,
            order.WmsorderCreatedAt,
            order.WmsorderUpdatedAt,
            lines,
            receipts,
            dispatches);
    }

    private static string? Normalize(string? value)
    {
        var trimmed = value?.Trim();
        return string.IsNullOrWhiteSpace(trimmed) ? null : trimmed;
    }
}
