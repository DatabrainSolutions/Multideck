using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRptrefreshFrequency
{
    public string RptrefreshFreqCode { get; set; } = null!;

    public string RptrefreshFreqName { get; set; } = null!;

    public string? RptrefreshFreqDescription { get; set; }

    public int? RptrefreshFreqIntervalMinutes { get; set; }

    public bool RptrefreshFreqIsActive { get; set; }

    public int RptrefreshFreqSortOrder { get; set; }

    public virtual ICollection<RptDashboard> RptDashboards { get; set; } = new List<RptDashboard>();

    public virtual ICollection<RptUserSubscription> RptUserSubscriptions { get; set; } = new List<RptUserSubscription>();
}
