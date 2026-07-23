using System;
using System.Collections.Generic;

namespace Multideck.Persistence.Entities;

public partial class SysAuditRetentionClass
{
    public string AuditRetentionClassCode { get; set; } = null!;

    public string AuditRetentionClassName { get; set; } = null!;

    public string? AuditRetentionClassDescription { get; set; }

    public int? AuditRetentionClassRetentionDays { get; set; }

    public bool AuditRetentionClassIsArchiveRequired { get; set; }

    public bool AuditRetentionClassIsActive { get; set; }

    public int AuditRetentionClassSortOrder { get; set; }

    public virtual ICollection<AuditEvent> AuditEvents { get; set; } = new List<AuditEvent>();

    public virtual ICollection<AuditRetentionJob> AuditRetentionJobs { get; set; } = new List<AuditRetentionJob>();

    public virtual ICollection<AuditTablePolicy> AuditTablePolicies { get; set; } = new List<AuditTablePolicy>();
}
