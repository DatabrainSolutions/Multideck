using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysObseventSeverity
{
    public string ObsseverityCode { get; set; } = null!;

    public string ObsseverityName { get; set; } = null!;

    public string? ObsseverityDescription { get; set; }

    public int ObsseverityRank { get; set; }

    public bool ObsseverityIsActive { get; set; }

    public virtual ICollection<ObsDataQualityIssue> ObsDataQualityIssues { get; set; } = new List<ObsDataQualityIssue>();

    public virtual ICollection<ObsExceptionQueue> ObsExceptionQueues { get; set; } = new List<ObsExceptionQueue>();

    public virtual ICollection<ObsIntegrationEvent> ObsIntegrationEvents { get; set; } = new List<ObsIntegrationEvent>();

    public virtual ICollection<ObsServiceHealthCheck> ObsServiceHealthChecks { get; set; } = new List<ObsServiceHealthCheck>();

    public virtual ICollection<SubAdminNotice> SubAdminNotices { get; set; } = new List<SubAdminNotice>();
}
