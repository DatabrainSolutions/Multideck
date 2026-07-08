using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsCustomerPortalStock
{
    public Guid? WmsbalanceCustomerOrgId { get; set; }

    public string? CustomerName { get; set; }

    public Guid? WmsbalanceFacilityId { get; set; }

    public string? WmsfacilityName { get; set; }

    public string? WmsitemSku { get; set; }

    public string? WmsitemDescription { get; set; }

    public string? WmslocationCode { get; set; }

    public string? WmslotLotNumber { get; set; }

    public string? WmsbalanceInventoryStatusCode { get; set; }

    public string? WmsbalanceCustomsStatusCode { get; set; }

    public string? WmsbalanceUomcode { get; set; }

    public decimal? WmsbalanceOnHandQuantity { get; set; }

    public decimal? WmsbalanceAvailableQuantity { get; set; }

    public DateTime? WmsbalanceFirstReceiptAt { get; set; }

    public DateTime? WmsbalanceLastMovementAt { get; set; }
}
