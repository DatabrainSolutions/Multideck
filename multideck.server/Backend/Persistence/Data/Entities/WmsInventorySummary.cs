using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsInventorySummary
{
    public Guid? WmsbalanceId { get; set; }

    public Guid? WmsbalanceFacilityId { get; set; }

    public string? WmsfacilityCode { get; set; }

    public string? WmsfacilityName { get; set; }

    public Guid? WmsbalanceCustomerOrgId { get; set; }

    public string? CustomerName { get; set; }

    public Guid? WmsbalanceItemId { get; set; }

    public string? WmsitemSku { get; set; }

    public string? WmsitemDescription { get; set; }

    public Guid? WmsbalanceLocationId { get; set; }

    public string? WmslocationCode { get; set; }

    public Guid? WmsbalanceLotId { get; set; }

    public string? WmslotLotNumber { get; set; }

    public Guid? WmsbalanceHuId { get; set; }

    public string? WmshuCode { get; set; }

    public string? WmsbalanceInventoryStatusCode { get; set; }

    public string? WmsbalanceCustomsStatusCode { get; set; }

    public string? WmsbalanceUomcode { get; set; }

    public decimal? WmsbalanceOnHandQuantity { get; set; }

    public decimal? WmsbalanceReservedQuantity { get; set; }

    public decimal? WmsbalanceAllocatedQuantity { get; set; }

    public decimal? WmsbalanceHeldQuantity { get; set; }

    public decimal? WmsbalanceAvailableQuantity { get; set; }

    public bool? WmsbalanceIsBonded { get; set; }

    public DateTime? WmsbalanceFirstReceiptAt { get; set; }

    public DateTime? WmsbalanceLastMovementAt { get; set; }
}
