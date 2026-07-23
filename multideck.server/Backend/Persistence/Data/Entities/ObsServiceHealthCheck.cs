using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class ObsServiceHealthCheck
{
    public Guid ObshealthId { get; set; }

    public string ObshealthServiceCode { get; set; } = null!;

    public string? ObshealthModuleCode { get; set; }

    public string ObshealthStatusCode { get; set; } = null!;

    public string ObshealthSeverityCode { get; set; } = null!;

    public DateTime ObshealthCheckedAt { get; set; }

    public int? ObshealthResponseMs { get; set; }

    public string? ObshealthMessage { get; set; }

    public string ObshealthDetailsJson { get; set; } = null!;

    public virtual SysSubmoduleCode? ObshealthModuleCodeNavigation { get; set; }

    public virtual SysObseventSeverity ObshealthSeverityCodeNavigation { get; set; } = null!;

    public virtual SysObsrunStatus ObshealthStatusCodeNavigation { get; set; } = null!;
}
