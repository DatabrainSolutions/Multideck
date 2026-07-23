using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RptReportDefinition
{
    public Guid RptreportId { get; set; }

    public string RptreportCode { get; set; } = null!;

    public string RptreportName { get; set; } = null!;

    public string? RptreportModuleCode { get; set; }

    public string? RptreportDescription { get; set; }

    public string? RptreportQueryRef { get; set; }

    public string RptreportParametersJson { get; set; } = null!;

    public string? RptreportMinPermissionCode { get; set; }

    public bool RptreportIsActive { get; set; }

    public DateTime RptreportCreatedAt { get; set; }

    public virtual ICollection<RptDataExport> RptDataExports { get; set; } = new List<RptDataExport>();

    public virtual ICollection<RptReportRun> RptReportRuns { get; set; } = new List<RptReportRun>();

    public virtual ICollection<RptSavedFilter> RptSavedFilters { get; set; } = new List<RptSavedFilter>();

    public virtual ICollection<RptUserSubscription> RptUserSubscriptions { get; set; } = new List<RptUserSubscription>();

    public virtual SysSubmoduleCode? RptreportModuleCodeNavigation { get; set; }
}
