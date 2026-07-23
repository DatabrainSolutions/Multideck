using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRateDirection
{
    public string RatedirCode { get; set; } = null!;

    public string RatedirName { get; set; } = null!;

    public string? RatedirDescription { get; set; }

    public int RatedirSortOrder { get; set; }

    public virtual ICollection<RateLane> RateLanes { get; set; } = new List<RateLane>();

    public virtual ICollection<RateRateRequest> RateRateRequests { get; set; } = new List<RateRateRequest>();
}
