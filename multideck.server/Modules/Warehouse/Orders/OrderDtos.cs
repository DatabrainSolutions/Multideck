namespace Multideck.Server.Modules.Warehouse.Orders;

public sealed record WarehouseOrderDto(
    Guid Id,
    Guid FacilityId,
    string FacilityCode,
    string FacilityName,
    Guid? OfficeId,
    string? OfficeName,
    Guid CustomerOrgId,
    string CustomerName,
    string OrderNumber,
    string TypeCode,
    string? TypeName,
    string StatusCode,
    string? StatusName,
    string PriorityCode,
    string? CustomerReference,
    DateOnly? RequestedDate,
    DateTime? AppointmentStartAt,
    DateTime? AppointmentEndAt,
    string? VehicleReg,
    string? ContainerNumber,
    string? SealNumber,
    string? Instructions,
    DateTime CreatedAt,
    DateTime UpdatedAt,
    IReadOnlyList<WarehouseOrderLineDto> Lines,
    IReadOnlyList<WarehouseReceiptSummaryDto> Receipts,
    IReadOnlyList<WarehouseDispatchSummaryDto> Dispatches);

public sealed record WarehouseOrderLineDto(
    Guid Id,
    int LineNumber,
    Guid ItemId,
    string Sku,
    string Description,
    string StatusCode,
    decimal OrderedQuantity,
    decimal ReceivedQuantity,
    decimal PickedQuantity,
    decimal PackedQuantity,
    decimal DispatchedQuantity,
    decimal RemainingQuantity,
    string UomCode,
    string? LotNumber,
    DateOnly? ExpiryDate,
    Guid? SourceLocationId,
    string? SourceLocationCode,
    Guid? TargetLocationId,
    string? TargetLocationCode,
    string InventoryStatusCode,
    string CustomsStatusCode,
    decimal? GoodsValue,
    string? CurrencyCode,
    string? Instructions);

public sealed record WarehouseReceiptSummaryDto(
    Guid Id,
    string ReceiptNumber,
    string StatusCode,
    DateTime? ReceivedAt,
    bool HasDiscrepancy,
    string? Notes);

public sealed record WarehouseDispatchSummaryDto(
    Guid Id,
    string DispatchNumber,
    string StatusCode,
    DateTime? DispatchedAt,
    string? VehicleReg,
    string? ContainerNumber,
    string? SealNumber);

public sealed record WarehouseOrderReferenceResponse(
    IReadOnlyList<WarehouseOrderFacilityOption> Facilities,
    IReadOnlyList<WarehouseOrderCustomerOption> Customers,
    IReadOnlyList<WarehouseOrderItemOption> Items,
    IReadOnlyList<WarehouseOrderLocationOption> Locations,
    IReadOnlyList<WarehouseOrderTypeOption> Types,
    IReadOnlyList<WarehouseOrderStatusOption> Statuses,
    IReadOnlyList<WarehouseCustomsStatusOption> CustomsStatuses);

public sealed record WarehouseOrderFacilityOption(Guid Id, Guid? OfficeId, string Code, string Name);
public sealed record WarehouseOrderCustomerOption(Guid Id, string Name);
public sealed record WarehouseOrderItemOption(Guid Id, Guid CustomerOrgId, Guid? FacilityId, string Sku, string Description, string UomCode, bool RequiresLot, bool RequiresExpiry);
public sealed record WarehouseOrderLocationOption(Guid Id, Guid FacilityId, string Code, string? ZoneName);
public sealed record WarehouseOrderTypeOption(string Code, string Name, string? DirectionCode);
public sealed record WarehouseOrderStatusOption(string Code, string Name, bool IsOpen, bool IsFinal);
public sealed record WarehouseCustomsStatusOption(string Code, string Name, bool IsDutySuspended);

public sealed record CreateWarehouseOrderRequest(
    Guid FacilityId,
    Guid CustomerOrgId,
    string TypeCode,
    string? PriorityCode,
    string? CustomerReference,
    DateOnly? RequestedDate,
    DateTime? AppointmentStartAt,
    DateTime? AppointmentEndAt,
    string? VehicleReg,
    string? ContainerNumber,
    string? SealNumber,
    string? Instructions,
    IReadOnlyList<CreateWarehouseOrderLineRequest> Lines);

public sealed record CreateWarehouseOrderLineRequest(
    Guid ItemId,
    decimal Quantity,
    string? UomCode,
    string? LotNumber,
    DateOnly? ExpiryDate,
    Guid? SourceLocationId,
    Guid? TargetLocationId,
    string? CustomsStatusCode,
    decimal? GoodsValue,
    string? CurrencyCode,
    string? Instructions);

public sealed record ReceiveWarehouseOrderRequest(
    Guid? ReceivingLocationId,
    string? Notes,
    IReadOnlyList<ReceiveWarehouseOrderLineRequest> Lines);

public sealed record ReceiveWarehouseOrderLineRequest(
    Guid OrderLineId,
    decimal Quantity,
    decimal DamagedQuantity,
    Guid? TargetLocationId,
    string? LotNumber,
    string? BatchNumber,
    DateOnly? ManufactureDate,
    DateOnly? ExpiryDate);

public sealed record DispatchWarehouseOrderRequest(
    string? VehicleReg,
    string? ContainerNumber,
    string? SealNumber,
    string? Notes,
    IReadOnlyList<DispatchWarehouseOrderLineRequest> Lines);

public sealed record DispatchWarehouseOrderLineRequest(
    Guid OrderLineId,
    decimal Quantity,
    Guid? SourceLocationId,
    Guid? LotId);

