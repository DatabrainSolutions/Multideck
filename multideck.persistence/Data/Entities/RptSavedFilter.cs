using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RptSavedFilter
{
    public Guid RptfilterId { get; set; }

    public Guid? RptfilterUserId { get; set; }

    public Guid? RptfilterDashboardId { get; set; }

    public Guid? RptfilterReportId { get; set; }

    public string RptfilterName { get; set; } = null!;

    public string RptfilterFilterJson { get; set; } = null!;

    public bool RptfilterIsDefault { get; set; }

    public DateTime RptfilterCreatedAt { get; set; }

    public virtual RptDashboard? RptfilterDashboard { get; set; }

    public virtual RptReportDefinition? RptfilterReport { get; set; }

    public virtual CmpUser? RptfilterUser { get; set; }
}
