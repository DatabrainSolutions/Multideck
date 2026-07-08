using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ObsBackgroundJobRun
{
    public Guid ObsjobRunId { get; set; }

    public Guid? ObsjobRunJobId { get; set; }

    public string ObsjobRunStatusCode { get; set; } = null!;

    public DateTime? ObsjobRunStartedAt { get; set; }

    public DateTime? ObsjobRunFinishedAt { get; set; }

    public int? ObsjobRunDurationMs { get; set; }

    public int ObsjobRunRecordsProcessed { get; set; }

    public int ObsjobRunErrorCount { get; set; }

    public int ObsjobRunWarningCount { get; set; }

    public string ObsjobRunResultJson { get; set; } = null!;

    public string? ObsjobRunErrorMessage { get; set; }

    public DateTime ObsjobRunCreatedAt { get; set; }

    public virtual ObsBackgroundJob? ObsjobRunJob { get; set; }

    public virtual SysObsrunStatus ObsjobRunStatusCodeNavigation { get; set; } = null!;
}
