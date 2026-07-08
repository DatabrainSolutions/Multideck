using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRptdashboardType
{
    public string RptdashboardTypeCode { get; set; } = null!;

    public string RptdashboardTypeName { get; set; } = null!;

    public string? RptdashboardTypeDescription { get; set; }

    public bool RptdashboardTypeIsActive { get; set; }

    public int RptdashboardTypeSortOrder { get; set; }

    public virtual ICollection<RptDashboard> RptDashboards { get; set; } = new List<RptDashboard>();
}
