using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class RptReportRun
{
    public Guid RptreportRunId { get; set; }

    public Guid RptreportRunReportId { get; set; }

    public string RptreportRunStatusCode { get; set; } = null!;

    public Guid? RptreportRunRequestedBy { get; set; }

    public string RptreportRunParametersJson { get; set; } = null!;

    public string? RptreportRunResultStorageRef { get; set; }

    public DateTime? RptreportRunStartedAt { get; set; }

    public DateTime? RptreportRunFinishedAt { get; set; }

    public string? RptreportRunErrorMessage { get; set; }

    public DateTime RptreportRunCreatedAt { get; set; }

    public virtual RptReportDefinition RptreportRunReport { get; set; } = null!;

    public virtual CmpUser? RptreportRunRequestedByNavigation { get; set; }

    public virtual SysObsrunStatus RptreportRunStatusCodeNavigation { get; set; } = null!;
}
