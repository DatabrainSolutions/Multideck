using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class BlDangerousGood
{
    public Guid BldgId { get; set; }

    public Guid BldgBlgId { get; set; }

    public string? BldgUnnumber { get; set; }

    public string? BldgProperShippingName { get; set; }

    public string? BldgImdgclass { get; set; }

    public string? BldgPackingGroup { get; set; }

    public decimal? BldgFlashPoint { get; set; }

    public string? BldgFlashPointUom { get; set; }

    public bool? BldgMarinePollutant { get; set; }

    public bool? BldgLimitedQuantity { get; set; }

    public string? BldgEmergencyContact { get; set; }

    public string? BldgNotes { get; set; }

    public virtual BlGoodsItem BldgBlg { get; set; } = null!;
}
