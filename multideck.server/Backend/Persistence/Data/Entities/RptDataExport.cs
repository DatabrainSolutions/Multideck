using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RptDataExport
{
    public Guid RptexportId { get; set; }

    public Guid? RptexportUserId { get; set; }

    public Guid? RptexportDashboardId { get; set; }

    public Guid? RptexportReportId { get; set; }

    public string RptexportStatusCode { get; set; } = null!;

    public string RptexportFormatCode { get; set; } = null!;

    public string? RptexportFileStorageRef { get; set; }

    public int? RptexportRowCount { get; set; }

    public DateTime RptexportRequestedAt { get; set; }

    public DateTime? RptexportCompletedAt { get; set; }

    public string? RptexportErrorMessage { get; set; }

    public virtual RptDashboard? RptexportDashboard { get; set; }

    public virtual RptReportDefinition? RptexportReport { get; set; }

    public virtual SysObsrunStatus RptexportStatusCodeNavigation { get; set; } = null!;

    public virtual CmpUser? RptexportUser { get; set; }
}
