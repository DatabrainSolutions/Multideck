using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsDashboard
{
    public Guid? WmsfacilityId { get; set; }

    public string? WmsfacilityCode { get; set; }

    public string? WmsfacilityName { get; set; }

    public int? OpenOrderCount { get; set; }

    public int? OpenTaskCount { get; set; }

    public int? OpenExceptionCount { get; set; }

    public int? OpenHoldCount { get; set; }

    public decimal? TotalOnHandQuantity { get; set; }

    public decimal? TotalAvailableQuantity { get; set; }

    public decimal? TotalHeldQuantity { get; set; }
}
