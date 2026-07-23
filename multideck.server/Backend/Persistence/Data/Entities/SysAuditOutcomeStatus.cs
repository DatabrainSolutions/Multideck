using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAuditOutcomeStatus
{
    public string AuditOutcomeStatusCode { get; set; } = null!;

    public string AuditOutcomeStatusName { get; set; } = null!;

    public string? AuditOutcomeStatusDescription { get; set; }

    public bool AuditOutcomeStatusIsActive { get; set; }

    public int AuditOutcomeStatusSortOrder { get; set; }

    public virtual ICollection<AuditEvent> AuditEvents { get; set; } = new List<AuditEvent>();

    public virtual ICollection<AuditRequestContext> AuditRequestContexts { get; set; } = new List<AuditRequestContext>();

    public virtual ICollection<AuditRetentionJobItem> AuditRetentionJobItems { get; set; } = new List<AuditRetentionJobItem>();

    public virtual ICollection<AuditRetentionJob> AuditRetentionJobs { get; set; } = new List<AuditRetentionJob>();
}
