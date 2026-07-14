namespace Multideck.Server.Modules.Warehouse.Inventory;

/// <summary>A physical stock balance, including its warehouse location and lot/batch identity.</summary>
public sealed record InventoryBalanceDto(
    Guid Id,
    Guid FacilityId,
    string FacilityCode,
    string FacilityName,
    Guid? CustomerOrgId,
    string? CustomerName,
    Guid ItemId,
    string Sku,
    string ItemDescription,
    Guid? LocationId,
    string? LocationCode,
    Guid? LotId,
    string? LotNumber,
    string? BatchNumber,
    DateOnly? ManufactureDate,
    DateOnly? ExpiryDate,
    string InventoryStatusCode,
    string? InventoryStatusName,
    string CustomsStatusCode,
    string UomCode,
    decimal OnHandQuantity,
    decimal ReservedQuantity,
    decimal AllocatedQuantity,
    decimal HeldQuantity,
    decimal AvailableQuantity,
    bool IsBonded,
    DateTime? FirstReceiptAt,
    DateTime? LastMovementAt,
    DateTime UpdatedAt);

/// <summary>An immutable inventory movement used by the stock history view.</summary>
public sealed record InventoryMovementDto(
    Guid Id,
    Guid FacilityId,
    string FacilityName,
    Guid ItemId,
    string Sku,
    string ItemDescription,
    string TypeCode,
    string? TypeName,
    decimal Quantity,
    string UomCode,
    string? FromLocationCode,
    string? ToLocationCode,
    string? LotNumber,
    string? BatchNumber,
    string? Reference,
    string? Notes,
    DateTime CreatedAt);

