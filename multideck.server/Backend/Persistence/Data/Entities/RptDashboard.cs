using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RptDashboard
{
    public Guid RptdashId { get; set; }

    public string RptdashCode { get; set; } = null!;

    public string RptdashName { get; set; } = null!;

    public string RptdashTypeCode { get; set; } = null!;

    public string? RptdashModuleCode { get; set; }

    public string? RptdashDescription { get; set; }

    public bool RptdashIsMvp { get; set; }

    public string? RptdashMinPermissionCode { get; set; }

    public string? RptdashDefaultRefreshCode { get; set; }

    public bool RptdashIsActive { get; set; }

    public int RptdashSortOrder { get; set; }

    public virtual ICollection<RptDashboardWidget> RptDashboardWidgets { get; set; } = new List<RptDashboardWidget>();

    public virtual ICollection<RptDataExport> RptDataExports { get; set; } = new List<RptDataExport>();

    public virtual ICollection<RptSavedFilter> RptSavedFilters { get; set; } = new List<RptSavedFilter>();

    public virtual ICollection<RptUserSubscription> RptUserSubscriptions { get; set; } = new List<RptUserSubscription>();

    public virtual SysRptrefreshFrequency? RptdashDefaultRefreshCodeNavigation { get; set; }

    public virtual SysSubmoduleCode? RptdashModuleCodeNavigation { get; set; }

    public virtual SysRptdashboardType RptdashTypeCodeNavigation { get; set; } = null!;
}
