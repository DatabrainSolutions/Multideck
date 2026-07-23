using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRateRequestStatus
{
    public string RatereqstCode { get; set; } = null!;

    public string RatereqstName { get; set; } = null!;

    public string? RatereqstDescription { get; set; }

    public bool RatereqstIsFinal { get; set; }

    public int RatereqstSortOrder { get; set; }

    public virtual ICollection<RateRateRequest> RateRateRequests { get; set; } = new List<RateRateRequest>();
}
