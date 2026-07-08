using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysRptwidgetType
{
    public string RptwidgetTypeCode { get; set; } = null!;

    public string RptwidgetTypeName { get; set; } = null!;

    public string? RptwidgetTypeDescription { get; set; }

    public bool RptwidgetTypeIsActive { get; set; }

    public int RptwidgetTypeSortOrder { get; set; }

    public virtual ICollection<RptDashboardWidget> RptDashboardWidgets { get; set; } = new List<RptDashboardWidget>();
}
