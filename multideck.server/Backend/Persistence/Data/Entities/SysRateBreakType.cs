using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRateBreakType
{
    public string RatebrkCode { get; set; } = null!;

    public string RatebrkName { get; set; } = null!;

    public string? RatebrkDescription { get; set; }

    public int RatebrkSortOrder { get; set; }

    public virtual ICollection<RateRateBreak> RateRateBreaks { get; set; } = new List<RateRateBreak>();
}
