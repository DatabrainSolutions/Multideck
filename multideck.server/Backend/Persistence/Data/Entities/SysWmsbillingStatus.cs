using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmsbillingStatus
{
    public string WmsbillingStatusCode { get; set; } = null!;

    public string WmsbillingStatusName { get; set; } = null!;

    public string? WmsbillingStatusDescription { get; set; }

    public bool WmsbillingStatusIsBillable { get; set; }

    public bool WmsbillingStatusIsFinal { get; set; }

    public bool WmsbillingStatusIsActive { get; set; }

    public int WmsbillingStatusSortOrder { get; set; }

    public virtual ICollection<WmsBillingEvent> WmsBillingEvents { get; set; } = new List<WmsBillingEvent>();
}
