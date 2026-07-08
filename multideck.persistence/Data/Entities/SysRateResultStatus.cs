using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRateResultStatus
{
    public string RateresstCode { get; set; } = null!;

    public string RateresstName { get; set; } = null!;

    public string? RateresstDescription { get; set; }

    public bool RateresstIsFinal { get; set; }

    public int RateresstSortOrder { get; set; }

    public virtual ICollection<RateRateResult> RateRateResults { get; set; } = new List<RateRateResult>();
}
