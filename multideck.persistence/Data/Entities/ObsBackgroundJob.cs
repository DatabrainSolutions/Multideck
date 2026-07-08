using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ObsBackgroundJob
{
    public Guid ObsjobId { get; set; }

    public string ObsjobCode { get; set; } = null!;

    public string ObsjobName { get; set; } = null!;

    public string? ObsjobModuleCode { get; set; }

    public string? ObsjobScheduleExpression { get; set; }

    public bool ObsjobIsEnabled { get; set; }

    public string? ObsjobDescription { get; set; }

    public DateTime ObsjobCreatedAt { get; set; }

    public virtual ICollection<ObsBackgroundJobRun> ObsBackgroundJobRuns { get; set; } = new List<ObsBackgroundJobRun>();

    public virtual SysSubmoduleCode? ObsjobModuleCodeNavigation { get; set; }
}
