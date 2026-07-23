using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRateAdjustmentType
{
    public string RateadjCode { get; set; } = null!;

    public string RateadjName { get; set; } = null!;

    public string? RateadjDescription { get; set; }

    public int RateadjSortOrder { get; set; }

    public virtual ICollection<RateResultAdjustment> RateResultAdjustments { get; set; } = new List<RateResultAdjustment>();
}
