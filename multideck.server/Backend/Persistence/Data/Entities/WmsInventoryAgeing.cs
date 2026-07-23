using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsInventoryAgeing
{
    public Guid? WmsbalanceId { get; set; }

    public Guid? WmsbalanceFacilityId { get; set; }

    public string? WmsfacilityName { get; set; }

    public Guid? WmsbalanceCustomerOrgId { get; set; }

    public string? CustomerName { get; set; }

    public string? WmsitemSku { get; set; }

    public string? WmsitemDescription { get; set; }

    public decimal? WmsbalanceOnHandQuantity { get; set; }

    public decimal? WmsbalanceAvailableQuantity { get; set; }

    public string? WmsbalanceCustomsStatusCode { get; set; }

    public DateTime? WmsbalanceFirstReceiptAt { get; set; }

    public int? AgeDays { get; set; }
}
