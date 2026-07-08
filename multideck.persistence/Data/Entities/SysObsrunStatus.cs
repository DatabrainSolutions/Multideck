using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysObsrunStatus
{
    public string ObsrunStatusCode { get; set; } = null!;

    public string ObsrunStatusName { get; set; } = null!;

    public string? ObsrunStatusDescription { get; set; }

    public bool ObsrunStatusIsTerminal { get; set; }

    public bool ObsrunStatusIsSuccess { get; set; }

    public bool ObsrunStatusIsActive { get; set; }

    public int ObsrunStatusSortOrder { get; set; }

    public virtual ICollection<MigImportRun> MigImportRuns { get; set; } = new List<MigImportRun>();

    public virtual ICollection<MigLoadResult> MigLoadResults { get; set; } = new List<MigLoadResult>();

    public virtual ICollection<ObsAiactionLog> ObsAiactionLogs { get; set; } = new List<ObsAiactionLog>();

    public virtual ICollection<ObsBackgroundJobRun> ObsBackgroundJobRuns { get; set; } = new List<ObsBackgroundJobRun>();

    public virtual ICollection<ObsIntegrationEvent> ObsIntegrationEvents { get; set; } = new List<ObsIntegrationEvent>();

    public virtual ICollection<ObsServiceHealthCheck> ObsServiceHealthChecks { get; set; } = new List<ObsServiceHealthCheck>();

    public virtual ICollection<RptDataExport> RptDataExports { get; set; } = new List<RptDataExport>();

    public virtual ICollection<RptReportRun> RptReportRuns { get; set; } = new List<RptReportRun>();
}
