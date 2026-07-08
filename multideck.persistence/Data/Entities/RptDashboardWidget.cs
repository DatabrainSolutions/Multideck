using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RptDashboardWidget
{
    public Guid RptwidgetId { get; set; }

    public Guid RptwidgetDashboardId { get; set; }

    public string RptwidgetCode { get; set; } = null!;

    public string RptwidgetName { get; set; } = null!;

    public string RptwidgetTypeCode { get; set; } = null!;

    public string? RptwidgetMetricCode { get; set; }

    public string? RptwidgetQueryRef { get; set; }

    public string RptwidgetConfigJson { get; set; } = null!;

    public int RptwidgetSortOrder { get; set; }

    public bool RptwidgetIsActive { get; set; }

    public virtual RptDashboard RptwidgetDashboard { get; set; } = null!;

    public virtual SysRptwidgetType RptwidgetTypeCodeNavigation { get; set; } = null!;
}
