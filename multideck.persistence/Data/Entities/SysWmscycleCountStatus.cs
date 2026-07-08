using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysWmscycleCountStatus
{
    public string WmscycleCountStatusCode { get; set; } = null!;

    public string WmscycleCountStatusName { get; set; } = null!;

    public string? WmscycleCountStatusDescription { get; set; }

    public bool WmscycleCountStatusIsFinal { get; set; }

    public bool WmscycleCountStatusIsActive { get; set; }

    public int WmscycleCountStatusSortOrder { get; set; }

    public virtual ICollection<WmsCycleCountPlan> WmsCycleCountPlans { get; set; } = new List<WmsCycleCountPlan>();
}
