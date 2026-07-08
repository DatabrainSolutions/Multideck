using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class WmsLocationUtilisation
{
    public Guid? WmslocationId { get; set; }

    public Guid? WmslocationFacilityId { get; set; }

    public string? WmsfacilityName { get; set; }

    public string? WmszoneCode { get; set; }

    public string? WmslocationCode { get; set; }

    public string? WmslocationTypeCode { get; set; }

    public string? WmslocationStatusCode { get; set; }

    public decimal? WmslocationMaxWeightKg { get; set; }

    public decimal? WmslocationMaxVolumeCbm { get; set; }

    public decimal? OnHandQuantity { get; set; }

    public int? ItemCount { get; set; }

    public int? HandlingUnitCount { get; set; }
}
